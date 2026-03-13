import { createApp, startServer } from "../../shared/health";
import { logger } from "../../shared/logger";
import { config } from "../../shared/config";
import { createProvider, loadAuthority } from "../../shared/signer";
import { SolanaStablecoin } from "@stbr/sss-token";
import { PublicKey } from "@solana/web3.js";
import express from "express";
import cors from "cors";

const SERVICE_NAME = "sss-compliance";
const PORT = parseInt(process.env.PORT || "3003");

const app = createApp(SERVICE_NAME);
app.use(cors());
app.use(express.json());

/**
 * Compliance Service — SSS-2 blacklist management and sanctions screening.
 *
 * Requires env vars:
 *   AUTHORITY_KEYPAIR  — base58 secret key of the blacklister authority
 *   SOLANA_RPC_URL     — Solana RPC endpoint
 *   SSS_PROGRAM_ID     — deployed program ID
 */

// ─── Blacklist — Add Address ──────────────────────────────────────
app.post("/api/blacklist/add", async (req, res) => {
  try {
    const { mintAddress, address, reason } = req.body;
    if (!mintAddress || !address || !reason) {
      return res.status(400).json({ error: "mintAddress, address, and reason are required" });
    }

    logger.info("Blacklist add request", { mintAddress, address, reason });

    const provider = createProvider();
    const authority = loadAuthority();
    const mintPubkey = new PublicKey(mintAddress);
    const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);

    const signature = await stablecoin.compliance.blacklistAdd(
      new PublicKey(address),
      reason,
      authority
    );

    logger.info("Address blacklisted on-chain", { signature, address });
    res.json({
      status: "blacklisted",
      address,
      reason,
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });
  } catch (err: any) {
    logger.error("Blacklist add failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Blacklist — Remove Address ───────────────────────────────────
app.post("/api/blacklist/remove", async (req, res) => {
  try {
    const { mintAddress, address } = req.body;
    if (!mintAddress || !address) {
      return res.status(400).json({ error: "mintAddress and address are required" });
    }

    const provider = createProvider();
    const authority = loadAuthority();
    const mintPubkey = new PublicKey(mintAddress);
    const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);

    const signature = await stablecoin.compliance.blacklistRemove(
      new PublicKey(address),
      authority
    );

    logger.info("Address removed from blacklist", { signature, address });
    res.json({
      status: "removed",
      address,
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });
  } catch (err: any) {
    logger.error("Blacklist remove failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Blacklist — Check Addresses ──────────────────────────────────
app.post("/api/blacklist/check", async (req, res) => {
  try {
    const { mintAddress, addresses } = req.body;
    if (!mintAddress || !addresses?.length) {
      return res.status(400).json({ error: "mintAddress and addresses[] are required" });
    }

    const provider = createProvider();
    const mintPubkey = new PublicKey(mintAddress);
    const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);

    const results = await Promise.all(
      (addresses as string[]).map(async (addr) => {
        const blacklisted = await stablecoin.isBlacklisted(new PublicKey(addr));
        return { address: addr, blacklisted };
      })
    );

    res.json({ results });
  } catch (err: any) {
    logger.error("Blacklist check failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Sanctions Screening (Integration Point) ──────────────────────
app.post("/api/sanctions/screen", async (req, res) => {
  try {
    const { mintAddress, address, provider: screeningProvider = "manual" } = req.body;

    logger.info("Sanctions screening request", { address, provider: screeningProvider });

    // Integration point for external sanctions providers (Chainalysis, TRM, etc.)
    // For now: check on-chain blacklist as ground truth
    let blacklisted = false;
    if (mintAddress) {
      const provider = createProvider();
      const stablecoin = await SolanaStablecoin.load(
        provider,
        new PublicKey(mintAddress)
      );
      blacklisted = await stablecoin.isBlacklisted(new PublicKey(address));
    }

    res.json({
      address,
      provider: screeningProvider,
      screened_at: new Date().toISOString(),
      match: blacklisted,
      details: blacklisted ? "Found in on-chain blacklist" : null,
    });
  } catch (err: any) {
    logger.error("Sanctions screening failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Audit Trail Export ───────────────────────────────────────────
app.get("/api/audit/export", async (req, res) => {
  try {
    const { mint, format = "json", from, to } = req.query;

    logger.info("Audit export request", { mint, format, from, to });

    // TODO: In production, query Postgres (populated by the indexer service)
    // For now: return empty with structure defined
    const entries: any[] = [];

    if (format === "csv") {
      const headers = "timestamp,action,actor,target,amount,details";
      const csv = headers + "\n" + entries.map((e) => Object.values(e).join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=audit-trail.csv");
      res.send(csv);
    } else {
      res.json({ entries, exportedAt: new Date().toISOString(), total: 0 });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

startServer(app, PORT, SERVICE_NAME);
