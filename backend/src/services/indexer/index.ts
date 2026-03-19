import { Connection, PublicKey } from "@solana/web3.js";
import { EventParser, Program } from "@coral-xyz/anchor";
import { createApp, startServer } from "../../shared/health";
import { logger } from "../../shared/logger";
import { config } from "../../shared/config";
import cors from "cors";
import express from "express";
import { createProvider } from "../../shared/signer";
import { SolanaStablecoin } from "@stbr/sss-token";

const SERVICE_NAME = "sss-indexer";
const PORT = parseInt(process.env.PORT || "3002");

const app = createApp(SERVICE_NAME);
app.use(cors());
app.use(express.json());

/**
 * Event Indexer Service — Monitors on-chain events via WebSocket.
 *
 * Subscribes to SSS program logs, parses Anchor events:
 *   - StablecoinInitialized
 *   - TokensMinted / TokensBurned
 *   - AddressBlacklisted / AddressUnblacklisted
 *   - TokensSeized
 *   - Paused / Unpaused
 *
 * Requires env vars:
 *   SOLANA_RPC_URL     — Solana RPC endpoint
 *   SOLANA_WS_URL      — Solana WebSocket endpoint
 *   SSS_PROGRAM_ID     — deployed program ID
 */

/** In-memory event log (replace with Postgres in production) */
const eventLog: Array<{
  type: string;
  data: any;
  signature: string;
  timestamp: string;
}> = [];

let subscriptionId: number | undefined;

async function startIndexer() {
  const programId = new PublicKey(config.solana.programId);
  const connection = new Connection(config.solana.rpcUrl, {
    wsEndpoint: config.solana.wsUrl,
    commitment: "confirmed",
  });

  logger.info("Starting event indexer", {
    rpc: config.solana.rpcUrl,
    programId: programId.toBase58(),
  });

  // Fetch IDL to build the event parser
  let program: Program | undefined;
  try {
    const provider = createProvider();
    program = new Program(
      await Program.fetchIdl(programId, provider)!,
      provider
    );
    logger.info("IDL loaded successfully");
  } catch (err: any) {
    logger.warn("Could not load IDL for event parsing — raw log mode", { error: err.message });
  }

  // Subscribe to program logs
  try {
    subscriptionId = connection.onLogs(
      programId,
      (logs) => {
        if (logs.err) {
          logger.warn("Transaction error", { signature: logs.signature, error: logs.err });
          return;
        }

        // Try Anchor event parsing if IDL loaded
        if (program) {
          try {
            const parser = new EventParser(programId, program.coder);
            for (const event of parser.parseLogs(logs.logs)) {
              const entry = {
                type: event.name,
                data: event.data,
                signature: logs.signature,
                timestamp: new Date().toISOString(),
              };
              eventLog.push(entry);
              logger.info("SSS event indexed", entry);
            }
          } catch {
            // Fallback to raw
          }
        } else {
          // Raw log — look for "Program data:" lines
          for (const log of logs.logs) {
            if (log.startsWith("Program data:")) {
              const entry = {
                type: "raw_event",
                data: log.replace("Program data: ", ""),
                signature: logs.signature,
                timestamp: new Date().toISOString(),
              };
              eventLog.push(entry);
            }
          }
        }
      },
      "confirmed"
    );

    logger.info("Subscribed to SSS program logs", { subscriptionId, programId: programId.toBase58() });
  } catch (err: any) {
    logger.error("Failed to subscribe to logs", { error: err.message });
  }
}

// ─── API Endpoints ────────────────────────────────────────────────

app.get("/api/events", async (req, res) => {
  try {
    const { type, limit = "50" } = req.query;
    let results = [...eventLog].reverse(); // Newest first
    if (type) results = results.filter((e) => e.type === type);
    results = results.slice(0, parseInt(limit as string));
    res.json({ events: results, total: eventLog.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/audit-log", async (req, res) => {
  try {
    const { action, limit = "20" } = req.query;
    let results = [...eventLog].reverse();
    if (action) results = results.filter((e) => e.type === action);
    results = results.slice(0, parseInt(limit as string));
    res.json({ entries: results, total: eventLog.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Token supply endpoint
app.get("/api/token/:mintAddress", async (req, res) => {
  try {
    const provider = createProvider();
    const mintPubkey = new PublicKey(req.params.mintAddress);
    const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
    const supply = await stablecoin.getTotalSupply();
    const cfg = await stablecoin.getConfig();

    res.json({
      mint: req.params.mintAddress,
      name: cfg.name,
      symbol: cfg.symbol,
      decimals: cfg.decimals,
      supply: supply.toString(),
      paused: await stablecoin.isPaused(),
      isCompliant: cfg.enablePermanentDelegate && cfg.enableTransferHook,
    });
  } catch (err: any) {
    logger.error("Token info failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Start
startServer(app, PORT, SERVICE_NAME);
startIndexer().catch((err) => {
  logger.error("Indexer failed to start", { error: err.message });
});
