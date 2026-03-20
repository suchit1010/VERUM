import React, { useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import '@solana/wallet-adapter-react-ui/styles.css';
import { Connection, PublicKey } from '@solana/web3.js';
import { RPC_URL, ASSET_MINTS, SVS_VAULTS } from './utils/constants';
import { useProtocolState } from './hooks/useProtocolState';
import { buildSvsDepositTx, getAdaptiveCR } from './utils/basket-sdk';
import { AlertCircle, CheckCircle2, Loader, ArrowRight, Info } from 'lucide-react';

function InnerApp() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { state, prices, btcConfBps, program, refresh } = useProtocolState();
  
  const [step, setStep] = useState<'select-asset' | 'enter-amount' | 'confirm' | 'executing'>('select-asset');
  const [selectedAsset, setSelectedAsset] = useState<string>('XAU');
  const [amount, setAmount] = useState('');
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txMsg, setTxMsg] = useState('');
  const [userBalance, setUserBalance] = useState<number>(0);
  const [errorDetails, setErrorDetails] = useState('');

  const { cr, regime } = getAdaptiveCR(btcConfBps);

  const ASSETS = [
    { key: 'XAU', name: 'Gold', mint: 'F5r2ep6...', vault: SVS_VAULTS.XAU },
    { key: 'WTI', name: 'Crude Oil', mint: '69cvuJ9...', vault: SVS_VAULTS.WTI },
    { key: 'BTC', name: 'Bitcoin', mint: 'F5r2ep6...', vault: SVS_VAULTS.BTC },
    { key: 'XAG', name: 'Silver', mint: 'F5r2ep6...', vault: SVS_VAULTS.XAG },
    { key: 'DXY', name: 'DXY Index', mint: '69cvuJ9...', vault: SVS_VAULTS.DXY },
    { key: 'RWA', name: 'Tokenized RWA', mint: 'F5r2ep6...', vault: SVS_VAULTS.RWA },
  ];

  // Fetch user balance for selected asset
  useEffect(() => {
    if (!connection || !publicKey) return;
    
    (async () => {
      try {
        const mint = ASSET_MINTS[selectedAsset as keyof typeof ASSET_MINTS];
        if (!mint) return;
        
        const { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } = await import('@solana/spl-token');
        const ata = await getAssociatedTokenAddress(mint, publicKey, false, TOKEN_2022_PROGRAM_ID);
        const balance = await connection.getTokenAccountBalance(ata);
        setUserBalance(parseFloat(balance.value.uiAmount?.toString() || '0'));
      } catch (err: any) {
        console.log('No token account yet:', err.message);
        setUserBalance(0);
      }
    })();
  }, [selectedAsset, publicKey, connection]);

  const handleDeposit = async () => {
    if (!publicKey || !connected || !amount) {
      setTxStatus('error');
      setErrorDetails('Please enter an amount and connect your wallet');
      return;
    }

    if (userBalance < parseFloat(amount)) {
      setTxStatus('error');
      setErrorDetails(`Insufficient balance. You have ${userBalance.toFixed(2)}, need ${amount}`);
      return;
    }

    setStep('executing');
    setTxStatus('pending');
    setTxMsg('Building deposit transaction...');
    setErrorDetails('');

    try {
      const tx = await buildSvsDepositTx(
        connection,
        publicKey,
        selectedAsset,
        parseFloat(amount),
        6,  // decimals for Token-2022
        0
      );

      setTxMsg('Sending transaction to wallet...');
      const signature = await sendTransaction(tx, connection, { skipPreflight: false });
      
      setTxMsg(`Transaction sent: ${signature.slice(0, 16)}...`);
      setTxStatus('pending');
      
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      setTxStatus('success');
      setTxMsg(`✓ Deposit successful! TX: ${signature.slice(0, 16)}...`);
      setAmount('');
      setStep('select-asset');
      
      setTimeout(() => {
        refresh();
        setTxStatus('idle');
      }, 2000);

    } catch (error: any) {
      console.error('Full error:', error);
      setTxStatus('error');
      
      // Parse detailed error message
      let msg = error?.message || 'Unknown error';
      if (msg.includes('SendTransactionError')) {
        msg = 'Transaction simulation failed. Check that your tokens are in the correct vault.';
      }
      if (msg.includes('AccountNotInitialized')) {
        msg = 'Vault not properly initialized. Contact support.';
      }
      if (msg.includes('AccountOwnedByWrongProgram')) {
        msg = 'Token account owned by wrong program. Ensure using Token-2022.';
      }
      
      setErrorDetails(msg);
      setStep('confirm');
    }
  };

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col items-center justify-center">
        <div className="text-center space-y-6">
          <h1 className="text-5xl font-bold tracking-tight">
            VERUM <span className="text-amber-400">–</span> World Reserve Protocol
          </h1>
          <p className="text-xl text-slate-400">Connect your wallet to access the protocol</p>
          <WalletMultiButton className="!bg-amber-500 hover:!bg-amber-600 !transition-colors !h-12 !rounded-lg !font-bold !text-lg border-none" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6">
      {/* Header */}
      <div className="max-w-3xl mx-auto mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold">VERUM Protocol</h1>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-slate-400">Collateral Ratio</p>
            <p className={`text-2xl font-bold ${regime === 'CRISIS' ? 'text-red-400' : regime === 'ELEVATED' ? 'text-yellow-400' : 'text-green-400'}`}>
              {cr.toFixed(1)}% / {regime}
            </p>
          </div>
          <WalletMultiButton className="!bg-white/10 hover:!bg-white/20 !transition-colors !h-10 !rounded-lg !font-mono !text-sm border border-white/10" />
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-3xl mx-auto grid grid-cols-3 gap-6">
        {/* Left Panel: Asset Selection */}
        <div className="col-span-1 space-y-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Step 1: Select Asset</h2>
          
          <div className="space-y-2">
            {ASSETS.map((asset) => (
              <button
                key={asset.key}
                onClick={() => setSelectedAsset(asset.key)}
                className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                  selectedAsset === asset.key
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <div className="font-semibold">{asset.key}</div>
                <div className="text-sm text-slate-400">{asset.name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Balance: {asset.key === selectedAsset ? userBalance.toFixed(2) : '—'}
                </div>
              </button>
            ))}
          </div>

          {/* Price Info */}
          {prices[selectedAsset] && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-slate-400">Current Price</p>
              <p className="text-xl font-bold text-blue-400">${prices[selectedAsset]?.price.toFixed(2)}</p>
            </div>
          )}
        </div>

        {/* Middle: Amount Input */}
        <div className="col-span-1 space-y-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Step 2: Enter Amount</h2>
          
          <div className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            
            <div className="flex justify-between text-xs text-slate-400">
              <span>Available</span>
              <button
                onClick={() => setAmount(userBalance.toFixed(6))}
                className="hover:text-amber-400 transition-colors"
              >
                {userBalance.toFixed(2)}
              </button>
            </div>

            {amount && (
              <div className="p-2 rounded bg-slate-900 border border-white/5 text-xs">
                <p className="text-slate-400">USD Value</p>
                <p className="font-semibold text-green-400">
                  ${(parseFloat(amount) * (prices[selectedAsset]?.price || 0)).toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Action Button */}
        <div className="col-span-1 space-y-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Step 3: Confirm</h2>
          
          <button
            onClick={handleDeposit}
            disabled={!amount || txStatus === 'pending' || userBalance < parseFloat(amount || '0')}
            className={`w-full py-4 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-2 ${
              txStatus === 'pending'
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : userBalance < parseFloat(amount || '0')
                ? 'bg-red-500/40 text-red-300 cursor-not-allowed border border-red-500/20'
                : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black'
            }`}
          >
            {txStatus === 'pending' && <Loader className="animate-spin w-5 h-5" />}
            {txStatus === 'success' && <CheckCircle2 className="w-5 h-5" />}
            {txStatus === 'error' && <AlertCircle className="w-5 h-5" />}
            
            {txStatus === 'pending' ? 'Processing...' : txStatus === 'success' ? 'Success!' : txStatus === 'error' ? 'Error' : 'Deposit'}
          </button>

          {/* Status Messages */}
          {txMsg && (
            <div className={`p-3 rounded-lg text-xs font-mono ${
              txStatus === 'success'
                ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                : txStatus === 'error'
                ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                : 'bg-blue-500/10 border border-blue-500/20 text-blue-300'
            }`}>
              {txMsg}
            </div>
          )}

          {errorDetails && (
            <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-300 text-xs space-y-2">
              <div className="flex gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Error Details</p>
                  <p className="mt-1 font-mono text-xs">{errorDetails}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Protocol Info */}
      <div className="max-w-3xl mx-auto mt-12 p-6 rounded-lg border border-white/10 bg-white/5 space-y-4">
        <div className="flex items-gap-2">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <h3 className="font-semibold ml-2">How It Works</h3>
        </div>
        <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
          <li>Deposit your Token-2022 collateral (dUSD1 or dUSD2) into the SVS-1 vault</li>
          <li>Receive vault shares proportional to your deposit</li>
          <li>Mint BASKET tokens using your collateral as backing</li>
          <li>Redeem BASKET tokens to get your collateral back</li>
        </ol>
      </div>

      {/* State Info */}
      <div className="max-w-3xl mx-auto mt-6 grid grid-cols-3 gap-4 text-center">
        <div className="p-4 rounded-lg border border-white/10 bg-white/5">
          <p className="text-xs text-slate-400 uppercase">Total Minted</p>
          <p className="text-2xl font-bold mt-2">{state?.totalMinted?.toFixed(2) || '0'} VERUM</p>
        </div>
        <div className="p-4 rounded-lg border border-white/10 bg-white/5">
          <p className="text-xs text-slate-400 uppercase">Insurance Fund</p>
          <p className="text-2xl font-bold mt-2">{state?.insuranceFund?.toFixed(2) || '0'} SOL</p>
        </div>
        <div className="p-4 rounded-lg border border-white/10 bg-white/5">
          <p className="text-xs text-slate-400 uppercase">Emergency Mode</p>
          <p className={`text-2xl font-bold mt-2 ${state?.emergencyMode ? 'text-red-400' : 'text-green-400'}`}>
            {state?.emergencyMode ? 'ACTIVE' : 'OK'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={[new PhantomWalletAdapter()]} autoConnect>
        <WalletModalProvider>
          <InnerApp />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
