import { InitializeParams } from "./types";

/**
 * SSS Presets — opinionated configurations for common stablecoin architectures.
 *
 * SSS-1 (Minimal): Mint + Freeze + Metadata. For simple stablecoins.
 * SSS-2 (Compliant): SSS-1 + Permanent Delegate + Transfer Hook + Blacklist. For regulated tokens.
 * SSS-3 (Confidential): SSS-1 + ConfidentialTransfer extension. For privacy-preserving stablecoins.
 */
export interface PresetConfig {
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enableConfidentialTransfer: boolean;
}

export interface CustomConfig {
  enablePermanentDelegate?: boolean;
  enableTransferHook?: boolean;
  defaultAccountFrozen?: boolean;
  enableConfidentialTransfer?: boolean;
}

export interface StablecoinCreateParams {
  /** Use a preset or provide custom config */
  preset?: "SSS_1" | "SSS_2" | "SSS_3";
  /** Custom extensions (overrides preset) */
  extensions?: CustomConfig;
  /** Token name */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Metadata URI */
  uri?: string;
  /** Decimal precision (default: 6) */
  decimals?: number;
}

export const Presets = {
  /**
   * SSS-1: Minimal Stablecoin
   * - Mint authority + freeze authority + metadata
   * - For internal tokens, DAO treasuries, ecosystem settlement
   * - Compliance is reactive (freeze accounts as needed)
   */
  SSS_1: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    enableConfidentialTransfer: false,
  } as PresetConfig,

  /**
   * SSS-2: Compliant Stablecoin
   * - SSS-1 + permanent delegate + transfer hook + blacklist enforcement
   * - For regulated stablecoins (USDC/USDT-class tokens)
   * - On-chain blacklist enforcement on every transfer
   * - Token seizure via permanent delegate
   */
  SSS_2: {
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
    enableConfidentialTransfer: false,
  } as PresetConfig,

  /**
   * SSS-3: Confidential Stablecoin
   * - SSS-1 + ConfidentialTransfer extension (ZK-proof-verified transfers)
   * - Balances and amounts are encrypted on-chain
   * - Auditor key support (optional, for compliance)
   * - POC: auto-approves all accounts for confidential transfers
   */
  SSS_3: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    enableConfidentialTransfer: true,
  } as PresetConfig,
} as const;

/**
 * Resolve create params to InitializeParams for the on-chain program
 */
export function resolveParams(params: StablecoinCreateParams): InitializeParams {
  let config: PresetConfig;

  if (params.extensions) {
    // Custom config
    config = {
      enablePermanentDelegate: params.extensions.enablePermanentDelegate ?? false,
      enableTransferHook: params.extensions.enableTransferHook ?? false,
      defaultAccountFrozen: params.extensions.defaultAccountFrozen ?? false,
      enableConfidentialTransfer: params.extensions.enableConfidentialTransfer ?? false,
    };
  } else if (params.preset === "SSS_2") {
    config = Presets.SSS_2;
  } else if (params.preset === "SSS_3") {
    config = Presets.SSS_3;
  } else {
    // Default to SSS-1
    config = Presets.SSS_1;
  }

  return {
    name: params.name,
    symbol: params.symbol,
    uri: params.uri ?? "",
    decimals: params.decimals ?? 6,
    ...config,
  };
}
