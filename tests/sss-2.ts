import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { 
  TOKEN_2022_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddressSync, 
  createAssociatedTokenAccountIdempotentInstruction 
} from "@solana/spl-token";
import { expect } from "chai";
import { SssStablecoin } from "../target/types/sss_stablecoin";

const SEED_CONFIG = Buffer.from("config");
const SEED_ROLES = Buffer.from("roles");
const SEED_MINTER = Buffer.from("minter");
const SEED_PAUSE = Buffer.from("pause");
const SEED_BLACKLIST = Buffer.from("blacklist");

describe("SSS-2: Compliant Stablecoin", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssStablecoin as Program<SssStablecoin>;
  const authority = provider.wallet as anchor.Wallet;

  let mintKeypair: Keypair;
  let configPda: PublicKey;
  let rolesPda: PublicKey;
  let pausePda: PublicKey;

  before(async () => {
    mintKeypair = Keypair.generate();

    [configPda] = PublicKey.findProgramAddressSync(
      [SEED_CONFIG, mintKeypair.publicKey.toBuffer()],
      program.programId
    );
    [rolesPda] = PublicKey.findProgramAddressSync(
      [SEED_ROLES, mintKeypair.publicKey.toBuffer()],
      program.programId
    );
    [pausePda] = PublicKey.findProgramAddressSync(
      [SEED_PAUSE, mintKeypair.publicKey.toBuffer()],
      program.programId
    );
  });

  // ─── Initialize SSS-2 ─────────────────────────────────────────

  it("initializes an SSS-2 compliant stablecoin", async () => {
    const params = {
      name: "Compliant USDC",
      symbol: "cUSDC",
      uri: "",
      decimals: 6,
      enablePermanentDelegate: true,
      enableTransferHook: true,
      defaultAccountFrozen: false,
    };

    await program.methods
      .initialize(params)
      .accounts({
        authority: authority.publicKey,
        mint: mintKeypair.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([mintKeypair])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enablePermanentDelegate).to.equal(true);
    expect(config.enableTransferHook).to.equal(true);
  });

  it("has SSS-2 roles set (blacklister, seizer)", async () => {
    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.blacklister.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(roles.seizer.toBase58()).to.equal(authority.publicKey.toBase58());
  });

  // ─── Blacklist ─────────────────────────────────────────────────

  it("adds an address to the blacklist", async () => {
    const badActor = Keypair.generate();

    const [blacklistPda] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), badActor.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .addToBlacklist("OFAC SDN List match")
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleConfig: rolesPda,
        addressToBlacklist: badActor.publicKey,
        blacklistEntry: blacklistPda,
      } as any)
      .rpc();

    const entry = await program.account.blacklistEntry.fetch(blacklistPda);
    expect(entry.address.toBase58()).to.equal(badActor.publicKey.toBase58());
    expect(entry.reason).to.equal("OFAC SDN List match");
  });

  it("removes an address from the blacklist", async () => {
    const tempBlacklisted = Keypair.generate();

    const [blacklistPda] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), tempBlacklisted.publicKey.toBuffer()],
      program.programId
    );

    // Add
    await program.methods
      .addToBlacklist("Temporary block")
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleConfig: rolesPda,
        addressToBlacklist: tempBlacklisted.publicKey,
        blacklistEntry: blacklistPda,
      } as any)
      .rpc();

    // Remove
    await program.methods
      .removeFromBlacklist()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleConfig: rolesPda,
        blacklistEntry: blacklistPda,
      } as any)
      .rpc();

    // Verify account is closed
    const accountInfo = await provider.connection.getAccountInfo(blacklistPda);
    expect(accountInfo).to.be.null;
  });

  // ─── Feature Gating ────────────────────────────────────────────

  it("rejects blacklist on SSS-1 token", async () => {
    // Create a separate SSS-1 token
    const sss1Mint = Keypair.generate();
    const [sss1Config] = PublicKey.findProgramAddressSync(
      [SEED_CONFIG, sss1Mint.publicKey.toBuffer()],
      program.programId
    );
    const [sss1Roles] = PublicKey.findProgramAddressSync(
      [SEED_ROLES, sss1Mint.publicKey.toBuffer()],
      program.programId
    );
    const [sss1Pause] = PublicKey.findProgramAddressSync(
      [SEED_PAUSE, sss1Mint.publicKey.toBuffer()],
      program.programId
    );

    // Initialize as SSS-1
    await program.methods
      .initialize({
        name: "SSS-1 Token",
        symbol: "S1",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      })
      .accounts({
        authority: authority.publicKey,
        mint: sss1Mint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([sss1Mint])
      .rpc();

    // Try to blacklist on SSS-1 — should fail
    const target = Keypair.generate();
    const [blPda] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, sss1Mint.publicKey.toBuffer(), target.publicKey.toBuffer()],
      program.programId
    );

    try {
      const [sss1BlacklistPda] = PublicKey.findProgramAddressSync(
        [SEED_BLACKLIST, sss1Mint.publicKey.toBuffer(), target.publicKey.toBuffer()],
        program.programId
      );
      await program.methods
        .addToBlacklist("Should fail")
        .accounts({
          authority: authority.publicKey,
          config: sss1Config,
          roleConfig: sss1Roles,
          addressToBlacklist: target.publicKey,
          blacklistEntry: sss1BlacklistPda,
        } as any)
        .rpc();
      expect.fail("Should have thrown ComplianceNotEnabled");
    } catch (err: any) {
      expect(err.message).to.include("ComplianceNotEnabled");
    }
  });

  // ─── Core Operations (Mint, Burn, Pause) ───────────────────────

  it("adds a minter quota", async () => {
    const minter = Keypair.generate();
    const [minterQuotaPda] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mintKeypair.publicKey.toBuffer(), minter.publicKey.toBuffer()],
      program.programId
    );

    // Initial funding for the minter so they can pay fees
    await provider.connection.requestAirdrop(minter.publicKey, 1_000_000_000);

    await program.methods
      .addMinter(new BN(1_000_000_000))
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        minterQuota: minterQuotaPda,
        minter: minter.publicKey,
      } as any)
      .rpc();

    const minterAccount = await program.account.minterQuota.fetch(minterQuotaPda);
    expect(minterAccount.quota.toNumber()).to.equal(1_000_000_000);
  });

  it("pauses and unpauses the stablecoin", async () => {
    // Pause
    await program.methods
      .pause()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleConfig: rolesPda,
        pauseState: pausePda,
      } as any)
      .rpc();

    let pauseInfo = await program.account.pauseState.fetch(pausePda);
    expect(pauseInfo.paused).to.equal(true);

    // Unpause
    await program.methods
      .unpause()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleConfig: rolesPda,
        pauseState: pausePda,
      } as any)
      .rpc();
      
    pauseInfo = await program.account.pauseState.fetch(pausePda);
    expect(pauseInfo.paused).to.equal(false);
  });

  it("mints tokens using minter quota", async () => {
    // We already created a quota of 1,000,000,000 in the previous test for a new minter
    // Let's create a recipient and ATA
    const minter = authority; // Let's give authority a quota to make signing easy
    const recipient = Keypair.generate();

    const [minterQuotaPda] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mintKeypair.publicKey.toBuffer(), minter.publicKey.toBuffer()],
      program.programId
    );

    // 1. Add quota to authority
    await program.methods
      .addMinter(new BN(5000))
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        minterQuota: minterQuotaPda,
        minter: minter.publicKey,
      } as any)
      .rpc();

    // 2. Setup ATA
    const recipientAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const ix = createAssociatedTokenAccountIdempotentInstruction(
      minter.publicKey,
      recipientAta,
      recipient.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix), []);

    // 3. Mint
    await program.methods
      .mintTokens(new BN(1000))
      .accounts({
        minter: minter.publicKey,
        config: configPda,
        minterQuota: minterQuotaPda,
        pauseState: pausePda,
        mint: mintKeypair.publicKey,
        recipient: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any)
      .rpc();

    const ataInfo = await provider.connection.getTokenAccountBalance(recipientAta);
    expect(ataInfo.value.uiAmountString).to.equal("0.001"); // 1000 base units

    const quotaInfo = await program.account.minterQuota.fetch(minterQuotaPda);
    expect(quotaInfo.minted.toNumber()).to.equal(1000);
  });

  it("burns tokens", async () => {
    // Authority needs an ATA with tokens to burn
    const burnerAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const ix = createAssociatedTokenAccountIdempotentInstruction(
      authority.publicKey,
      burnerAta,
      authority.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix), []);

    const [minterQuotaPda] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mintKeypair.publicKey.toBuffer(), authority.publicKey.toBuffer()],
      program.programId
    );

    // Mint 5000 to authority
    await program.methods
      .mintTokens(new BN(5000))
      .accounts({
        minter: authority.publicKey,
        config: configPda,
        minterQuota: minterQuotaPda,
        pauseState: pausePda,
        mint: mintKeypair.publicKey,
        recipient: burnerAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any)
      .rpc();

    // Now burn 2000
    await program.methods
      .burnTokens(new BN(2000))
      .accounts({
        burner: authority.publicKey,
        config: configPda,
        roleConfig: rolesPda,
        pauseState: pausePda,
        mint: mintKeypair.publicKey,
        fromAccount: burnerAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any)
      .rpc();

    const ataInfo = await provider.connection.getTokenAccountBalance(burnerAta);
    expect(ataInfo.value.amount).to.equal("3000"); // 5000 - 2000
  });

  it("freezes and unfreezes accounts", async () => {
    const user = Keypair.generate();
    const userAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      user.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const ix = createAssociatedTokenAccountIdempotentInstruction(
      authority.publicKey,
      userAta,
      user.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix), []);

    // Freeze
    await program.methods
      .freezeAccount()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleConfig: rolesPda,
        mint: mintKeypair.publicKey,
        accountToFreeze: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any)
      .rpc();

    // Unfreeze
    await program.methods
      .thawAccount()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleConfig: rolesPda,
        mint: mintKeypair.publicKey,
        accountToThaw: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any)
      .rpc();
  });

  it("seizes tokens from blacklisted account", async () => {
    // 1. Create bad actor and destination
    const badActor = Keypair.generate();
    const badActorAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      badActor.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const destination = Keypair.generate();
    const destAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      destination.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Create ATAs
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey, badActorAta, badActor.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey, destAta, destination.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID
      )
    );
    await provider.sendAndConfirm(tx, []);

    // 2. Mint 1000 tokens to bad actor
    const [minterQuotaPda] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mintKeypair.publicKey.toBuffer(), authority.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .mintTokens(new BN(1000))
      .accounts({
        minter: authority.publicKey,
        config: configPda,
        minterQuota: minterQuotaPda,
        pauseState: pausePda,
        mint: mintKeypair.publicKey,
        recipient: badActorAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any)
      .rpc();

    // 3. Blacklist bad actor
    const [blacklistPda] = PublicKey.findProgramAddressSync(
      [SEED_BLACKLIST, mintKeypair.publicKey.toBuffer(), badActor.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .addToBlacklist("Seize Target")
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleConfig: rolesPda,
        addressToBlacklist: badActor.publicKey,
        blacklistEntry: blacklistPda,
      } as any)
      .rpc();

    // 4. Seize tokens
    await program.methods
      .seize(new BN(1000))
      .accounts({
        seizer: authority.publicKey,
        config: configPda,
        roleConfig: rolesPda,
        blacklistEntry: blacklistPda,
        mint: mintKeypair.publicKey,
        fromAccount: badActorAta,
        toAccount: destAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any)
      .rpc();

    // 5. Verify balances
    const badActorBalance = await provider.connection.getTokenAccountBalance(badActorAta);
    const destBalance = await provider.connection.getTokenAccountBalance(destAta);

    expect(badActorBalance.value.amount).to.equal("0");
    expect(destBalance.value.amount).to.equal("1000");
  });
});
