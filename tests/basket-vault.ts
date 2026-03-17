import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { createMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import { SssOracle } from "../target/types/sss_oracle";

const SEED_BASKET_CONFIG = Buffer.from("basket-config");
const SEED_ORACLE_CONFIG = Buffer.from("oracle_cfg");

async function airdropAndConfirm(
  provider: AnchorProvider,
  recipient: PublicKey,
  lamports: number,
) {
  const sig = await provider.connection.requestAirdrop(recipient, lamports);
  await provider.connection.confirmTransaction(sig, "confirmed");
}

function currencyToBytes(code: string): number[] {
  const buf = Buffer.alloc(8);
  buf.write(code.substring(0, 8), "utf8");
  return Array.from(buf);
}

describe("BasketVault: Oracle Price Ingestion", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const basketProgram = (anchor.workspace as any).BasketVault as any;
  const oracleProgram = anchor.workspace.SssOracle as Program<SssOracle>;
  const stablecoinProgram = anchor.workspace.SssStablecoin as Program<any>;

  const authority = provider.wallet as anchor.Wallet;
  const payer = (provider.wallet as any).payer as Keypair;
  const keeper = Keypair.generate();

  before(async () => {
    await airdropAndConfirm(provider, authority.publicKey, 5_000_000_000);
    await airdropAndConfirm(provider, keeper.publicKey, 3_000_000_000);
  });

  async function initializeBasketWithSingleAsset(options?: {
    basketMaxOracleConfidenceBps?: number;
    registeredFeed?: PublicKey;
    oracleFeed?: PublicKey;
  }) {
    const basketMint = await createMint(
      provider.connection,
      payer,
      authority.publicKey,
      null,
      6,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );

    const assetMint = await createMint(
      provider.connection,
      payer,
      authority.publicKey,
      null,
      6,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );

    const [globalConfig] = PublicKey.findProgramAddressSync(
      [SEED_BASKET_CONFIG, basketMint.toBuffer()],
      basketProgram.programId,
    );

    const registeredFeed = options?.registeredFeed ?? Keypair.generate().publicKey;
    const oracleFeed = options?.oracleFeed ?? registeredFeed;
    const maxOracleConfidenceBps = options?.basketMaxOracleConfidenceBps ?? 500;

    await basketProgram.methods
      .initialize({
        baseCrBps: 15_000,
        crisisCrBps: 30_000,
        maxWeightStepBps: 1_000,
        rebalanceCooldownSlots: new BN(1),
        maxPriceAgeSecs: new BN(120),
        maxOracleConfidenceBps,
        maxMintPerTx: new BN(1_000_000_000),
      })
      .accounts({
        payer: authority.publicKey,
        authority: authority.publicKey,
        basketMint,
        sssProgram: stablecoinProgram.programId,
        globalConfig,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await basketProgram.methods
      .registerAsset({
        mint: assetMint,
        oracleFeed: registeredFeed,
        decimals: 6,
        weightBps: 10_000,
        minCrBps: 10_000,
        priceMaxAgeSecs: null,
      })
      .accounts({
        authority: authority.publicKey,
        globalConfig,
      })
      .rpc();

    const [oracleConfig] = PublicKey.findProgramAddressSync(
      [SEED_ORACLE_CONFIG, assetMint.toBuffer()],
      oracleProgram.programId,
    );

    await oracleProgram.methods
      .initializeOracle({
        currencyCode: currencyToBytes("BASKET"),
        switchboardFeed: oracleFeed,
        tokenDecimals: 6,
        maxStaleness: new BN(120),
        priceLowerBound: new BN(100_000),
        priceUpperBound: new BN(10_000_000),
        maxDeviationBps: 5_000,
        initialPrice: new BN(1_000_000),
      })
      .accounts({
        authority: keeper.publicKey,
        stablecoinMint: assetMint,
      })
      .signers([keeper])
      .rpc();

    return {
      basketMint,
      assetMint,
      globalConfig,
      oracleConfig,
      registeredFeed,
      oracleFeed,
    };
  }

  it("syncs asset price from verified sss-oracle config", async () => {
    const fixture = await initializeBasketWithSingleAsset();

    const now = Math.floor(Date.now() / 1000);
    await oracleProgram.methods
      .updatePrice(new BN(1_250_000), new BN(5_000), new BN(now + 3))
      .accounts({
        authority: keeper.publicKey,
        oracleConfig: fixture.oracleConfig,
      })
      .signers([keeper])
      .rpc();

    await basketProgram.methods
      .updateAssetPriceFromOracle({ assetMint: fixture.assetMint })
      .accounts({
        authority: authority.publicKey,
        globalConfig: fixture.globalConfig,
        oracleProgram: oracleProgram.programId,
        oracleConfig: fixture.oracleConfig,
      })
      .rpc();

    const cfg = await (basketProgram.account as any).globalConfig.fetch(fixture.globalConfig);
    expect(cfg.assets[0].priceMicroUsd.toString()).to.equal("1250000");
    expect(cfg.assets[0].priceUpdatedAt.toNumber()).to.be.greaterThan(0);
  });

  it("rejects oracle sync when feed does not match registered asset feed", async () => {
    const fixture = await initializeBasketWithSingleAsset({
      registeredFeed: Keypair.generate().publicKey,
      oracleFeed: Keypair.generate().publicKey,
    });

    const now = Math.floor(Date.now() / 1000);
    await oracleProgram.methods
      .updatePrice(new BN(1_100_000), new BN(5_000), new BN(now + 3))
      .accounts({
        authority: keeper.publicKey,
        oracleConfig: fixture.oracleConfig,
      })
      .signers([keeper])
      .rpc();

    try {
      await basketProgram.methods
        .updateAssetPriceFromOracle({ assetMint: fixture.assetMint })
        .accounts({
          authority: authority.publicKey,
          globalConfig: fixture.globalConfig,
          oracleProgram: oracleProgram.programId,
          oracleConfig: fixture.oracleConfig,
        })
        .rpc();
      expect.fail("Should fail with OracleFeedMismatch");
    } catch (err: any) {
      expect(err.toString()).to.include("OracleFeedMismatch");
    }
  });

  it("rejects oracle sync when oracle confidence is too wide", async () => {
    const fixture = await initializeBasketWithSingleAsset({
      basketMaxOracleConfidenceBps: 100, // 1%
    });

    const now = Math.floor(Date.now() / 1000);
    await oracleProgram.methods
      .updatePrice(new BN(1_000_000), new BN(30_000), new BN(now + 3)) // 3%
      .accounts({
        authority: keeper.publicKey,
        oracleConfig: fixture.oracleConfig,
      })
      .signers([keeper])
      .rpc();

    try {
      await basketProgram.methods
        .updateAssetPriceFromOracle({ assetMint: fixture.assetMint })
        .accounts({
          authority: authority.publicKey,
          globalConfig: fixture.globalConfig,
          oracleProgram: oracleProgram.programId,
          oracleConfig: fixture.oracleConfig,
        })
        .rpc();
      expect.fail("Should fail with OracleConfidenceTooWide");
    } catch (err: any) {
      expect(err.toString()).to.include("OracleConfidenceTooWide");
    }
  });
});
