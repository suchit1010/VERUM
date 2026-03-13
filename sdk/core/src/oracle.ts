/**
 * OracleModule — Switchboard price feed integration for SSS non-USD stablecoins.
 *
 * ## Architecture
 *
 * ```
 * Switchboard On-Demand Feed (off-chain)
 *        │
 *        ▼
 * Keeper service (this SDK) ──► sss-oracle program ──► OracleConfig PDA
 *                                      │
 *                                      ▼
 *                              MintQuoteEvent / RedeemQuoteEvent
 * ```
 *
 * ## Supported currency pairs (devnet)
 *
 * Fetch live feed addresses from: https://ondemand.switchboard.xyz/solana/devnet
 *
 * | Currency | Pair    | Notes                              |
 * |----------|---------|------------------------------------|
 * | EUR      | EUR/USD | Major FX pair                      |
 * | BRL      | BRL/USD | Brazilian Real                     |
 * | JPY      | JPY/USD | Japanese Yen (small price, ~0.007) |
 * | GBP      | GBP/USD | British Pound                      |
 *
 * ## Quick start
 *
 * ```ts
 * // Initialize an oracle for a EUR-pegged stablecoin
 * const oracle = new OracleModule(provider, mintAddress);
 * await oracle.initialize({
 *   currency: "EUR",
 *   switchboardFeed: SWITCHBOARD_FEEDS["EUR"],
 *   tokenDecimals: 6,
 *   initialPrice: 1_080_000, // 1.08 USD/EUR bootstrap price
 * });
 *
 * // Keeper loop — post Switchboard prices every 30s
 * await oracle.postSwitchboardPrice(feedPrice, feedConfidence, feedTimestamp);
 *
 * // Quote how many EUR tokens to mint for $100 USD
 * const quote = await oracle.getMintQuote(100_000_000); // 100 USD in micro-USD
 * console.log(`Mint ${quote.tokenAmount} EUR tokens`);
 * ```
 */

