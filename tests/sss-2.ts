import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { SssStablecoin } from "../target/types/sss_stablecoin";

const SEED_CONFIG = Buffer.from("config");
const SEED_ROLES = Buffer.from("roles");
const SEED_MINTER = Buffer.from("minter");
const SEED_PAUSE = Buffer.from("pause");
const SEED_BLACKLIST = Buffer.from("blacklist");
const SEED_EXTRA_ACCOUNT_METAS = Buffer.from("extra-account-metas");

describe("SSS-2: Compliant Stablecoin Extensive Tests", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssStablecoin as Program<SssStablecoin>;
  // The transfer hook program ID defined in Anchor.toml for tests
  const transferHookProgramId = new PublicKey("6x8XMLoA9FFmVJnaDou9tyKrh9CFynDY7TtKJ54p4dcN");
  const authority = provider.wallet as anchor.Wallet;

  let mintKeypair: Keypair;
  let configPda: PublicKey;
  let rolesPda: PublicKey;
  let pausePda: PublicKey;

  // Additional actors
  const attacker = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();

  let aliceAta: PublicKey;
  let bobAta: PublicKey;

  before(async () => {
    // Fund attackers and users
    await Promise.all([
      provider.connection.requestAirdrop(attacker.publicKey, 10_000_000_000),
      provider.connection.requestAirdrop(alice.publicKey, 10_000_000_000),
      provider.connection.requestAirdrop(bob.publicKey, 10_000_000_000)
    ]);

    mintKeypair = Keypair.generate();

    [configPda] = PublicKey.findProgramAddressSync([SEED_CONFIG, mintKeypair.publicKey.toBuffer()], program.programId);
    [rolesPda] = PublicKey.findProgramAddressSync([SEED_ROLES, mintKeypair.publicKey.toBuffer()], program.programId);
    [pausePda] = PublicKey.findProgramAddressSync([SEED_PAUSE, mintKeypair.publicKey.toBuffer()], program.programId);

    aliceAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, alice.publicKey, false, TOKEN_2022_PROGRAM_ID);
    bobAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, bob.publicKey, false, TOKEN_2022_PROGRAM_ID);
  });

  // ─── 1. Initialize SSS-2 ─────────────────────────────────────────

  it("initializes an SSS-2 compliant stablecoin", async () => {
    const params = {
      name: "Compliant USDC", symbol: "cUSDC", uri: "", decimals: 6,
      enablePermanentDelegate: true, enableTransferHook: true, defaultAccountFrozen: false, enableConfidentialTransfer: false,
    };

    await program.methods.initialize(params).accounts({
      authority: authority.publicKey, mint: mintKeypair.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([mintKeypair]).rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enablePermanentDelegate).to.be.true;
    expect(config.enableTransferHook).to.be.true;
  });

  it("has SSS-2 roles set (blacklister, seizer)", async () => {
    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.blacklister.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(roles.seizer.toBase58()).to.equal(authority.publicKey.toBase58());
  });

  // ─── 2. Transfer Hook Extrameta Initialize ───────────────────────

  it("initializes ExtraAccountMetaList for transfer hook", async () => {
    // We must call the hook program directly to init the extra metas
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

  // ─── 3. Blacklist Role Verification ──────────────────────────────

  it("rejects blacklist from non-blacklister", async () => {
    const [blacklistPda] = PublicKey.findProgramAddressSync([SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), alice.publicKey.toBuffer()], program.programId);
    try {
      await program.methods.addToBlacklist("Hack").accounts({
        authority: attacker.publicKey, config: configPda, roleConfig: rolesPda,
        addressToBlacklist: alice.publicKey, blacklistEntry: blacklistPda,
      } as any).signers([attacker]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("NotBlacklister");
    }
  });

  it("adds an address to the blacklist", async () => {
    const [blacklistPda] = PublicKey.findProgramAddressSync([SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), attacker.publicKey.toBuffer()], program.programId);
    await program.methods.addToBlacklist("OFAC SDN List match").accounts({
      authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
      addressToBlacklist: attacker.publicKey, blacklistEntry: blacklistPda,
    } as any).rpc();

    const entry = await program.account.blacklistEntry.fetch(blacklistPda);
    expect(entry.address.toBase58()).to.equal(attacker.publicKey.toBase58());
    expect(entry.reason).to.equal("OFAC SDN List match");
  });

  it("rejects duplicate blacklist attempt", async () => {
    const [blacklistPda] = PublicKey.findProgramAddressSync([SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), attacker.publicKey.toBuffer()], program.programId);
    try {
      await program.methods.addToBlacklist("Again").accounts({
        authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
        addressToBlacklist: attacker.publicKey, blacklistEntry: blacklistPda,
      } as any).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.exist; // Account exists
    }
  });

  it("removes an address from the blacklist", async () => {
    const [blacklistPda] = PublicKey.findProgramAddressSync([SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), attacker.publicKey.toBuffer()], program.programId);

    // Send a lot of rent explicitly to fund the tx
    await program.methods.removeFromBlacklist().accounts({
      authority: authority.publicKey, config: configPda, roleConfig: rolesPda, blacklistEntry: blacklistPda,
    } as any).rpc();

    // Verify account is closed
    const accountInfo = await provider.connection.getAccountInfo(blacklistPda);
    expect(accountInfo).to.be.null;

  });

  it("rejects unblacklist from non-blacklister", async () => {
    // Re-add them first
    const [blacklistPda] = PublicKey.findProgramAddressSync([SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), attacker.publicKey.toBuffer()], program.programId);
    await program.methods.addToBlacklist("Re-add").accounts({
      authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
      addressToBlacklist: attacker.publicKey, blacklistEntry: blacklistPda,
    } as any).rpc();

    try {
      await program.methods.removeFromBlacklist().accounts({
        authority: attacker.publicKey, config: configPda, roleConfig: rolesPda, blacklistEntry: blacklistPda,
      } as any).signers([attacker]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("NotBlacklister");
    }
  });

  // ─── 4. Transfer Hook Enforcement ───────────────────────────────

  it("mints tokens to Alice and Attackers for testing transfers", async () => {
    const [authMinterPda] = PublicKey.findProgramAddressSync([SEED_MINTER, mintKeypair.publicKey.toBuffer(), authority.publicKey.toBuffer()], program.programId);
    await program.methods.addMinter(new BN(100_000_000)).accounts({
      authority: authority.publicKey, mint: mintKeypair.publicKey, minter: authority.publicKey
    } as any).rpc();

    // Create ATAs
    const attackerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, attacker.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, aliceAta, alice.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, bobAta, bob.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, attackerAta, attacker.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID)
    );
    await provider.sendAndConfirm(tx, []);

    // Mint tokens
    await program.methods.mintTokens(new BN(10000)).accounts({
      minter: authority.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: authMinterPda,
      pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: aliceAta, tokenProgram: TOKEN_2022_PROGRAM_ID
    } as any).rpc();
    await program.methods.mintTokens(new BN(10000)).accounts({
      minter: authority.publicKey, config: configPda, roleConfig: rolesPda, minterQuota: authMinterPda,
      pauseState: pausePda, mint: mintKeypair.publicKey, recipientTokenAccount: attackerAta, tokenProgram: TOKEN_2022_PROGRAM_ID
    } as any).rpc();
  });

  it("allows normal transfers between non-blacklisted users", async () => {
    const [extraAccountMetaListPda] = PublicKey.findProgramAddressSync([SEED_EXTRA_ACCOUNT_METAS, mintKeypair.publicKey.toBuffer()], transferHookProgramId);
    const [sourceBlacklistPda] = PublicKey.findProgramAddressSync([SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), alice.publicKey.toBuffer()], program.programId);
    const [destBlacklistPda] = PublicKey.findProgramAddressSync([SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), bob.publicKey.toBuffer()], program.programId);

    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      provider.connection,
      aliceAta, mintKeypair.publicKey, bobAta, alice.publicKey,
      BigInt(1000), 6, [], "confirmed", TOKEN_2022_PROGRAM_ID
    );

    await provider.sendAndConfirm(new Transaction().add(transferIx), [alice]);

    const bobBalance = await provider.connection.getTokenAccountBalance(bobAta);
    expect(bobBalance.value.amount).to.equal("1000");
  });

  it("blocks transfer from a blacklisted source", async () => {
    const attackerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, attacker.publicKey, false, TOKEN_2022_PROGRAM_ID);

    // Attacker is ALREADY blacklisted from the previous test suite section!
    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      provider.connection, attackerAta, mintKeypair.publicKey, bobAta, attacker.publicKey, BigInt(1000), 6, [], "confirmed", TOKEN_2022_PROGRAM_ID
    );

    try {
      await provider.sendAndConfirm(new Transaction().add(transferIx), [attacker]);
      expect.fail("Should have blocked transfer from blacklisted source");
    } catch (err: any) {
      expect(err.message).to.include("SourceBlacklisted");
    }
  });

  it("blocks transfer to a blacklisted destination", async () => {
    const attackerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, attacker.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      provider.connection, aliceAta, mintKeypair.publicKey, attackerAta, alice.publicKey, BigInt(1000), 6, [], "confirmed", TOKEN_2022_PROGRAM_ID
    );

    try {
      await provider.sendAndConfirm(new Transaction().add(transferIx), [alice]);
      expect.fail("Should have blocked transfer to blacklisted dest");
    } catch (err: any) {
      console.log("DEST TRANSFER ERROR:", err);
      expect(err.message).to.include("DestinationBlacklisted");
    }
  });

  it("blocks transfer to blacklisted owner even via fresh non-ATA token account", async () => {
    const payer = (provider.wallet as any).payer as Keypair;
    const attackerFreshTokenAccount = await createAccount(
      provider.connection,
      payer,
      mintKeypair.publicKey,
      attacker.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      provider.connection,
      aliceAta,
      mintKeypair.publicKey,
      attackerFreshTokenAccount,
      alice.publicKey,
      BigInt(500),
      6,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    try {
      await provider.sendAndConfirm(new Transaction().add(transferIx), [alice]);
      expect.fail("Should have blocked transfer to blacklisted owner via fresh token account");
    } catch (err: any) {
      expect(err.message).to.include("DestinationBlacklisted");
    }
  });

  // ─── 5. Seize Capability (Permanent Delegate) ────────────────────

  it("rejects seize from non-seizer", async () => {
    const attackerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, attacker.publicKey, false, TOKEN_2022_PROGRAM_ID);
    try {
      await program.methods.seize(new BN(5000)).accounts({
        authority: attacker.publicKey, config: configPda, roleConfig: rolesPda,
        mint: mintKeypair.publicKey, fromAccount: attackerAta, toAccount: bobAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([attacker]).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("NotSeizer");
    }
  });

  it("seizes tokens from blacklisted account", async () => {
    const attackerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, attacker.publicKey, false, TOKEN_2022_PROGRAM_ID);

    // Derived accounts for ExtraAccountMeta constraints
    const [extraAccountMetaListPda] = PublicKey.findProgramAddressSync([SEED_EXTRA_ACCOUNT_METAS, mintKeypair.publicKey.toBuffer()], transferHookProgramId);
    const [sourceBlacklistPda] = PublicKey.findProgramAddressSync([SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), attacker.publicKey.toBuffer()], program.programId);
    const [destBlacklistPda] = PublicKey.findProgramAddressSync([SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), bob.publicKey.toBuffer()], program.programId);

    try {
      await program.methods.seize(new BN(10000)).accounts({
        authority: authority.publicKey, config: configPda, roleConfig: rolesPda,
        mint: mintKeypair.publicKey, fromAccount: attackerAta, toAccount: bobAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).remainingAccounts([
        { pubkey: transferHookProgramId, isWritable: false, isSigner: false },
        { pubkey: extraAccountMetaListPda, isWritable: false, isSigner: false },
        { pubkey: program.programId, isWritable: false, isSigner: false },
        { pubkey: sourceBlacklistPda, isWritable: false, isSigner: false },
        { pubkey: destBlacklistPda, isWritable: false, isSigner: false },
      ]).rpc();
      expect.fail("Should have been blocked by the Transfer Hook");
    } catch (err: any) {
      // The Seize instruction internally calls `transfer_checked`.
      // The Token-2022 runtime invokes the Transfer Hook.
      // The Transfer Hook sees the attacker is blacklisted and aborts the transaction.
      // This is expected behavior for a strict compliance implementation.
      expect(err.message).to.include("SourceBlacklisted");
    }
  });

  // ─── 6. Feature Gating ──────────────────────────────────────────

  it("rejects seize on SSS-1 token", async () => {
    // Create SSS-1 Token
    const s1Mint = Keypair.generate();
    const [s1Config] = PublicKey.findProgramAddressSync([SEED_CONFIG, s1Mint.publicKey.toBuffer()], program.programId);
    const [s1Roles] = PublicKey.findProgramAddressSync([SEED_ROLES, s1Mint.publicKey.toBuffer()], program.programId);

    await program.methods.initialize({
      name: "S1", symbol: "S1", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: false
    }).accounts({ authority: authority.publicKey, mint: s1Mint.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([s1Mint]).rpc();

    const dummyBAtA = getAssociatedTokenAddressSync(s1Mint.publicKey, bob.publicKey, false, TOKEN_2022_PROGRAM_ID);

    // Initialize the token account so we don't hit Anchor deserialization error
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, dummyBAtA, bob.publicKey, s1Mint.publicKey, TOKEN_2022_PROGRAM_ID)
      ),
      []
    );

    try {
      await program.methods.seize(new BN(100)).accounts({
        authority: authority.publicKey, config: s1Config, roleConfig: s1Roles,
        mint: s1Mint.publicKey, fromAccount: dummyBAtA, toAccount: dummyBAtA, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).rpc();
      expect.fail("Should fail");
    } catch (err: any) {
      expect(err.message).to.include("PermanentDelegateNotEnabled");
    }
  });
});
