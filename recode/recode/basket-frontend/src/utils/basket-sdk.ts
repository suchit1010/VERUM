// src/utils/basket-sdk.ts
//
// Production Solana integration layer.
// Swap the mock functions in index.html with these for mainnet.
//
// Install deps:
//   npm install @solana/web3.js @coral-xyz/anchor @pythnetwork/hermes-client
//   npm install @solana/wallet-adapter-react @solana/wallet-adapter-phantom

import {
  Connection, PublicKey, SystemProgram,
  SYSVAR_RENT_PUBKEY, Transaction, clusterApiUrl
} from '@solana/web3.js';
import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import { HermesClient } from '@pythnetwork/hermes-client';

// ─────────────────────────────────────────────────────────────────────────────
// Constants — update after deployment
// ─────────────────────────────────────────────────────────────────────────────

export const BASKET_VAULT_PROGRAM_ID = new PublicKey(
  'BASKETvau1tXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' // replace after anchor deploy
);

export const SSS_PROGRAM_ID = new PublicKey(
  'SSSSSSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' // replace with your SSS program ID
);

// Pyth devnet price feed accounts (PriceUpdateV2 accounts)
// Find at: https://pyth.network/developers/price-feed-ids#solana-devnet
export const PYTH_FEEDS = {
  XAU: new PublicKey('Eavb8FKNoYPbHnSS8kMi4tnb3ize9ySnmMHKKMHKKMHK'),  // devnet XAU/USD
  WTI: new PublicKey('FNNkznizmC6A7t2sGJGEPM53u1wWfLsTHGqKQsGsBMFV'),  // devnet WTI/USD
  BTC: new PublicKey('HovQMDrbAgAYPCmR4cN8VzQcajF5xqQRBe8EJsF3NPZZ'),  // devnet BTC/USD
  XAG: new PublicKey('Bxnobf4NbUzS8R4VQ6BXRS4KSMnrp9M4BBQnMbnVRYx3'),  // devnet XAG/USD
  DXY: new PublicKey('GcGkMqiKoGCDT5T4tFmJzFVCKCGXJFBrFn5bKmEMEqaS'),  // devnet DXY
};

// Seeds (must match state.rs exactly)
export const SEEDS = {
  GLOBAL_CONFIG:   Buffer.from('global_config'),
  VAULT_AUTHORITY: Buffer.from('basket_vault_authority'),
  COLLATERAL:      Buffer.from('collateral'),
  POSITION:        Buffer.from('position'),
};

// ─────────────────────────────────────────────────────────────────────────────
// PDA derivations
// ─────────────────────────────────────────────────────────────────────────────

export async function getGlobalConfigPDA(): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [SEEDS.GLOBAL_CONFIG],
    BASKET_VAULT_PROGRAM_ID
  );
}

export async function getVaultAuthorityPDA(): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [SEEDS.VAULT_AUTHORITY],
    BASKET_VAULT_PROGRAM_ID
  );
}

export async function getVaultCollateralConfigPDA(
  assetMint: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [SEEDS.COLLATERAL, assetMint.toBuffer()],
    BASKET_VAULT_PROGRAM_ID
  );
}

export async function getVaultTokenAccountPDA(
  assetMint: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [SEEDS.COLLATERAL, Buffer.from('token'), assetMint.toBuffer()],
    BASKET_VAULT_PROGRAM_ID
  );
}

