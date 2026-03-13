import { Keypair, PublicKey, SystemProgram, TransactionSignature } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

import type { SolanaStablecoin } from "./stablecoin";
import { parseSssError } from "./errors";

/**
 * ComplianceModule — SSS-2 compliance operations.
 *
 * Provides blacklist management and token seizure capabilities.
 * These methods will throw ComplianceNotEnabled if used on an SSS-1 token.
 *
 * Usage:
 * ```ts
 * await stablecoin.compliance.blacklistAdd(address, "OFAC match");
 * await stablecoin.compliance.seize(frozenAccount, treasury);
 * ```
 */
export class ComplianceModule {
  constructor(private readonly parent: SolanaStablecoin) {}

  /**
   * Add an address to the blacklist.
   * The transfer hook will block all transfers to/from this address.
   */
  async blacklistAdd(
    address: PublicKey,
    reason: string,
    authority: Keypair
  ): Promise<TransactionSignature> {
    const [configPda] = this.parent.accounts.getConfigPda(this.parent.mintAddress);
    const [rolesPda] = this.parent.accounts.getRolesPda(this.parent.mintAddress);
    const [blacklistPda] = this.parent.accounts.getBlacklistPda(this.parent.mintAddress, address);

    try {
      return await this.parent.program.methods
        .addToBlacklist(reason)
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          roleConfig: rolesPda,
          addressToBlacklist: address,
          blacklistEntry: blacklistPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  /**
   * Remove an address from the blacklist.
   * Rent is returned to the authority.
   */
  async blacklistRemove(
    address: PublicKey,
    authority: Keypair
  ): Promise<TransactionSignature> {
    const [configPda] = this.parent.accounts.getConfigPda(this.parent.mintAddress);
    const [rolesPda] = this.parent.accounts.getRolesPda(this.parent.mintAddress);
    const [blacklistPda] = this.parent.accounts.getBlacklistPda(this.parent.mintAddress, address);

    try {
      return await this.parent.program.methods
        .removeFromBlacklist()
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          roleConfig: rolesPda,
          blacklistEntry: blacklistPda,
        })
        .signers([authority])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  /**
   * Seize tokens from a blacklisted/frozen account via permanent delegate.
   * Transfers tokens to the specified treasury account.
   */
  async seize(
    fromAccount: PublicKey,
    toAccount: PublicKey,
    amount: bigint | number,
    authority: Keypair
  ): Promise<TransactionSignature> {
    const [configPda] = this.parent.accounts.getConfigPda(this.parent.mintAddress);
    const [rolesPda] = this.parent.accounts.getRolesPda(this.parent.mintAddress);

    try {
      return await this.parent.program.methods
        .seize(new BN(amount.toString()))
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          roleConfig: rolesPda,
          mint: this.parent.mintAddress,
          fromAccount,
          toAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  /**
   * Check if an address is currently blacklisted.
   */
  async isBlacklisted(address: PublicKey): Promise<boolean> {
    return this.parent.isBlacklisted(address);
  }

  /**
   * Get blacklist entry details for an address.
   */
  async getBlacklistEntry(address: PublicKey) {
    const [blacklistPda] = this.parent.accounts.getBlacklistPda(this.parent.mintAddress, address);
    try {
      const account = await (this.parent.program.account as any).blacklistEntry.fetch(blacklistPda);
      return {
        mint: account.mint as PublicKey,
        address: account.address as PublicKey,
        reason: account.reason as string,
        blacklistedBy: account.blacklistedBy as PublicKey,
        blacklistedAt: (account.blacklistedAt as any).toNumber(),
        bump: account.bump as number,
      };
    } catch {
      return null;
    }
  }
}
