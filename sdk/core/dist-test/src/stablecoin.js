"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaStablecoin = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const anchor_1 = require("@coral-xyz/anchor");
const index_1 = require("./accounts/index");
const compliance_1 = require("./compliance");
const presets_1 = require("./presets");
const types_1 = require("./types");
const errors_1 = require("./errors");
const idl_json_1 = __importDefault(require("./idl.json"));
/**
 * SolanaStablecoin — Main SDK entry point.
 *
 * Usage:
 * ```ts
 * // Create with preset
 * const stable = await SolanaStablecoin.create(connection, {
 *   preset: "SSS_2",
 *   name: "My Stablecoin",
 *   symbol: "MYUSD",
 *   decimals: 6,
 *   authority: adminKeypair,
 * });
 *
 * // Load existing
 * const existing = await SolanaStablecoin.load(connection, mintAddress);
 *
 * // Operations
 * await stable.mint({ recipient, amount: 1_000_000n, minter });
 * await stable.freeze(accountAddress);
 * ```
 */
class SolanaStablecoin {
    constructor(connection, program, mintAddress, config, programId = types_1.SSS_STABLECOIN_PROGRAM_ID) {
        this.connection = connection;
        this.program = program;
        this.mintAddress = mintAddress;
        this.config = config;
        this.programId = programId;
        this.accounts = new index_1.SssAccounts(this.programId, types_1.SSS_TRANSFER_HOOK_PROGRAM_ID);
        this.compliance = new compliance_1.ComplianceModule(this);
    }
    /**
     * Create a new stablecoin with the given parameters.
     * Supports SSS-1 and SSS-2 presets, or fully custom configuration.
     */
    static async create(provider, params, programId = types_1.SSS_STABLECOIN_PROGRAM_ID) {
        const program = new anchor_1.Program(idl_json_1.default, provider);
        const initParams = (0, presets_1.resolveParams)(params);
        const mintKeypair = web3_js_1.Keypair.generate();
        const accounts = new index_1.SssAccounts(programId);
        const [configPda] = accounts.getConfigPda(mintKeypair.publicKey);
        const [rolesPda] = accounts.getRolesPda(mintKeypair.publicKey);
        const [pausePda] = accounts.getPausePda(mintKeypair.publicKey);
        try {
            const signature = await program.methods
                .initialize(initParams)
                .accounts({
                authority: params.authority.publicKey,
                mint: mintKeypair.publicKey,
                config: configPda,
                roleConfig: rolesPda,
                pauseState: pausePda,
                tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
                systemProgram: web3_js_1.SystemProgram.programId,
                rent: web3_js_1.SYSVAR_RENT_PUBKEY,
            })
                .signers([params.authority, mintKeypair])
                .rpc();
            const stablecoin = await SolanaStablecoin.load(provider, mintKeypair.publicKey, programId);
            return { stablecoin, mint: mintKeypair, signature };
        }
        catch (err) {
            throw (0, errors_1.parseSssError)(err);
        }
    }
    /**
     * Load an existing stablecoin by its mint address.
     */
    static async load(provider, mint, programId = types_1.SSS_STABLECOIN_PROGRAM_ID) {
        const program = new anchor_1.Program(idl_json_1.default, provider);
        const accounts = new index_1.SssAccounts(programId);
        const [configPda] = accounts.getConfigPda(mint);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const configAccount = await program.account.stablecoinConfig.fetch(configPda);
        const config = {
            mint: configAccount.mint,
            authority: configAccount.authority,
            name: configAccount.name,
            symbol: configAccount.symbol,
            uri: configAccount.uri,
            decimals: configAccount.decimals,
            enablePermanentDelegate: configAccount.enablePermanentDelegate,
            enableTransferHook: configAccount.enableTransferHook,
            defaultAccountFrozen: configAccount.defaultAccountFrozen,
            enableConfidentialTransfer: configAccount.enableConfidentialTransfer,
            bump: configAccount.bump,
            createdAt: configAccount.createdAt.toNumber(),
        };
        return new SolanaStablecoin(provider.connection, program, mint, config, programId);
    }
    // ─── Core Operations ────────────────────────────────────────────
    /**
     * Mint tokens to a recipient.
     */
    async mint(params) {
        const amount = new anchor_1.BN(params.amount.toString());
        const [configPda] = this.accounts.getConfigPda(this.mintAddress);
        const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
        const [minterQuotaPda] = this.accounts.getMinterQuotaPda(this.mintAddress, params.minter.publicKey);
        const [pausePda] = this.accounts.getPausePda(this.mintAddress);
        const recipientAta = (0, spl_token_1.getAssociatedTokenAddressSync)(this.mintAddress, params.recipient, false, spl_token_1.TOKEN_2022_PROGRAM_ID);
        try {
            return await this.program.methods
                .mintTokens(amount)
                .accounts({
                minter: params.minter.publicKey,
                config: configPda,
                roleConfig: rolesPda,
                minterQuota: minterQuotaPda,
                pauseState: pausePda,
                mint: this.mintAddress,
                recipientTokenAccount: recipientAta,
                tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
            })
                .signers([params.minter])
                .rpc();
        }
        catch (err) {
            throw (0, errors_1.parseSssError)(err);
        }
    }
    /**
     * Burn tokens from the burner's account.
     */
    async burn(params) {
        const amount = new anchor_1.BN(params.amount.toString());
        const [configPda] = this.accounts.getConfigPda(this.mintAddress);
        const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
        const [pausePda] = this.accounts.getPausePda(this.mintAddress);
        const burnerAta = (0, spl_token_1.getAssociatedTokenAddressSync)(this.mintAddress, params.burner.publicKey, false, spl_token_1.TOKEN_2022_PROGRAM_ID);
        try {
            return await this.program.methods
                .burnTokens(amount)
                .accounts({
                burner: params.burner.publicKey,
                config: configPda,
                roleConfig: rolesPda,
                pauseState: pausePda,
                mint: this.mintAddress,
                burnerTokenAccount: burnerAta,
                tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
            })
                .signers([params.burner])
                .rpc();
        }
        catch (err) {
            throw (0, errors_1.parseSssError)(err);
        }
    }
    /**
     * Freeze a token account.
     */
    async freeze(targetAccount, authority) {
        const [configPda] = this.accounts.getConfigPda(this.mintAddress);
        const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
        try {
            return await this.program.methods
                .freezeAccount()
                .accounts({
                authority: authority.publicKey,
                config: configPda,
                roleConfig: rolesPda,
                mint: this.mintAddress,
                targetAccount,
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
     * Thaw a frozen token account.
     */
    async thaw(targetAccount, authority) {
        const [configPda] = this.accounts.getConfigPda(this.mintAddress);
        const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
        try {
            return await this.program.methods
                .thawAccount()
                .accounts({
                authority: authority.publicKey,
                config: configPda,
                roleConfig: rolesPda,
                mint: this.mintAddress,
                targetAccount,
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
     * Pause all operations.
     */
    async pause(authority) {
        const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
        const [pausePda] = this.accounts.getPausePda(this.mintAddress);
        try {
            return await this.program.methods
                .pause()
                .accounts({
                authority: authority.publicKey,
                roleConfig: rolesPda,
                pauseState: pausePda,
            })
                .signers([authority])
                .rpc();
        }
        catch (err) {
            throw (0, errors_1.parseSssError)(err);
        }
    }
    /**
     * Unpause operations.
     */
    async unpause(authority) {
        const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
        const [pausePda] = this.accounts.getPausePda(this.mintAddress);
        try {
            return await this.program.methods
                .unpause()
                .accounts({
                authority: authority.publicKey,
                roleConfig: rolesPda,
                pauseState: pausePda,
            })
                .signers([authority])
                .rpc();
        }
        catch (err) {
            throw (0, errors_1.parseSssError)(err);
        }
    }
    // ─── Role Management ────────────────────────────────────────────
    /**
     * Add a minter with a quota.
     */
    async addMinter(minter, quota, authority) {
        const [configPda] = this.accounts.getConfigPda(this.mintAddress);
        const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
        const [minterQuotaPda] = this.accounts.getMinterQuotaPda(this.mintAddress, minter);
        try {
            return await this.program.methods
                .addMinter(new anchor_1.BN(quota.toString()))
                .accounts({
                authority: authority.publicKey,
                config: configPda,
                roleConfig: rolesPda,
                mint: this.mintAddress,
                minter,
                minterQuota: minterQuotaPda,
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
     * Remove a minter.
     */
    async removeMinter(minter, authority) {
        const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
        const [minterQuotaPda] = this.accounts.getMinterQuotaPda(this.mintAddress, minter);
        try {
            return await this.program.methods
                .removeMinter()
                .accounts({
                authority: authority.publicKey,
                roleConfig: rolesPda,
                minterQuota: minterQuotaPda,
            })
                .signers([authority])
                .rpc();
        }
        catch (err) {
            throw (0, errors_1.parseSssError)(err);
        }
    }
    /**
     * Transfer master authority.
     */
    async transferAuthority(newAuthority, currentAuthority) {
        const [configPda] = this.accounts.getConfigPda(this.mintAddress);
        const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
        try {
            return await this.program.methods
                .transferAuthority()
                .accounts({
                authority: currentAuthority.publicKey,
                config: configPda,
                roleConfig: rolesPda,
                newAuthority,
            })
                .signers([currentAuthority])
                .rpc();
        }
        catch (err) {
            throw (0, errors_1.parseSssError)(err);
        }
    }
    // ─── Read Operations ────────────────────────────────────────────
    /**
     * Get current total supply of the stablecoin.
     */
    async getTotalSupply() {
        const mintInfo = await this.connection.getTokenSupply(this.mintAddress);
        return BigInt(mintInfo.value.amount);
    }
    /**
     * Get the stablecoin configuration.
     */
    async getConfig() {
        const [configPda] = this.accounts.getConfigPda(this.mintAddress);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const account = await this.program.account.stablecoinConfig.fetch(configPda);
        return {
            mint: account.mint,
            authority: account.authority,
            name: account.name,
            symbol: account.symbol,
            uri: account.uri,
            decimals: account.decimals,
            enablePermanentDelegate: account.enablePermanentDelegate,
            enableTransferHook: account.enableTransferHook,
            defaultAccountFrozen: account.defaultAccountFrozen,
            enableConfidentialTransfer: account.enableConfidentialTransfer,
            bump: account.bump,
            createdAt: account.createdAt.toNumber(),
        };
    }
    /**
     * Get the pause state.
     */
    async isPaused() {
        const [pausePda] = this.accounts.getPausePda(this.mintAddress);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const account = await this.program.account.pauseState.fetch(pausePda);
        return account.paused;
    }
    /**
     * Get a minter's quota info.
     */
    async getMinterQuota(minter) {
        const [minterQuotaPda] = this.accounts.getMinterQuotaPda(this.mintAddress, minter);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const account = await this.program.account.minterQuota.fetch(minterQuotaPda);
            return {
                mint: account.mint,
                minter: account.minter,
                quota: BigInt(account.quota.toString()),
                minted: BigInt(account.minted.toString()),
                active: account.active,
                bump: account.bump,
                createdAt: account.createdAt.toNumber(),
            };
        }
        catch {
            return null;
        }
    }
    /**
     * Check if an address is blacklisted (SSS-2).
     */
    async isBlacklisted(address) {
        const [blacklistPda] = this.accounts.getBlacklistPda(this.mintAddress, address);
        const accountInfo = await this.connection.getAccountInfo(blacklistPda);
        return accountInfo !== null;
    }
}
exports.SolanaStablecoin = SolanaStablecoin;
