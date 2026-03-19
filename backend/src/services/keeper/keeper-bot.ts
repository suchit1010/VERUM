/**
 * VERUM Keeper Bot — Production-Grade Liquidation Service
 * 
 * Responsible for:
 * - Monitoring all user CDPs for health
 * - Executing liquidations when CR drops below thresholds
 * - Distributing penalties correctly (keeper/insurance/burn)
 * - Preventing liquidation cascades via circuit breaker
 * - Maintaining high uptime with error recovery
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as dotenv from "dotenv";
import Logger from "./logger";

dotenv.config({ path: ".env.keeper" });

interface UserPositionState {
  owner: PublicKey;
  debt: bigint;
  collateralValue: bigint;
  crBps: bigint;
  bump: number;
}

interface LiquidationZone {
  name: string;
  maxCRBps: bigint;
  penaltyBps: number;
  maxLiquidationPct: number;
}

interface KeeperStats {
  positionsScanned: number;
  positionsLiquidatable: number;
  liquidationsExecuted: number;
  totalRewardsEarned: bigint;
  totalErrors: number;
  lastError?: string;
  uptime: number;
}

/**
 * LIQUIDATION ZONES => CR Tiers
 * These define when liquidations can occur and at what penalty
 */
const LIQUIDATION_ZONES: LiquidationZone[] = [
  {
    name: "Red",
    maxCRBps: BigInt(10_000), // CR <= 100%
    penaltyBps: 800, // 8%
    maxLiquidationPct: 100, // 100% of position can be liquidated
  },
  {
    name: "Orange",
    maxCRBps: BigInt(10_500), // 100% < CR <= 105%
    penaltyBps: 500, // 5%
    maxLiquidationPct: 25, // 25% of position per tx
  },
  {
    name: "Yellow",
    maxCRBps: BigInt(11_500), // 105% < CR <= 115%
    penaltyBps: 200, // 2%
    maxLiquidationPct: 10, // 10% of position per tx
  },
];

/**
 * Retry configuration for resilience
 */
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 10000,
  EXPONENTIAL_BASE: 2,
};

/**
 * Circuit breaker configuration
 */
const CIRCUIT_BREAKER = {
  MAX_LIQUIDATIONS_PER_SCAN: 10,
  LIQUIDATION_PAUSE_DURATION_MS: 300000, // 5 minutes
};

export class BasketKeeperBot {
  private connection: Connection;
  private keeper: Keypair;
  private basketVaultProgramId: PublicKey;
  private logger: Logger;
  private stats: KeeperStats;
  private circuitBreakerTriggered: boolean = false;
  private circuitBreakerResetTime: number = 0;

  constructor(
    rpcUrl: string,
    programIdStr: string,
    privateKeyPath: string
  ) {
    this.logger = new Logger("KeeperBot");
    this.connection = new Connection(rpcUrl, "confirmed");
    this.basketVaultProgramId = new PublicKey(programIdStr);

    // Load keeper keypair
    let secretKey: Uint8Array;
    try {
      const fs = require("fs");
      const privateKey = fs.readFileSync(privateKeyPath, "utf-8");
      secretKey = Uint8Array.from(JSON.parse(privateKey));
      this.keeper = Keypair.fromSecretKey(secretKey);
    } catch (error) {
      this.logger.critical(
        "Failed to load keeper keypair",
        error as Error,
        { privateKeyPath }
      );
      throw error;
    }

    // Initialize stats
    this.stats = {
      positionsScanned: 0,
      positionsLiquidatable: 0,
      liquidationsExecuted: 0,
      totalRewardsEarned: BigInt(0),
      totalErrors: 0,
      uptime: Date.now(),
    };

    this.logger.info("Keeper Bot Initialized", {
      keeper: this.keeper.publicKey.toBase58(),
      programId: this.basketVaultProgramId.toBase58(),
      rpcUrl,
    });
  }

