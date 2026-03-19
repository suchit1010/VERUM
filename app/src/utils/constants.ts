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

export const VERUM_VAULT_PROGRAM_ID = publicKeyFromEnv(
  "VITE_VERUM_VAULT_PROGRAM_ID",
  "BCjkqk3PNXuGVnWSpEgWU8m7ewEAQEb4REFPFgxdnHBP"
);

export const SSS_PROGRAM_ID = publicKeyFromEnv(
  "VITE_SSS_PROGRAM_ID",
  "HJ6TUXQ34XhDrmvcozMsBWhSuEVkEcYeqoTWo1Bcmzet"
);

export const SVS1_PROGRAM_ID = publicKeyFromEnv(
  "VITE_SVS1_PROGRAM_ID",
  "Bv8aVSQ3DJUe3B7TqQZRZgrNvVTh8TjfpwpoeR1ckDMC"
);

export const VERUM_MINT = publicKeyFromEnv(
  "VITE_VERUM_MINT",
  "B2mN75XtCtTAduTnQe1jTTH2NE9usavMVMPACZbf2s1q"
);

export const PYTH_ACCOUNTS = {
  XAU: publicKeyFromEnv("VITE_PYTH_ACCOUNT_XAU", "2rRQq8GhJZ2KKWYJ6oJoqj8iWYoM6yBbKz5gDLV5e6Gz"),
  WTI: publicKeyFromEnv("VITE_PYTH_ACCOUNT_WTI", "8k7F9XSUeMvjGjB5wkpBPiZv2LpRNHUAhuNdxTF5LNK"),
  BTC: publicKeyFromEnv("VITE_PYTH_ACCOUNT_BTC", "Gnt27xtC473ZT2Mw5u8wZ68Z3gULk5AJ5YRKG4sp6yEe"),
  XAG: publicKeyFromEnv("VITE_PYTH_ACCOUNT_XAG", "8k7F9XSUeMvjGjB5wkpBPiZv2LpRNHUAhuNdxTF5LNK"),
  DXY: publicKeyFromEnv("VITE_PYTH_ACCOUNT_DXY", "Gnt27xtC473ZT2Mw5u8wZ68Z3gULk5AJ5YRKG4sp6yEe"),
  RWA: publicKeyFromEnv("VITE_PYTH_ACCOUNT_RWA", "Gnt27xtC473ZT2Mw5u8wZ68Z3gULk5AJ5YRKG4sp6yEe"),
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
  XAU: publicKeyFromEnv("VITE_SVS_VAULT_XAU", "95dW3tPVbLjnovLfn4vGpV3cT5kAsWUVgeDysUFk7XNF"),
  WTI: publicKeyFromEnv("VITE_SVS_VAULT_WTI", "3chAdVCHpwHuCLoxRmd9HhAXFs77brCBRf77jof4tZPV"),
  BTC: publicKeyFromEnv("VITE_SVS_VAULT_BTC", "XzYWkSHjsrYF4rWRrPNqfVzrvL7nE1JV5MC2cyoE6Wn"),
  XAG: publicKeyFromEnv("VITE_SVS_VAULT_XAG", "EUFkne7JtJbaTePsxE8LxqsrqBeUghMKzhASgGgebwqb"),
  DXY: publicKeyFromEnv("VITE_SVS_VAULT_DXY", "6Ee3HwCfmeuxaJke3Hz1qy37qqb5Bq9hWdMhgK3EUSz2"),
  RWA: publicKeyFromEnv("VITE_SVS_VAULT_RWA", "eaPZdTbSQoy3SUusyJ4xVCrE7dZAS6swwZFvQApasNg"),
} as const;

export const ASSET_MINTS = {
  XAU: publicKeyFromEnv("VITE_ASSET_MINT_XAU", "F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD"),
  WTI: publicKeyFromEnv("VITE_ASSET_MINT_WTI", "69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf"),
  BTC: publicKeyFromEnv("VITE_ASSET_MINT_BTC", "A9kP3XyB4zQvT1m2RnF8cLYGjw5XvBqPZJ67K71gR8mN"),
  XAG: publicKeyFromEnv("VITE_ASSET_MINT_XAG", "F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD"),
  DXY: publicKeyFromEnv("VITE_ASSET_MINT_DXY", "69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf"),
  RWA: publicKeyFromEnv("VITE_ASSET_MINT_RWA", "A9kP3XyB4zQvT1m2RnF8cLYGjw5XvBqPZJ67K71gR8mN"),
} as const;

export const REGISTRY_ORDER = ["XAU", "WTI", "BTC", "XAG", "DXY", "RWA"] as const;

export const SEEDS = {
  GLOBAL_CONFIG: Buffer.from("global_config"),
  VAULT_AUTH: Buffer.from("basket_vault_authority"),
  USER_POSITION: Buffer.from("user_position"),
};

export const CLUSTER = "devnet" as const;
export const RPC_URL = "https://api.devnet.solana.com";
