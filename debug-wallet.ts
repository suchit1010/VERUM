#!/usr/bin/env node
/**
 * VERUM Debug Script - Check your wallet and token setup
 * 
 * Usage: npx ts-node debug-wallet.ts
 */

import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

const DEVNET = "https://api.devnet.solana.com";

// Token-2022 mints
const DUSD1_MINT = new PublicKey("F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD");
const DUSD2_MINT = new PublicKey("69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf");

const ASSETS = {
  XAU: DUSD1_MINT,  // Gold
  WTI: DUSD2_MINT,  // Oil
  BTC: DUSD1_MINT,  // Bitcoin
  XAG: DUSD1_MINT,  // Silver
  DXY: DUSD2_MINT,  // DXY Index
  RWA: DUSD1_MINT,  // RWA
};

async function debug() {
  try {
    console.log("🔍 VERUM Wallet Debug Script");
    console.log("============================\n");

    // Load wallet
    const fs = require("fs");
    const path = require("path");
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const keyPath = path.join(homeDir, ".config/solana/id.json");
    
    console.log("📁 Looking for wallet at:", keyPath);
    const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    const wallet = Keypair.fromSecretKey(Uint8Array.from(keyData));
    const walletPk = wallet.publicKey;

    console.log(`✓ Wallet loaded: ${walletPk.toBase58()}\n`);

    // Connect
    const connection = new Connection(DEVNET, "confirmed");
    const balance = await connection.getBalance(walletPk);
    console.log(`💰 SOL Balance: ${(balance / 1e9).toFixed(4)} SOL\n`);

    // Check token accounts
    console.log("📦 Checking Token Accounts...\n");

    for (const [asset, mint] of Object.entries(ASSETS)) {
      console.log(`${asset} (${mint.toBase58()})`);

      try {
        // Calculate ATA
        const ata = await getAssociatedTokenAddress(mint, walletPk, false, TOKEN_2022_PROGRAM_ID);
        console.log(`  ATA: ${ata.toBase58()}`);

        // Check if exists
        const accountInfo = await connection.getAccountInfo(ata);
        if (!accountInfo) {
          console.log(`  ✗ Account NOT created`);
        } else {
          console.log(`  ✓ Account exists`);

          // Get balance
          const response = await connection.getTokenAccountBalance(ata);
          const balance = response.value.uiAmount || 0;
          console.log(`  💵 Balance: ${balance}`);

          if (balance === 0) {
            console.log(`  ⚠️  No tokens! You need to mint some.`);
          }
        }
      } catch (e) {
        console.log(`  ✗ Error: ${e}`);
      }
      console.log();
    }

    // Summary
    console.log("\n📋 Summary:");
    console.log("===========");
    console.log("1. If you see '✗ Account NOT created', run:");
    console.log("   ```bash");
    console.log("   spl-token create-account F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD --url devnet");
    console.log("   spl-token create-account 69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf --url devnet");
    console.log("   ```");
    console.log("\n2. If you see '💵 Balance: 0', you need to mint tokens.");
    console.log("\n3. If everything shows ✓ and balance > 0, refresh the frontend:");
    console.log("   - Ctrl+Shift+Delete → Clear cache & reload");
    console.log("   - OR: npm run dev");
    console.log("\n4. Then try depositing again!");

  } catch (error) {
    console.error("❌ Debug failed:", error);
    process.exit(1);
  }
}

debug();
