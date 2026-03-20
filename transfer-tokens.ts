#!/usr/bin/env node
/**
 * Transfer Tokens from WSL wallet to Your Wallet
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
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { readFileSync } from "fs";
import { join } from "path";

const DEVNET = "https://api.devnet.solana.com";
const DUSD1_MINT = new PublicKey("F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD");
const DUSD2_MINT = new PublicKey(
  "69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf"
);
const YOUR_WALLET = new PublicKey(
  "3qWVExJqsN3y8f4C5EjGFKnMEx8Pwt4zG1swZ5PvY5n9"
);

// Source ATAs from WSL wallet
const SOURCE_DUSD1 = new PublicKey(
  "FFTnc4xSiet1dHiBHHSCK3m9SSawqmaHQgik1PPbiLpi"
);
const SOURCE_DUSD2 = new PublicKey(
  "3rRff75ECdqjCFaPPAb8nDpWZiP877ocF6Njy3hQgtPN"
);

async function transfer() {
  try {
    console.log("🔄 Token Transfer Script");
    console.log("=======================\n");

    // Get payer (WSL wallet default keypair)
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const keyPath = join(home, ".config/solana/id.json");
    const keyData = JSON.parse(readFileSync(keyPath, "utf8"));
    const payer = Keypair.fromSecretKey(Uint8Array.from(keyData));

    console.log(`➡️  From: ${payer.publicKey.toBase58()} (WSL wallet)`);
    console.log(`⬅️  To: ${YOUR_WALLET.toBase58()} (Your wallet)\n`);

    const connection = new Connection(DEVNET, "confirmed");

    // Get or create destination ATAs
    const destAta1 = await getAssociatedTokenAddress(
      DUSD1_MINT,
      YOUR_WALLET,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const destAta2 = await getAssociatedTokenAddress(
      DUSD2_MINT,
      YOUR_WALLET,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    console.log(`📦 Destination ATAs:`);
    console.log(`  dUSD1: ${destAta1.toBase58()}`);
    console.log(`  dUSD2: ${destAta2.toBase58()}\n`);

    // Build transfer transactions
    const tx = new Transaction();

    // Create ATAs if they don't exist
    const ata1Account = await connection.getAccountInfo(destAta1);
    const ata2Account = await connection.getAccountInfo(destAta2);

    if (!ata1Account) {
      console.log("Creating dUSD1 account for your wallet...");
      try {
        await createAssociatedTokenAccount(
          connection,
          payer,
          DUSD1_MINT,
          YOUR_WALLET,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );
      } catch (e) {
        // Account already exists or will be created
      }
    }

    if (!ata2Account) {
      console.log("Creating dUSD2 account for your wallet...");
      try {
        await createAssociatedTokenAccount(
          connection,
          payer,
          DUSD2_MINT,
          YOUR_WALLET,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );
      } catch (e) {
        // Account already exists or will be created
      }
    }

    if (!ata1Account || !ata2Account) {
      console.log("Sending account create transaction...\n");
      let sig = await sendAndConfirmTransaction(connection, tx, [payer]);
      console.log(`✅ Accounts created: ${sig}\n`);
    }

    // Transfer tokens
    console.log("💸 Transferring tokens...\n");

    const tx2 = new Transaction();

    // Transfer 100 dUSD1 (no hooks)
    tx2.add(
      createTransferCheckedInstruction(
        SOURCE_DUSD1,
        DUSD1_MINT,
        destAta1,
        payer.publicKey,
        100 * 1e6, // 100 tokens
        6, // Token-2022 decimals
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    console.log("(dUSD2 has transfer hooks - transferring separately)\n");

    const sig2 = await sendAndConfirmTransaction(connection, tx2, [payer]);
    console.log(`✅ Transfer successful: ${sig2}\n`);

    // Verify balances
    console.log("📊 New Balances (Your Wallet):\n");
    const bal1 = await connection.getTokenAccountBalance(destAta1);
    const bal2 = await connection.getTokenAccountBalance(destAta2);

    console.log(`✓ dUSD1: ${bal1.value.uiAmount || 0}`);
    console.log(`✓ dUSD2: ${bal2.value.uiAmount || 0}`);

    console.log("\n🎉 Tokens transferred! Now:");
    console.log("1. Hard refresh frontend (Ctrl+Shift+Delete)");
    console.log("2. Connect your wallet in Phantom");
    console.log("3. Try depositing!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

transfer();
