/**
 * SSS-2: Advanced Compliance Tests
 *
 * Extends sss-2.ts with deeper coverage:
 *   - Blacklist entry field verification
 *   - Blacklist input validation (reason length)
 *   - Multiple-address blacklisting
 *   - Blacklister / seizer role succession
 *   - SSS-2 pause/burn still works alongside blacklist
 *   - Config flag verification
 *   - Minter lifecycle on SSS-2
 *
 * All tests share one fresh SSS-2 mint; tests run sequentially.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedWithTransferHookInstruction,
} from "@solana/spl-token";
import { expect } from "chai";
import { SssStablecoin } from "../target/types/sss_stablecoin";

const SEED_CONFIG             = Buffer.from("config");
const SEED_ROLES              = Buffer.from("roles");
const SEED_MINTER             = Buffer.from("minter");
const SEED_PAUSE              = Buffer.from("pause");
const SEED_BLACKLIST          = Buffer.from("blacklist");
const SEED_EXTRA_ACCOUNT_METAS = Buffer.from("extra-account-metas");

describe("SSS-2: Advanced Compliance Tests", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssStablecoin as Program<SssStablecoin>;
  const transferHookProgramId = new PublicKey("6x8XMLoA9FFmVJnaDou9tyKrh9CFynDY7TtKJ54p4dcN");
  const authority = provider.wallet as anchor.Wallet;

  let mintKeypair: Keypair;
  let configPda:   PublicKey;
  let rolesPda:    PublicKey;
  let pausePda:    PublicKey;

  const carol   = Keypair.generate();
  const alice   = Keypair.generate();
  const bob     = Keypair.generate();

  let aliceAta: PublicKey;
  let bobAta:   PublicKey;
  let carolAta: PublicKey;
  let authorityAta: PublicKey;

  before(async () => {
    await Promise.all([
      provider.connection.requestAirdrop(carol.publicKey,  10_000_000_000),
      provider.connection.requestAirdrop(alice.publicKey,  10_000_000_000),
      provider.connection.requestAirdrop(bob.publicKey,    10_000_000_000),
    ]);
    await new Promise(r => setTimeout(r, 800));

    mintKeypair  = Keypair.generate();
    [configPda]  = PublicKey.findProgramAddressSync([SEED_CONFIG, mintKeypair.publicKey.toBuffer()], program.programId);
    [rolesPda]   = PublicKey.findProgramAddressSync([SEED_ROLES,  mintKeypair.publicKey.toBuffer()], program.programId);
    [pausePda]   = PublicKey.findProgramAddressSync([SEED_PAUSE,  mintKeypair.publicKey.toBuffer()], program.programId);

    aliceAta     = getAssociatedTokenAddressSync(mintKeypair.publicKey, alice.publicKey,     false, TOKEN_2022_PROGRAM_ID);
    bobAta       = getAssociatedTokenAddressSync(mintKeypair.publicKey, bob.publicKey,       false, TOKEN_2022_PROGRAM_ID);
    carolAta     = getAssociatedTokenAddressSync(mintKeypair.publicKey, carol.publicKey,     false, TOKEN_2022_PROGRAM_ID);
    authorityAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);
  });

  // ─── 1. Initialization ───────────────────────────────────────────

  it("initializes SSS-2 advanced test mint", async () => {
    await program.methods.initialize({
      name: "Advanced USDC", symbol: "aUSDC", uri: "", decimals: 6,
      enablePermanentDelegate: true, enableTransferHook: true, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mintKeypair.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mintKeypair]).rpc();
  });

  it("initializes ExtraAccountMetaList for transfer hook", async () => {
    const sssTransferHookProgram = anchor.workspace.SssTransferHook as any;
    const [extraAccountMetaListPda] = PublicKey.findProgramAddressSync(
      [SEED_EXTRA_ACCOUNT_METAS, mintKeypair.publicKey.toBuffer()],
      transferHookProgramId
    );
    await sssTransferHookProgram.methods.initializeExtraAccountMetaList()
      .accounts({
        payer: authority.publicKey,
        mint: mintKeypair.publicKey,
        extraAccountMetaList: extraAccountMetaListPda,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ─── 2. Blacklist Entry Field Verification ───────────────────────

  it("blacklists alice with a specific reason", async () => {
    const [aliceBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), alice.publicKey.toBuffer()], program.programId
    );
    await program.methods.addToBlacklist("OFAC SDN List match — Alice").accounts({
      authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
      addressToBlacklist: alice.publicKey, blacklistEntry: aliceBlacklist,
    } as any).rpc();
  });

  it("blacklist entry stores reason field correctly", async () => {
    const [aliceBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), alice.publicKey.toBuffer()], program.programId
    );
    const entry = await program.account.blacklistEntry.fetch(aliceBlacklist);
    expect(entry.reason).to.equal("OFAC SDN List match — Alice");
  });

  it("blacklist entry blacklisted_by field matches the authority", async () => {
    const [aliceBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), alice.publicKey.toBuffer()], program.programId
    );
    const entry = await program.account.blacklistEntry.fetch(aliceBlacklist);
    expect(entry.blacklistedBy.toBase58()).to.equal(authority.publicKey.toBase58());
  });

  it("blacklist entry mint field matches the mint pubkey", async () => {
    const [aliceBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), alice.publicKey.toBuffer()], program.programId
    );
    const entry = await program.account.blacklistEntry.fetch(aliceBlacklist);
    expect(entry.mint.toBase58()).to.equal(mintKeypair.publicKey.toBase58());
  });

  it("blacklist entry address field matches the blacklisted address", async () => {
    const [aliceBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), alice.publicKey.toBuffer()], program.programId
    );
    const entry = await program.account.blacklistEntry.fetch(aliceBlacklist);
    expect(entry.address.toBase58()).to.equal(alice.publicKey.toBase58());
  });

  it("blacklist entry blacklisted_at timestamp is non-zero", async () => {
    const [aliceBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), alice.publicKey.toBuffer()], program.programId
    );
    const entry = await program.account.blacklistEntry.fetch(aliceBlacklist);
    expect(entry.blacklistedAt.toNumber()).to.be.greaterThan(0);
  });

  // ─── 3. Multiple Addresses Blacklisted Simultaneously ───────────

  it("blacklists bob simultaneously with alice", async () => {
    const [bobBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), bob.publicKey.toBuffer()], program.programId
    );
    await program.methods.addToBlacklist("Terrorist financing").accounts({
      authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
      addressToBlacklist: bob.publicKey, blacklistEntry: bobBlacklist,
    } as any).rpc();

    const entry = await program.account.blacklistEntry.fetch(bobBlacklist);
    expect(entry.address.toBase58()).to.equal(bob.publicKey.toBase58());
  });

  it("removing alice from blacklist leaves bob's entry intact", async () => {
    const [aliceBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), alice.publicKey.toBuffer()], program.programId
    );
    const [bobBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), bob.publicKey.toBuffer()], program.programId
    );

    await program.methods.removeFromBlacklist().accounts({
      authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
      blacklistEntry: aliceBlacklist,
    } as any).rpc();

    // Alice's PDA is closed
    const aliceInfo = await provider.connection.getAccountInfo(aliceBlacklist);
    expect(aliceInfo).to.be.null;

    // Bob's PDA still exists
    const bobEntry = await program.account.blacklistEntry.fetch(bobBlacklist);
    expect(bobEntry.address.toBase58()).to.equal(bob.publicKey.toBase58());
  });

  it("can re-blacklist a previously unblacklisted address", async () => {
    const [aliceBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), alice.publicKey.toBuffer()], program.programId
    );
    await program.methods.addToBlacklist("Re-listed: new evidence").accounts({
      authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
      addressToBlacklist: alice.publicKey, blacklistEntry: aliceBlacklist,
    } as any).rpc();

    const entry = await program.account.blacklistEntry.fetch(aliceBlacklist);
    expect(entry.reason).to.equal("Re-listed: new evidence");
  });

  // ─── 4. Blacklist Reason Validation ─────────────────────────────

  it("blacklist reason: empty string is rejected (InvalidReason)", async () => {
    const dummy = Keypair.generate();
    const [dummyBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), dummy.publicKey.toBuffer()], program.programId
    );
    try {
      await program.methods.addToBlacklist("").accounts({
        authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
        addressToBlacklist: dummy.publicKey, blacklistEntry: dummyBlacklist,
      } as any).rpc();
      expect.fail("Should have thrown InvalidReason");
    } catch (err: any) {
      expect(err.message).to.include("InvalidReason");
    }
  });

  it("blacklist reason: exactly 128 characters is accepted (boundary success)", async () => {
    const dummy = Keypair.generate();
    const [dummyBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), dummy.publicKey.toBuffer()], program.programId
    );
    const reason128 = "A".repeat(128);
    await program.methods.addToBlacklist(reason128).accounts({
      authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
      addressToBlacklist: dummy.publicKey, blacklistEntry: dummyBlacklist,
    } as any).rpc();

    const entry = await program.account.blacklistEntry.fetch(dummyBlacklist);
    expect(entry.reason.length).to.equal(128);
  });

  it("blacklist reason: 129 characters is rejected (boundary fail)", async () => {
    const dummy = Keypair.generate();
    const [dummyBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), dummy.publicKey.toBuffer()], program.programId
    );
    const reason129 = "A".repeat(129);
    try {
      await program.methods.addToBlacklist(reason129).accounts({
        authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
        addressToBlacklist: dummy.publicKey, blacklistEntry: dummyBlacklist,
      } as any).rpc();
      expect.fail("Should have thrown InvalidReason");
    } catch (err: any) {
      expect(err.message).to.include("InvalidReason");
    }
  });

  // ─── 5. Config Flag Verification ─────────────────────────────────

  it("SSS-2 config stores enablePermanentDelegate = true", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enablePermanentDelegate).to.be.true;
  });

  it("SSS-2 config stores enableTransferHook = true", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enableTransferHook).to.be.true;
  });

  it("initializing SSS-2 with defaultAccountFrozen=true stores the flag", async () => {
    const m = Keypair.generate();
    await program.methods.initialize({
      name: "Frozen Default", symbol: "FRZ", uri: "", decimals: 6,
      enablePermanentDelegate: true, enableTransferHook: true, defaultAccountFrozen: true, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: m.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([m]).rpc();

    const [cfg] = PublicKey.findProgramAddressSync([SEED_CONFIG, m.publicKey.toBuffer()], program.programId);
    const config = await program.account.stablecoinConfig.fetch(cfg);
    expect(config.defaultAccountFrozen).to.be.true;
  });

  // ─── 6. Role Management ───────────────────────────────────────────

  it("blacklister role can be transferred to carol", async () => {
    await program.methods.updateRole({ role: { blacklister: {} }, newAccount: carol.publicKey })
      .accounts({ authority: authority.publicKey, config: configPda, roleConfig: rolesPda } as any).rpc();

    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.blacklister.toBase58()).to.equal(carol.publicKey.toBase58());
  });

  it("new blacklister (carol) can add addresses to blacklist", async () => {
    const dummy = Keypair.generate();
    const [dummyBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), dummy.publicKey.toBuffer()], program.programId
    );
    await program.methods.addToBlacklist("Carol's listing").accounts({
      authority: carol.publicKey, config: configPda, roleConfig: rolesPda,
      addressToBlacklist: dummy.publicKey, blacklistEntry: dummyBlacklist,
    } as any).signers([carol]).rpc();

    const entry = await program.account.blacklistEntry.fetch(dummyBlacklist);
    expect(entry.blacklistedBy.toBase58()).to.equal(carol.publicKey.toBase58());
  });

  it("old blacklister (authority) cannot blacklist after role change", async () => {
    const dummy = Keypair.generate();
    const [dummyBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), dummy.publicKey.toBuffer()], program.programId
    );
    try {
      await program.methods.addToBlacklist("Unauthorized").accounts({
        authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
        addressToBlacklist: dummy.publicKey, blacklistEntry: dummyBlacklist,
      } as any).rpc();
      expect.fail("Should have thrown NotBlacklister");
    } catch (err: any) {
      expect(err.message).to.include("NotBlacklister");
    }
  });

  it("seizer role can be transferred to carol", async () => {
    await program.methods.updateRole({ role: { seizer: {} }, newAccount: carol.publicKey })
      .accounts({ authority: authority.publicKey, config: configPda, roleConfig: rolesPda } as any).rpc();

    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.seizer.toBase58()).to.equal(carol.publicKey.toBase58());
  });

  it("seize by non-seizer (authority) fails after role transfer", async () => {
    const dummy = Keypair.generate();
    const dummyAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, dummy.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, dummyAta, dummy.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID)
    );
    await provider.sendAndConfirm(tx, []);

    let threw = false;
    try {
      await program.methods.seize(new BN(1)).accounts({
        authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
        mint: mintKeypair.publicKey, fromAccount: dummyAta, toAccount: dummyAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).rpc();
    } catch (err: any) {
      threw = true;
      // Accept NotSeizer or PermanentDelegateNotEnabled or constraint errors (authority is not seizer)
      expect(err.message.toLowerCase()).to.satisfy(
        (m: string) => m.includes("notseizer") || m.includes("notauthority") || m.includes("seizer") || m.includes("simulation failed"),
        `Expected a seizer-related error but got: ${err.message}`
      );
    }
    expect(threw, "Expected seize to throw for non-seizer").to.be.true;
  });

  // ─── 7. Pause Behavior ────────────────────────────────────────────

  it("SSS-2 minting can be paused (same as SSS-1)", async () => {
    const [authMinterPda] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mintKeypair.publicKey.toBuffer(), authority.publicKey.toBuffer()], program.programId
    );
    await program.methods.addMinter(new BN(100_000))
      .accounts({ authority: authority.publicKey, mint: mintKeypair.publicKey, minter: authority.publicKey } as any).rpc();

    // Pause
    await program.methods.pause()
      .accounts({ authority: authority.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any).rpc();

    // Create ATAs
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, aliceAta,     alice.publicKey,     mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, authorityAta, authority.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID),
    );
    await provider.sendAndConfirm(tx, []);

    try {
      await program.methods.mintTokens(new BN(1000)).accounts({
        minter: authority.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: authMinterPda,
        pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: aliceAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).rpc();
      expect.fail("Should have thrown Paused");
    } catch (err: any) {
      expect(err.message).to.include("Paused");
    }
  });

  it("SSS-2 unpauses and minting works again", async () => {
    await program.methods.unpause()
      .accounts({ authority: authority.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any).rpc();

    const [authMinterPda] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mintKeypair.publicKey.toBuffer(), authority.publicKey.toBuffer()], program.programId
    );
    await program.methods.mintTokens(new BN(5000)).accounts({
      minter: authority.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: authMinterPda,
      pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: aliceAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).rpc();

    const bal = await provider.connection.getTokenAccountBalance(aliceAta);
    expect(parseInt(bal.value.amount)).to.be.greaterThan(0);
  });

  // ─── 8. SSS-2 Minter Lifecycle ───────────────────────────────────

  it("addMinter works on SSS-2 the same as SSS-1", async () => {
    await program.methods.addMinter(new BN(50_000))
      .accounts({ authority: authority.publicKey, mint: mintKeypair.publicKey, minter: carol.publicKey } as any).rpc();

    const [carolQ] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mintKeypair.publicKey.toBuffer(), carol.publicKey.toBuffer()], program.programId
    );
    const state = await program.account.minterQuota.fetch(carolQ);
    expect(state.active).to.be.true;
    expect(state.quota.toNumber()).to.equal(50_000);
  });

  it("removeMinter works on SSS-2 the same as SSS-1", async () => {
    const [carolQ] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mintKeypair.publicKey.toBuffer(), carol.publicKey.toBuffer()], program.programId
    );
    await program.methods.removeMinter()
      .accounts({
        authority: authority.publicKey,
        roleConfig: rolesPda,
        minterQuota: carolQ,
      } as any).rpc();
  });

  it("SSS-2 authority transfer changes config.authority", async () => {
    const newAuth = Keypair.generate();
    await program.methods.transferAuthority().accounts({
      authority: authority.publicKey, config: configPda, roleConfig: rolesPda, newAuthority: newAuth.publicKey,
    } as any).rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.authority.toBase58()).to.equal(newAuth.publicKey.toBase58());
  });
});
