import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { expect } from "chai";
import { SssStablecoin } from "../target/types/sss_stablecoin";

// PDA Seeds (matching on-chain)
const SEED_CONFIG = Buffer.from("config");
const SEED_ROLES = Buffer.from("roles");
const SEED_MINTER = Buffer.from("minter");
const SEED_PAUSE = Buffer.from("pause");

describe("SSS-1: Minimal Stablecoin", () => {
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

  // ─── Initialize ──────────────────────────────────────────────────

  it("initializes an SSS-1 stablecoin", async () => {
    const params = {
      name: "Test Stablecoin",
      symbol: "TUSD",
      uri: "https://example.com/metadata.json",
      decimals: 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
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

    // Verify config
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.name).to.equal("Test Stablecoin");
    expect(config.symbol).to.equal("TUSD");
    expect(config.decimals).to.equal(6);
    expect(config.enablePermanentDelegate).to.equal(false);
    expect(config.enableTransferHook).to.equal(false);
    expect(config.authority.toBase58()).to.equal(authority.publicKey.toBase58());
  });

  it("verifies role config is initialized", async () => {
    const roles = await program.account.roleConfig.fetch(rolesPda);
    expect(roles.masterAuthority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(roles.pauser.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(roles.burner.toBase58()).to.equal(authority.publicKey.toBase58());
    // SSS-1: blacklister and seizer should be default (unset)
    expect(roles.blacklister.toBase58()).to.equal(PublicKey.default.toBase58());
  });

  it("verifies pause state is initialized (not paused)", async () => {
    const pause = await program.account.pauseState.fetch(pausePda);
    expect(pause.paused).to.equal(false);
  });

  // ─── Add Minter ─────────────────────────────────────────────────

  it("adds a minter with quota", async () => {
    const minter = Keypair.generate();
    const quota = new BN(1_000_000_000); // 1000 tokens (6 decimals)

    const [minterQuotaPda] = PublicKey.findProgramAddressSync(
      [SEED_MINTER, mintKeypair.publicKey.toBuffer(), minter.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .addMinter(quota)
      .accounts({
        authority: authority.publicKey,
        mint: mintKeypair.publicKey,
        minter: minter.publicKey,
      })
      .rpc();

    const minterAccount = await program.account.minterQuota.fetch(minterQuotaPda);
    expect(minterAccount.active).to.equal(true);
    expect(minterAccount.quota.toNumber()).to.equal(1_000_000_000);
    expect(minterAccount.minted.toNumber()).to.equal(0);
  });

  // ─── Pause / Unpause ────────────────────────────────────────────

  it("pauses operations", async () => {
    await program.methods
      .pause()
      .accounts({
        authority: authority.publicKey,
        pauseState: pausePda,
      } as any)
      .rpc();

    const pause = await program.account.pauseState.fetch(pausePda);
    expect(pause.paused).to.equal(true);
  });

  it("unpauses operations", async () => {
    await program.methods
      .unpause()
      .accounts({
        authority: authority.publicKey,
        pauseState: pausePda,
      } as any)
      .rpc();

    const pause = await program.account.pauseState.fetch(pausePda);
    expect(pause.paused).to.equal(false);
  });

  // ─── Authorization Tests ────────────────────────────────────────

  it("rejects pause from non-pauser", async () => {
    const faker = Keypair.generate();

    try {
      await program.methods
        .pause()
        .accounts({
          authority: faker.publicKey,
          pauseState: pausePda,
        } as any)
        .signers([faker])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("NotPauser");
    }
  });
});