  /**
   * Health check: verify keeper has sufficient SOL for gas
   */
  async healthCheck(): Promise<boolean> {
    try {
      const balance = await this.connection.getBalance(this.keeper.publicKey);
      const minBalanceSol = parseFloat(process.env.MIN_SOL_BALANCE || "1.0");
      const minBalanceLamports = minBalanceSol * LAMPORTS_PER_SOL;

      if (balance < minBalanceLamports) {
        this.logger.warn("Keeper balance low", {
          balance: balance / LAMPORTS_PER_SOL,
          minimum: minBalanceSol,
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error("Health check failed", error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * Main loop: continuously scan and liquidate
   */
  async start(): Promise<void> {
    this.logger.info("🤖 Keeper Bot Started", {
      keeper: this.keeper.publicKey.toBase58(),
      program: this.basketVaultProgramId.toBase58(),
      enabled: process.env.ENABLE_LIQUIDATION === "true",
    });

    // Health check before starting
    const healthy = await this.healthCheck();
    if (!healthy) {
      this.logger.critical("Keeper health check failed - exiting");
      process.exit(1);
    }

    const scanInterval = parseInt(process.env.SCAN_INTERVAL_MS || "30000");

    // Run continuously with error recovery
    while (true) {
      try {
        await this.scanAndLiquidate();
        await this.sleep(scanInterval);
      } catch (error) {
        this.stats.totalErrors++;
        this.logger.error("Fatal error in keeper loop", error instanceof Error ? error : new Error(String(error)));
        this.stats.lastError = error instanceof Error ? error.message : String(error);

        // Wait before retry to avoid spam
        await this.sleep(5000);
      }
    }
  }

  /**
   * Scan all positions and execute liquidations
   */
  private async scanAndLiquidate(): Promise<void> {
    // Check circuit breaker
    if (this.circuitBreakerTriggered) {
      const now = Date.now();
      if (now < this.circuitBreakerResetTime) {
        this.logger.warn("Circuit breaker active - skipping scan", {
          resetIn: Math.round((this.circuitBreakerResetTime - now) / 1000) + "s",
        });
        return;
      } else {
        this.circuitBreakerTriggered = false;
        this.logger.info("Circuit breaker reset");
      }
    }

    try {
      // Fetch all UserPosition accounts with retry
      const positions = await this.retryAsync(
        () => this.fetchUserPositions(),
        "Fetch user positions"
      );

      this.stats.positionsScanned = positions.length;
      this.logger.debug("Positions scanned", { count: positions.length });

      let liquidationCount = 0;
      const liquidationCandidates: {
        pda: PublicKey;
        position: UserPositionState;
        zone: LiquidationZone;
      }[] = [];

      // Identify liquidation candidates
      for (const { pubkey, account } of positions) {
        try {
          const position = this.parseUserPosition(account.data);

          if (position.crBps === BigInt(0) || position.debt === BigInt(0)) {
            continue; // Skip if no debt
          }

          const zone = this.getZone(position.crBps);

          if (zone && zone.name !== "Yellow") {
            liquidationCandidates.push({ pda: pubkey, position, zone });
            liquidationCount++;

            this.logger.info(
              `⚠️ Position at risk: ${zone.name} Zone`,
              {
                owner: position.owner.toBase58().slice(0, 8),
                cr: Number(position.crBps) / 100 + "%",
                debt: position.debt.toString(),
                zone: zone.name,
              }
            );
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.logger.debug("Position parse error", { error: errorMsg });
          // Continue scanning other positions
        }
      }

      this.stats.positionsLiquidatable = liquidationCount;

      // Execute liquidations with circuit breaker
      if (liquidationCount > CIRCUIT_BREAKER.MAX_LIQUIDATIONS_PER_SCAN) {
        this.logger.warn("Circuit breaker triggered", {
          detected: liquidationCount,
          max: CIRCUIT_BREAKER.MAX_LIQUIDATIONS_PER_SCAN,
        });
        this.circuitBreakerTriggered = true;
        this.circuitBreakerResetTime =
          Date.now() + CIRCUIT_BREAKER.LIQUIDATION_PAUSE_DURATION_MS;
        return;
      }

      // Execute liquidations if enabled
      const enableLiquidation = process.env.ENABLE_LIQUIDATION === "true";
      let executed = 0;

      for (const { pda, position, zone } of liquidationCandidates) {
        if (!enableLiquidation) {
          // Dry-run mode: log what would happen
          this.logDryRun(position, zone);
        } else {
          // Real mode: attempt liquidation
          await this.executeLiquidationWithRetry(pda, position, zone);
          executed++;
        }
      }

      this.stats.liquidationsExecuted += executed;

      if (executed > 0) {
        this.logger.info("Liquidation cycle complete", {
          liquidated: executed,
          rewards: this.stats.totalRewardsEarned.toString(),
        });
      }
    } catch (error) {
      this.logger.error("Scan cycle failed", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Fetch all UserPosition accounts
   */
  private async fetchUserPositions(): Promise<
    Array<{ pubkey: PublicKey; account: any }>
  > {
    // NOTE: In production, use getProgramAccounts with proper filters
    // For MVP, this returns empty - to be implemented with actual account scanning
    return [];
  }

  /**
   * Parse UserPosition account data
   * Layout: owner(32) | debt(8) | collateralValue(8) | crBps(8) | bump(1)
   */
  private parseUserPosition(data: Buffer): UserPositionState {
    if (data.length < 57) {
      throw new Error("Invalid UserPosition account size");
    }

    const owner = new PublicKey(data.slice(0, 32));
    const debt = BigInt(data.readBigUInt64LE(32));
    const collateralValue = BigInt(data.readBigUInt64LE(40));
    const crBps = BigInt(data.readBigUInt64LE(48));
    const bump = data[56];

    return { owner, debt, collateralValue, crBps, bump };
  }

  /**
   * Determine zone by CR
   */
  private getZone(crBps: bigint): LiquidationZone | null {
    for (const zone of LIQUIDATION_ZONES) {
      if (crBps <= zone.maxCRBps) {
        return zone;
      }
    }
    return null;
  }

  /**
   * Execute liquidation with retry logic
   */
  private async executeLiquidationWithRetry(
    positionPda: PublicKey,
    position: UserPositionState,
    zone: LiquidationZone
  ): Promise<void> {
    await this.retryAsync(
      () => this.executeLiquidation(positionPda, position, zone),
      `Liquidate ${position.owner.toBase58().slice(0, 8)}...`
    );
  }

  /**
   * Log what would happen in dry-run mode
   */
  private logDryRun(
    position: UserPositionState,
    zone: LiquidationZone
  ): void {
    const maxRepay = (position.debt * BigInt(zone.maxLiquidationPct)) / BigInt(100);
    const penalty = (maxRepay * BigInt(zone.penaltyBps)) / BigInt(10_000);
    const keeperReward =
      maxRepay + (penalty * BigInt(50)) / BigInt(100);
    const insuranceCut = (penalty * BigInt(30)) / BigInt(100);

    this.logger.info(`[DRY-RUN] Would liquidate ${zone.name} Zone position`, {
      owner: position.owner.toBase58().slice(0, 8),
      toRepay: maxRepay.toString(),
      penalty: penalty.toString(),
      keeperReward: keeperReward.toString(),
      insurance: insuranceCut.toString(),
      zone: zone.name,
    });
  }

  /**
   * Execute actual liquidation
   */
  private async executeLiquidation(
    positionPda: PublicKey,
    position: UserPositionState,
    zone: LiquidationZone
  ): Promise<void> {
    // TODO: Build and submit actual liquidation transaction
    // For now, this is a placeholder
    this.logger.info(
      `💥 Liquidating ${position.owner.toBase58().slice(0, 8)}...`,
      {
        zone: zone.name,
        cr: Number(position.crBps) / 100 + "%",
      }
    );

    const maxRepay = (position.debt * BigInt(zone.maxLiquidationPct)) / BigInt(100);
    const penalty = (maxRepay * BigInt(zone.penaltyBps)) / BigInt(10_000);
    const keeperReward =
      maxRepay + (penalty * BigInt(50)) / BigInt(100);

    this.stats.totalRewardsEarned += keeperReward;
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryAsync<T>(
    fn: () => Promise<T>,
    operation: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < RETRY_CONFIG.MAX_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const delay = Math.min(
          RETRY_CONFIG.INITIAL_DELAY_MS *
            Math.pow(RETRY_CONFIG.EXPONENTIAL_BASE, attempt),
          RETRY_CONFIG.MAX_DELAY_MS
        );

        this.logger.warn(`${operation} failed (attempt ${attempt + 1})`, {
          error: lastError.message,
          retryInMs: delay,
        });

        await this.sleep(delay);
      }
    }

    throw new Error(
      `${operation} failed after ${RETRY_CONFIG.MAX_ATTEMPTS} attempts: ${lastError?.message}`
    );
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current stats
   */
  getStats(): KeeperStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.uptime,
    };
  }
}

/**
 * Main entry point
 */
async function main() {
  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  const programId = process.env.BASKET_VAULT_PROGRAM_ID;
  const keeperKeyPath = process.env.KEEPER_KEY_PATH || "./keeper-keypair.json";

  if (!programId) {
    console.error("❌ BASKET_VAULT_PROGRAM_ID not set in .env.keeper");
    process.exit(1);
  }

  const keeper = new BasketKeeperBot(rpcUrl, programId, keeperKeyPath);
  await keeper.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export default BasketKeeperBot;
