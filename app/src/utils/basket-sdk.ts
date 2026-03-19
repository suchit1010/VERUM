// app/src/utils/basket-sdk.ts
// Full production Solana integration for VerumVault + SVS-1 + SSS

import {
  Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress, TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  VERUM_VAULT_PROGRAM_ID, SVS1_PROGRAM_ID, SSS_PROGRAM_ID,
  VERUM_MINT, PYTH_ACCOUNTS, SVS_VAULTS, ASSET_MINTS,
  REGISTRY_ORDER, SEEDS,
} from "./constants";

type RegistryAssetKey = keyof typeof ASSET_MINTS;

const ASSET_KEY_ALIASES: Record<string, RegistryAssetKey> = {
  XAU: "XAU",
  WTI: "WTI",
  BTC: "BTC",
  XAG: "XAG",
  DXY: "DXY",
  RWA: "RWA",
  PAXG: "XAU",
  OIL: "WTI",
  WBTC: "BTC",
  USDC: "DXY",
};

function toRegistryAssetKey(assetKey: string): RegistryAssetKey {
  return ASSET_KEY_ALIASES[assetKey.toUpperCase()] ?? "XAU";
}

// ── PDA helpers ───────────────────────────────────────────────────────────────

export function getGlobalConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.GLOBAL_CONFIG], VERUM_VAULT_PROGRAM_ID
  );
}

export function getVaultAuthorityPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.VAULT_AUTH], VERUM_VAULT_PROGRAM_ID
  );
}

export function getUserPositionPDA(user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.USER_POSITION, user.toBuffer()],
    VERUM_VAULT_PROGRAM_ID
  );
}

// SVS-1 PDAs
export function getSvsVaultPDA(assetMint: PublicKey, vaultId = 0): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(vaultId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), assetMint.toBuffer(), idBuf],
    SVS1_PROGRAM_ID
  );
}

export function getSvsSharesMintPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("shares"), vault.toBuffer()],
    SVS1_PROGRAM_ID
  );
}

export function getSvsVaultTokenPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_token"), vault.toBuffer()],
    SVS1_PROGRAM_ID
  );
}

export function getSvsTokenOwnerPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("token_account_owner_pda"), vault.toBuffer()],
    SVS1_PROGRAM_ID
  );
}

// ── Protocol state ────────────────────────────────────────────────────────────

export interface ProtocolState {
  totalMinted:     number;   // VERUM supply (6 dec → human)
  insuranceFund:   number;   // USD
  emergencyMode:   boolean;
  weights:         number[]; // bps per asset
  adaptiveCR:      number;   // 150 | 200 | 300
  btcConfBps:      number;
  lastRebalance:   Date | null;
}

export async function fetchProtocolState(
  program: Program,
): Promise<ProtocolState> {
  const [globalConfigPDA] = getGlobalConfigPDA();
  const config = await (program.account as any).globalConfig.fetch(globalConfigPDA);

  return {
    totalMinted:   config.totalMinted.toNumber() / 1e6,
    insuranceFund: config.insuranceFundLamports.toNumber() / 1e9,
    emergencyMode: config.emergencyMode,
    weights:       config.assetRegistry.map((a: any) => a.weightBps),
    adaptiveCR:    150,  // updated after price fetch
    btcConfBps:    0,
    lastRebalance: config.lastRebalanceTimestamp.toNumber() > 0
      ? new Date(config.lastRebalanceTimestamp.toNumber() * 1000)
      : null,
  };
}

// ── Deposit into SVS-1 vault (user calls SVS-1 directly) ─────────────────────
// VerumVault reads collateral from SVS-1 vaults.
// Users interact with SVS-1 directly to deposit/withdraw collateral.
// This helper builds the SVS-1 deposit transaction.

