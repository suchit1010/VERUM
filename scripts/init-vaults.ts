// scripts/init-vaults.ts
// Creates one SVS-1 vault per collateral asset.
// Run AFTER deploying SVS-1 from solanabr/solana-vault-standard.
// Usage: npx ts-node scripts/init-vaults.ts

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, clusterApiUrl, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
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

const SVS1_ID = publicKeyFromEnv("SVS1_PROGRAM_ID", "Bv8aVSQ3DJUe3B7TqQZRZgrNvVTh8TjfpwpoeR1ckDMC");

// Collateral mints (devnet test mints - using SSS Token-2022 mints)
const ASSETS = [
  { key: "XAU", mint: new PublicKey("F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD"), decimals: 6, vaultId: 0 },
  { key: "WTI", mint: new PublicKey("69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf"), decimals: 6, vaultId: 1 },
  { key: "BTC", mint: new PublicKey("F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD"), decimals: 6, vaultId: 2 },
  { key: "XAG", mint: new PublicKey("F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD"), decimals: 6, vaultId: 3 },
  { key: "DXY", mint: new PublicKey("69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf"), decimals: 6, vaultId: 4 },
  { key: "RWA", mint: new PublicKey("F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD"), decimals: 6, vaultId: 5 },
];

async function initVault(
  program: anchor.Program,
  wallet:  Keypair,
  asset:   { key: string; mint: PublicKey; decimals: number; vaultId: number },
) {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(asset.vaultId));

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), asset.mint.toBuffer(), idBuf],
    SVS1_ID
  );

  const [sharesMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("shares"), vault.toBuffer()],
    SVS1_ID
  );

  const assetVault = await getAssociatedTokenAddress(
    asset.mint,
    vault,
    true,  // allowOwnerOffCurve
    new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
  );

  console.log(`  Vault PDA: ${vault.toBase58()}`);
  console.log(`  Shares Mint: ${sharesMint.toBase58()}`);
  console.log(`  Asset Vault: ${assetVault.toBase58()}`);

  // SVS-1 initialize discriminator: sha256("global:initialize")[0..8]
  const DISC = Buffer.from([0xaf, 0xaf, 0x6d, 0x1f, 0x0d, 0x98, 0x9b, 0xed]);

  const vaultIdBN = new anchor.BN(asset.vaultId);

  try {
    const tx = await (program.methods as any)
      .initialize(
        vaultIdBN,
        `${asset.key} Vault`,  // name
        `v${asset.key}`,       // symbol
        ""                     // uri
      )
      .accounts({
        authority: wallet.publicKey,
        vault,
        assetMint: asset.mint,
        sharesMint,
        assetVault,
        assetTokenProgram: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
        token2022Program: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
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
      asset,
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
