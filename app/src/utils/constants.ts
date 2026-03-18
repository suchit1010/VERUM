import { PublicKey } from "@solana/web3.js";

const env = (import.meta as any).env ?? {};

function publicKeyFromEnv(envName: string, fallback: string): PublicKey {
  const value = env[envName] || fallback;
  try {
    return new PublicKey(value);
  } catch {
    console.warn(`[constants] Invalid ${envName}, using fallback.`);
    return new PublicKey(fallback);
  }
}

export const BASKET_VAULT_PROGRAM_ID = publicKeyFromEnv(
  "VITE_BASKET_VAULT_PROGRAM_ID",
  "6G1N31NpMwodAgcF4hgMT9JPmzxELdeUGe66xEPssEht"
);

export const SSS_PROGRAM_ID = publicKeyFromEnv(
  "VITE_SSS_PROGRAM_ID",
  "So11111111111111111111111111111111111111112"
);

export const SVS1_PROGRAM_ID = publicKeyFromEnv(
  "VITE_SVS1_PROGRAM_ID",
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

export const BASKET_MINT = publicKeyFromEnv(
  "VITE_BASKET_MINT",
  "So11111111111111111111111111111111111111112"
);

export const PYTH_ACCOUNTS = {
  XAU: publicKeyFromEnv("VITE_PYTH_ACCOUNT_XAU", "Eavb8FKNoYPbHnSS8kMi4tnb3ize9ySnmMHKKMHKKMHK"),
  WTI: publicKeyFromEnv("VITE_PYTH_ACCOUNT_WTI", "FNNkznizmC6A7t2sGJGEPM53u1wWfLsTHGqKQsGsBMFV"),
  BTC: publicKeyFromEnv("VITE_PYTH_ACCOUNT_BTC", "HovQMDrbAgAYPCmR4cN8VzQcajF5xqQRBe8EJsF3NPZZ"),
  XAG: publicKeyFromEnv("VITE_PYTH_ACCOUNT_XAG", "Bxnobf4NbUzS8R4VQ6BXRS4KSMnrp9M4BBQnMbnVRYx3"),
  DXY: publicKeyFromEnv("VITE_PYTH_ACCOUNT_DXY", "GcGkMqiKoGCDT5T4tFmJzFVCKCGXJFBrFn5bKmEMEqaS"),
  RWA: publicKeyFromEnv("VITE_PYTH_ACCOUNT_RWA", "GcGkMqiKoGCDT5T4tFmJzFVCKCGXJFBrFn5bKmEMEqaS"),
} as const;

export const PYTH_FEED_IDS = {
  XAU: "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2",
  WTI: "a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
  BTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  XAG: "f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e",
  DXY: "a39b82aa35a53d7afbef02e1f5c57ebf6b0c1f957a0a35ec1f6e50c7d89d5af5",
  RWA: "a39b82aa35a53d7afbef02e1f5c57ebf6b0c1f957a0a35ec1f6e50c7d89d5af5",
} as const;

export const SVS_VAULTS = {
  XAU: publicKeyFromEnv("VITE_SVS_VAULT_XAU", "Eavb8FKNoYPbHnSS8kMi4tnb3ize9ySnmMHKKMHKKMHK"),
  WTI: publicKeyFromEnv("VITE_SVS_VAULT_WTI", "FNNkznizmC6A7t2sGJGEPM53u1wWfLsTHGqKQsGsBMFV"),
  BTC: publicKeyFromEnv("VITE_SVS_VAULT_BTC", "HovQMDrbAgAYPCmR4cN8VzQcajF5xqQRBe8EJsF3NPZZ"),
  XAG: publicKeyFromEnv("VITE_SVS_VAULT_XAG", "Bxnobf4NbUzS8R4VQ6BXRS4KSMnrp9M4BBQnMbnVRYx3"),
  DXY: publicKeyFromEnv("VITE_SVS_VAULT_DXY", "GcGkMqiKoGCDT5T4tFmJzFVCKCGXJFBrFn5bKmEMEqaS"),
  RWA: publicKeyFromEnv("VITE_SVS_VAULT_RWA", "GcGkMqiKoGCDT5T4tFmJzFVCKCGXJFBrFn5bKmEMEqaS"),
} as const;

export const ASSET_MINTS = {
  XAU: publicKeyFromEnv("VITE_ASSET_MINT_XAU", "So11111111111111111111111111111111111111112"),
  WTI: publicKeyFromEnv("VITE_ASSET_MINT_WTI", "Eavb8FKNoYPbHnSS8kMi4tnb3ize9ySnmMHKKMHKKMHK"),
  BTC: publicKeyFromEnv("VITE_ASSET_MINT_BTC", "HovQMDrbAgAYPCmR4cN8VzQcajF5xqQRBe8EJsF3NPZZ"),
  XAG: publicKeyFromEnv("VITE_ASSET_MINT_XAG", "Bxnobf4NbUzS8R4VQ6BXRS4KSMnrp9M4BBQnMbnVRYx3"),
  DXY: publicKeyFromEnv("VITE_ASSET_MINT_DXY", "GcGkMqiKoGCDT5T4tFmJzFVCKCGXJFBrFn5bKmEMEqaS"),
  RWA: publicKeyFromEnv("VITE_ASSET_MINT_RWA", "GcGkMqiKoGCDT5T4tFmJzFVCKCGXJFBrFn5bKmEMEqaS"),
} as const;

export const REGISTRY_ORDER = ["XAU", "WTI", "BTC", "XAG", "DXY", "RWA"] as const;

export const SEEDS = {
  GLOBAL_CONFIG: Buffer.from("global_config"),
  VAULT_AUTH: Buffer.from("basket_vault_authority"),
  USER_POSITION: Buffer.from("user_position"),
};

export const CLUSTER = "devnet" as const;
export const RPC_URL = "https://api.devnet.solana.com";
