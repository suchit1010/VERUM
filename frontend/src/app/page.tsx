'use client';

import { useState, useEffect, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';
const WalletMultiButton = dynamic(() => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton), { ssr: false });
import { PublicKey, SendTransactionError, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { useSSS } from '@/hooks/useSSS';
import { toast } from 'react-hot-toast';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAccount } from '@solana/spl-token';
import { SssAccounts, SSS_STABLECOIN_PROGRAM_ID, SSS_TRANSFER_HOOK_PROGRAM_ID } from '@stbr/sss-token';
import { Loader2, Coins, ArrowRightLeft, ShieldAlert } from 'lucide-react';

const DEVNET_MINTS = [
  { label: 'SSS-1 (Devnet) ', address: 'F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD' },
  { label: 'SSS-2 (Devnet)', address: '69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf' }
];

const isValidPublicKey = (key: string) => {
  try {
    new PublicKey(key);
    return true;
  } catch {
    return false;
  }
};

const parseTransferLogs = (logs: string[] | null | undefined): string => {
  const joined = logs?.join('\n') ?? '';

  if (!joined) return 'Transfer simulation failed.';
  if (joined.includes('SourceBlacklisted')) return 'Transfer blocked by SSS-2 policy: source is blacklisted.';
  if (joined.includes('DestinationBlacklisted')) return 'Transfer blocked by SSS-2 policy: destination is blacklisted.';
  if (joined.includes('AccountFrozen')) return 'Transfer blocked: source or destination token account is frozen.';
  if (joined.includes('Provided owner is not allowed') || joined.includes('TokenOwnerOffCurveError')) {
    return 'Recipient must be a normal wallet address (not a PDA/program address).';
  }
  if (joined.includes('insufficient funds')) return 'Insufficient SOL for network fee / ATA creation.';
  if (joined.includes('already in use')) return 'Destination ATA already exists. Retry once.';

  const lastProgramLog = logs?.filter((line) => line.includes('Program log:')).slice(-1)[0];
  return lastProgramLog?.replace('Program log: ', '') ?? 'Transfer simulation failed. See console logs.';
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const accounts = useMemo(() => new SssAccounts(SSS_STABLECOIN_PROGRAM_ID), []);
  const [mintInput, setMintInput] = useState('');
  const [activeMint, setActiveMint] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const [mintAmount, setMintAmount] = useState('');
  const [mintRecipient, setMintRecipient] = useState('');
  const [burnAmount, setBurnAmount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');
  const [isMinting, setIsMinting] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  const { mintTokens, burnTokens, mintAddress } = useSSS(activeMint);

  const fetchBalance = async () => {
    if (!publicKey || !mintAddress) return;
    try {
      const ata = getAssociatedTokenAddressSync(mintAddress, publicKey, false, TOKEN_2022_PROGRAM_ID);
      const acc = await connection.getTokenAccountBalance(ata);
      setBalance(Number(acc.value.uiAmount));
    } catch {
      setBalance(0);
    }
  };

  useEffect(() => {
    if (activeMint && publicKey) fetchBalance();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMint, publicKey, connection]);

  const handleMint = async () => {
    if (isMinting) return;
    let tid: string | undefined;
    try {
      if (!mintAmount || !mintRecipient) return;
      if (!mintAddress) {
        toast.error('Connect a mint first', { icon: '❌' });
        return;
      }
      if (!isValidPublicKey(mintRecipient)) {
        toast.error('Invalid recipient address format!', { icon: '❌' });
        return;
      }
      if (Number(mintAmount) <= 0) {
        toast.error('Mint amount must be greater than 0', { icon: '❌' });
        return;
      }

      setIsMinting(true);

      tid = toast.loading('Minting tokens...');
      
      const mintInfo = await connection.getTokenSupply(mintAddress);
      const decimals = mintInfo.value.decimals;
      const rawAmount = Number(mintAmount) * (10 ** decimals);

      const txId = await mintTokens(rawAmount, new PublicKey(mintRecipient));
      toast.success(<div>Mint successful!<br/><a href={`https://solscan.io/tx/${txId}?cluster=devnet`} target="_blank" rel="noreferrer" className="underline text-blue-400">View on Solscan</a></div>, { id: tid });
      fetchBalance();
      setMintAmount('');
      setMintRecipient('');
    } catch (e: unknown) {
      const message = getErrorMessage(e);
      if (tid) {
        toast.error('Mint failed: ' + message, { id: tid, duration: 6000 });
      } else {
        toast.error('Mint failed: ' + message, { duration: 6000 });
      }
    } finally {
      setIsMinting(false);
    }
  };

  const handleBurn = async () => {
    if (isBurning) return;
    let tid: string | undefined;
    try {
      if (!burnAmount) return;
      if (Number(burnAmount) <= 0) {
        toast.error('Burn amount must be greater than 0', { icon: '❌' });
        return;
      }
      if (balance === null || balance < Number(burnAmount)) {
        toast.error('Insufficient token balance to burn!', { icon: '❌' });
        return;
      }

      setIsBurning(true);

      tid = toast.loading('Burning tokens...');

      if (!mintAddress) return;
      const mintInfo = await connection.getTokenSupply(mintAddress);
      const decimals = mintInfo.value.decimals;
      const rawAmount = Number(burnAmount) * (10 ** decimals);

      const txId = await burnTokens(rawAmount);
      toast.success(<div>Burn successful!<br/><a href={`https://solscan.io/tx/${txId}?cluster=devnet`} target="_blank" rel="noreferrer" className="underline text-blue-400">View on Solscan</a></div>, { id: tid });
      fetchBalance();
      setBurnAmount('');
    } catch (e: unknown) {
      const message = getErrorMessage(e);
      if (tid) {
        toast.error('Burn failed: ' + message, { id: tid });
      } else {
        toast.error('Burn failed: ' + message);
      }
    } finally {
      setIsBurning(false);
    }
  };

  const handleTransfer = async () => {
    if (isTransferring) return;
    if (!publicKey || !mintAddress) return;
    let tid: string | undefined;
    try {
      if (!transferAmount || !transferRecipient) return;
      if (!isValidPublicKey(transferRecipient)) {
        toast.error('Invalid recipient wallet address format!', { icon: '❌' });
        return;
      }
      if (balance === null || balance < Number(transferAmount)) {
        toast.error('Insufficient token balance to transfer!', { icon: '❌' });
        return;
      }

      setIsTransferring(true);

      tid = toast.loading('Transferring...');
      
      const recipient = new PublicKey(transferRecipient);
      if (!PublicKey.isOnCurve(recipient.toBytes())) {
        toast.error('Recipient must be a wallet address (on-curve public key).');
        return;
      }
      const [sourceBlacklistPda] = accounts.getBlacklistPda(mintAddress, publicKey);
      const [destBlacklistPda] = accounts.getBlacklistPda(mintAddress, recipient);
      const [extraAccountMetaListPda] = accounts.getExtraAccountMetaListPda(mintAddress);

      const [sourceBlacklistInfo, destBlacklistInfo] = await Promise.all([
        connection.getAccountInfo(sourceBlacklistPda),
        connection.getAccountInfo(destBlacklistPda),
      ]);

      if (sourceBlacklistInfo) {
        toast.error('Transfer blocked: your wallet is blacklisted for this SSS-2 mint.');
        return;
      }

      if (destBlacklistInfo) {
        toast.error('Transfer blocked: recipient wallet is blacklisted for this SSS-2 mint.');
        return;
      }

      const sourceAta = getAssociatedTokenAddressSync(mintAddress, publicKey, false, TOKEN_2022_PROGRAM_ID);
      const destAta = getAssociatedTokenAddressSync(mintAddress, recipient, false, TOKEN_2022_PROGRAM_ID);

      const tx = new Transaction();
      const mintInfo = await connection.getTokenSupply(mintAddress);
      const decimals = mintInfo.value.decimals;
      const rawAmount = BigInt(Math.round(Number(transferAmount) * (10 ** decimals)));

      // SSS-2 one-time setup: initialize transfer-hook ExtraAccountMetaList PDA if missing.
      const extraMetaInfo = await connection.getAccountInfo(extraAccountMetaListPda);
      if (!extraMetaInfo) {
        if (!signTransaction) {
          toast.error('Wallet does not support transaction signing.');
          return;
        }

        const initHookIx = new TransactionInstruction({
          programId: SSS_TRANSFER_HOOK_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: mintAddress, isSigner: false, isWritable: false },
            { pubkey: extraAccountMetaListPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.from([92, 197, 174, 197, 41, 124, 19, 3]),
        });

        const initTx = new Transaction().add(initHookIx);
        const initBlockhash = await connection.getLatestBlockhash();
        initTx.feePayer = publicKey;
        initTx.recentBlockhash = initBlockhash.blockhash;

        const signedInitTx = await signTransaction(initTx);
        const initSig = await connection.sendRawTransaction(signedInitTx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });

        await connection.confirmTransaction({
          signature: initSig,
          blockhash: initBlockhash.blockhash,
          lastValidBlockHeight: initBlockhash.lastValidBlockHeight,
        });

        toast.success('Initialized SSS-2 transfer hook metadata. Retrying transfer...');
      }

      const sourceTokenAccount = await getAccount(connection, sourceAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      if (sourceTokenAccount.isFrozen) {
        toast.error('Transfer blocked: your token account is frozen.');
        return;
      }

      if (sourceTokenAccount.amount < rawAmount) {
        toast.error('Transfer blocked: insufficient raw token amount in source account.');
        return;
      }
      
      const info = await connection.getAccountInfo(destAta);
      tx.add(createAssociatedTokenAccountIdempotentInstruction(publicKey, destAta, recipient, mintAddress, TOKEN_2022_PROGRAM_ID));
      if (info) {
        const destinationTokenAccount = await getAccount(connection, destAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
        if (destinationTokenAccount.isFrozen) {
          toast.error('Transfer blocked: destination token account is frozen.');
          return;
        }
      }

      const transferInstruction = createTransferCheckedInstruction(
        sourceAta,
        mintAddress,
        destAta,
        publicKey,
        rawAmount,
        decimals,
        [],
        TOKEN_2022_PROGRAM_ID
      );

      // Manually append SSS-2 transfer-hook accounts to avoid browser Buffer BigInt runtime issue
      // inside createTransferCheckedWithTransferHookInstruction.
      transferInstruction.keys.push(
        { pubkey: SSS_STABLECOIN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: sourceBlacklistPda, isSigner: false, isWritable: false },
        { pubkey: destBlacklistPda, isSigner: false, isWritable: false },
        { pubkey: SSS_TRANSFER_HOOK_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: extraAccountMetaListPda, isSigner: false, isWritable: false },
      );

      tx.add(transferInstruction);

      const latestBlockhash = await connection.getLatestBlockhash();
      tx.feePayer = publicKey;
      tx.recentBlockhash = latestBlockhash.blockhash;

      if (!signTransaction) {
        toast.error('Wallet does not support transaction signing.');
        return;
      }

      const signedTx = await signTransaction(tx);

      const simulation = await connection.simulateTransaction(signedTx);
      if (simulation.value.err) {
        toast.error(parseTransferLogs(simulation.value.logs), { duration: 9000 });
        console.log('Transfer simulation diagnostics:', simulation.value.err, simulation.value.logs);
        return;
      }

      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      });

      toast.success(<div>Transfer successful!<br/><a href={`https://solscan.io/tx/${signature}?cluster=devnet`} target="_blank" rel="noreferrer" className="underline text-blue-400">View on Solscan</a></div>, { id: tid });
      fetchBalance();
      setTransferAmount('');
      setTransferRecipient('');
    } catch (e: unknown) {
      const errorWithCause = e as { error?: unknown; cause?: unknown };
      let details = getErrorMessage(e);

      const nestedErrorForMessage = (errorWithCause.error ?? errorWithCause.cause) as unknown;
      if (details === 'Unknown error' && nestedErrorForMessage) {
        details = getErrorMessage(nestedErrorForMessage);
      }

      const sendError = e instanceof SendTransactionError
        ? e
        : (nestedErrorForMessage instanceof SendTransactionError ? nestedErrorForMessage : null);

      if (sendError) {
        try {
          const logs = await sendError.getLogs(connection);
          const joined = logs?.join('\n') ?? '';
          if (joined.includes('SourceBlacklisted')) {
            details = 'Transfer blocked by SSS-2 policy: source is blacklisted.';
          } else if (joined.includes('DestinationBlacklisted')) {
            details = 'Transfer blocked by SSS-2 policy: destination is blacklisted.';
          } else if (joined.includes('AccountFrozen')) {
            details = 'Transfer blocked: token account is frozen (SSS-2 compliance state).';
          } else if (joined.includes('insufficient funds')) {
            details = 'Transfer blocked: insufficient funds for fee or token amount.';
          } else if (joined) {
            details = joined;
          }
        } catch {
        }
      }

      if (tid) {
        toast.error('Transfer failed: ' + details, { id: tid, duration: 8000 });
      } else {
        toast.error('Transfer failed: ' + details, { duration: 8000 });
      }
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <header className="flex flex-col md:flex-row justify-between items-center bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-emerald-400 flex items-center gap-3">
            <Coins className="w-8 h-8 text-blue-400" />
            SSS Dashboard
          </h1>
          <p className="text-slate-400 mt-2">Manage and track your Solana Stablecoins</p>
        </div>
        <WalletMultiButton className="bg-blue-600! hover:bg-blue-700! transition-colors! rounded-xl" />
      </header>

      {publicKey ? (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-slate-300">Stablecoin Mint Address</label>
              <div className="flex gap-2">
                {DEVNET_MINTS.map((m) => (
                  <button
                    key={m.address}
                    onClick={() => {
                      setMintInput(m.address);
                      setActiveMint(m.address);
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-blue-400 px-2 py-1 rounded-md transition-colors"
                  >
                    Load {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-4">
              <input
                type="text"
                value={mintInput}
                onChange={(e) => setMintInput(e.target.value)}
                placeholder="e.g. EUhD...1A2b"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-sm"
              />
              <button
                onClick={() => {
                  if (!isValidPublicKey(mintInput)) {
                    toast.error('Not a valid Solana address');
                    return;
                  }
                  setActiveMint(mintInput);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-xl font-semibold transition-colors shadow-lg shadow-emerald-900/20"
              >
                Connect Mint
              </button>
            </div>
          </div>

          {activeMint && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="col-span-1 md:col-span-2 flex bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 p-6 rounded-2xl shadow-lg items-center justify-between">
                 <div>
                    <h2 className="text-slate-400 font-medium">Your Token Balance</h2>
                    <div className="text-5xl font-black mt-2 text-white flex gap-2 items-center">
                      {balance !== null ? balance.toLocaleString() : <Loader2 className="w-8 h-8 animate-spin text-blue-500" />}
                      <span className="text-xl text-slate-500 font-normal">SSS</span>
                    </div>
                 </div>
                 <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <div className="text-xs text-slate-500 mb-1">Active Mint</div>
                    <div className="font-mono text-sm text-blue-400">{activeMint.substring(0, 8)}...{activeMint.slice(-8)}</div>
                 </div>
              </div>

              {/* MINT */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Coins className="w-5 h-5 text-emerald-400"/> Mint Tokens</h3>
                <div className="space-y-4">
                  <input type="text" placeholder="Recipient Public Key" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm font-mono focus:ring-2 ring-emerald-500 outline-none" value={mintRecipient} onChange={e => setMintRecipient(e.target.value)} />
                  <input type="number" placeholder="Raw Amount (integer)" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:ring-2 ring-emerald-500 outline-none" value={mintAmount} onChange={e => setMintAmount(e.target.value)} />
                  <button disabled={isMinting} onClick={handleMint} className="w-full bg-emerald-600 hover:bg-emerald-700 py-3 rounded-lg font-bold transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-60 disabled:cursor-not-allowed">{isMinting ? 'Minting...' : 'Mint Issue'}</button>
                </div>
              </div>

              {/* BURN */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-rose-400"/> Burn Tokens</h3>
                <div className="space-y-4">
                  <input type="number" placeholder="Raw Amount (integer)" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:ring-2 ring-rose-500 outline-none" value={burnAmount} onChange={e => setBurnAmount(e.target.value)} />
                  <button disabled={isBurning} onClick={handleBurn} className="w-full bg-rose-600 hover:bg-rose-700 py-3 rounded-lg font-bold transition-colors mt-13 shadow-lg shadow-rose-900/20 disabled:opacity-60 disabled:cursor-not-allowed">{isBurning ? 'Burning...' : 'Burn Tokens'}</button>
                </div>
              </div>

              {/* TRANSFER */}
              <div className="md:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-blue-400"/> Transfer Protocol</h3>
                <div className="flex flex-col md:flex-row gap-4">
                   <input type="text" placeholder="Recipient Wallet Address" className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm font-mono focus:ring-2 ring-blue-500 outline-none" value={transferRecipient} onChange={e => setTransferRecipient(e.target.value)} />
                   <input type="number" placeholder="Amount (UI units e.g. 10.5)" className="md:w-48 w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:ring-2 ring-blue-500 outline-none" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} />
                   <button disabled={isTransferring} onClick={handleTransfer} className="bg-blue-600 hover:bg-blue-700 px-8 py-2 rounded-lg font-bold transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-60 disabled:cursor-not-allowed">{isTransferring ? 'Sending...' : 'Send'}</button>
                </div>
              </div>

            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-24 bg-slate-900/50 border border-slate-800 rounded-3xl backdrop-blur-sm">
          <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-900/20">
            <Coins className="w-12 h-12 text-blue-500" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Connect Wallet to Begin</h2>
          <p className="text-slate-400 max-w-md mx-auto leading-relaxed">Access the dashboard to mint, burn, monitor balances, and seamlessly transfer assets under the Solana Stablecoin Standard.</p>
        </div>
      )}
    </div>
  );
}
