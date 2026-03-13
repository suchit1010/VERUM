import { Keypair, Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import * as fs from "fs";
import { config } from "./config";

/**
 * Load the authority keypair from env.
 *
 * Supports two formats (in priority order):
 *   1. KEYPAIR_PATH — path to a solana JSON keypair file (e.g. ~/.config/solana/id.json)
 *   2. AUTHORITY_KEYPAIR — base58-encoded private key string
 *
 * Example .env:
 *   KEYPAIR_PATH=/home/shre/.config/solana/id.json
 */
export function loadAuthority(): Keypair {
  // Option 1: JSON keypair file (easiest — just point to your Solana wallet)
  const keypairPath = process.env.KEYPAIR_PATH;
  if (keypairPath) {
    const expanded = keypairPath.replace("~", process.env.HOME || "");
    const raw = fs.readFileSync(expanded, "utf8");
    const secret = Uint8Array.from(JSON.parse(raw));
    return Keypair.fromSecretKey(secret);
  }

  // Option 2: base58-encoded private key
  const b58Key = process.env.AUTHORITY_KEYPAIR;
  if (b58Key) {
    // Dynamic import to handle different bs58 versions
    let decoded: Uint8Array;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const bs58 = require("bs58");
      const encodeFn = bs58.decode || bs58.default?.decode;
      decoded = encodeFn(b58Key);
    } catch {
      // Fallback: try Buffer
      decoded = Buffer.from(b58Key, "base64");
    }
    return Keypair.fromSecretKey(decoded);
  }

  throw new Error(
    "No keypair configured. Set either:\n" +
    "  KEYPAIR_PATH=/home/shre/.config/solana/id.json\n" +
    "  or AUTHORITY_KEYPAIR=<base58-encoded-secret-key>"
  );
}

/**
 * Create an AnchorProvider backed by the authority keypair.
 */
export function createProvider(): AnchorProvider {
  const connection = new Connection(config.solana.rpcUrl, "confirmed");
  const authority = loadAuthority();
  const wallet = new Wallet(authority);
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}