export async function buildSvsDepositTx(
  connection:  Connection,
  wallet:      PublicKey,
  assetKey:    string,
  amount:      number,   // human-readable (e.g. 1.5 PAXG)
  decimals:    number,
  minShares:   number = 0,
) {
  const resolvedKey  = toRegistryAssetKey(assetKey);
  const assetMint    = ASSET_MINTS[resolvedKey];
  const rawAmount    = new BN(Math.floor(amount * Math.pow(10, decimals)));
  const minSharesRaw = new BN(minShares);

  const [vault]         = getSvsVaultPDA(assetMint);
  const [sharesMint]    = getSvsSharesMintPDA(vault);
  const [vaultToken]    = getSvsVaultTokenPDA(vault);
  const [tokenOwner]    = getSvsTokenOwnerPDA(vault);

  const userAssets = await getAssociatedTokenAddress(assetMint, wallet);
  const userShares = await getAssociatedTokenAddress(sharesMint, wallet);

  // Check if user shares ATA exists; if not, prepend create instruction
  const sharesInfo = await connection.getAccountInfo(userShares);

  const preIxs = sharesInfo ? [] : [
    createAssociatedTokenAccountInstruction(
      wallet, userShares, wallet, sharesMint
    )
  ];

  // SVS-1 deposit discriminator: sha256("global:deposit")[0..8]
  const DISC = Buffer.from([0xf2, 0x23, 0xc6, 0x89, 0x52, 0xe1, 0xf2, 0xbd]);
  const data = Buffer.concat([
    DISC,
    rawAmount.toArrayLike(Buffer, "le", 8),
    minSharesRaw.toArrayLike(Buffer, "le", 8),
  ]);

  const { Transaction, TransactionInstruction } = await import("@solana/web3.js");

  const ix = new TransactionInstruction({
    programId: SVS1_PROGRAM_ID,
    keys: [
      { pubkey: vault,       isSigner: false, isWritable: true  },
      { pubkey: userAssets,  isSigner: false, isWritable: true  },
      { pubkey: vaultToken,  isSigner: false, isWritable: true  },
      { pubkey: userShares,  isSigner: false, isWritable: true  },
      { pubkey: sharesMint,  isSigner: false, isWritable: true  },
      { pubkey: tokenOwner,  isSigner: false, isWritable: false },
      { pubkey: wallet,      isSigner: true,  isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction();
  preIxs.forEach(i => tx.add(i));
  tx.add(ix);
  return tx;
}

// ── Mint VERUM ───────────────────────────────────────────────────────────────

export async function buildMintBasketTx(
  connection:    Connection,
  program:       Program,
  wallet:        PublicKey,
  desiredAmount: number,  // human-readable VERUM to mint
) {
  const [globalConfig]    = getGlobalConfigPDA();
  const [vaultAuthority]  = getVaultAuthorityPDA();
  const [userPosition]    = getUserPositionPDA(wallet);
  const desiredRaw        = new BN(Math.floor(desiredAmount * 1e6));

  const userVerumAta = await getAssociatedTokenAddress(VERUM_MINT, wallet);
  const basketAtaInfo = await connection.getAccountInfo(userVerumAta);
  const preIxs = basketAtaInfo ? [] : [
    createAssociatedTokenAccountInstruction(wallet, userVerumAta, wallet, VERUM_MINT)
  ];

  // remaining_accounts:
  // [0..N] Pyth accounts
  // [N..2N] SVS vault accounts
  // [2N..3N] user share token accounts
  // [3N..4N] shares mint accounts
  const pythAccounts = REGISTRY_ORDER.map(key => ({
    pubkey:     PYTH_ACCOUNTS[key as keyof typeof PYTH_ACCOUNTS],
    isWritable: false,
    isSigner:   false,
  }));

  const svsAccounts = REGISTRY_ORDER.map(key => ({
    pubkey:     SVS_VAULTS[key as keyof typeof SVS_VAULTS],
    isWritable: false,
    isSigner:   false,
  }));

  const userShareAccounts = [];
  const sharesMintAccounts = [];
  for (const key of REGISTRY_ORDER) {
    const svsVault = SVS_VAULTS[key as keyof typeof SVS_VAULTS];
    const [sharesMint] = getSvsSharesMintPDA(svsVault);
    const userShares = await getAssociatedTokenAddress(sharesMint, wallet);

    userShareAccounts.push({
      pubkey: userShares,
      isWritable: false,
      isSigner: false,
    });

    sharesMintAccounts.push({
      pubkey: sharesMint,
      isWritable: false,
      isSigner: false,
    });
  }

  const tx = await (program.methods as any)
    .mintBasket(desiredRaw)
    .accounts({
      user:              wallet,
      globalConfig,
      vaultAuthority,
      basketMint:        VERUM_MINT,
      userVerumAccount: userVerumAta,
      userPosition,
      sssProgram:        SSS_PROGRAM_ID,
      tokenProgram:      TOKEN_PROGRAM_ID,
      systemProgram:     SystemProgram.programId,
    })
    .remainingAccounts([...pythAccounts, ...svsAccounts, ...userShareAccounts, ...sharesMintAccounts])
    .transaction();

  const fullTx = new (await import("@solana/web3.js")).Transaction();
  preIxs.forEach(i => fullTx.add(i));
  fullTx.add(tx);
  return fullTx;
}

// ── Redeem VERUM ─────────────────────────────────────────────────────────────

export async function buildRedeemBasketTx(
  program:       Program,
  wallet:        PublicKey,
  basketAmount:  number,
) {
  const [globalConfig]   = getGlobalConfigPDA();
  const [vaultAuthority] = getVaultAuthorityPDA();
  const [userPosition]   = getUserPositionPDA(wallet);
  const amountRaw        = new BN(Math.floor(basketAmount * 1e6));
  const minAssetsZero    = REGISTRY_ORDER.map(() => new BN(0)); // no slippage guard for MVP

  const userVerumAta = await getAssociatedTokenAddress(VERUM_MINT, wallet);

  // Build remaining_accounts: 6 accounts × N assets
  const remainingAccounts = [];
  for (const key of REGISTRY_ORDER) {
    const assetMint  = ASSET_MINTS[key as keyof typeof ASSET_MINTS];
    const svsVault   = SVS_VAULTS[key as keyof typeof SVS_VAULTS];
    const [sharesMint]  = getSvsSharesMintPDA(svsVault);
    const [vaultToken]  = getSvsVaultTokenPDA(svsVault);
    const [tokenOwner]  = getSvsTokenOwnerPDA(svsVault);
    const userAssets    = await getAssociatedTokenAddress(assetMint, wallet);
    const userShares    = await getAssociatedTokenAddress(sharesMint, wallet);

    remainingAccounts.push(
      { pubkey: svsVault,   isWritable: true,  isSigner: false },
      { pubkey: userAssets, isWritable: true,  isSigner: false },
      { pubkey: vaultToken, isWritable: true,  isSigner: false },
      { pubkey: userShares, isWritable: true,  isSigner: false },
      { pubkey: sharesMint, isWritable: true,  isSigner: false },
      { pubkey: tokenOwner, isWritable: false, isSigner: false },
    );
  }

  return (program.methods as any)
    .redeemBasket(amountRaw, minAssetsZero)
    .accounts({
      user:              wallet,
      globalConfig,
      vaultAuthority,
      basketMint:        VERUM_MINT,
      userVerumAccount: userVerumAta,
      userPosition,
      sssProgram:        SSS_PROGRAM_ID,
      svsProgramAccount: SVS1_PROGRAM_ID,
      tokenProgram:      TOKEN_PROGRAM_ID,
      systemProgram:     SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .transaction();
}

// ── Collateral ratio helpers ──────────────────────────────────────────────────

export function getAdaptiveCR(btcConfBps: number): {
  cr: number; regime: string; cls: string
} {
  if (btcConfBps < 30)  return { cr: 150, regime: "Normal",   cls: ""         };
  if (btcConfBps < 200) return { cr: 200, regime: "Elevated", cls: "elevated" };
  return                       { cr: 300, regime: "Crisis",   cls: "crisis"   };
}

export function computeCR(collateralUsd: number, basketMinted: number): number {
  if (basketMinted === 0) return Infinity;
  return (collateralUsd / basketMinted) * 100;
}
