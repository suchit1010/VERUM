import { PublicKey } from "@solana/web3.js";

// ─── PDA Seeds (mirrors sss-common/src/seeds.rs) ─────────────────
export const SEEDS = {
  CONFIG: Buffer.from("config"),
  ROLES: Buffer.from("roles"),
  MINTER: Buffer.from("minter"),
  BLACKLIST: Buffer.from("blacklist"),
  PAUSE: Buffer.from("pause"),
  EXTRA_ACCOUNT_METAS: Buffer.from("extra-account-metas"),
} as const;

// ─── Program IDs ─────────────────────────────────────────────────
// Generated keypairs — update after devnet deployment
export const SSS_STABLECOIN_PROGRAM_ID = new PublicKey(
  "HJ6TUXQ34XhDrmvcozMsBWhSuEVkEcYeqoTWo1Bcmzet"
);
export const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "6x8XMLoA9FFmVJnaDou9tyKrh9CFynDY7TtKJ54p4dcN"
);

// ─── Account Types ───────────────────────────────────────────────

export interface StablecoinConfig {
  mint: PublicKey;
  authority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  bump: number;
  createdAt: number;
}

export interface RoleConfig {
  mint: PublicKey;
  masterAuthority: PublicKey;
  pauser: PublicKey;
  burner: PublicKey;
  blacklister: PublicKey;
  seizer: PublicKey;
  bump: number;
}

export interface MinterQuota {
  mint: PublicKey;
  minter: PublicKey;
  quota: bigint;
  minted: bigint;
  active: boolean;
  bump: number;
  createdAt: number;
}

export interface BlacklistEntry {
  mint: PublicKey;
  address: PublicKey;
  reason: string;
  blacklistedBy: PublicKey;
  blacklistedAt: number;
  bump: number;
}

export interface PauseState {
  mint: PublicKey;
  paused: boolean;
  lastChangedBy: PublicKey;
  lastChangedAt: number;
  bump: number;
}

// ─── Instruction Params ──────────────────────────────────────────

export interface InitializeParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

export enum RoleType {
  Pauser = "Pauser",
  Burner = "Burner",
  Blacklister = "Blacklister",
  Seizer = "Seizer",
}

export interface MintParams {
  recipient: PublicKey;
  amount: bigint;
  minter: PublicKey;
}

export interface SeizeParams {
  fromAccount: PublicKey;
  toAccount: PublicKey;
  amount: bigint;
}
