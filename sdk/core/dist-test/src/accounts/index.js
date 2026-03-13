"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SssAccounts = void 0;
const web3_js_1 = require("@solana/web3.js");
const types_1 = require("../types");
/**
 * PDA derivation helpers — mirrors the on-chain PDA seeds exactly.
 * All derivations are O(1) and deterministic.
 */
class SssAccounts {
    constructor(programId = types_1.SSS_STABLECOIN_PROGRAM_ID, hookProgramId = types_1.SSS_TRANSFER_HOOK_PROGRAM_ID) {
        this.programId = programId;
        this.hookProgramId = hookProgramId;
    }
    /** Derive StablecoinConfig PDA: ["config", mint] */
    getConfigPda(mint) {
        return web3_js_1.PublicKey.findProgramAddressSync([types_1.SEEDS.CONFIG, mint.toBuffer()], this.programId);
    }
    /** Derive RoleConfig PDA: ["roles", mint] */
    getRolesPda(mint) {
        return web3_js_1.PublicKey.findProgramAddressSync([types_1.SEEDS.ROLES, mint.toBuffer()], this.programId);
    }
    /** Derive MinterQuota PDA: ["minter", mint, minter_pubkey] */
    getMinterQuotaPda(mint, minter) {
        return web3_js_1.PublicKey.findProgramAddressSync([types_1.SEEDS.MINTER, mint.toBuffer(), minter.toBuffer()], this.programId);
    }
    /** Derive BlacklistEntry PDA: ["blacklist", mint, address] */
    getBlacklistPda(mint, address) {
        return web3_js_1.PublicKey.findProgramAddressSync([types_1.SEEDS.BLACKLIST, mint.toBuffer(), address.toBuffer()], this.programId);
    }
    /** Derive PauseState PDA: ["pause", mint] */
    getPausePda(mint) {
        return web3_js_1.PublicKey.findProgramAddressSync([types_1.SEEDS.PAUSE, mint.toBuffer()], this.programId);
    }
    /** Derive ExtraAccountMetaList PDA for transfer hook: ["extra-account-metas", mint] */
    getExtraAccountMetaListPda(mint) {
        return web3_js_1.PublicKey.findProgramAddressSync([types_1.SEEDS.EXTRA_ACCOUNT_METAS, mint.toBuffer()], this.hookProgramId);
    }
    /** Get all PDAs for a given mint (convenience method) */
    getAllPdas(mint) {
        return {
            config: this.getConfigPda(mint),
            roles: this.getRolesPda(mint),
            pause: this.getPausePda(mint),
            extraAccountMetaList: this.getExtraAccountMetaListPda(mint),
        };
    }
}
exports.SssAccounts = SssAccounts;
exports.default = SssAccounts;
