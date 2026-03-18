// scripts/init-vaults.ts
// Creates one SVS-1 vault per collateral asset.
// Run AFTER deploying SVS-1 from solanabr/solana-vault-standard.
// Usage: npx ts-node scripts/init-vaults.ts

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, clusterApiUrl, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { readFileSync } from "fs";
import { homedir } from "os";
import path from "path";

const CLUSTER     = "devnet";
const WALLET_PATH = path.join(homedir(), ".config/solana/id.json");

function publicKeyFromEnv(name: string, fallback: string): PublicKey {
  const value = process.env[name] ?? fallback;
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid ${name} public key: ${value}`);
  }
}

const SVS1_ID = publicKeyFromEnv("SVS1_PROGRAM_ID", "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// Collateral mints (devnet test mints)
const ASSETS = [
  { key: "PAXG", mint: publicKeyFromEnv("ASSET_MINT_XAU", "Eavb8FKNoYPbHnSS8kMi4tnb3ize9ySnmMHKKMHKKMHK"), decimals: 8 },
  { key: "tOIL", mint: publicKeyFromEnv("ASSET_MINT_WTI", "FNNkznizmC6A7t2sGJGEPM53u1wWfLsTHGqKQsGsBMFV"), decimals: 6 },
  { key: "WBTC", mint: publicKeyFromEnv("ASSET_MINT_BTC", "HovQMDrbAgAYPCmR4cN8VzQcajF5xqQRBe8EJsF3NPZZ"), decimals: 8 },
  { key: "XAG", mint: publicKeyFromEnv("ASSET_MINT_XAG", "Bxnobf4NbUzS8R4VQ6BXRS4KSMnrp9M4BBQnMbnVRYx3"), decimals: 8 },
  { key: "DXY", mint: publicKeyFromEnv("ASSET_MINT_DXY", "GcGkMqiKoGCDT5T4tFmJzFVCKCGXJFBrFn5bKmEMEqaS"), decimals: 6 },
  { key: "RWA", mint: publicKeyFromEnv("ASSET_MINT_RWA", "GcGkMqiKoGCDT5T4tFmJzFVCKCGXJFBrFn5bKmEMEqaS"), decimals: 6 },
];

async function initVault(
  program:    anchor.Program,
  wallet:     Keypair,
  assetMint:  PublicKey,
  vaultId:    number = 0,
) {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(vaultId));

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), assetMint.toBuffer(), idBuf],
    SVS1_ID
  );

  const [sharesMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("shares"), vault.toBuffer()],
    SVS1_ID
  );

  const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_token"), vault.toBuffer()],
    SVS1_ID
  );

  const [tokenOwnerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_account_owner_pda"), vault.toBuffer()],
    SVS1_ID
  );

  console.log(`  Vault PDA: ${vault.toBase58()}`);

  // SVS-1 initialize discriminator: sha256("global:initialize")[0..8]
  const DISC = Buffer.from([0xaf, 0xaf, 0x6d, 0x1f, 0x0d, 0x98, 0x9b, 0xed]);

  const vaultIdBN = new anchor.BN(vaultId);

  try {
    const tx = await (program.methods as any)
      .initialize(vaultIdBN)
      .accounts({
        vault,
        sharesMint,
        vaultTokenAccount,
        tokenOwnerPda,
        assetMint,
        authority:     wallet.publicKey,
        payer:         wallet.publicKey,
        tokenProgram:  TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent:          SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log(`  ✓ TX: ${tx}`);
    return vault;
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("  ↩ Already initialized.");
      return vault;
    }
    throw e;
  }
}

async function main() {
  const conn      = new Connection(clusterApiUrl(CLUSTER), "confirmed");
  const walletKey = JSON.parse(readFileSync(WALLET_PATH, "utf8"));
  const wallet    = Keypair.fromSecretKey(Uint8Array.from(walletKey));

  // Load SVS-1 IDL
  // Copy from deps/svs/target/idl/svs_1.json after building SVS
  const svs1Idl = JSON.parse(readFileSync(
    path.join(__dirname, "../deps/svs/target/idl/svs_1.json"), "utf8"
  ));

  const provider = new anchor.AnchorProvider(conn,
    new anchor.Wallet(wallet), { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const idlWithAddress = { ...svs1Idl, address: SVS1_ID.toBase58() };
  const svs1Program = new anchor.Program(idlWithAddress as any, provider);
  const vaultAddresses: Record<string, string> = {};

  console.log("Initializing SVS-1 vaults...\n");

  for (const asset of ASSETS) {
    console.log(`${asset.key} (${asset.mint.toBase58().slice(0, 8)}...):`);
    const vault = await initVault(
      svs1Program,
      wallet,
      asset.mint,
      0,
    );
    vaultAddresses[asset.key] = vault.toBase58();
  }

  console.log("\n✓ All vaults initialized.");
  console.log("\nCopy these vault addresses into app/src/utils/constants.ts SVS_VAULTS:");
  console.log(JSON.stringify(vaultAddresses, null, 2));
}

main().catch(err => {
  console.error("init-vaults failed:", err);
  process.exit(1);
});
