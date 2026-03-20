#!/usr/bin/env node
/**
 * VERUM Mint Tokens Script
 * Mints dUSD1 and dUSD2 to your wallet
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createMintToInstruction,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

const DEVNET = "https://api.devnet.solana.com";

// Your wallet info
const PRIVATE_KEY_BASE58 =
  "32ERhSP2iN4nKTMBVirwiCADZEN5Jwm1A38f65QzcdP6RHDsCXZN9XzaY7o8AzsG2eQZJy4RPoF9z6tsADKxy3eR";
const WALLET = new PublicKey("3qWVExJqsN3y8f4C5EjGFKnMEx8Pwt4zG1swZ5PvY5n9");

// Token mints
const DUSD1_MINT = new PublicKey(
  "F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD"
);
const DUSD2_MINT = new PublicKey(
  "69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf"
);

// Mint authority (from SSS deployment)
const MINT_AUTHORITY = new PublicKey(
  "ARHBf3gyFRCCZDoe98qpsgFtaenKZLfG6kHp3C7A2oyD"
);

async function mintTokens() {
  try {
    console.log("🪙 VERUM Token Minting Script");
    console.log("=============================\n");

    // Import private key from base58
    const fs = require("fs");
    const path = require("path");

    // Create temp keypair file (for import)
    const keyData = JSON.parse(
      fs.readFileSync(path.join(process.env.HOME, ".config/solana/id.json"), "utf8")
    );
    const payer = Keypair.fromSecretKey(Uint8Array.from(keyData));

    console.log(`💰 Payer: ${payer.publicKey.toBase58()}`);
    console.log(`👤 Target Wallet: ${WALLET.toBase58()}`);
    console.log(`🌐 Network: ${DEVNET}\n`);

    const connection = new Connection(DEVNET, "confirmed");

    // Check payer balance
    const balance = await connection.getBalance(payer.publicKey);
    console.log(`💵 Payer Balance: ${(balance / 1e9).toFixed(4)} SOL`);

    if (balance < 0.1e9) {
      console.error("❌ Payer has insufficient SOL for transaction fees");
      process.exit(1);
    }

    console.log("\n📦 Creating Token Accounts for Target Wallet...\n");

    // Create ATAs for target wallet
    const ata1 = await getAssociatedTokenAddress(
      DUSD1_MINT,
      WALLET,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`✓ dUSD1 ATA: ${ata1.toBase58()}`);

    const ata2 = await getAssociatedTokenAddress(
      DUSD2_MINT,
      WALLET,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`✓ dUSD2 ATA: ${ata2.toBase58()}\n`);

    // Check if ATAs exist, create if not
    const ata1Info = await connection.getAccountInfo(ata1);
    const ata2Info = await connection.getAccountInfo(ata2);

    if (!ata1Info) {
      console.log("Creating dUSD1 account...");
      // Will be created in transaction if using mint-to with owner
    }
    if (!ata2Info) {
      console.log("Creating dUSD2 account...");
      // Will be created in transaction if using mint-to with owner
    }

    console.log("\n🪙 Minting Tokens...\n");

    // Build mint transaction
    const tx = new Transaction();

    // Mint 1000 dUSD1
    tx.add(
      createMintToInstruction(
        DUSD1_MINT,
        ata1,
        payer.publicKey,
        1000 * 1e6, // 1000 tokens with 6 decimals
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Mint 1000 dUSD2
    tx.add(
      createMintToInstruction(
        DUSD2_MINT,
        ata2,
        payer.publicKey,
        1000 * 1e6, // 1000 tokens with 6 decimals
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    console.log("Sending transaction...");
    const signature = await sendAndConfirmTransaction(connection, tx, [payer]);

    console.log(`✅ Transaction successful: ${signature}\n`);

    // Verify balances
    console.log("📊 Verifying Balances...\n");

    const balance1 = await connection.getTokenAccountBalance(ata1);
    console.log(
      `✓ dUSD1 Balance: ${balance1.value.uiAmount || 0} ${balance1.value.symbol || "tokens"}`
    );

    const balance2 = await connection.getTokenAccountBalance(ata2);
    console.log(
      `✓ dUSD2 Balance: ${balance2.value.uiAmount || 0} ${balance2.value.symbol || "tokens"}`
    );

    console.log("\n🎉 All done! Your wallet now has tokens.");
    console.log("\nNext steps:");
    console.log("1. Hard refresh the frontend (Ctrl+Shift+Delete)");
    console.log("2. Connect your wallet in Phantom");
    console.log("3. Try depositing!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

mintTokens();
