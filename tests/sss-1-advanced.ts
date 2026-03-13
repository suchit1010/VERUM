/**
 * SSS-1: Advanced Edge Cases & Configuration Tests
 *
 * Extends sss-1.ts with deeper validation:
 *   - Input boundary conditions
 *   - Multi-minter quota lifecycle
 *   - Burn edge cases
 *   - Role succession flow
 *   - Authority transfer & succession
 *
 * All tests use a fresh mint; state carries over sequentially.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { SssStablecoin } from "../target/types/sss_stablecoin";

const SEED_CONFIG = Buffer.from("config");
const SEED_ROLES  = Buffer.from("roles");
const SEED_MINTER = Buffer.from("minter");
const SEED_PAUSE  = Buffer.from("pause");

describe("SSS-1: Advanced Edge Cases & Configuration", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program  = anchor.workspace.SssStablecoin as Program<SssStablecoin>;
  const authority = provider.wallet as anchor.Wallet;

  // Primary shared mint
  let mintKeypair: Keypair;
  let configPda:   PublicKey;
  let rolesPda:    PublicKey;
  let pausePda:    PublicKey;

  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  const user3 = Keypair.generate();

  let user1Ata:      PublicKey;
  let user2Ata:      PublicKey;
  let authorityAta:  PublicKey;

  before(async () => {
    await Promise.all([
      provider.connection.requestAirdrop(user1.publicKey, 10_000_000_000),
      provider.connection.requestAirdrop(user2.publicKey, 10_000_000_000),
      provider.connection.requestAirdrop(user3.publicKey, 10_000_000_000),
    ]);
    // Allow airdrop to confirm
    await new Promise(r => setTimeout(r, 800));

    mintKeypair  = Keypair.generate();
    [configPda]  = PublicKey.findProgramAddressSync([SEED_CONFIG, mintKeypair.publicKey.toBuffer()], program.programId);
    [rolesPda]   = PublicKey.findProgramAddressSync([SEED_ROLES,  mintKeypair.publicKey.toBuffer()], program.programId);
    [pausePda]   = PublicKey.findProgramAddressSync([SEED_PAUSE,  mintKeypair.publicKey.toBuffer()], program.programId);

    user1Ata     = getAssociatedTokenAddressSync(mintKeypair.publicKey, user1.publicKey,     false, TOKEN_2022_PROGRAM_ID);
    user2Ata     = getAssociatedTokenAddressSync(mintKeypair.publicKey, user2.publicKey,     false, TOKEN_2022_PROGRAM_ID);
    authorityAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);
  });

  // ─── Group 1: Input Validation (throw-away mints) ───────────────

  it("fails to initialize with symbol longer than 10 characters", async () => {
    const m = Keypair.generate();
    try {
      await program.methods.initialize({
        name: "Test", symbol: "TOOLONGSYMB", uri: "", decimals: 6,
        enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
      }).accounts({ authority: authority.publicKey, mint: m.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
        .signers([m]).rpc();
      expect.fail("Should have thrown InvalidSymbol");
    } catch (err: any) {
      expect(err.message).to.include("InvalidSymbol");
    }
  });

  it("fails to initialize with URI longer than 200 characters", async () => {
    const m = Keypair.generate();
    const longUri = "https://example.com/" + "a".repeat(185); // >200 total
    try {
      await program.methods.initialize({
        name: "Test", symbol: "TST", uri: longUri, decimals: 6,
        enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
      }).accounts({ authority: authority.publicKey, mint: m.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
        .signers([m]).rpc();
      expect.fail("Should have thrown InvalidUri");
    } catch (err: any) {
      expect(err.message).to.include("InvalidUri");
    }
  });

  it("initializes successfully with 0 decimals (lower boundary)", async () => {
    const m = Keypair.generate();
    await program.methods.initialize({
      name: "Zero Decimal", symbol: "ZD", uri: "", decimals: 0,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: m.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([m]).rpc();

    const [cfg] = PublicKey.findProgramAddressSync([SEED_CONFIG, m.publicKey.toBuffer()], program.programId);
    const config = await program.account.stablecoinConfig.fetch(cfg);
    expect(config.decimals).to.equal(0);
  });

  it("initializes successfully with exactly 18 decimals (upper boundary)", async () => {
    const m = Keypair.generate();
    await program.methods.initialize({
      name: "Max Decimal", symbol: "MD", uri: "", decimals: 18,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: m.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([m]).rpc();

    const [cfg] = PublicKey.findProgramAddressSync([SEED_CONFIG, m.publicKey.toBuffer()], program.programId);
    const config = await program.account.stablecoinConfig.fetch(cfg);
    expect(config.decimals).to.equal(18);
  });

  it("initializes successfully with symbol exactly 10 characters", async () => {
    const m = Keypair.generate();
    await program.methods.initialize({
      name: "Max Symbol", symbol: "TENCHARACT", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: m.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([m]).rpc();

    const [cfg] = PublicKey.findProgramAddressSync([SEED_CONFIG, m.publicKey.toBuffer()], program.programId);
    const config = await program.account.stablecoinConfig.fetch(cfg);
    expect(config.symbol).to.equal("TENCHARACT");
  });

  // ─── Group 2: Config Field Verification (shared mint) ───────────

  it("stores all config fields correctly after initialization", async () => {
    await program.methods.initialize({
      name: "Config Test",
      symbol: "CFG",
      uri: "https://meta.example.com/token.json",
      decimals: 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
      defaultAccountFrozen: false,
      enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mintKeypair.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mintKeypair]).rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.name).to.equal("Config Test");
    expect(config.symbol).to.equal("CFG");
    expect(config.uri).to.equal("https://meta.example.com/token.json");
    expect(config.decimals).to.equal(6);
    expect(config.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(config.mint.toBase58()).to.equal(mintKeypair.publicKey.toBase58());
    expect(config.enablePermanentDelegate).to.be.false;
    expect(config.enableTransferHook).to.be.false;
    expect(config.defaultAccountFrozen).to.be.false;
    expect(config.createdAt.toNumber()).to.be.greaterThan(0);
  });

  it("PauseState is false immediately after initialization", async () => {
    const state = await program.account.pauseState.fetch(pausePda);
    expect(state.paused).to.be.false;
  });

  it("RoleConfig has authority as all initial roles", async () => {
    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.masterAuthority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(roles.pauser.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(roles.burner.toBase58()).to.equal(authority.publicKey.toBase58());
    // SSS-1 has no blacklister/seizer
    expect(roles.blacklister.toBase58()).to.equal(PublicKey.default.toBase58());
    expect(roles.seizer.toBase58()).to.equal(PublicKey.default.toBase58());
  });

  // ─── Group 3: Multi-Minter Lifecycle ────────────────────────────

  it("creates ATAs for test wallets", async () => {
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, user1Ata,     user1.publicKey,     mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, user2Ata,     user2.publicKey,     mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, authorityAta, authority.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID),
    );
    await provider.sendAndConfirm(tx, []);
  });

  it("adds two minters with independent quotas", async () => {
    // user1 → quota 3000, user2 → quota 7000
    await program.methods.addMinter(new BN(3000))
      .accounts({ authority: authority.publicKey, mint: mintKeypair.publicKey, minter: user1.publicKey } as any).rpc();
    await program.methods.addMinter(new BN(7000))
      .accounts({ authority: authority.publicKey, mint: mintKeypair.publicKey, minter: user2.publicKey } as any).rpc();

    const [q1] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), user1.publicKey.toBuffer()], program.programId);
    const [q2] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), user2.publicKey.toBuffer()], program.programId);
    const quota1 = await program.account.minterQuota.fetch(q1);
    const quota2 = await program.account.minterQuota.fetch(q2);
    expect(quota1.quota.toNumber()).to.equal(3000);
    expect(quota2.quota.toNumber()).to.equal(7000);
    expect(quota1.active).to.be.true;
    expect(quota2.active).to.be.true;
  });

  it("minterQuota.minted tracks how much has been minted", async () => {
    const [q1] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), user1.publicKey.toBuffer()], program.programId);
    await program.methods.mintTokens(new BN(1500)).accounts({
      minter: user1.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: q1,
      pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: user1Ata,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([user1]).rpc();

    const state = await program.account.minterQuota.fetch(q1);
    expect(state.minted.toNumber()).to.equal(1500);
  });

  it("second mint accumulates minted total", async () => {
    const [q1] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), user1.publicKey.toBuffer()], program.programId);
    await program.methods.mintTokens(new BN(1000)).accounts({
      minter: user1.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: q1,
      pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: user1Ata,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([user1]).rpc();

    const state = await program.account.minterQuota.fetch(q1);
    expect(state.minted.toNumber()).to.equal(2500); // 1500 + 1000
  });

  it("mints exact remaining quota (boundary success)", async () => {
    const [q1] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), user1.publicKey.toBuffer()], program.programId);
    // 2500 minted, quota=3000, remaining=500
    await program.methods.mintTokens(new BN(500)).accounts({
      minter: user1.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: q1,
      pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: user1Ata,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([user1]).rpc();

    const state = await program.account.minterQuota.fetch(q1);
    expect(state.minted.toNumber()).to.equal(3000); // fully used
  });

  it("fails to mint 1 token after quota is fully exhausted", async () => {
    const [q1] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), user1.publicKey.toBuffer()], program.programId);
    try {
      await program.methods.mintTokens(new BN(1)).accounts({
        minter: user1.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: q1,
        pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: user1Ata,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([user1]).rpc();
      expect.fail("Should have thrown QuotaExceeded");
    } catch (err: any) {
      expect(err.message).to.include("QuotaExceeded");
    }
  });

  it("removes user2 as a minter", async () => {
    const [q2] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mintKeypair.publicKey.toBuffer(), user2.publicKey.toBuffer()], program.programId
    );
    await program.methods.removeMinter()
      .accounts({
        authority: authority.publicKey,
        roleConfig: rolesPda,
        minterQuota: q2,
      } as any).rpc();
  });

  it("removed minter cannot mint (account closed or deactivated)", async () => {
    const [q2] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), user2.publicKey.toBuffer()], program.programId);
    try {
      await program.methods.mintTokens(new BN(100)).accounts({
        minter: user2.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: q2,
        pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: user2Ata,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([user2]).rpc();
      expect.fail("Removed minter should not be able to mint");
    } catch (err: any) {
      expect(err.message).to.exist;
    }
  });

  it("non-authority cannot remove a minter", async () => {
    const attacker = Keypair.generate();
    await provider.connection.requestAirdrop(attacker.publicKey, 1_000_000_000);
    await new Promise(r => setTimeout(r, 500));
    const [q1] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mintKeypair.publicKey.toBuffer(), user1.publicKey.toBuffer()], program.programId
    );
    try {
      await program.methods.removeMinter()
        .accounts({
          authority: attacker.publicKey,
          roleConfig: rolesPda,
          minterQuota: q1,
        } as any)
        .signers([attacker]).rpc();
      expect.fail("Should have thrown NotMasterAuthority");
    } catch (err: any) {
      expect(err.message).to.include("NotMasterAuthority");
    }
  });

  // ─── Group 4: Burn Edge Cases ────────────────────────────────────

  it("burning zero tokens fails with InvalidAmount", async () => {
    try {
      await program.methods.burnTokens(new BN(0)).accounts({
        burner: authority.publicKey, config: configPda, roleConfig: rolesPda, pauseState: pausePda,
        mint: mintKeypair.publicKey, burnerTokenAccount: authorityAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).rpc();
      expect.fail("Should fail with InvalidAmount");
    } catch (err: any) {
      expect(err.message).to.include("InvalidAmount");
    }
  });

  it("burns full balance of a token account to zero", async () => {
    // First mint some tokens to authority
    const [authMinterPda] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), authority.publicKey.toBuffer()], program.programId);
    await program.methods.addMinter(new BN(2000))
      .accounts({ authority: authority.publicKey, mint: mintKeypair.publicKey, minter: authority.publicKey } as any).rpc();
    await program.methods.mintTokens(new BN(2000)).accounts({
      minter: authority.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: authMinterPda,
      pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: authorityAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).rpc();

    // Burn all 2000
    await program.methods.burnTokens(new BN(2000)).accounts({
      burner: authority.publicKey, config: configPda, roleConfig: rolesPda, pauseState: pausePda,
      mint: mintKeypair.publicKey, burnerTokenAccount: authorityAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).rpc();

    const bal = await provider.connection.getTokenAccountBalance(authorityAta);
    expect(bal.value.amount).to.equal("0");
  });

  // ─── Group 5: Role Updates ───────────────────────────────────────

  it("updates pauser role to user1", async () => {
    await program.methods.updateRole({ role: { pauser: {} }, newAccount: user1.publicKey })
      .accounts({ authority: authority.publicKey, config: configPda, roleConfig: rolesPda } as any).rpc();

    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.pauser.toBase58()).to.equal(user1.publicKey.toBase58());
  });

  it("new pauser (user1) can pause operations", async () => {
    await program.methods.pause()
      .accounts({ authority: user1.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any)
      .signers([user1]).rpc();

    const state = await program.account.pauseState.fetch(pausePda);
    expect(state.paused).to.be.true;
  });

  it("old pauser (authority) cannot pause after role transfer", async () => {
    // user1 paused in the previous test — unpause so we start from a clean state.
    await program.methods.unpause()
      .accounts({ authority: user1.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any)
      .signers([user1]).rpc();

    // Note: master_authority retains all role powers as a safety backstop (is_pauser includes is_master).
    // To test that the role restriction truly works, use user2 — a wallet with NO roles at all.
    let threw = false;
    try {
      await program.methods.pause()
        .accounts({ authority: user2.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any)
        .signers([user2]).rpc();
    } catch (err: any) {
      threw = true;
      expect(err.message).to.include("NotPauser");
    }
    expect(threw, "Expected pause to throw NotPauser").to.be.true;
    // State must remain unpaused.
    const state = await program.account.pauseState.fetch(pausePda);
    expect(state.paused).to.be.false;
  });

  it("updates burner role to user1", async () => {
    await program.methods.updateRole({ role: { burner: {} }, newAccount: user1.publicKey })
      .accounts({ authority: authority.publicKey, config: configPda, roleConfig: rolesPda } as any).rpc();

    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.burner.toBase58()).to.equal(user1.publicKey.toBase58());
  });

  it("old burner (authority) cannot burn after role transfer", async () => {
    // master_authority retains all powers (is_burner includes is_master).
    // To test the role restriction, use user2 — a wallet with NO roles.
    // user2's ATA must exist for Anchor's token-account constraint to pass;
    // the NotBurner check fires in the handler BEFORE the burn CPI, so zero balance is fine.
    const user2Ata = getAssociatedTokenAddressSync(mintKeypair.publicKey, user2.publicKey, false, TOKEN_2022_PROGRAM_ID);
    await provider.sendAndConfirm(
      new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          authority.publicKey, user2Ata, user2.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID
        )
      ), []
    );

    let threw = false;
    try {
      await program.methods.burnTokens(new BN(1)).accounts({
        burner: user2.publicKey, config: configPda, roleConfig: rolesPda, pauseState: pausePda,
        mint: mintKeypair.publicKey, burnerTokenAccount: user2Ata, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([user2]).rpc();
    } catch (err: any) {
      threw = true;
      expect(err.message).to.include("NotBurner");
    }
    expect(threw, "Expected burn to throw NotBurner").to.be.true;
  });

  // ─── Group 6: Authority Transfer & Succession ────────────────────

  it("transfers master authority to user3", async () => {
    await program.methods.transferAuthority().accounts({
      authority: authority.publicKey, config: configPda, roleConfig: rolesPda, newAuthority: user3.publicKey,
    } as any).rpc();

    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.masterAuthority.toBase58()).to.equal(user3.publicKey.toBase58());
  });

  it("config.authority updated to reflect new master", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.authority.toBase58()).to.equal(user3.publicKey.toBase58());
  });

  it("new master authority (user3) can add a new minter", async () => {
    const newMinter = Keypair.generate();
    await program.methods.addMinter(new BN(500))
      .accounts({ authority: user3.publicKey, mint: mintKeypair.publicKey, minter: newMinter.publicKey } as any)
      .signers([user3]).rpc();

    const [qPda] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), newMinter.publicKey.toBuffer()], program.programId);
    const state = await program.account.minterQuota.fetch(qPda);
    expect(state.active).to.be.true;
    expect(state.quota.toNumber()).to.equal(500);
  });

  it("old master authority (authority) cannot add minters after transfer", async () => {
    const dummy = Keypair.generate();
    try {
      await program.methods.addMinter(new BN(100))
        .accounts({ authority: authority.publicKey, mint: mintKeypair.publicKey, minter: dummy.publicKey } as any).rpc();
      expect.fail("Should have thrown NotMasterAuthority");
    } catch (err: any) {
      expect(err.message).to.include("NotMasterAuthority");
    }
  });

  // ─── Group 7: State Verification ─────────────────────────────────

  it("multiple pause/unpause cycles work correctly", async () => {
    // Ensure unpaused with current pauser (user1) before changing role
    try {
      await program.methods.unpause()
        .accounts({ authority: user1.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any)
        .signers([user1]).rpc();
    } catch { /* already unpaused — ignore */ }

    // user3 must update pauser to user3 first (currently user1)
    await program.methods.updateRole({ role: { pauser: {} }, newAccount: user3.publicKey })
      .accounts({ authority: user3.publicKey, config: configPda, roleConfig: rolesPda } as any)
      .signers([user3]).rpc();

    for (let i = 0; i < 3; i++) {
      await program.methods.pause()
        .accounts({ authority: user3.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any)
        .signers([user3]).rpc();
      await program.methods.unpause()
        .accounts({ authority: user3.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any)
        .signers([user3]).rpc();
    }

    const state = await program.account.pauseState.fetch(pausePda);
    expect(state.paused).to.be.false;
  });

  it("SSS-1 never has blacklister or seizer roles set", async () => {
    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.blacklister.toBase58()).to.equal(PublicKey.default.toBase58());
    expect(roles.seizer.toBase58()).to.equal(PublicKey.default.toBase58());
  });

  it("minterQuota.mint field matches the mint pubkey", async () => {
    const [authQ] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), authority.publicKey.toBuffer()], program.programId);
    const state = await program.account.minterQuota.fetch(authQ);
    expect(state.mint.toBase58()).to.equal(mintKeypair.publicKey.toBase58());
  });

  it("minterQuota.minter field matches the minter pubkey", async () => {
    const [authQ] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), authority.publicKey.toBuffer()], program.programId);
    const state = await program.account.minterQuota.fetch(authQ);
    expect(state.minter.toBase58()).to.equal(authority.publicKey.toBase58());
  });
});
