// app/src/utils/constants.ts
// ─────────────────────────────────────────────────────────────────────────────
// UPDATE THESE after deploying programs to devnet.
// Run: anchor deploy → copy program IDs here.
// ─────────────────────────────────────────────────────────────────────────────

import { PublicKey } from "@solana/web3.js";

// ── Program IDs ───────────────────────────────────────────────────────────────

export const BASKET_VAULT_PROGRAM_ID = new PublicKey(
  "BASKETvau1tXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
);

export const SSS_PROGRAM_ID = new PublicKey(
  "SSSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  // suchit1010 SSS program
);

export const SVS1_PROGRAM_ID = new PublicKey(
  "SVS1VauLt1111111111111111111111111111111111"     // solanabr SVS-1 program
);

// ── BASKET mint ───────────────────────────────────────────────────────────────
// Created by SSS. Copy from SSS deploy output.
export const BASKET_MINT = new PublicKey(
  "BASKETmint111111111111111111111111111111111"
);

// ── Pyth devnet PriceUpdateV2 accounts ───────────────────────────────────────
// These are the on-chain accounts Pyth pushes prices to.
// Find latest at: https://pyth.network/developers/price-feed-ids#solana-devnet
export const PYTH_ACCOUNTS = {
  XAU: new PublicKey("Eavb8FKNoYPbHnSS8kMi4tnb3ize9ySnmMHKKMHKKMHK"),
  WTI: new PublicKey("FNNkznizmC6A7t2sGJGEPM53u1wWfLsTHGqKQsGsBMFV"),
  BTC: new PublicKey("HovQMDrbAgAYPCmR4cN8VzQcajF5xqQRBe8EJsF3NPZZ"),
  XAG: new PublicKey("Bxnobf4NbUzS8R4VQ6BXRS4KSMnrp9M4BBQnMbnVRYx3"),
  DXY: new PublicKey("GcGkMqiKoGCDT5T4tFmJzFVCKCGXJFBrFn5bKmEMEqaS"),
  RWA: new PublicKey("GcGkMqiKoGCDT5T4tFmJzFVCKCGXJFBrFn5bKmEMEqaS"), // proxy for MVP
};

// ── Pyth feed ID hex strings (for on-chain validation) ───────────────────────
export const PYTH_FEED_IDS = {
  XAU: "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2",
  WTI: "a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
  BTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  XAG: "f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e",
  DXY: "a39b82aa35a53d7afbef02e1f5c57ebf6b0c1f957a0a35ec1f6e50c7d89d5af5",
};

// ── SVS-1 vault PDAs (one per collateral asset) ───────────────────────────────
// Derived as: ["vault", asset_mint, vault_id=0 LE u64]
// These are created by running: npx ts-node scripts/init-vaults.ts
// Copy the output addresses here after running that script.
export const SVS_VAULTS = {
  PAXG: new PublicKey("SVSvaultPAXG111111111111111111111111111111"),
  WBTC: new PublicKey("SVSvaultWBTC111111111111111111111111111111"),
  OIL:  new PublicKey("SVSvaultOIL1111111111111111111111111111111"),
  XAG:  new PublicKey("SVSvaultXAG1111111111111111111111111111111"),
  DXY:  new PublicKey("SVSvaultDXY1111111111111111111111111111111"),
  RWA:  new PublicKey("SVSvaultRWA1111111111111111111111111111111"),
};

// ── Collateral token mints (devnet) ───────────────────────────────────────────
// Use these mock mints on devnet. Replace with mainnet addresses for production.
export const ASSET_MINTS = {
  PAXG: new PublicKey("PAXGmint1111111111111111111111111111111111"),
  WBTC: new PublicKey("WBTCmint1111111111111111111111111111111111"),
  OIL:  new PublicKey("tOILmint1111111111111111111111111111111111"),
  XAG:  new PublicKey("XAGmint11111111111111111111111111111111111"),
  DXY:  new PublicKey("DXYmint111111111111111111111111111111111111"),
  RWA:  new PublicKey("RWAmint111111111111111111111111111111111111"),
};

// ── Registry order (must match GlobalConfig.asset_registry order) ─────────────
// [0]=XAU, [1]=WTI, [2]=BTC (vol proxy), [3]=XAG, [4]=DXY, [5]=RWA
export const REGISTRY_ORDER = ["XAU", "WTI", "BTC", "XAG", "DXY", "RWA"] as const;

// ── PDA seeds ─────────────────────────────────────────────────────────────────
export const SEEDS = {
  GLOBAL_CONFIG: Buffer.from("global_config"),
  VAULT_AUTH:    Buffer.from("basket_vault_authority"),
};

// ── Network ───────────────────────────────────────────────────────────────────
export const CLUSTER = "devnet" as const;
export const RPC_URL = "https://api.devnet.solana.com";
