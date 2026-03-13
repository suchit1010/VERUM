import { useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, Idl, BN, type Wallet as AnchorWallet } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { SssAccounts, SSS_STABLECOIN_PROGRAM_ID } from '@stbr/sss-token';
import SssStablecoinIdl from '@/lib/idl.json';

export function useAnchorProvider() {
  const { connection } = useConnection();
  const wallet = useWallet();

  return useMemo(() => {
    if (!wallet || !wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      return null;
    }
    return new AnchorProvider(
      connection,
      wallet as unknown as AnchorWallet,
      AnchorProvider.defaultOptions()
    );
  }, [connection, wallet]);
}

export function useSSS(mintString: string | null) {
  const provider = useAnchorProvider();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const accounts = useMemo(() => new SssAccounts(SSS_STABLECOIN_PROGRAM_ID), []);
  const mintAddress = useMemo(() => {
    try {
      return mintString ? new PublicKey(mintString) : null;
    } catch {
      return null;
    }
  }, [mintString]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new Program(SssStablecoinIdl as Idl, provider);
  }, [provider]);

  const mintTokens = async (amount: number, recipient: PublicKey) => {
    if (!program || !mintAddress || !publicKey) throw new Error('Wallet not connected');
    const [configPda] = accounts.getConfigPda(mintAddress);
    const [rolesPda] = accounts.getRolesPda(mintAddress);
    const [minterQuotaPda] = accounts.getMinterQuotaPda(mintAddress, publicKey);
    const [pausePda] = accounts.getPausePda(mintAddress);

    // Pre-flight check: Ensure minter role exists
    try {
      const minterQuotaAccount = (program.account as Record<string, { fetch: (address: PublicKey) => Promise<unknown> }>).minterQuota;
      if (!minterQuotaAccount) {
        throw new Error('SDK account client missing minterQuota account mapping.');
      }
      await minterQuotaAccount.fetch(minterQuotaPda);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('Account does not exist')) {
        throw new Error('Not Authorized: Your wallet is not a configured Minter for this stablecoin.');
      }
      throw e;
    }

    const recipientAta = getAssociatedTokenAddressSync(mintAddress, recipient, false, TOKEN_2022_PROGRAM_ID);
    
    // Check if ATA exists
    const accountInfo = await connection.getAccountInfo(recipientAta);
    const preInstructions = [];
    if (!accountInfo) {
       preInstructions.push(
         createAssociatedTokenAccountInstruction(publicKey, recipientAta, recipient, mintAddress, TOKEN_2022_PROGRAM_ID)
       );
    }
    
    const tx = await program.methods
      .mintTokens(new BN(amount))
      .accounts({
        minter: publicKey,
        config: configPda,
        roleConfig: rolesPda,
        minterQuota: minterQuotaPda,
        pauseState: pausePda,
        mint: mintAddress,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .preInstructions(preInstructions)
      .rpc();

    return tx;
  };

  const burnTokens = async (amount: number) => {
    if (!program || !mintAddress || !publicKey) throw new Error('Wallet not connected');
    const [configPda] = accounts.getConfigPda(mintAddress);
    const [rolesPda] = accounts.getRolesPda(mintAddress);
    const [pausePda] = accounts.getPausePda(mintAddress);

    const burnerTokenAccount = getAssociatedTokenAddressSync(mintAddress, publicKey, false, TOKEN_2022_PROGRAM_ID);

    const tx = await program.methods
      .burnTokens(new BN(amount))
      .accounts({
        burner: publicKey,
        config: configPda,
        roleConfig: rolesPda,
        pauseState: pausePda,
        mint: mintAddress,
        burnerTokenAccount: burnerTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    return tx;
  };

  return {
    program,
    mintTokens,
    burnTokens,
    mintAddress,
  };
}

