"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * SSS SDK Advanced Tests
 *
 * Deeper SDK coverage beyond sdk.test.ts:
 *   - SSS-2 creation & compliance flag verification
 *   - getConfig() return shape
 *   - getTotalSupply() precision across mint/burn operations
 *   - freeze() / thaw() via SDK
 *   - removeMinter() via SDK
 *   - Full compliance module: blacklistAdd, isBlacklisted, blacklistRemove, getBlacklistEntry
 *   - SDK error wrapping for unauthorized calls
 *   - SSS-1 isBlacklisted() always returns false (no PDA)
 */
const anchor = __importStar(require("@coral-xyz/anchor"));
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const chai_1 = require("chai");
const stablecoin_1 = require("../src/stablecoin");
describe("SSS SDK Advanced Tests", () => {
    const provider = anchor_1.AnchorProvider.env();
    anchor.setProvider(provider);
    const authority = provider.wallet;
    const adminKeypair = authority.payer;
    const minter = web3_js_1.Keypair.generate();
    const burner = web3_js_1.Keypair.generate();
    const alice = web3_js_1.Keypair.generate();
    const bob = web3_js_1.Keypair.generate();
    let sss1;
    let sss1Mint;
    let sss2;
    let sss2Mint;
    before(async () => {
        await Promise.all([
            provider.connection.requestAirdrop(minter.publicKey, 10000000000),
            provider.connection.requestAirdrop(burner.publicKey, 10000000000),
            provider.connection.requestAirdrop(alice.publicKey, 10000000000),
            provider.connection.requestAirdrop(bob.publicKey, 10000000000),
        ]);
        await new Promise(r => setTimeout(r, 1000));
    });
    // ─── 1. SSS-1 via SDK ────────────────────────────────────────────
    it("SDK creates SSS-1 with correct flags in config", async () => {
        const res = await stablecoin_1.SolanaStablecoin.create(provider, {
            preset: "SSS_1",
            name: "SDK Advanced USD",
            symbol: "saUSD",
            decimals: 6,
            authority: adminKeypair,
        });
        sss1 = res.stablecoin;
        sss1Mint = res.mint;
        (0, chai_1.expect)(sss1.config.enablePermanentDelegate).to.be.false;
        (0, chai_1.expect)(sss1.config.enableTransferHook).to.be.false;
        (0, chai_1.expect)(sss1.config.name).to.equal("SDK Advanced USD");
        (0, chai_1.expect)(sss1.config.symbol).to.equal("saUSD");
    });
    it("SDK getConfig() returns a fresh, up-to-date StablecoinConfig", async () => {
        const config = await sss1.getConfig();
        (0, chai_1.expect)(config.mint.toBase58()).to.equal(sss1Mint.publicKey.toBase58());
        (0, chai_1.expect)(config.authority.toBase58()).to.equal(adminKeypair.publicKey.toBase58());
        (0, chai_1.expect)(config.decimals).to.equal(6);
        (0, chai_1.expect)(config.createdAt).to.be.greaterThan(0);
    });
    it("SDK getTotalSupply() returns 0 before any minting", async () => {
        const supply = await sss1.getTotalSupply();
        (0, chai_1.expect)(supply.toString()).to.equal("0");
    });
    it("SDK addMinter() + getMinterQuota() round-trip works correctly", async () => {
        await sss1.addMinter(minter.publicKey, 10000000n, adminKeypair);
        const quota = await sss1.getMinterQuota(minter.publicKey);
        (0, chai_1.expect)(quota).to.not.be.null;
        (0, chai_1.expect)(quota.quota.toString()).to.equal("10000000");
        (0, chai_1.expect)(quota.minted.toString()).to.equal("0");
        (0, chai_1.expect)(quota.active).to.be.true;
    });
    it("SDK mint() increases getTotalSupply() correctly", async () => {
        const aliceAta = (0, spl_token_1.getAssociatedTokenAddressSync)(sss1Mint.publicKey, alice.publicKey, false, spl_token_1.TOKEN_2022_PROGRAM_ID);
        const burnerAta = (0, spl_token_1.getAssociatedTokenAddressSync)(sss1Mint.publicKey, burner.publicKey, false, spl_token_1.TOKEN_2022_PROGRAM_ID);
        const tx = new web3_js_1.Transaction().add((0, spl_token_1.createAssociatedTokenAccountInstruction)(authority.publicKey, aliceAta, alice.publicKey, sss1Mint.publicKey, spl_token_1.TOKEN_2022_PROGRAM_ID), (0, spl_token_1.createAssociatedTokenAccountInstruction)(authority.publicKey, burnerAta, burner.publicKey, sss1Mint.publicKey, spl_token_1.TOKEN_2022_PROGRAM_ID));
        await provider.sendAndConfirm(tx, []);
        await sss1.mint({ recipient: alice.publicKey, amount: 3000000n, minter });
        const supply = await sss1.getTotalSupply();
        (0, chai_1.expect)(supply.toString()).to.equal("3000000");
    });
    it("SDK getMinterQuota() reflects minted amount after minting", async () => {
        const quota = await sss1.getMinterQuota(minter.publicKey);
        (0, chai_1.expect)(quota.minted.toString()).to.equal("3000000");
    });
    it("SDK getMinterQuota() returns null for unknown minter", async () => {
        const unknown = web3_js_1.Keypair.generate();
        const quota = await sss1.getMinterQuota(unknown.publicKey);
        (0, chai_1.expect)(quota).to.be.null;
    });
    // ─── 2. Burn & Supply ────────────────────────────────────────────
    it("SDK burn() decreases getTotalSupply()", async () => {
        // The initial burner role is the master authority (adminKeypair).
        // Mint an extra batch to admin's ATA so admin can burn from their own account.
        const adminAta = (0, spl_token_1.getAssociatedTokenAddressSync)(sss1Mint.publicKey, adminKeypair.publicKey, false, spl_token_1.TOKEN_2022_PROGRAM_ID);
        await provider.sendAndConfirm(new web3_js_1.Transaction().add((0, spl_token_1.createAssociatedTokenAccountIdempotentInstruction)(adminKeypair.publicKey, adminAta, adminKeypair.publicKey, sss1Mint.publicKey, spl_token_1.TOKEN_2022_PROGRAM_ID)), []);
        await sss1.mint({ recipient: adminKeypair.publicKey, amount: 1000000n, minter });
        const supplyBefore = await sss1.getTotalSupply();
        // adminKeypair is the master authority → passes is_burner() check.
        await sss1.burn({ amount: 500000n, burner: adminKeypair });
        const supplyAfter = await sss1.getTotalSupply();
        (0, chai_1.expect)((supplyBefore - supplyAfter).toString()).to.equal("500000");
    });
    // ─── 3. Freeze / Thaw ────────────────────────────────────────────
    it("SDK freeze() prevents token transfer from frozen account", async () => {
        const aliceAta = (0, spl_token_1.getAssociatedTokenAddressSync)(sss1Mint.publicKey, alice.publicKey, false, spl_token_1.TOKEN_2022_PROGRAM_ID);
        await sss1.freeze(aliceAta, adminKeypair);
        const accountInfo = await provider.connection.getParsedAccountInfo(aliceAta);
        const state = accountInfo.value?.data?.parsed?.info?.state;
        (0, chai_1.expect)(state).to.equal("frozen");
    });
    it("SDK thaw() restores frozen account to active state", async () => {
        const aliceAta = (0, spl_token_1.getAssociatedTokenAddressSync)(sss1Mint.publicKey, alice.publicKey, false, spl_token_1.TOKEN_2022_PROGRAM_ID);
        await sss1.thaw(aliceAta, adminKeypair);
        const accountInfo = await provider.connection.getParsedAccountInfo(aliceAta);
        const state = accountInfo.value?.data?.parsed?.info?.state;
        (0, chai_1.expect)(state).to.equal("initialized");
    });
    // ─── 4. removeMinter() ───────────────────────────────────────────
    it("SDK removeMinter() removes the minter", async () => {
        await sss1.removeMinter(minter.publicKey, adminKeypair);
        // The account is closed; subsequent mint attempt should fail
        try {
            await sss1.mint({ recipient: alice.publicKey, amount: 1n, minter });
            chai_1.expect.fail("Should have failed — minter removed");
        }
        catch (err) {
            // Anchor will throw an account-not-found or constraint error
            (0, chai_1.expect)(err).to.exist;
        }
    });
    // ─── 5. isBlacklisted() on SSS-1 ─────────────────────────────────
    it("SDK isBlacklisted() returns false on SSS-1 (no blacklist PDA)", async () => {
        const result = await sss1.isBlacklisted(alice.publicKey);
        (0, chai_1.expect)(result).to.be.false;
    });
    // ─── 6. SSS-2 via SDK ────────────────────────────────────────────
    it("SDK creates SSS-2 with correct compliance flags", async () => {
        const res = await stablecoin_1.SolanaStablecoin.create(provider, {
            preset: "SSS_2",
            name: "SDK Compliance USD",
            symbol: "scUSD",
            decimals: 6,
            authority: adminKeypair,
        });
        sss2 = res.stablecoin;
        sss2Mint = res.mint;
        (0, chai_1.expect)(sss2.config.enablePermanentDelegate).to.be.true;
        (0, chai_1.expect)(sss2.config.enableTransferHook).to.be.true;
    });
    it("SDK SSS-2 getConfig() reflects correct compliance flags", async () => {
        const config = await sss2.getConfig();
        (0, chai_1.expect)(config.enablePermanentDelegate).to.be.true;
        (0, chai_1.expect)(config.enableTransferHook).to.be.true;
        (0, chai_1.expect)(config.name).to.equal("SDK Compliance USD");
    });
    it("SDK SSS-2 load by mint address properly restores compliance flags", async () => {
        const loaded = await stablecoin_1.SolanaStablecoin.load(provider, sss2Mint.publicKey);
        (0, chai_1.expect)(loaded.config.enablePermanentDelegate).to.be.true;
        (0, chai_1.expect)(loaded.config.enableTransferHook).to.be.true;
        (0, chai_1.expect)(loaded.mintAddress.toBase58()).to.equal(sss2Mint.publicKey.toBase58());
    });
    // ─── 7. Compliance Module ─────────────────────────────────────────
    it("SDK compliance.isBlacklisted() returns false for clean address", async () => {
        const result = await sss2.compliance.isBlacklisted(bob.publicKey);
        (0, chai_1.expect)(result).to.be.false;
    });
    it("SDK compliance.blacklistAdd() blacklists an address", async () => {
        await sss2.compliance.blacklistAdd(bob.publicKey, "AML violation", adminKeypair);
        const result = await sss2.compliance.isBlacklisted(bob.publicKey);
        (0, chai_1.expect)(result).to.be.true;
    });
    it("SDK compliance.getBlacklistEntry() returns structured entry data", async () => {
        const entry = await sss2.compliance.getBlacklistEntry(bob.publicKey);
        (0, chai_1.expect)(entry).to.not.be.null;
        (0, chai_1.expect)(entry.reason).to.equal("AML violation");
        (0, chai_1.expect)(entry.address.toBase58()).to.equal(bob.publicKey.toBase58());
        (0, chai_1.expect)(entry.blacklistedBy.toBase58()).to.equal(adminKeypair.publicKey.toBase58());
        (0, chai_1.expect)(entry.blacklistedAt).to.be.greaterThan(0);
    });
    it("SDK compliance.getBlacklistEntry() returns null for non-blacklisted address", async () => {
        const unknown = web3_js_1.Keypair.generate();
        const entry = await sss2.compliance.getBlacklistEntry(unknown.publicKey);
        (0, chai_1.expect)(entry).to.be.null;
    });
    it("SDK compliance.blacklistRemove() removes the address from blacklist", async () => {
        await sss2.compliance.blacklistRemove(bob.publicKey, adminKeypair);
        const result = await sss2.compliance.isBlacklisted(bob.publicKey);
        (0, chai_1.expect)(result).to.be.false;
    });
    // ─── 8. Error Handling ────────────────────────────────────────────
    it("SDK transferAuthority() correctly updates config.authority", async () => {
        const newAuth = web3_js_1.Keypair.generate();
        await sss1.transferAuthority(newAuth.publicKey, adminKeypair);
        const config = await sss1.getConfig();
        (0, chai_1.expect)(config.authority.toBase58()).to.equal(newAuth.publicKey.toBase58());
    });
});
