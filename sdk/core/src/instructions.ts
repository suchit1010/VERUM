import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { SolanaStablecoin } from './stablecoin';

/**
 * Instruction builder architecture for extreme SDK scale (100k+ users).
 * 
 * FIRST PRINCIPLE THINKING:
 * Direct RPC calls (.rpc()) do not scale because they cannot be batched.
 * To support massive scale, high throughput, and atomic operations, the SDK must expose 
 * raw TransactionInstructions. These can be combined with ComputeBudget instructions 
 * and address lookup tables (ALTs) to construct highly optimized VersionedTransactions.
 */
export class StablecoinInstructionBuilder {
  constructor(private readonly stablecoin: SolanaStablecoin) {}

  async mint(
    recipient: PublicKey,
    amount: bigint | number,
    minter: PublicKey
  ): Promise<TransactionInstruction> {
    const amountBn = new BN(amount.toString());
    const [configPda] = this.stablecoin.accounts.getConfigPda(this.stablecoin.mintAddress);
    const [rolesPda] = this.stablecoin.accounts.getRolesPda(this.stablecoin.mintAddress);
    const [minterQuotaPda] = this.stablecoin.accounts.getMinterQuotaPda(this.stablecoin.mintAddress, minter);
    const [pausePda] = this.stablecoin.accounts.getPausePda(this.stablecoin.mintAddress);

    const recipientAta = getAssociatedTokenAddressSync(
      this.stablecoin.mintAddress,
      recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return await this.stablecoin.program.methods
      .mintTokens(amountBn)
      .accounts({
        minter,
        config: configPda,
        roleConfig: rolesPda,
        minterQuota: minterQuotaPda,
        pauseState: pausePda,
        mint: this.stablecoin.mintAddress,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction();
  }
}
