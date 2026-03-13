"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceModule = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const anchor_1 = require("@coral-xyz/anchor");
const errors_1 = require("./errors");
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
class ComplianceModule {
    constructor(parent) {
        this.parent = parent;
    }
    /**
     * Add an address to the blacklist.
     * The transfer hook will block all transfers to/from this address.
     */
    async blacklistAdd(address, reason, authority) {
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
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .signers([authority])
                .rpc();
        }
        catch (err) {
            throw (0, errors_1.parseSssError)(err);
        }
    }
    /**
     * Remove an address from the blacklist.
     * Rent is returned to the authority.
     */
    async blacklistRemove(address, authority) {
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
        }
        catch (err) {
            throw (0, errors_1.parseSssError)(err);
        }
    }
    /**
     * Seize tokens from a blacklisted/frozen account via permanent delegate.
     * Transfers tokens to the specified treasury account.
     */
    async seize(fromAccount, toAccount, amount, authority) {
        const [configPda] = this.parent.accounts.getConfigPda(this.parent.mintAddress);
        const [rolesPda] = this.parent.accounts.getRolesPda(this.parent.mintAddress);
        try {
            return await this.parent.program.methods
                .seize(new anchor_1.BN(amount.toString()))
                .accounts({
                authority: authority.publicKey,
                config: configPda,
                roleConfig: rolesPda,
                mint: this.parent.mintAddress,
                fromAccount,
                toAccount,
                tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
            })
                .signers([authority])
                .rpc();
        }
        catch (err) {
            throw (0, errors_1.parseSssError)(err);
        }
    }
    /**
     * Check if an address is currently blacklisted.
     */
    async isBlacklisted(address) {
        return this.parent.isBlacklisted(address);
    }
    /**
     * Get blacklist entry details for an address.
     */
    async getBlacklistEntry(address) {
        const [blacklistPda] = this.parent.accounts.getBlacklistPda(this.parent.mintAddress, address);
        try {
            const account = await this.parent.program.account.blacklistEntry.fetch(blacklistPda);
            return {
                mint: account.mint,
                address: account.address,
                reason: account.reason,
                blacklistedBy: account.blacklistedBy,
                blacklistedAt: account.blacklistedAt.toNumber(),
                bump: account.bump,
            };
        }
        catch {
            return null;
        }
    }
}
exports.ComplianceModule = ComplianceModule;
