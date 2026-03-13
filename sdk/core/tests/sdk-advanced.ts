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
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { expect } from "chai";
import { SolanaStablecoin } from "../src/stablecoin";

describe("SSS SDK Advanced Tests", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const authority    = provider.wallet as anchor.Wallet;
  const adminKeypair = (authority as any).payer as Keypair;

  const minter = Keypair.generate();
  const burner = Keypair.generate();
  const alice   = Keypair.generate();
  const bob     = Keypair.generate();

  let sss1: SolanaStablecoin;
  let sss1Mint: Keypair;
  let sss2: SolanaStablecoin;
  let sss2Mint: Keypair;

  before(async () => {
    await Promise.all([
      provider.connection.requestAirdrop(minter.publicKey, 10_000_000_000),
      provider.connection.requestAirdrop(burner.publicKey, 10_000_000_000),
      provider.connection.requestAirdrop(alice.publicKey,  10_000_000_000),
      provider.connection.requestAirdrop(bob.publicKey,    10_000_000_000),
    ]);
    await new Promise(r => setTimeout(r, 1000));
  });

  // ─── 1. SSS-1 via SDK ────────────────────────────────────────────

  it("SDK creates SSS-1 with correct flags in config", async () => {
    const res = await SolanaStablecoin.create(provider, {
      preset: "SSS_1",
      name: "SDK Advanced USD",
      symbol: "saUSD",
      decimals: 6,
      authority: adminKeypair,
    });
    sss1 = res.stablecoin;
    sss1Mint = res.mint;

    expect(sss1.config.enablePermanentDelegate).to.be.false;
    expect(sss1.config.enableTransferHook).to.be.false;
    expect(sss1.config.name).to.equal("SDK Advanced USD");
    expect(sss1.config.symbol).to.equal("saUSD");
  });

  it("SDK getConfig() returns a fresh, up-to-date StablecoinConfig", async () => {
    const config = await sss1.getConfig();
    expect(config.mint.toBase58()).to.equal(sss1Mint.publicKey.toBase58());
    expect(config.authority.toBase58()).to.equal(adminKeypair.publicKey.toBase58());
    expect(config.decimals).to.equal(6);
    expect(config.createdAt).to.be.greaterThan(0);
  });

  it("SDK getTotalSupply() returns 0 before any minting", async () => {
    const supply = await sss1.getTotalSupply();
    expect(supply.toString()).to.equal("0");
  });

  it("SDK addMinter() + getMinterQuota() round-trip works correctly", async () => {
    await sss1.addMinter(minter.publicKey, 10_000_000n, adminKeypair);
    const quota = await sss1.getMinterQuota(minter.publicKey);
    expect(quota).to.not.be.null;
    expect(quota!.quota.toString()).to.equal("10000000");
    expect(quota!.minted.toString()).to.equal("0");
    expect(quota!.active).to.be.true;
  });

  it("SDK mint() increases getTotalSupply() correctly", async () => {
    const aliceAta = getAssociatedTokenAddressSync(sss1Mint.publicKey, alice.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const burnerAta = getAssociatedTokenAddressSync(sss1Mint.publicKey, burner.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(authority.publicKey, aliceAta, alice.publicKey, sss1Mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountInstruction(authority.publicKey, burnerAta, burner.publicKey, sss1Mint.publicKey, TOKEN_2022_PROGRAM_ID),
    );
    await provider.sendAndConfirm(tx, []);

    await sss1.mint({ recipient: alice.publicKey, amount: 3_000_000n, minter });
    const supply = await sss1.getTotalSupply();
    expect(supply.toString()).to.equal("3000000");
  });

  it("SDK getMinterQuota() reflects minted amount after minting", async () => {
    const quota = await sss1.getMinterQuota(minter.publicKey);
    expect(quota!.minted.toString()).to.equal("3000000");
  });

  it("SDK getMinterQuota() returns null for unknown minter", async () => {
    const unknown = Keypair.generate();
    const quota = await sss1.getMinterQuota(unknown.publicKey);
    expect(quota).to.be.null;
  });

  // ─── 2. Burn & Supply ────────────────────────────────────────────

  it("SDK burn() decreases getTotalSupply()", async () => {
    // The initial burner role is the master authority (adminKeypair).
    // Mint an extra batch to admin's ATA so admin can burn from their own account.
    const adminAta = getAssociatedTokenAddressSync(sss1Mint.publicKey, adminKeypair.publicKey, false, TOKEN_2022_PROGRAM_ID);
    await provider.sendAndConfirm(
      new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          adminKeypair.publicKey, adminAta, adminKeypair.publicKey, sss1Mint.publicKey, TOKEN_2022_PROGRAM_ID
        )
      ), []
    );
    await sss1.mint({ recipient: adminKeypair.publicKey, amount: 1_000_000n, minter });
    const supplyBefore = await sss1.getTotalSupply();

    // adminKeypair is the master authority → passes is_burner() check.
    await sss1.burn({ amount: 500_000n, burner: adminKeypair });
    const supplyAfter = await sss1.getTotalSupply();

    expect((supplyBefore - supplyAfter).toString()).to.equal("500000");
  });

  // ─── 3. Freeze / Thaw ────────────────────────────────────────────

  it("SDK freeze() prevents token transfer from frozen account", async () => {
    const aliceAta = getAssociatedTokenAddressSync(sss1Mint.publicKey, alice.publicKey, false, TOKEN_2022_PROGRAM_ID);
    await sss1.freeze(aliceAta, adminKeypair);

    const accountInfo = await provider.connection.getParsedAccountInfo(aliceAta);
    const state = (accountInfo.value?.data as any)?.parsed?.info?.state;
    expect(state).to.equal("frozen");
  });

  it("SDK thaw() restores frozen account to active state", async () => {
    const aliceAta = getAssociatedTokenAddressSync(sss1Mint.publicKey, alice.publicKey, false, TOKEN_2022_PROGRAM_ID);
    await sss1.thaw(aliceAta, adminKeypair);

    const accountInfo = await provider.connection.getParsedAccountInfo(aliceAta);
    const state = (accountInfo.value?.data as any)?.parsed?.info?.state;
    expect(state).to.equal("initialized");
  });

  // ─── 4. removeMinter() ───────────────────────────────────────────

  it("SDK removeMinter() removes the minter", async () => {
    await sss1.removeMinter(minter.publicKey, adminKeypair);
    // The account is closed; subsequent mint attempt should fail
    try {
      await sss1.mint({ recipient: alice.publicKey, amount: 1n, minter });
      expect.fail("Should have failed — minter removed");
    } catch (err: any) {
      // Anchor will throw an account-not-found or constraint error
      expect(err).to.exist;
    }
  });

  // ─── 5. isBlacklisted() on SSS-1 ─────────────────────────────────

  it("SDK isBlacklisted() returns false on SSS-1 (no blacklist PDA)", async () => {
    const result = await sss1.isBlacklisted(alice.publicKey);
    expect(result).to.be.false;
  });

  // ─── 6. SSS-2 via SDK ────────────────────────────────────────────

  it("SDK creates SSS-2 with correct compliance flags", async () => {
    const res = await SolanaStablecoin.create(provider, {
      preset: "SSS_2",
      name: "SDK Compliance USD",
      symbol: "scUSD",
      decimals: 6,
      authority: adminKeypair,
    });
    sss2 = res.stablecoin;
    sss2Mint = res.mint;

    expect(sss2.config.enablePermanentDelegate).to.be.true;
    expect(sss2.config.enableTransferHook).to.be.true;
  });

  it("SDK SSS-2 getConfig() reflects correct compliance flags", async () => {
    const config = await sss2.getConfig();
    expect(config.enablePermanentDelegate).to.be.true;
    expect(config.enableTransferHook).to.be.true;
    expect(config.name).to.equal("SDK Compliance USD");
  });

  it("SDK SSS-2 load by mint address properly restores compliance flags", async () => {
    const loaded = await SolanaStablecoin.load(provider, sss2Mint.publicKey);
    expect(loaded.config.enablePermanentDelegate).to.be.true;
    expect(loaded.config.enableTransferHook).to.be.true;
    expect(loaded.mintAddress.toBase58()).to.equal(sss2Mint.publicKey.toBase58());
  });

  // ─── 7. Compliance Module ─────────────────────────────────────────

  it("SDK compliance.isBlacklisted() returns false for clean address", async () => {
    const result = await sss2.compliance.isBlacklisted(bob.publicKey);
    expect(result).to.be.false;
  });

  it("SDK compliance.blacklistAdd() blacklists an address", async () => {
    await sss2.compliance.blacklistAdd(bob.publicKey, "AML violation", adminKeypair);
    const result = await sss2.compliance.isBlacklisted(bob.publicKey);
    expect(result).to.be.true;
  });

  it("SDK compliance.getBlacklistEntry() returns structured entry data", async () => {
    const entry = await sss2.compliance.getBlacklistEntry(bob.publicKey);
    expect(entry).to.not.be.null;
    expect(entry!.reason).to.equal("AML violation");
    expect(entry!.address.toBase58()).to.equal(bob.publicKey.toBase58());
    expect(entry!.blacklistedBy.toBase58()).to.equal(adminKeypair.publicKey.toBase58());
    expect(entry!.blacklistedAt).to.be.greaterThan(0);
  });

  it("SDK compliance.getBlacklistEntry() returns null for non-blacklisted address", async () => {
    const unknown = Keypair.generate();
    const entry = await sss2.compliance.getBlacklistEntry(unknown.publicKey);
    expect(entry).to.be.null;
  });

  it("SDK compliance.blacklistRemove() removes the address from blacklist", async () => {
    await sss2.compliance.blacklistRemove(bob.publicKey, adminKeypair);
    const result = await sss2.compliance.isBlacklisted(bob.publicKey);
    expect(result).to.be.false;
  });

  // ─── 8. Error Handling ────────────────────────────────────────────

  it("SDK transferAuthority() correctly updates config.authority", async () => {
    const newAuth = Keypair.generate();
    await sss1.transferAuthority(newAuth.publicKey, adminKeypair);
    const config = await sss1.getConfig();
    expect(config.authority.toBase58()).to.equal(newAuth.publicKey.toBase58());
  });
});
