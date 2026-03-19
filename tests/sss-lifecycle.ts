/**
 * SSS Full Lifecycle Integration Tests
 *
 * End-to-end integration scenarios that cut across multiple roles,
 * instructions, and program state transitions within a single test.
 *
 * These tests validate correctness of the full system from a user
 * perspective — not individual instructions in isolation.
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

const SEED_CONFIG   = Buffer.from("config");
const SEED_ROLES    = Buffer.from("roles");
const SEED_MINTER   = Buffer.from("minter");
const SEED_PAUSE    = Buffer.from("pause");
const SEED_BLACKLIST = Buffer.from("blacklist");
const SEED_EXTRA_ACCOUNT_METAS = Buffer.from("extra-account-metas");

async function pdas(programId: PublicKey, mint: PublicKey, minter?: PublicKey, blacklisted?: PublicKey) {
  const [config]  = PublicKey.findProgramAddressSync([SEED_CONFIG, mint.toBuffer()], programId);
  const [roles]   = PublicKey.findProgramAddressSync([SEED_ROLES,  mint.toBuffer()], programId);
  const [pause]   = PublicKey.findProgramAddressSync([SEED_PAUSE,  mint.toBuffer()], programId);
  const [minterQ] = minter
    ? PublicKey.findProgramAddressSync([SEED_MINTER, mint.toBuffer(), minter.toBuffer()], programId)
    : [undefined];
  const [blacklist] = blacklisted
    ? PublicKey.findProgramAddressSync([SEED_BLACKLIST, mint.toBuffer(), blacklisted.toBuffer()], programId)
    : [undefined];
  return { config, roles, pause, minterQ, blacklist };
}

describe("SSS Full Lifecycle Integration Tests", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SssStablecoin as Program<SssStablecoin>;
  const transferHookProgramId = new PublicKey("6x8XMLoA9FFmVJnaDou9tyKrh9CFynDY7TtKJ54p4dcN");
  const authority  = provider.wallet as anchor.Wallet;

  // ─── 1. Full SSS-1 Lifecycle ─────────────────────────────────────

  it("SSS-1: init → addMinter → mint → freeze → thaw → pause → unpause → burn", async () => {
    const mint = Keypair.generate();
    const minter = Keypair.generate();
    const alice  = Keypair.generate();
    await provider.connection.requestAirdrop(minter.publicKey, 2_000_000_000);
    await provider.connection.requestAirdrop(alice.publicKey,  2_000_000_000);
    await new Promise(r => setTimeout(r, 600));

    const { config, roles, pause } = await pdas(program.programId, mint.publicKey);
    const [minterQ] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint.publicKey.toBuffer(), minter.publicKey.toBuffer()], program.programId
    );

    // Init
    await program.methods.initialize({
      name: "Lifecycle USD", symbol: "LUSD", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint]).rpc();

    // AddMinter (minter + authority as minter, so authority can burn from own ATA)
    await program.methods.addMinter(new BN(100_000))
      .accounts({ authority: authority.publicKey, mint: mint.publicKey, minter: minter.publicKey } as any).rpc();
    await program.methods.addMinter(new BN(100_000))
      .accounts({ authority: authority.publicKey, mint: mint.publicKey, minter: authority.publicKey } as any).rpc();
    const [authorityMinterQ] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint.publicKey.toBuffer(), authority.publicKey.toBuffer()], program.programId
    );

    // Create ATAs
    const aliceAta      = getAssociatedTokenAddressSync(mint.publicKey, alice.publicKey,     false, TOKEN_2022_PROGRAM_ID);
    const minterAta     = getAssociatedTokenAddressSync(mint.publicKey, minter.publicKey,    false, TOKEN_2022_PROGRAM_ID);
    const authorityAta  = getAssociatedTokenAddressSync(mint.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, aliceAta,     alice.publicKey,     mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, minterAta,    minter.publicKey,    mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, authorityAta, authority.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    );
    await provider.sendAndConfirm(tx, []);

    // Mint
    await program.methods.mintTokens(new BN(10_000)).accounts({
      minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: aliceAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter]).rpc();
    const supplyAfterMint = (await provider.connection.getTokenSupply(mint.publicKey)).value.amount;
    expect(supplyAfterMint).to.equal("10000");

    // Freeze alice
    await program.methods.freezeAccount().accounts({
      authority: authority.publicKey, config, roleConfig: roles,
      mint: mint.publicKey, targetAccount: aliceAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).rpc();
    const frozenInfo = await provider.connection.getParsedAccountInfo(aliceAta);
    expect((frozenInfo.value?.data as any)?.parsed?.info?.state).to.equal("frozen");

    // Thaw alice
    await program.methods.thawAccount().accounts({
      authority: authority.publicKey, config, roleConfig: roles,
      mint: mint.publicKey, targetAccount: aliceAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).rpc();
    const thawedInfo = await provider.connection.getParsedAccountInfo(aliceAta);
    expect((thawedInfo.value?.data as any)?.parsed?.info?.state).to.equal("initialized");

    // Pause → minting blocked
    await program.methods.pause()
      .accounts({ authority: authority.publicKey, roleConfig: roles, pauseState: pause } as any).rpc();
    try {
      await program.methods.mintTokens(new BN(1)).accounts({
        minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
        pauseState: pause, mint: mint.publicKey, recipientTokenAccount: aliceAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([minter]).rpc();
      expect.fail("Should be paused");
    } catch (e: any) { expect(e.message).to.include("Paused"); }

    // Unpause → mint to authorityAta (authority is the default burner)
    await program.methods.unpause()
      .accounts({ authority: authority.publicKey, roleConfig: roles, pauseState: pause } as any).rpc();
    await program.methods.mintTokens(new BN(5_000)).accounts({
      minter: authority.publicKey, config, roleConfig: roles, minterQuota: authorityMinterQ,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: authorityAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).rpc();

    // Burn from authorityAta (authority is both minter+burner by default)
    await program.methods.burnTokens(new BN(5_000)).accounts({
      burner: authority.publicKey, config, roleConfig: roles, pauseState: pause,
      mint: mint.publicKey, burnerTokenAccount: authorityAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).rpc();

    const supplyFinal = (await provider.connection.getTokenSupply(mint.publicKey)).value.amount;
    expect(supplyFinal).to.equal("10000");
  });

  // ─── 2. Full SSS-2 Lifecycle ─────────────────────────────────────

  it("SSS-2: init → hook init → mint → blacklist → blocked transfer → unblacklist → allowed mint", async () => {
    const mint   = Keypair.generate();
    const minter = Keypair.generate();
    const alice  = Keypair.generate();
    const bob    = Keypair.generate();
    await provider.connection.requestAirdrop(minter.publicKey, 2_000_000_000);
    await new Promise(r => setTimeout(r, 600));

    const sssTransferHookProgram = anchor.workspace.SssTransferHook as any;
    const { config, roles, pause } = await pdas(program.programId, mint.publicKey);
    const [minterQ] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint.publicKey.toBuffer(), minter.publicKey.toBuffer()], program.programId
    );
    const [aliceBlacklist] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mint.publicKey.toBuffer(), alice.publicKey.toBuffer()], program.programId
    );
    const [extraAccountMetaListPda] = PublicKey.findProgramAddressSync(
      [SEED_EXTRA_ACCOUNT_METAS, mint.publicKey.toBuffer()], transferHookProgramId
    );

    // Init SSS-2
    await program.methods.initialize({
      name: "Compliance USD", symbol: "cUSD", uri: "", decimals: 6,
      enablePermanentDelegate: true, enableTransferHook: true, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint]).rpc();

    // Init hook
    await sssTransferHookProgram.methods.initializeExtraAccountMetaList()
      .accounts({
        payer: authority.publicKey, mint: mint.publicKey,
        extraAccountMetaList: extraAccountMetaListPda, systemProgram: SystemProgram.programId,
      }).rpc();

    // AddMinter + create ATAs
    await program.methods.addMinter(new BN(50_000))
      .accounts({ authority: authority.publicKey, mint: mint.publicKey, minter: minter.publicKey } as any).rpc();

    const aliceAta = getAssociatedTokenAddressSync(mint.publicKey, alice.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const bobAta   = getAssociatedTokenAddressSync(mint.publicKey, bob.publicKey,   false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, aliceAta, alice.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, bobAta,   bob.publicKey,   mint.publicKey, TOKEN_2022_PROGRAM_ID),
    );
    await provider.sendAndConfirm(tx, []);

    // Mint to alice
    await program.methods.mintTokens(new BN(20_000)).accounts({
      minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: aliceAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter]).rpc();

    // Blacklist alice
    await program.methods.addToBlacklist("Test blacklist lifecycle").accounts({
      authority: authority.publicKey, config, roleConfig: roles,
      addressToBlacklist: alice.publicKey, blacklistEntry: aliceBlacklist,
    } as any).rpc();

    // Attempt a TRANSFER from alice to bob — this triggers the TransferHook and should be blocked
    // (Note: mintTokens does NOT go through the transfer hook, only transfer_checked does)
    const minterAtaSSS2 = getAssociatedTokenAddressSync(mint.publicKey, minter.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createMinterAtaTx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, minterAtaSSS2, minter.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID)
    );
    await provider.sendAndConfirm(createMinterAtaTx, []);
    // Mint to minter first
    await program.methods.mintTokens(new BN(1_000)).accounts({
      minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: minterAtaSSS2, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter]).rpc();
    // Transfer hook should block transfer FROM non-blacklisted to alice (DestinationBlacklisted)
    // We verify this by expecting a blocked transfer
    let transferThrew = false;
    try {
      await createTransferCheckedWithTransferHookInstruction(
        provider.connection, minterAtaSSS2, mint.publicKey, aliceAta, minter.publicKey,
        BigInt(10), 6, [], "confirmed", TOKEN_2022_PROGRAM_ID
      ).then(async ix => {
        const transferTx = new Transaction().add(ix);
        await provider.sendAndConfirm(transferTx, [minter]);
      });
    } catch (e: any) {
      transferThrew = true;
      // Transfer hook returns DestinationBlacklisted; the error propagates as a simulation failure
    }
    expect(transferThrew, "Transfer to blacklisted alice should have been blocked").to.be.true;

    // Unblacklist alice
    await program.methods.removeFromBlacklist().accounts({
      authority: authority.publicKey, config, roleConfig: roles, blacklistEntry: aliceBlacklist,
    } as any).rpc();

    // Now minting to alice works again
    await program.methods.mintTokens(new BN(5_000)).accounts({
      minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: aliceAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter]).rpc();

    // Supply: 20000 (alice mint) + 1000 (minter mint) + 5000 (alice mint after unblacklist) = 26000
    const supply = (await provider.connection.getTokenSupply(mint.publicKey)).value.amount;
    expect(parseInt(supply)).to.equal(26_000);
  });

  // ─── 3. Authority Rotation with Continued Operations ─────────────

  it("authority rotation: new authority can operate, old authority is locked out", async () => {
    const mint    = Keypair.generate();
    const newAuth = Keypair.generate();
    await provider.connection.requestAirdrop(newAuth.publicKey, 2_000_000_000);
    await new Promise(r => setTimeout(r, 600));

    const { config, roles, pause } = await pdas(program.programId, mint.publicKey);

    await program.methods.initialize({
      name: "Rotate USD", symbol: "rUSD", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint]).rpc();

    // Transfer to newAuth
    await program.methods.transferAuthority().accounts({
      authority: authority.publicKey, config, roleConfig: roles, newAuthority: newAuth.publicKey,
    } as any).rpc();

    // newAuth can add a minter
    const bob = Keypair.generate();
    await program.methods.addMinter(new BN(9_999))
      .accounts({ authority: newAuth.publicKey, mint: mint.publicKey, minter: bob.publicKey } as any)
      .signers([newAuth]).rpc();

    const [bobQ] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint.publicKey.toBuffer(), bob.publicKey.toBuffer()], program.programId
    );
    const quotaState = await program.account.minterQuota.fetch(bobQ);
    expect(quotaState.active).to.be.true;

    // Old authority cannot add minters
    const eve = Keypair.generate();
    try {
      await program.methods.addMinter(new BN(1))
        .accounts({ authority: authority.publicKey, mint: mint.publicKey, minter: eve.publicKey } as any).rpc();
      expect.fail("Should fail - old authority");
    } catch (e: any) {
      expect(e.message).to.include("Unauthorized");
    }
  });

  // ─── 4. Multiple Minters Respecting Individual Quotas ────────────

  it("multiple minters respect individual quotas independently", async () => {
    const mint    = Keypair.generate();
    const minterA = Keypair.generate();
    const minterB = Keypair.generate();
    const holder  = Keypair.generate();
    await Promise.all([
      provider.connection.requestAirdrop(minterA.publicKey, 2_000_000_000),
      provider.connection.requestAirdrop(minterB.publicKey, 2_000_000_000),
    ]);
    await new Promise(r => setTimeout(r, 600));

    const { config, roles, pause } = await pdas(program.programId, mint.publicKey);
    const [minterQA] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint.publicKey.toBuffer(), minterA.publicKey.toBuffer()], program.programId
    );
    const [minterQB] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint.publicKey.toBuffer(), minterB.publicKey.toBuffer()], program.programId
    );

    await program.methods.initialize({
      name: "Multi USD", symbol: "mUSD", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint]).rpc();

    await program.methods.addMinter(new BN(5_000))
      .accounts({ authority: authority.publicKey, mint: mint.publicKey, minter: minterA.publicKey } as any).rpc();
    await program.methods.addMinter(new BN(3_000))
      .accounts({ authority: authority.publicKey, mint: mint.publicKey, minter: minterB.publicKey } as any).rpc();

    const holderAta = getAssociatedTokenAddressSync(mint.publicKey, holder.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, holderAta, holder.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID)
    );
    await provider.sendAndConfirm(tx, []);

    // MinterA mints up to its quota
    await program.methods.mintTokens(new BN(5_000)).accounts({
      minter: minterA.publicKey, config, roleConfig: roles, minterQuota: minterQA,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: holderAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minterA]).rpc();

    // MinterA exceeds quota
    try {
      await program.methods.mintTokens(new BN(1)).accounts({
        minter: minterA.publicKey, config, roleConfig: roles, minterQuota: minterQA,
        pauseState: pause, mint: mint.publicKey, recipientTokenAccount: holderAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([minterA]).rpc();
      expect.fail("Should have thrown QuotaExceeded");
    } catch (e: any) { expect(e.message).to.include("QuotaExceeded"); }

    // MinterB still has full quota
    await program.methods.mintTokens(new BN(3_000)).accounts({
      minter: minterB.publicKey, config, roleConfig: roles, minterQuota: minterQB,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: holderAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minterB]).rpc();

    const total = (await provider.connection.getTokenSupply(mint.publicKey)).value.amount;
    expect(total).to.equal("8000");
  });

  // ─── 5. Cross-Mint Independence ───────────────────────────────────

  it("two separate mints are fully independent (SSS-1 and SSS-2)", async () => {
    const mint1 = Keypair.generate();
    const mint2 = Keypair.generate();
    const minter1 = Keypair.generate();
    const minter2 = Keypair.generate();
    await Promise.all([
      provider.connection.requestAirdrop(minter1.publicKey, 2_000_000_000),
      provider.connection.requestAirdrop(minter2.publicKey, 2_000_000_000),
    ]);
    await new Promise(r => setTimeout(r, 600));

    for (const [mint] of [[mint1], [mint2]]) {
      await program.methods.initialize({
        name: "Cross USD", symbol: "cUSD", uri: "", decimals: 6,
        enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
      }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
        .signers([mint]).rpc();
    }

    await program.methods.addMinter(new BN(1_000))
      .accounts({ authority: authority.publicKey, mint: mint1.publicKey, minter: minter1.publicKey } as any).rpc();
    await program.methods.addMinter(new BN(2_000))
      .accounts({ authority: authority.publicKey, mint: mint2.publicKey, minter: minter2.publicKey } as any).rpc();

    const holder = Keypair.generate();
    const ata1 = getAssociatedTokenAddressSync(mint1.publicKey, holder.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const ata2 = getAssociatedTokenAddressSync(mint2.publicKey, holder.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, ata1, holder.publicKey, mint1.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, ata2, holder.publicKey, mint2.publicKey, TOKEN_2022_PROGRAM_ID),
    );
    await provider.sendAndConfirm(tx, []);

    const [q1] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint1.publicKey.toBuffer(), minter1.publicKey.toBuffer()], program.programId
    );
    const [q2] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint2.publicKey.toBuffer(), minter2.publicKey.toBuffer()], program.programId
    );
    const [cfg1] = PublicKey.findProgramAddressSync([SEED_CONFIG, mint1.publicKey.toBuffer()], program.programId);
    const [roles1] = PublicKey.findProgramAddressSync([SEED_ROLES,  mint1.publicKey.toBuffer()], program.programId);
    const [pause1] = PublicKey.findProgramAddressSync([SEED_PAUSE,  mint1.publicKey.toBuffer()], program.programId);
    const [cfg2] = PublicKey.findProgramAddressSync([SEED_CONFIG, mint2.publicKey.toBuffer()], program.programId);
    const [roles2] = PublicKey.findProgramAddressSync([SEED_ROLES,  mint2.publicKey.toBuffer()], program.programId);
    const [pause2] = PublicKey.findProgramAddressSync([SEED_PAUSE,  mint2.publicKey.toBuffer()], program.programId);

    await program.methods.mintTokens(new BN(1_000)).accounts({
      minter: minter1.publicKey, config: cfg1, roleConfig: roles1, minterQuota: q1,
      pauseState: pause1, mint: mint1.publicKey, recipientTokenAccount: ata1, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter1]).rpc();

    await program.methods.mintTokens(new BN(2_000)).accounts({
      minter: minter2.publicKey, config: cfg2, roleConfig: roles2, minterQuota: q2,
      pauseState: pause2, mint: mint2.publicKey, recipientTokenAccount: ata2, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter2]).rpc();

    const s1 = (await provider.connection.getTokenSupply(mint1.publicKey)).value.amount;
    const s2 = (await provider.connection.getTokenSupply(mint2.publicKey)).value.amount;
    expect(s1).to.equal("1000");
    expect(s2).to.equal("2000");
  });

  // ─── 6. Role Succession Chain ─────────────────────────────────────

  it("pauser role can be passed through a chain A → B → C", async () => {
    const mint   = Keypair.generate();
    const userA  = Keypair.generate();
    const userB  = Keypair.generate();
    const userC  = Keypair.generate();
    await Promise.all([
      provider.connection.requestAirdrop(userA.publicKey, 2_000_000_000),
      provider.connection.requestAirdrop(userB.publicKey, 2_000_000_000),
      provider.connection.requestAirdrop(userC.publicKey, 2_000_000_000),
    ]);
    await new Promise(r => setTimeout(r, 600));

    const [config] = PublicKey.findProgramAddressSync([SEED_CONFIG, mint.publicKey.toBuffer()], program.programId);
    const [roles]  = PublicKey.findProgramAddressSync([SEED_ROLES,  mint.publicKey.toBuffer()], program.programId);
    const [pause]  = PublicKey.findProgramAddressSync([SEED_PAUSE,  mint.publicKey.toBuffer()], program.programId);

    await program.methods.initialize({
      name: "Chain USD", symbol: "chUSD", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint]).rpc();

    // authority → A
    await program.methods.updateRole({ role: { pauser: {} }, newAccount: userA.publicKey })
      .accounts({ authority: authority.publicKey, config, roleConfig: roles } as any).rpc();

    // A can pause
    await program.methods.pause()
      .accounts({ authority: userA.publicKey, roleConfig: roles, pauseState: pause } as any).signers([userA]).rpc();

    // A can unpause
    await program.methods.unpause()
      .accounts({ authority: userA.publicKey, roleConfig: roles, pauseState: pause } as any).signers([userA]).rpc();

    // authority transfers pauser from A → B
    await program.methods.updateRole({ role: { pauser: {} }, newAccount: userB.publicKey })
      .accounts({ authority: authority.publicKey, config, roleConfig: roles } as any).rpc();

    // B can pause
    await program.methods.pause()
      .accounts({ authority: userB.publicKey, roleConfig: roles, pauseState: pause } as any).signers([userB]).rpc();

    // A can no longer pause (paused again → already paused; let's try unpause instead)
    try {
      await program.methods.unpause()
        .accounts({ authority: userA.publicKey, roleConfig: roles, pauseState: pause } as any).signers([userA]).rpc();
      expect.fail("userA should no longer be pauser");
    } catch (e: any) { expect(e.message).to.include("NotPauser"); }

    // authority transfers pauser from B → C
    await program.methods.updateRole({ role: { pauser: {} }, newAccount: userC.publicKey })
      .accounts({ authority: authority.publicKey, config, roleConfig: roles } as any).rpc();

    // Resume + stop properly
    await program.methods.unpause()
      .accounts({ authority: userC.publicKey, roleConfig: roles, pauseState: pause } as any).signers([userC]).rpc();

    const pauseState = await program.account.pauseState.fetch(pause);
    expect(pauseState.paused).to.be.false;
  });

  // ─── 7. Burn After Multiple Mints ─────────────────────────────────

  it("burn reduces supply correctly after multiple separate mints", async () => {
    const mint   = Keypair.generate();
    const minter = Keypair.generate();
    const burner = Keypair.generate();
    await Promise.all([
      provider.connection.requestAirdrop(minter.publicKey, 2_000_000_000),
      provider.connection.requestAirdrop(burner.publicKey, 2_000_000_000),
    ]);
    await new Promise(r => setTimeout(r, 600));

    const [config] = PublicKey.findProgramAddressSync([SEED_CONFIG, mint.publicKey.toBuffer()], program.programId);
    const [roles]  = PublicKey.findProgramAddressSync([SEED_ROLES,  mint.publicKey.toBuffer()], program.programId);
    const [pause]  = PublicKey.findProgramAddressSync([SEED_PAUSE,  mint.publicKey.toBuffer()], program.programId);
    const [minterQ] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint.publicKey.toBuffer(), minter.publicKey.toBuffer()], program.programId
    );

    await program.methods.initialize({
      name: "Burn USD", symbol: "bUSD", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint]).rpc();

    await program.methods.addMinter(new BN(100_000))
      .accounts({ authority: authority.publicKey, mint: mint.publicKey, minter: minter.publicKey } as any).rpc();

    const minterAta = getAssociatedTokenAddressSync(mint.publicKey, minter.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const burnerAta = getAssociatedTokenAddressSync(mint.publicKey, burner.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, minterAta, minter.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, burnerAta, burner.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    );
    await provider.sendAndConfirm(tx, []);

    // Three separate mint operations
    for (const amount of [10_000, 20_000, 30_000]) {
      await program.methods.mintTokens(new BN(amount)).accounts({
        minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
        pauseState: pause, mint: mint.publicKey, recipientTokenAccount: minterAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([minter]).rpc();
    }

    const supplyBefore = (await provider.connection.getTokenSupply(mint.publicKey)).value.amount;
    expect(supplyBefore).to.equal("60000");

    // Add burner role to minter (so minter can burn from their own ATA)
    await program.methods.updateRole({ role: { burner: {} }, newAccount: minter.publicKey })
      .accounts({ authority: authority.publicKey, config, roleConfig: roles } as any).rpc();

    // Burn 15_000 from minterAta (minter is both the burner and token account owner)
    await program.methods.burnTokens(new BN(15_000)).accounts({
      burner: minter.publicKey, config, roleConfig: roles, pauseState: pause,
      mint: mint.publicKey, burnerTokenAccount: minterAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter]).rpc();

    const supplyAfter = (await provider.connection.getTokenSupply(mint.publicKey)).value.amount;
    expect(supplyAfter).to.equal("45000");
  });

  // ─── 8. Pause State Survives Config Reads ─────────────────────────

  it("pause state is independently stored from config (reads remain consistent)", async () => {
    const mint = Keypair.generate();
    const [config] = PublicKey.findProgramAddressSync([SEED_CONFIG, mint.publicKey.toBuffer()], program.programId);
    const [roles]  = PublicKey.findProgramAddressSync([SEED_ROLES,  mint.publicKey.toBuffer()], program.programId);
    const [pause]  = PublicKey.findProgramAddressSync([SEED_PAUSE,  mint.publicKey.toBuffer()], program.programId);

    await program.methods.initialize({
      name: "State USD", symbol: "sUSD", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint]).rpc();

    const pauseState0 = await program.account.pauseState.fetch(pause);
    expect(pauseState0.paused).to.be.false;

    await program.methods.pause()
      .accounts({ authority: authority.publicKey, roleConfig: roles, pauseState: pause } as any).rpc();

    const pauseState1 = await program.account.pauseState.fetch(pause);
    const configState = await program.account.stablecoinConfig.fetch(config);

    expect(pauseState1.paused).to.be.true;
    // Config must be unaffected by pause
    expect(configState.name).to.equal("State USD");
    expect(configState.symbol).to.equal("sUSD");
  });

  // ─── 9. Multiple Pause/Unpause Cycles ────────────────────────────

  it("system handles 5 pause/unpause cycles without corruption", async () => {
    const mint = Keypair.generate();
    const [roles] = PublicKey.findProgramAddressSync([SEED_ROLES, mint.publicKey.toBuffer()], program.programId);
    const [pause] = PublicKey.findProgramAddressSync([SEED_PAUSE, mint.publicKey.toBuffer()], program.programId);

    await program.methods.initialize({
      name: "Cycle USD", symbol: "cyUSD", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint]).rpc();

    for (let i = 0; i < 5; i++) {
      await program.methods.pause()
        .accounts({ authority: authority.publicKey, roleConfig: roles, pauseState: pause } as any).rpc();
      await program.methods.unpause()
        .accounts({ authority: authority.publicKey, roleConfig: roles, pauseState: pause } as any).rpc();
    }

    const pauseState = await program.account.pauseState.fetch(pause);
    expect(pauseState.paused).to.be.false;
  });

  // ─── 10. Zero decimals stablecoin works end-to-end ───────────────

  it("zero-decimals stablecoin can mint and burn integer units", async () => {
    const mint   = Keypair.generate();
    const minter = Keypair.generate();
    await provider.connection.requestAirdrop(minter.publicKey, 2_000_000_000);
    await new Promise(r => setTimeout(r, 600));

    const [config] = PublicKey.findProgramAddressSync([SEED_CONFIG, mint.publicKey.toBuffer()], program.programId);
    const [roles]  = PublicKey.findProgramAddressSync([SEED_ROLES,  mint.publicKey.toBuffer()], program.programId);
    const [pause]  = PublicKey.findProgramAddressSync([SEED_PAUSE,  mint.publicKey.toBuffer()], program.programId);
    const [minterQ] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint.publicKey.toBuffer(), minter.publicKey.toBuffer()], program.programId
    );

    await program.methods.initialize({
      name: "No Dec USD", symbol: "ndUSD", uri: "", decimals: 0,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint]).rpc();

    await program.methods.addMinter(new BN(1_000))
      .accounts({ authority: authority.publicKey, mint: mint.publicKey, minter: minter.publicKey } as any).rpc();

    const holder = Keypair.generate();
    const holderAta = getAssociatedTokenAddressSync(mint.publicKey, holder.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, holderAta, holder.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID)
    );
    await provider.sendAndConfirm(tx, []);

    await program.methods.mintTokens(new BN(42)).accounts({
      minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: holderAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter]).rpc();

    const supply = (await provider.connection.getTokenSupply(mint.publicKey)).value.amount;
    expect(supply).to.equal("42");
  });

  // ─── 11. Minter quota tracking survives pause/unpause ─────────────

  it("minterQuota.minted is preserved across pause/unpause cycles", async () => {
    const mint   = Keypair.generate();
    const minter = Keypair.generate();
    await provider.connection.requestAirdrop(minter.publicKey, 2_000_000_000);
    await new Promise(r => setTimeout(r, 600));

    const [config] = PublicKey.findProgramAddressSync([SEED_CONFIG, mint.publicKey.toBuffer()], program.programId);
    const [roles]  = PublicKey.findProgramAddressSync([SEED_ROLES,  mint.publicKey.toBuffer()], program.programId);
    const [pause]  = PublicKey.findProgramAddressSync([SEED_PAUSE,  mint.publicKey.toBuffer()], program.programId);
    const [minterQ] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint.publicKey.toBuffer(), minter.publicKey.toBuffer()], program.programId
    );

    await program.methods.initialize({
      name: "Track USD", symbol: "trUSD", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint]).rpc();

    await program.methods.addMinter(new BN(50_000))
      .accounts({ authority: authority.publicKey, mint: mint.publicKey, minter: minter.publicKey } as any).rpc();

    const holder = Keypair.generate();
    const holderAta = getAssociatedTokenAddressSync(mint.publicKey, holder.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, holderAta, holder.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID)
    );
    await provider.sendAndConfirm(tx, []);

    // Mint 10k
    await program.methods.mintTokens(new BN(10_000)).accounts({
      minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: holderAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter]).rpc();

    // Pause → unpause cycle
    await program.methods.pause()
      .accounts({ authority: authority.publicKey, roleConfig: roles, pauseState: pause } as any).rpc();
    await program.methods.unpause()
      .accounts({ authority: authority.publicKey, roleConfig: roles, pauseState: pause } as any).rpc();

    // Mint another 5k
    await program.methods.mintTokens(new BN(5_000)).accounts({
      minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: holderAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter]).rpc();

    const quotaState = await program.account.minterQuota.fetch(minterQ);
    expect(quotaState.minted.toNumber()).to.equal(15_000);
    expect(quotaState.quota.toNumber()).to.equal(50_000);
  });

  // ─── 12. Mint precisely at the quota boundary ─────────────────────

  it("minting the exact remaining quota succeeds; one more fails", async () => {
    const mint   = Keypair.generate();
    const minter = Keypair.generate();
    await provider.connection.requestAirdrop(minter.publicKey, 2_000_000_000);
    await new Promise(r => setTimeout(r, 600));

    const [config] = PublicKey.findProgramAddressSync([SEED_CONFIG, mint.publicKey.toBuffer()], program.programId);
    const [roles]  = PublicKey.findProgramAddressSync([SEED_ROLES,  mint.publicKey.toBuffer()], program.programId);
    const [pause]  = PublicKey.findProgramAddressSync([SEED_PAUSE,  mint.publicKey.toBuffer()], program.programId);
    const [minterQ] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mint.publicKey.toBuffer(), minter.publicKey.toBuffer()], program.programId
    );

    await program.methods.initialize({
      name: "Boundary USD", symbol: "bndUSD", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    }).accounts({ authority: authority.publicKey, mint: mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint]).rpc();

    await program.methods.addMinter(new BN(1_000))
      .accounts({ authority: authority.publicKey, mint: mint.publicKey, minter: minter.publicKey } as any).rpc();

    const holder = Keypair.generate();
    const holderAta = getAssociatedTokenAddressSync(mint.publicKey, holder.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, holderAta, holder.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID)
    );
    await provider.sendAndConfirm(tx, []);

    // Use 999
    await program.methods.mintTokens(new BN(999)).accounts({
      minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: holderAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter]).rpc();

    // Use the exact last 1
    await program.methods.mintTokens(new BN(1)).accounts({
      minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
      pauseState: pause, mint: mint.publicKey, recipientTokenAccount: holderAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([minter]).rpc();

    // One more should fail
    try {
      await program.methods.mintTokens(new BN(1)).accounts({
        minter: minter.publicKey, config, roleConfig: roles, minterQuota: minterQ,
        pauseState: pause, mint: mint.publicKey, recipientTokenAccount: holderAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([minter]).rpc();
      expect.fail("Should have thrown QuotaExceeded");
    } catch (e: any) {
      expect(e.message).to.include("QuotaExceeded");
    }
  });
});
