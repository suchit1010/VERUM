import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import * as toml from "toml";

export interface CliConfig {
  keypairPath: string;
  rpcUrl: string;
  outputFormat: "text" | "json";
  dryRun: boolean;
  skipConfirm: boolean;
}

/**
 * Load keypair from file path (supports ~ expansion)
 */
export function loadKeypair(keypairPath: string): Keypair {
  const resolved = keypairPath.replace("~", process.env.HOME || "");
  const raw = fs.readFileSync(resolved, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Create an AnchorProvider from CLI options
 */
export function createProvider(opts: CliConfig): AnchorProvider {
  const connection = new Connection(opts.rpcUrl, "confirmed");
  const keypair = loadKeypair(opts.keypairPath);
  const wallet = new Wallet(keypair);
  return new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
}

/**
 * Get CLI config from Commander options
 */
export function getCliConfig(opts: any): CliConfig {
  return {
    keypairPath: opts.keypair || "~/.config/solana/id.json",
    rpcUrl: opts.url || "http://localhost:8899",
    outputFormat: opts.output || "text",
    dryRun: opts.dryRun || false,
    skipConfirm: opts.yes || false,
  };
}

/**
 * Load custom TOML/JSON config file for stablecoin initialization
 */
export function loadCustomConfig(configPath: string): any {
  const ext = path.extname(configPath).toLowerCase();
  const raw = fs.readFileSync(configPath, "utf-8");

  if (ext === ".toml") {
    return toml.parse(raw);
  } else if (ext === ".json") {
    return JSON.parse(raw);
  } else {
    throw new Error(`Unsupported config format: ${ext}. Use .toml or .json`);
  }
}

/**
 * Format output based on CLI output format
 */
export function formatOutput(data: any, format: "text" | "json"): string {
  if (format === "json") {
    return JSON.stringify(data, null, 2);
  }

  // Text format
  if (typeof data === "string") return data;

  return Object.entries(data)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join("\n");
}
