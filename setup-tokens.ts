#!/usr/bin/env node

/**
 * VERUM Token Setup Script
 * Creates token accounts and mints test tokens for local testing
 * 
 * Usage: npx ts-node setup-tokens.ts
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createMintToInstruction,
  getAssociatedTokenAddress,
  createInitializeMintInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

const DEVNET = "https://api.devnet.solana.com";

// Token-2022 mints
const DUSD1_MINT = new PublicKey(
  "F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD"
);
const DUSD2_MINT = new PublicKey(
  "69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf"
);

const MINT_AMOUNT = 1000e6; // 1000 tokens with 6 decimals

async function setupTokens() {
  try {
    console.log("🚀 VERUM Token Setup Script");
    console.log("===========================\n");

    // Connect to devnet
    const connection = new Connection(DEVNET, "confirmed");

    // Get wallet from CLI default (id.json)
    let wallet: Keypair;
    try {
      const fs = require("fs");
      const path = require("path");
      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      const keyPath = path.join(homeDir, ".config/solana/id.json");
      const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
      wallet = Keypair.fromSecretKey(Uint8Array.from(keyData));
    } catch {
      console.error(
        "❌ Could not load Solana keypair from ~/.config/solana/id.json"
      );
      console.error("   Please ensure you have configured Solana CLI");
      process.exit(1);
    }

    const walletPk = wallet.publicKey;
    console.log(`📝 Wallet: ${walletPk.toBase58()}`);
    console.log(`🌐 Network: ${DEVNET}\n`);

    // Get balance
    const balance = await connection.getBalance(walletPk);
    console.log(`💰 SOL Balance: ${(balance / 1e9).toFixed(4)} SOL\n`);

    if (balance < 0.5e9) {
      console.warn(
        "⚠️  Warning: You have less than 0.5 SOL. You may not have enough for transactions."
      );
      console.warn("   Get devnet SOL: https://faucet.solana.com/\n");
    }

    // Step 1: Create token accounts for dUSD1
    console.log("📦 Creating Token Accounts...\n");
    console.log(`Token 1: ${DUSD1_MINT.toBase58()}`);

    let dusd1Ata: PublicKey;
    try {
      dusd1Ata = await getAssociatedTokenAddress(
        DUSD1_MINT,
        walletPk,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const dusd1Account = await connection.getTokenAccountsByOwner(
        walletPk,
        { mint: DUSD1_MINT }
      );

      if (dusd1Account.value.length === 0) {
        console.log("  ✓ Creating associated token account...");
        const createAtaTx = await createAssociatedTokenAccount(
          connection,
          wallet,
          DUSD1_MINT,
          walletPk,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );
        console.log(`  ✓ Created: ${dusd1Ata.toBase58()}\n`);
      } else {
        dusd1Ata = dusd1Account.value[0].pubkey;
        console.log(`  ✓ Already exists: ${dusd1Ata.toBase58()}\n`);
      }
    } catch (e) {
      console.error(`  ✗ Error creating dUSD1 ATA: ${e}`);
      throw e;
    }

    // Step 2: Create token accounts for dUSD2
    console.log(`Token 2: ${DUSD2_MINT.toBase58()}`);

    let dusd2Ata: PublicKey;
    try {
      dusd2Ata = await getAssociatedTokenAddress(
        DUSD2_MINT,
        walletPk,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const dusd2Account = await connection.getTokenAccountsByOwner(
        walletPk,
        { mint: DUSD2_MINT }
      );

      if (dusd2Account.value.length === 0) {
        console.log("  ✓ Creating associated token account...");
        const createAtaTx = await createAssociatedTokenAccount(
          connection,
          wallet,
          DUSD2_MINT,
          walletPk,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );
        console.log(`  ✓ Created: ${dusd2Ata.toBase58()}\n`);
      } else {
        dusd2Ata = dusd2Account.value[0].pubkey;
        console.log(`  ✓ Already exists: ${dusd2Ata.toBase58()}\n`);
      }
    } catch (e) {
      console.error(`  ✗ Error creating dUSD2 ATA: ${e}`);
      throw e;
    }

    // Step 3: Check mint authorities
    console.log("🔑 Checking Mint Authorities...\n");

    try {
      const dusd1Info = await connection.getParsedAccountInfo(DUSD1_MINT);
      const dusd1Data = dusd1Info.value?.data;
      console.log(`dUSD1 Mint: ${DUSD1_MINT.toBase58()}`);
      if (dusd1Data && 'parsed' in dusd1Data) {
        const parsed = dusd1Data.parsed;
        console.log(
          `  Mint Authority: ${parsed.info?.mintAuthority || 'None (!)'}` 
        );
        console.log(
          `  Freeze Authority: ${parsed.info?.freezeAuthority || 'None'}`
        );
      }

      const dusd2Info = await connection.getParsedAccountInfo(DUSD2_MINT);
      const dusd2Data = dusd2Info.value?.data;
      console.log(`\ndUSD2 Mint: ${DUSD2_MINT.toBase58()}`);
      if (dusd2Data && 'parsed' in dusd2Data) {
        const parsed = dusd2Data.parsed;
        console.log(
          `  Mint Authority: ${parsed.info?.mintAuthority || 'None (!)'}` 
        );
        console.log(
          `  Freeze Authority: ${parsed.info?.freezeAuthority || 'None'}`
        );
      }
    } catch (e) {
      console.warn(`  ⚠️ Could not check mint authorities: ${e}\n`);
    }

    console.log("\n💡 Next Steps:");
    console.log("1. If you have mint authority, run:");
    console.log(`   spl-token mint ${DUSD1_MINT.toBase58()} 1000 ${dusd1Ata.toBase58()} --url devnet`);
    console.log(`   spl-token mint ${DUSD2_MINT.toBase58()} 1000 ${dusd2Ata.toBase58()} --url devnet`);
    console.log("\n2. Check balance with:");
    console.log(`   spl-token balance ${DUSD1_MINT.toBase58()} --url devnet`);
    console.log(`   spl-token balance ${DUSD2_MINT.toBase58()} --url devnet`);
    console.log("\n3. Refresh frontend (Ctrl+Shift+R or npm run dev)");
    console.log("4. Try deposit again!");
  } catch (error) {
    console.error("❌ Setup failed:", error);
    process.exit(1);
  }
}

setupTokens();