import {
  PublicKey,
  Connection,
  Keypair,
  TransactionSignature,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { AnchorProvider, Program, BN, EventParser } from "@coral-xyz/anchor";

// ─── Program ID ──────────────────────────────────────────────────────────────

/** SSS Oracle program ID. */
export const SSS_ORACLE_PROGRAM_ID = new PublicKey(
  "hntKYM3tbdSnAzYaSU1FvDpFoE8wwBRvY3hpsMHhrN6"
);

// ─── Known Switchboard On-Demand Feed Addresses ───────────────────────────────
//
// Source: https://ondemand.switchboard.xyz/solana/devnet
// Update these whenever Switchboard rotates feed addresses.

export const SWITCHBOARD_FEEDS: Record<string, PublicKey> = {
  EUR: new PublicKey("FNNvb1AFDnDVPkocEri8mWbJ1952HQZtFLuwPiUjSJQ"), // EUR/USD devnet
  BRL: new PublicKey("5pDCXGRqnbovFnMzBBjf1QMAA1DgYMzBGBuFMbWBWHxV"), // BRL/USD devnet
  JPY: new PublicKey("2B5d8qFGCriMxvKUYNcLKFEXBtjJfGRvzrXNBvKmFEj2"), // JPY/USD devnet
  GBP: new PublicKey("CcMtxRVYLByW6STHxLFr13GbqPbpyqPMoiBqRcSyavKe"), // GBP/USD devnet
  // Add CPI, commodity, and custom pegs below:
  // CPI: new PublicKey("..."), // CPI index (slow-moving, staleness 3600s)
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OracleConfigState {
  /** Oracle authority (keeper key). */
  authority: PublicKey;
  /** Stablecoin mint being priced. */
  stablecoinMint: PublicKey;
  /** Switchboard feed address (stored for auditability). */
  switchboardFeed: PublicKey;
  /** ISO 4217 currency code, e.g. "EUR". */
  currencyCode: string;
  /** Latest price in micro-USD. 1 USD = 1_000_000. */
  priceUsd: bigint;
  /** Oracle confidence interval (same units as priceUsd). */
  confidence: bigint;
  /** Unix timestamp of the last accepted price update. */
  lastUpdate: number;
  /** Maximum allowed price age (seconds). */
  maxStaleness: number;
  /** Minimum sanity price (micro-USD). */
  priceLowerBound: bigint;
  /** Maximum sanity price (micro-USD). */
  priceUpperBound: bigint;
  /** Max allowed single-update deviation (basis points). */
  maxDeviationBps: number;
  /** Token decimal places. */
  tokenDecimals: number;
  /** Cumulative minted tokens (analytics). */
  totalMinted: bigint;
  /** Cumulative redeemed tokens (analytics). */
  totalRedeemed: bigint;
  /** Whether the cached price is within the staleness window. */
  isPriceFresh: boolean;
}

export interface InitOracleParams {
  /** ISO 4217 currency code, e.g. "EUR". Max 8 characters. */
  currency: string;
  /** Switchboard feed PublicKey. Use SWITCHBOARD_FEEDS["EUR"] etc. */
  switchboardFeed: PublicKey;
  /** Token decimals (must match the stablecoin mint). */
  tokenDecimals: number;
  /** Bootstrap price in micro-USD — the initial value before the keeper pushes live data. */
  initialPrice: number;
  /** Max price age in seconds. Default: 60. */
  maxStaleness?: number;
  /** Min sanity price (micro-USD). Default: 100_000 ($0.10). */
  priceLowerBound?: number;
  /** Max sanity price (micro-USD). Default: 10_000_000 ($10.00). */
  priceUpperBound?: number;
  /** Max single-update deviation in basis points. Default: 500 (5%). */
  maxDeviationBps?: number;
}

export interface MintQuote {
  /** USD input in micro-USD (as passed to getMintQuote). */
  usdInput: bigint;
  /** Token output in base units (e.g. 925_925 = 0.925925 EUR @ 6 decimals). */
  tokenAmount: bigint;
  /** Price used for the quote (micro-USD). */
  priceUsed: bigint;
  /** Unix timestamp after which this quote is stale. */
  expiresAt: number;
}

export interface RedeemQuote {
  /** Token input in base units. */
  tokenAmount: bigint;
  /** USD output in micro-USD. */
  usdOutput: bigint;
  /** Price used for the quote (micro-USD). */
  priceUsed: bigint;
  /** Unix timestamp after which this quote is stale. */
  expiresAt: number;
}

// ─── Minimal IDL for the oracle program ──────────────────────────────────────
// Full IDL is generated by `anchor build` → `target/idl/sss_oracle.json`

const SSS_ORACLE_IDL = {
  version: "0.1.0",
  name: "sss_oracle",
  instructions: [
    {
      name: "initializeOracle",
      accounts: [
        { name: "authority", isMut: true, isSigner: true },
        { name: "stablecoinMint", isMut: false, isSigner: false },
        { name: "oracleConfig", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        {
          name: "params",
          type: {
            defined: "InitOracleParams",
          },
        },
      ],
    },
    {
      name: "updatePrice",
      accounts: [
        { name: "authority", isMut: false, isSigner: true },
        { name: "oracleConfig", isMut: true, isSigner: false },
      ],
      args: [
        { name: "price", type: "i64" },
        { name: "confidence", type: "u64" },
        { name: "timestamp", type: "i64" },
      ],
    },
    {
      name: "mintQuote",
      accounts: [{ name: "oracleConfig", isMut: true, isSigner: false }],
      args: [{ name: "usdInput", type: "u64" }],
    },
    {
      name: "redeemQuote",
      accounts: [{ name: "oracleConfig", isMut: true, isSigner: false }],
      args: [{ name: "tokenAmount", type: "u64" }],
    },
  ],
  accounts: [
    {
      name: "OracleConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "publicKey" },
          { name: "stablecoinMint", type: "publicKey" },
          { name: "switchboardFeed", type: "publicKey" },
          { name: "currencyCode", type: { array: ["u8", 8] } },
          { name: "priceUsd", type: "i64" },
          { name: "confidence", type: "u64" },
          { name: "lastUpdate", type: "i64" },
          { name: "maxStaleness", type: "i64" },
          { name: "priceLowerBound", type: "i64" },
          { name: "priceUpperBound", type: "i64" },
          { name: "maxDeviationBps", type: "u16" },
          { name: "tokenDecimals", type: "u8" },
          { name: "bump", type: "u8" },
          { name: "totalMinted", type: "u128" },
          { name: "totalRedeemed", type: "u128" },
        ],
      },
    },
  ],
  events: [
    {
      name: "PriceUpdatedEvent",
      fields: [
        { name: "oracle", type: "publicKey", index: false },
        { name: "stablecoinMint", type: "publicKey", index: false },
        { name: "currencyCode", type: { array: ["u8", 8] }, index: false },
        { name: "priceUsd", type: "i64", index: false },
        { name: "confidence", type: "u64", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "MintQuoteEvent",
      fields: [
        { name: "oracle", type: "publicKey", index: false },
        { name: "usdInput", type: "u64", index: false },
        { name: "tokenAmount", type: "u64", index: false },
        { name: "priceUsed", type: "i64", index: false },
        { name: "expiresAt", type: "i64", index: false },
      ],
    },
    {
      name: "RedeemQuoteEvent",
      fields: [
        { name: "oracle", type: "publicKey", index: false },
        { name: "tokenAmount", type: "u64", index: false },
        { name: "usdOutput", type: "u64", index: false },
        { name: "priceUsed", type: "i64", index: false },
        { name: "expiresAt", type: "i64", index: false },
      ],
    },
  ],
  errors: [],
} as const;

// ─── OracleModule ─────────────────────────────────────────────────────────────

export class OracleModule {
  private program: Program;
  private eventParser: EventParser;

  constructor(
    private readonly provider: AnchorProvider,
    private readonly mintAddress: PublicKey,
    private readonly programId: PublicKey = SSS_ORACLE_PROGRAM_ID
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.program = new Program(SSS_ORACLE_IDL as any, provider);
    this.eventParser = new EventParser(programId, this.program.coder);
  }

  // ─── PDAs ────────────────────────────────────────────────────────

  getOracleConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_cfg"), this.mintAddress.toBuffer()],
      this.programId
    );
  }

  // ─── Initialize ──────────────────────────────────────────────────

  /**
   * Create an oracle configuration for a stablecoin.
   *
   * @example
   * ```ts
   * const oracleTx = await oracle.initialize({
   *   currency: "EUR",
   *   switchboardFeed: SWITCHBOARD_FEEDS["EUR"],
   *   tokenDecimals: 6,
   *   initialPrice: 1_080_000, // 1.08 USD/EUR
   * });
   * ```
   */
  async initialize(
    params: InitOracleParams,
    authority: Keypair
  ): Promise<TransactionSignature> {
    const [oracleConfig] = this.getOracleConfigPda();

    const currencyBytes = Buffer.alloc(8);
    currencyBytes.write(params.currency.substring(0, 8), "utf8");

    return this.program.methods
      .initializeOracle({
        currencyCode: Array.from(currencyBytes),
        switchboardFeed: params.switchboardFeed,
        tokenDecimals: params.tokenDecimals,
        maxStaleness: new BN(params.maxStaleness ?? 60),
        priceLowerBound: new BN(params.priceLowerBound ?? 100_000),
        priceUpperBound: new BN(params.priceUpperBound ?? 10_000_000),
        maxDeviationBps: params.maxDeviationBps ?? 500,
        initialPrice: new BN(params.initialPrice),
      })
      .accounts({
        authority: authority.publicKey,
        stablecoinMint: this.mintAddress,
        oracleConfig,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
  }

  // ─── Update Price (Keeper) ────────────────────────────────────────

  /**
   * Post a verified price from Switchboard to the oracle program.
   *
   * This is called by the keeper service after reading from the Switchboard feed.
   * The on-chain program enforces staleness, bounds, and max deviation.
   *
   * ## Switchboard integration example
   * ```ts
   * // Using @switchboard-xyz/on-demand SDK:
   * import { PullFeed, CrossbarClient } from "@switchboard-xyz/on-demand";
   *
   * const crossbar = new CrossbarClient("https://crossbar.switchboard.xyz");
   * const feed = new PullFeed(connection, SWITCHBOARD_FEEDS["EUR"]);
   * const { value, stdev, slot } = await feed.loadData();
   * const timestamp = await connection.getBlockTime(slot);
   *
   * await oracle.postSwitchboardPrice(
   *   BigInt(Math.round(value * 1_000_000)),  // micro-USD
   *   BigInt(Math.round(stdev * 1_000_000)),  // confidence
   *   timestamp!,
   *   keeperKeypair
   * );
   * ```
   */
  async postSwitchboardPrice(
    priceUsd: bigint,
    confidence: bigint,
    timestamp: number,
    authority: Keypair
  ): Promise<TransactionSignature> {
    const [oracleConfig] = this.getOracleConfigPda();

    return this.program.methods
      .updatePrice(
        new BN(priceUsd.toString()),
        new BN(confidence.toString()),
        new BN(timestamp)
      )
      .accounts({
        authority: authority.publicKey,
        oracleConfig,
      })
      .signers([authority])
      .rpc();
  }

  // ─── Quotes (simulate) ────────────────────────────────────────────

  /**
   * Get a mint quote: how many tokens to issue for a USD input.
   *
   * Uses `simulateTransaction` — no on-chain state change, no fee.
   *
   * @param usdInput  USD amount in micro-USD (1 USD = 1_000_000)
   * @returns MintQuote with tokenAmount, priceUsed, expiresAt
   *
   * @example
   * ```ts
   * // How many EUR tokens for $100 USD?
   * const quote = await oracle.getMintQuote(100_000_000n);
   * // quote.tokenAmount = 92_592_592 (92.59 EUR @ 6 decimals, EUR/USD=1.08)
   * ```
   */
  async getMintQuote(usdInput: bigint): Promise<MintQuote> {
    const [oracleConfig] = this.getOracleConfigPda();

    const tx = await this.program.methods
      .mintQuote(new BN(usdInput.toString()))
      .accounts({ oracleConfig })
      .transaction();

    const sim = await this.provider.connection.simulateTransaction(
      await this._prepareSimTx(tx),
      { commitment: "confirmed" }
    );

    for (const event of this.eventParser.parseLogs(sim.value.logs ?? [])) {
      if (event.name === "MintQuoteEvent") {
        const d = event.data as Record<string, BN | number>;
        return {
          usdInput,
          tokenAmount: BigInt((d.tokenAmount as BN).toString()),
          priceUsed: BigInt((d.priceUsed as BN).toString()),
          expiresAt: Number((d.expiresAt as BN).toString()),
        };
      }
    }
    throw new Error("MintQuoteEvent not found in simulation logs");
  }

  /**
   * Get a redeem quote: how much USD you receive for a token amount.
   *
   * Uses `simulateTransaction` — no on-chain state change, no fee.
   *
   * @param tokenAmount  Token amount in base units (e.g. 1_000_000 = 1 token @ 6 decimals)
   * @returns RedeemQuote with usdOutput, priceUsed, expiresAt
   */
  async getRedeemQuote(tokenAmount: bigint): Promise<RedeemQuote> {
    const [oracleConfig] = this.getOracleConfigPda();

    const tx = await this.program.methods
      .redeemQuote(new BN(tokenAmount.toString()))
      .accounts({ oracleConfig })
      .transaction();

    const sim = await this.provider.connection.simulateTransaction(
      await this._prepareSimTx(tx),
      { commitment: "confirmed" }
    );

    for (const event of this.eventParser.parseLogs(sim.value.logs ?? [])) {
      if (event.name === "RedeemQuoteEvent") {
        const d = event.data as Record<string, BN | number>;
        return {
          tokenAmount,
          usdOutput: BigInt((d.usdOutput as BN).toString()),
          priceUsed: BigInt((d.priceUsed as BN).toString()),
          expiresAt: Number((d.expiresAt as BN).toString()),
        };
      }
    }
    throw new Error("RedeemQuoteEvent not found in simulation logs");
  }

  // ─── State Reader ─────────────────────────────────────────────────

  /** Fetch the current on-chain oracle state. */
  async getConfig(): Promise<OracleConfigState> {
    const [oracleConfig] = this.getOracleConfigPda();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (this.program.account as any).oracleConfig.fetch(
      oracleConfig
    );

    const now = Math.floor(Date.now() / 1000);
    const lastUpdate = Number(raw.lastUpdate.toString());
    const maxStaleness = Number(raw.maxStaleness.toString());

    return {
      authority: raw.authority as PublicKey,
      stablecoinMint: raw.stablecoinMint as PublicKey,
      switchboardFeed: raw.switchboardFeed as PublicKey,
      currencyCode: Buffer.from(raw.currencyCode as number[])
        .toString("utf8")
        .replace(/\0/g, ""),
      priceUsd: BigInt(raw.priceUsd.toString()),
      confidence: BigInt(raw.confidence.toString()),
      lastUpdate,
      maxStaleness,
      priceLowerBound: BigInt(raw.priceLowerBound.toString()),
      priceUpperBound: BigInt(raw.priceUpperBound.toString()),
      maxDeviationBps: raw.maxDeviationBps as number,
      tokenDecimals: raw.tokenDecimals as number,
      totalMinted: BigInt(raw.totalMinted.toString()),
      totalRedeemed: BigInt(raw.totalRedeemed.toString()),
      isPriceFresh: now - lastUpdate <= maxStaleness,
    };
  }

  /** Human-readable price as a decimal string. Example: "1.08" for EUR/USD = 1_080_000. */
  static formatPrice(microUsd: bigint): string {
    const whole = microUsd / 1_000_000n;
    const frac = microUsd % 1_000_000n;
    return `${whole}.${frac.toString().padStart(6, "0")}`;
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private async _prepareSimTx(tx: Transaction): Promise<Transaction> {
    const { blockhash } =
      await this.provider.connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.provider.wallet.publicKey;
    return tx;
  }
}

// ─── Keeper Service ───────────────────────────────────────────────────────────

/**
 * KeeperService — polls a Switchboard feed and pushes price updates.
 *
 * ## Usage
 * ```ts
 * const keeper = new KeeperService(oracle, keeperKeypair, {
 *   intervalMs: 30_000,     // poll every 30s
 *   feedUrl: "https://crossbar.switchboard.xyz",
 * });
 * await keeper.start();
 * // ... runs until keeper.stop()
 * ```
 *
 * In production, run this as a Docker service:
 *   `docker compose up sss-oracle-keeper`
 */
export class KeeperService {
  private running = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly oracle: OracleModule,
    private readonly keeperKeypair: Keypair,
    private readonly opts: {
      intervalMs?: number;
      /** Called with each price update for logging/monitoring. */
      onUpdate?: (priceUsd: bigint, ts: number) => void;
      /** Called on error — defaults to console.error. */
      onError?: (err: Error) => void;
    } = {}
  ) {}

  /**
   * Start the keeper polling loop.
   *
   * Requires a `fetchSwitchboardPrice` implementation — see `fromSwitchboard()`.
   */
  async start(
    fetchPrice: () => Promise<{ priceUsd: bigint; confidence: bigint; timestamp: number }>
  ): Promise<void> {
    if (this.running) return;
    this.running = true;

    const tick = async () => {
      if (!this.running) return;
      try {
        const { priceUsd, confidence, timestamp } = await fetchPrice();
        await this.oracle.postSwitchboardPrice(
          priceUsd,
          confidence,
          timestamp,
          this.keeperKeypair
        );
        this.opts.onUpdate?.(priceUsd, timestamp);
      } catch (err) {
        (this.opts.onError ?? console.error)(err as Error);
      }
      if (this.running) {
        this.timer = setTimeout(tick, this.opts.intervalMs ?? 30_000);
      }
    };

    await tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }
}
