import express from "express";
import cors from "cors";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { SolanaStablecoin } from "@stbr/sss-token";
import { createApp, startServer } from "../../shared/health";
import { logger } from "../../shared/logger";
import { config } from "../../shared/config";
import { createProvider, loadAuthority } from "../../shared/signer";

const SERVICE_NAME = "sss-mint-burn";
const PORT = parseInt(process.env.PORT || "3001");

const app = createApp(SERVICE_NAME);
app.use(cors());
app.use(express.json());

/**
 * Mint/Burn Service — Coordinates the fiat-to-stablecoin lifecycle.
 *
 * Requires env vars:
 *   AUTHORITY_KEYPAIR  — base58 secret key of the authority/minter
 *   SOLANA_RPC_URL     — Solana RPC endpoint
 *   SSS_PROGRAM_ID     — deployed program ID
 */

// ─── Mint Tokens ─────────────────────────────────────────────────
app.post("/api/mint", async (req, res) => {
  try {
    const { mintAddress, recipient, amount, requestId } = req.body;

    if (!mintAddress || !recipient || !amount) {
      return res.status(400).json({ error: "mintAddress, recipient, and amount are required" });
    }

    logger.info("Mint request received", { mintAddress, recipient, amount, requestId });

    const provider = createProvider();
    const authority = loadAuthority();

    const mintPubkey = new PublicKey(mintAddress);
    const recipientPubkey = new PublicKey(recipient);

    // Ensure recipient ATA exists (create if not)
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority,
      mintPubkey,
      recipientPubkey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);

    const signature = await stablecoin.mint({
      recipient: recipientPubkey,
      amount: BigInt(amount),
      minter: authority,
    });

    logger.info("Mint executed on-chain", { signature, mintAddress, recipient, amount });

    res.json({
      requestId: requestId || `mint-${Date.now()}`,
      status: "confirmed",
      mintAddress,
      recipient,
      amount,
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error("Mint failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Burn Tokens ─────────────────────────────────────────────────
app.post("/api/burn", async (req, res) => {
  try {
    const { mintAddress, amount, requestId } = req.body;

    if (!mintAddress || !amount) {
      return res.status(400).json({ error: "mintAddress and amount are required" });
    }

    logger.info("Burn request received", { mintAddress, amount, requestId });

    const provider = createProvider();
    const authority = loadAuthority();

    const mintPubkey = new PublicKey(mintAddress);
    const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);

    const signature = await stablecoin.burn({
      amount: BigInt(amount),
      burner: authority,
    });

    logger.info("Burn executed on-chain", { signature, mintAddress, amount });

    res.json({
      requestId: requestId || `burn-${Date.now()}`,
      status: "confirmed",
      mintAddress,
      amount,
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error("Burn failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Request Status ───────────────────────────────────────────────
// In production this would query Postgres; for now returns current on-chain supply
app.get("/api/requests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ requestId: id, status: "confirmed", note: "Query on-chain for real-time status" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Supply Query ─────────────────────────────────────────────────
app.get("/api/supply/:mintAddress", async (req, res) => {
  try {
    const mintPubkey = new PublicKey(req.params.mintAddress);
    const provider = createProvider();
    const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
    const supply = await stablecoin.getTotalSupply();
    const config = await stablecoin.getConfig();

    res.json({
      mintAddress: req.params.mintAddress,
      supply: supply.toString(),
      name: config.name,
      symbol: config.symbol,
      decimals: config.decimals,
    });
  } catch (err: any) {
    logger.error("Supply query failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

startServer(app, PORT, SERVICE_NAME);