export async function getUserPositionPDA(
  user: PublicKey,
  assetMint: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [SEEDS.POSITION, user.toBuffer(), assetMint.toBuffer()],
    BASKET_VAULT_PROGRAM_ID
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pyth price fetching (production)
// ─────────────────────────────────────────────────────────────────────────────

const hermesClient = new HermesClient('https://hermes.pyth.network');

export interface AssetPrice {
  price: number;
  conf: number;
  confBps: number;
  publishTime: number;
}

export async function fetchPythPrices(): Promise<Record<string, AssetPrice>> {
  const feedIds = [
    'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC
    '765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2', // XAU
    'a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b', // WTI
    'f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e', // XAG
    'a39b82aa35a53d7afbef02e1f5c57ebf6b0c1f957a0a35ec1f6e50c7d89d5af5', // DXY
  ];

  const priceUpdates = await hermesClient.getLatestPriceUpdates(feedIds);

  const result: Record<string, AssetPrice> = {};
  const names = ['BTC', 'XAU', 'WTI', 'XAG', 'DXY'];

  priceUpdates.parsed?.forEach((update, i) => {
    const price   = parseFloat(update.price.price) * Math.pow(10, update.price.expo);
    const conf    = parseFloat(update.price.conf)  * Math.pow(10, update.price.expo);
    const confBps = (conf / price) * 10000;

    result[names[i]] = {
      price,
      conf,
      confBps,
      publishTime: update.price.publish_time,
    };
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Protocol read — fetch global config + compute current CR
// ─────────────────────────────────────────────────────────────────────────────

export interface ProtocolState {
  totalMinted: number;
  insuranceFund: number;
  emergencyMode: boolean;
  weights: number[];           // bps, [gold, oil, btc, farm, dxy, rwa]
  lastRebalance: Date | null;
  currentCR: number;           // percentage
  btcConfBps: number;
  adaptiveCR: number;          // min required (150/200/300)
}

export async function fetchProtocolState(
  program: Program,
  connection: Connection
): Promise<ProtocolState> {
  const [globalConfigPDA] = await getGlobalConfigPDA();
  const config = await program.account.globalConfig.fetch(globalConfigPDA);

  const prices = await fetchPythPrices();
  const btcConfBps = prices['BTC']?.confBps ?? 0;

  const adaptiveCR = btcConfBps < 30 ? 150 : btcConfBps < 200 ? 200 : 300;

  return {
    totalMinted:   config.totalMinted.toNumber() / 1e6,
    insuranceFund: config.insuranceFundLamports.toNumber() / 1e9,
    emergencyMode: config.emergencyMode,
    weights:       config.assetRegistry.map((a: any) => a.weightBps),
    lastRebalance: config.lastRebalanceTimestamp.toNumber() > 0
      ? new Date(config.lastRebalanceTimestamp.toNumber() * 1000)
      : null,
    currentCR:  0, // computed from user positions below
    btcConfBps,
    adaptiveCR,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// depositCollateral — production call
// ─────────────────────────────────────────────────────────────────────────────

export async function depositCollateral(
  program: Program,
  wallet: PublicKey,
  assetMint: PublicKey,
  amount: number,    // human-readable (e.g. 1.5 PAXG)
  decimals: number   // asset decimals (e.g. 8 for PAXG)
): Promise<string> {

  const rawAmount = new BN(Math.floor(amount * Math.pow(10, decimals)));

  const userTokenAccount            = await getAssociatedTokenAddress(assetMint, wallet);
  const [vaultCollateralConfig]     = await getVaultCollateralConfigPDA(assetMint);
  const [vaultTokenAccount]         = await getVaultTokenAccountPDA(assetMint);
  const [userPosition]              = await getUserPositionPDA(wallet, assetMint);
  const [vaultAuthority]            = await getVaultAuthorityPDA();

  const txSig = await program.methods
    .depositCollateral(rawAmount)
    .accounts({
      user:                 wallet,
      assetMint,
      userTokenAccount,
      vaultTokenAccount,
      vaultCollateralConfig,
      userPosition,
      vaultAuthority,
      tokenProgram:         TOKEN_PROGRAM_ID,
      systemProgram:        SystemProgram.programId,
      rent:                 SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  return txSig;
}

// ─────────────────────────────────────────────────────────────────────────────
// mintBasket — production call
// ─────────────────────────────────────────────────────────────────────────────

export async function mintBasket(
  program: Program,
  wallet: PublicKey,
  basketMint: PublicKey,
  collateralAmounts: Record<string, number>, // { assetMint: rawAmount }
  desiredAmount: number,  // BASKET to mint (6 decimals)
  assetMints: PublicKey[]
): Promise<string> {

  const [globalConfig]    = await getGlobalConfigPDA();
  const [vaultAuthority]  = await getVaultAuthorityPDA();

  const userBasketAccount = await getAssociatedTokenAddress(basketMint, wallet);

  // Raw collateral amounts in registry order
  const amounts = assetMints.map(mint =>
    new BN(collateralAmounts[mint.toBase58()] || 0)
  );

  const desiredRaw = new BN(Math.floor(desiredAmount * 1e6));

  // Pyth price accounts in registry order — passed as remainingAccounts
  const pythAccounts = [
    PYTH_FEEDS.XAU, PYTH_FEEDS.WTI, PYTH_FEEDS.BTC,
    PYTH_FEEDS.XAG, PYTH_FEEDS.DXY, PYTH_FEEDS.DXY, // RWA uses DXY proxy for MVP
  ].map(pk => ({ pubkey: pk, isWritable: false, isSigner: false }));

  const txSig = await program.methods
    .mintBasket(amounts, desiredRaw)
    .accounts({
      user:             wallet,
      globalConfig,
      vaultAuthority,
      basketMint,
      userBasketAccount,
      sssProgram:       SSS_PROGRAM_ID,
      tokenProgram:     TOKEN_PROGRAM_ID,
    })
    .remainingAccounts(pythAccounts)
    .rpc();

  return txSig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collateral ratio calculation (client-side, for preview)
// ─────────────────────────────────────────────────────────────────────────────

export function computeBasketValue(
  collateralAmounts: number[], // normalized to 6 decimals each
  prices: number[],            // USD, 6 decimal
  weights: number[]            // bps
): number {
  let total = 0;
  for (let i = 0; i < collateralAmounts.length; i++) {
    const usdValue  = (collateralAmounts[i] * prices[i]) / 1e6;
    const weighted  = (usdValue * weights[i]) / 10000;
    total += weighted;
  }
  return total;
}

export function computeCR(basketValue: number, basketMinted: number): number {
  if (basketMinted === 0) return Infinity;
  return (basketValue / basketMinted) * 100;
}

export function getAdaptiveCR(btcConfBps: number): {
  cr: number; regime: string; cls: string
} {
  if (btcConfBps < 30)  return { cr: 150, regime: 'Normal',   cls: '' };
  if (btcConfBps < 200) return { cr: 200, regime: 'Elevated', cls: 'elevated' };
  return                       { cr: 300, regime: 'Crisis',   cls: 'crisis' };
}
