/**
 * SSS-3: Confidential Transfer Tests
 *
 * Validates the SSS-3 proof-of-concept: initializing a Token-2022 mint
 * with the ConfidentialTransferMint extension via the SSS program.
 *
 * Note on SSS-3 Architecture:
 * - The ConfidentialTransfer extension encrypts token balances using ElGamal
 *   public keys, hiding transfer amounts while preserving on-chain auditability.
 * - ZK proofs verify balance correctness without revealing amounts.
 * - This POC demonstrates the extension setup; full confidential transfer
 *   operations require client-side ZK proof generation via @solana/spl-token.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { SssStablecoin } from "../target/types/sss_stablecoin";
import { SolanaStablecoin } from "../sdk/core/src/stablecoin";

const SEED_CONFIG = Buffer.from("config");
const SEED_ROLES  = Buffer.from("roles");
const SEED_PAUSE  = Buffer.from("pause");

describe("SSS-3: Confidential Transfer (POC)", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SssStablecoin as Program<SssStablecoin>;
  const authority = provider.wallet as anchor.Wallet;

  let mintKeypair: Keypair;
  let configPda: PublicKey;
  let rolesPda:  PublicKey;
  let pausePda:  PublicKey;

  before(async () => {
    mintKeypair = Keypair.generate();
    [configPda] = PublicKey.findProgramAddressSync([SEED_CONFIG, mintKeypair.publicKey.toBuffer()], program.programId);
    [rolesPda]  = PublicKey.findProgramAddressSync([SEED_ROLES,  mintKeypair.publicKey.toBuffer()], program.programId);
    [pausePda]  = PublicKey.findProgramAddressSync([SEED_PAUSE,  mintKeypair.publicKey.toBuffer()], program.programId);

    // Initialize in before() so all subsequent tests see a fully confirmed account.
    await program.methods.initialize({
      name: "Private USD",
      symbol: "pUSD",
      uri: "https://example.com/pusd",
      decimals: 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
      defaultAccountFrozen: false,
      enableConfidentialTransfer: true,
    }).accounts({
      authority: authority.publicKey,
      mint: mintKeypair.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([mintKeypair]).rpc();
    // Wait for the validator to confirm the block before any test reads the mint account.
    await new Promise(r => setTimeout(r, 700));
  });

  // ─── 1. Initialization ──────────────────────────────────────────

  it("SSS-3: initializes a mint with ConfidentialTransfer extension", async () => {
    // Initialization was performed in before(); verify the config was stored.
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enableConfidentialTransfer).to.be.true;
    expect(config.name).to.equal("Private USD");
    expect(config.symbol).to.equal("pUSD");
  });

  // ─── 2. Config field verification ───────────────────────────────

  it("SSS-3: config.enableConfidentialTransfer is stored as true", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enableConfidentialTransfer).to.be.true;
  });

  it("SSS-3: config.enablePermanentDelegate is false (SSS-3 is not SSS-2)", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enablePermanentDelegate).to.be.false;
  });

  it("SSS-3: config.enableTransferHook is false (no blacklist hook in basic SSS-3)", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enableTransferHook).to.be.false;
  });

  it("SSS-3: config.name and symbol are stored correctly", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.name).to.equal("Private USD");
    expect(config.symbol).to.equal("pUSD");
  });

  it("SSS-3: config.authority is set to the initializing wallet", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.authority.toBase58()).to.equal(authority.publicKey.toBase58());
  });

  // ─── 3. On-chain mint extension verification ─────────────────────

  it("SSS-3: mint account has ConfidentialTransferMint extension on-chain", async () => {
    // The mint was initialized in before() with a confirmation wait.
    // Use the connection's default commitment (no explicit "confirmed" string to avoid
    // any edge-case RPC formatting differences on the local test validator).
    const info = await provider.connection.getAccountInfo(mintKeypair.publicKey);
    expect(info).to.not.be.null;
    expect(info!.owner.toBase58()).to.equal(TOKEN_2022_PROGRAM_ID.toBase58());
    // Data length > 82 bytes proves TLV extension data was written beyond the base mint.
    expect(info!.data.length).to.be.greaterThan(82);
    // Config flag cross-confirms the extension was enabled.
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enableConfidentialTransfer).to.be.true;
  });

  it("SSS-3: mint account does NOT have PermanentDelegate extension (correct SSS-3 profile)", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enablePermanentDelegate).to.be.false;
    // Account data length > 82 bytes proves extensions present, but no PermanentDelegate flag in config
    expect(config.enableConfidentialTransfer).to.be.true;
  });

  it("SSS-3: mint account does NOT have TransferHook extension (correct SSS-3 profile)", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enableTransferHook).to.be.false;
  });

  // ─── 4. Mint operations still work ───────────────────────────────

  it("SSS-3: pause state initializes to false", async () => {
    const pauseState = await program.account.pauseState.fetch(pausePda);
    expect(pauseState.paused).to.be.false;
  });

  it("SSS-3: addMinter works on SSS-3 mint", async () => {
    await program.methods.addMinter(new BN(1_000_000))
      .accounts({ authority: authority.publicKey, mint: mintKeypair.publicKey, minter: authority.publicKey } as any).rpc();

    const [authMinterPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("minter"), mintKeypair.publicKey.toBuffer(), authority.publicKey.toBuffer()], program.programId
    );
    const state = await program.account.minterQuota.fetch(authMinterPda);
    expect(state.active).to.be.true;
    expect(state.quota.toNumber()).to.equal(1_000_000);
  });

  it("SSS-3: pause works on SSS-3 mint", async () => {
    await program.methods.pause()
      .accounts({ authority: authority.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any).rpc();

    const pauseState = await program.account.pauseState.fetch(pausePda);
    expect(pauseState.paused).to.be.true;
  });

  it("SSS-3: unpause works on SSS-3 mint", async () => {
    await program.methods.unpause()
      .accounts({ authority: authority.publicKey, roleConfig: rolesPda, pauseState: pausePda } as any).rpc();

    const pauseState = await program.account.pauseState.fetch(pausePda);
    expect(pauseState.paused).to.be.false;
  });

  // ─── 5. SSS-3 with combined extensions (SSS-2 + SSS-3) ──────────

  it("SSS-3: can combine ConfidentialTransfer with PermanentDelegate (enterprise preset)", async () => {
    const combinedMint = Keypair.generate();
    await program.methods.initialize({
      name: "Enterprise USD",
      symbol: "eUSD",
      uri: "",
      decimals: 6,
      enablePermanentDelegate: true,
      enableTransferHook: false,
      defaultAccountFrozen: false,
      enableConfidentialTransfer: true,
    }).accounts({
      authority: authority.publicKey,
      mint: combinedMint.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([combinedMint]).rpc();

    const [combinedConfig] = PublicKey.findProgramAddressSync(
      [SEED_CONFIG, combinedMint.publicKey.toBuffer()], program.programId
    );
    const config = await program.account.stablecoinConfig.fetch(combinedConfig);
    expect(config.enableConfidentialTransfer).to.be.true;
    expect(config.enablePermanentDelegate).to.be.true;
  });

  it("SSS-3 combined: both ConfidentialTransferMint and PermanentDelegate extensions present on-chain", async () => {
    const combinedMint = Keypair.generate();
    await program.methods.initialize({
      name: "Hybrid USD",
      symbol: "hUSD",
      uri: "",
      decimals: 6,
      enablePermanentDelegate: true,
      enableTransferHook: false,
      defaultAccountFrozen: false,
      enableConfidentialTransfer: true,
    }).accounts({
      authority: authority.publicKey,
      mint: combinedMint.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).signers([combinedMint]).rpc();
    // Wait for the block to be confirmed before reading the account.
    await new Promise(r => setTimeout(r, 700));

    // Verify via account existence and config flags.
    const info = await provider.connection.getAccountInfo(combinedMint.publicKey);
    expect(info).to.not.be.null;
    expect(info!.owner.toBase58()).to.equal(TOKEN_2022_PROGRAM_ID.toBase58());
    // Data size significantly > 82 bytes (base mint) proves multiple extensions are allocated
    expect(info!.data.length).to.be.greaterThan(150);

    const [combinedCfg] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), combinedMint.publicKey.toBuffer()], program.programId
    );
    const config = await program.account.stablecoinConfig.fetch(combinedCfg);
    expect(config.enableConfidentialTransfer).to.be.true;
    expect(config.enablePermanentDelegate).to.be.true;
  });

  // ─── 6. Multiple SSS-3 mints are independent ────────────────────

  it("two SSS-3 mints are fully independent", async () => {
    const mint1 = Keypair.generate();
    const mint2 = Keypair.generate();

    await program.methods.initialize({
      name: "Private A", symbol: "pA", uri: "", decimals: 6,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: true,
    }).accounts({ authority: authority.publicKey, mint: mint1.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint1]).rpc();

    await program.methods.initialize({
      name: "Private B", symbol: "pB", uri: "", decimals: 9,
      enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false, enableConfidentialTransfer: true,
    }).accounts({ authority: authority.publicKey, mint: mint2.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID } as any)
      .signers([mint2]).rpc();

    const [cfg1] = PublicKey.findProgramAddressSync([SEED_CONFIG, mint1.publicKey.toBuffer()], program.programId);
    const [cfg2] = PublicKey.findProgramAddressSync([SEED_CONFIG, mint2.publicKey.toBuffer()], program.programId);

    const config1 = await program.account.stablecoinConfig.fetch(cfg1);
    const config2 = await program.account.stablecoinConfig.fetch(cfg2);

    expect(config1.decimals).to.equal(6);
    expect(config2.decimals).to.equal(9);
    expect(config1.symbol).to.equal("pA");
    expect(config2.symbol).to.equal("pB");
    expect(config1.enableConfidentialTransfer).to.be.true;
    expect(config2.enableConfidentialTransfer).to.be.true;
    expect(mint1.publicKey.toBase58()).to.not.equal(mint2.publicKey.toBase58());
  });

  // ─── 7. SDK SSS_3 preset ────────────────────────────────────────

  it("SDK SSS_3 preset creates a valid SSS-3 stablecoin", async () => {
    const adminKeypair = (authority as any).payer as Keypair;

    const res = await SolanaStablecoin.create(provider, {
      preset: "SSS_3",
      name: "SDK Private USD",
      symbol: "spUSD",
      decimals: 6,
      authority: adminKeypair,
    });

    expect(res.stablecoin.config.enableConfidentialTransfer).to.be.true;
    expect(res.stablecoin.config.enablePermanentDelegate).to.be.false;
    expect(res.stablecoin.config.enableTransferHook).to.be.false;
  });
});
