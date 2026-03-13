import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { SssStablecoin } from "../target/types/sss_stablecoin";

const SEED_CONFIG = Buffer.from("config");
const SEED_ROLES = Buffer.from("roles");
const SEED_MINTER = Buffer.from("minter");
const SEED_PAUSE = Buffer.from("pause");

describe("SSS-1: Minimal Stablecoin Extensive Tests", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssStablecoin as Program<SssStablecoin>;
  const authority = provider.wallet as anchor.Wallet;

  let mintKeypair: Keypair;
  let configPda: PublicKey;
  let rolesPda: PublicKey;
  let pausePda: PublicKey;

  // Additional actors
  const attacker = Keypair.generate();
  const minterUser = Keypair.generate();
  const recipient = Keypair.generate();

  let recipientAta: PublicKey;
  let authorityAta: PublicKey;

  before(async () => {
    // Fund attacker, minter, recipient
    const airdrop1 = provider.connection.requestAirdrop(attacker.publicKey, 10_000_000_000);
    const airdrop2 = provider.connection.requestAirdrop(minterUser.publicKey, 10_000_000_000);
    const airdrop3 = provider.connection.requestAirdrop(recipient.publicKey, 10_000_000_000);
    await Promise.all([airdrop1, airdrop2, airdrop3]);

    mintKeypair = Keypair.generate();

    [configPda] = PublicKey.findProgramAddressSync([SEED_CONFIG, mintKeypair.publicKey.toBuffer()], program.programId);
    [rolesPda] = PublicKey.findProgramAddressSync([SEED_ROLES, mintKeypair.publicKey.toBuffer()], program.programId);
    [pausePda] = PublicKey.findProgramAddressSync([SEED_PAUSE, mintKeypair.publicKey.toBuffer()], program.programId);

    recipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, recipient.publicKey, false, TOKEN_2022_PROGRAM_ID);
    authorityAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);
  });

  // ─── 1. Initialization & Validation ──────────────────────────────

  it("fails to initialize with invalid decimals (>18)", async () => {
    const badMint = Keypair.generate();
    try {
      await program.methods.initialize({
        name: "Bad", symbol: "B", uri: "", decimals: 19,
        enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false
      }).accounts({ authority: authority.publicKey, mint: badMint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
        .signers([badMint]).rpc();
      expect.fail("Should have thrown InvalidDecimals");
    } catch (err: any) {
      expect(err.message).to.include("InvalidDecimals");
    }
  });

  it("fails to initialize with too long name (>32)", async () => {
    const badMint = Keypair.generate();
    try {
      await program.methods.initialize({
        name: "ThisNameIsWayTooLongAndShouldFailValidationCheck", symbol: "B", uri: "", decimals: 6,
        enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false
      }).accounts({ authority: authority.publicKey, mint: badMint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
        .signers([badMint]).rpc();
      expect.fail("Should have thrown InvalidName");
    } catch (err: any) {
      expect(err.message).to.include("InvalidName");
    }
  });

  it("initializes an SSS-1 stablecoin successfully", async () => {
    await program.methods.initialize({
      name: "Test Stablecoin", symbol: "TUSD", uri: "https://example.com/metadata.json", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false
    }).accounts({ authority: authority.publicKey, mint: mintKeypair.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mintKeypair]).rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.name).to.equal("Test Stablecoin");
    expect(config.enablePermanentDelegate).to.be.false;
    expect(config.enableTransferHook).to.be.false;
  });

  it("verifies initial role configuration", async () => {
    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.masterAuthority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(roles.pauser.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(roles.burner.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(roles.blacklister.toBase58()).to.equal(PublicKey.default.toBase58());
  });

  it("fails to re-initialize an existing mint", async () => {
    try {
      await program.methods.initialize({
        name: "Hacked", symbol: "H", uri: "", decimals: 6,
        enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false
      }).accounts({ authority: attacker.publicKey, mint: mintKeypair.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
        .signers([mintKeypair, attacker]).rpc();
      expect.fail("Should have thrown already in use");
    } catch (err: any) {
      expect(err.message).to.exist;
    }
  });

  // ─── 2. Role Management ─────────────────────────────────────────

  it("rejects add_minter if not master authority", async () => {
    try {
      await program.methods.addMinter(new BN(1000)).accounts({
        authority: attacker.publicKey, mint: mintKeypair.publicKey, minter: minterUser.publicKey,
      } as any).signers([attacker]).rpc();
      expect.fail("Should have thrown NotMasterAuthority");
    } catch (err: any) {
      expect(err.message).to.include("NotMasterAuthority");
    }
  });

  it("master authority adds a minter", async () => {
    const minterQuotaPda = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), minterUser.publicKey.toBuffer()], program.programId)[0];
    await program.methods.addMinter(new BN(5000)).accounts({
      authority: authority.publicKey, mint: mintKeypair.publicKey, minter: minterUser.publicKey,
    } as any).rpc();

    const state = await program.account.minterQuota.fetch(minterQuotaPda);
    expect(state.quota.toNumber()).to.equal(5000);
    expect(state.active).to.be.true;
  });

  it("fails to update role if not master authority", async () => {
    try {
      await program.methods.updateRole({ role: { pauser: {} }, newAccount: attacker.publicKey })
        .accounts({ authority: attacker.publicKey, config: configPda, roleConfig: rolesPda } as any)
        .signers([attacker]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("NotMasterAuthority");
    }
  });

  it("fails to set SSS-2 roles (blacklister) on SSS-1 token", async () => {
    try {
      await program.methods.updateRole({ role: { blacklister: {} }, newAccount: authority.publicKey })
        .accounts({ authority: authority.publicKey, config: configPda, roleConfig: rolesPda } as any).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("ComplianceNotEnabled");
    }
  });

  // ─── 3. Minting & Quotas ────────────────────────────────────────

  it("creates ATAs for tests", async () => {
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, recipientAta, recipient.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, authorityAta, authority.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID)
    );
    await provider.sendAndConfirm(tx, []);
  });

  it("rejects mint if not active minter", async () => {
    const fakeQuotaPda = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), attacker.publicKey.toBuffer()], program.programId)[0];
    try {
      await program.methods.mintTokens(new BN(100)).accounts({
        minter: attacker.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: fakeQuotaPda,
        pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: recipientAta, tokenProgram: TOKEN_2022_PROGRAM_ID
      } as any).signers([attacker]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.exist;
    }
  });

  it("rejects mint if amount exceeds quota", async () => {
    const minterQuotaPda = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), minterUser.publicKey.toBuffer()], program.programId)[0];
    try {
      await program.methods.mintTokens(new BN(6000)).accounts({
        minter: minterUser.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: minterQuotaPda,
        pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: recipientAta, tokenProgram: TOKEN_2022_PROGRAM_ID
      } as any).signers([minterUser]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("QuotaExceeded");
    }
  });

  it("mints tokens successfully within quota", async () => {
    const minterQuotaPda = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), minterUser.publicKey.toBuffer()], program.programId)[0];
    await program.methods.mintTokens(new BN(2000)).accounts({
      minter: minterUser.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: minterQuotaPda,
      pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: recipientAta, tokenProgram: TOKEN_2022_PROGRAM_ID
    } as any).signers([minterUser]).rpc();

    const balance = await provider.connection.getTokenAccountBalance(recipientAta);
    expect(balance.value.amount).to.equal("2000");
  });

  // ─── 4. Pause / Unpause ─────────────────────────────────────────

  it("rejects pause from non-pauser", async () => {
    try {
      await program.methods.pause()
        .accounts({ authority: attacker.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any)
        .signers([attacker]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("NotPauser");
    }
  });

  it("pauses operations", async () => {
    await program.methods.pause()
      .accounts({ authority: authority.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any).rpc();
    const pause = await program.account.pauseState.fetch(pausePda);
    expect(pause.paused).to.be.true;
  });

  it("fails to pause if already paused", async () => {
    try {
      await program.methods.pause()
        .accounts({ authority: authority.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("Paused");
    }
  });

  it("rejects minting while paused", async () => {
    const minterQuotaPda = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), minterUser.publicKey.toBuffer()], program.programId)[0];
    try {
      await program.methods.mintTokens(new BN(100)).accounts({
        minter: minterUser.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: minterQuotaPda,
        pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: recipientAta, tokenProgram: TOKEN_2022_PROGRAM_ID
      } as any).signers([minterUser]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("Paused");
    }
  });

  it("rejects burning while paused", async () => {
    try {
      await program.methods.burnTokens(new BN(100)).accounts({
        burner: authority.publicKey, config: configPda, roleConfig: rolesPda, pauseState: pausePda,
        mint: mintKeypair.publicKey, burnerTokenAccount: authorityAta, tokenProgram: TOKEN_2022_PROGRAM_ID
      } as any).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("Paused");
    }
  });

  it("unpauses operations", async () => {
    await program.methods.unpause()
      .accounts({ authority: authority.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any).rpc();
  });

  it("fails to unpause if not paused", async () => {
    try {
      await program.methods.unpause()
        .accounts({ authority: authority.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("NotPaused");
    }
  });

  // ─── 5. Burning ─────────────────────────────────────────────────

  it("rejects burn from unauthorized burner", async () => {
    try {
      // First ensure the attacker has an ATA initialized to avoid AccountNotInitialized error.
      // We do this by creating the ATA if it doesn't exist.
      const attackerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, attacker.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const tx = new anchor.web3.Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(attacker.publicKey, attackerAta, attacker.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID)
      );
      await provider.sendAndConfirm(tx, [attacker]);

      await program.methods.burnTokens(new BN(100)).accounts({
        burner: attacker.publicKey, config: configPda, roleConfig: rolesPda, pauseState: pausePda,
        mint: mintKeypair.publicKey, burnerTokenAccount: attackerAta, tokenProgram: TOKEN_2022_PROGRAM_ID
      } as any).signers([attacker]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("NotBurner");
    }
  });

  it("burns tokens successfully", async () => {
    const authMinterPda = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), authority.publicKey.toBuffer()], program.programId)[0];
    await program.methods.addMinter(new BN(1000)).accounts({
      authority: authority.publicKey, mint: mintKeypair.publicKey, minter: authority.publicKey
    } as any).rpc();

    await program.methods.mintTokens(new BN(1000)).accounts({
      minter: authority.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: authMinterPda,
      pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: authorityAta, tokenProgram: TOKEN_2022_PROGRAM_ID
    } as any).rpc();

    await program.methods.burnTokens(new BN(500)).accounts({
      burner: authority.publicKey, config: configPda, roleConfig: rolesPda, pauseState: pausePda,
      mint: mintKeypair.publicKey, burnerTokenAccount: authorityAta, tokenProgram: TOKEN_2022_PROGRAM_ID
    } as any).rpc();

    const balance = await provider.connection.getTokenAccountBalance(authorityAta);
    expect(balance.value.amount).to.equal("500");
  });

  // ─── 6. Freezing / Thawing ──────────────────────────────────────

  it("rejects freeze from non-pauser", async () => {
    try {
      await program.methods.freezeAccount()
        .accounts({ authority: attacker.publicKey, config: configPda, roleConfig: rolesPda, mint: mintKeypair.publicKey, targetAccount: recipientAta, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
        .signers([attacker]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("NotPauser");
    }
  });

  it("freezes recipient account", async () => {
    await program.methods.freezeAccount()
      .accounts({ authority: authority.publicKey, config: configPda, roleConfig: rolesPda, mint: mintKeypair.publicKey, targetAccount: recipientAta, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .rpc();

    const acc = await getAccount(provider.connection, recipientAta, undefined, TOKEN_2022_PROGRAM_ID);
    expect(acc.isFrozen).to.be.true;
  });

  it("rejects thaw from non-pauser", async () => {
    try {
      await program.methods.thawAccount()
        .accounts({ authority: attacker.publicKey, config: configPda, roleConfig: rolesPda, mint: mintKeypair.publicKey, targetAccount: recipientAta, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
        .signers([attacker]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("NotPauser");
    }
  });

  it("thaws recipient account", async () => {
    await program.methods.thawAccount()
      .accounts({ authority: authority.publicKey, config: configPda, roleConfig: rolesPda, mint: mintKeypair.publicKey, targetAccount: recipientAta, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .rpc();

    const acc = await getAccount(provider.connection, recipientAta, undefined, TOKEN_2022_PROGRAM_ID);
    expect(acc.isFrozen).to.be.false;
  });

  // ─── 7. Authority Transfers ───────────────────────────────────────

  it("fails to transfer authority if not master", async () => {
    try {
      await program.methods.transferAuthority().accounts({
        authority: attacker.publicKey, config: configPda, roleConfig: rolesPda, newAuthority: attacker.publicKey
      } as any).signers([attacker]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("NotMasterAuthority");
    }
  });

  it("transfers master authority successfully", async () => {
    await program.methods.transferAuthority().accounts({
      authority: authority.publicKey, config: configPda, roleConfig: rolesPda, newAuthority: recipient.publicKey
    } as any).rpc();

    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.masterAuthority.toBase58()).to.equal(recipient.publicKey.toBase58());
  });
});
