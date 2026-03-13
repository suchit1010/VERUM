"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Presets = void 0;
exports.resolveParams = resolveParams;
exports.Presets = {
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
    },
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
    },
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
    },
};
/**
 * Resolve create params to InitializeParams for the on-chain program
 */
function resolveParams(params) {
    let config;
    if (params.extensions) {
        // Custom config
        config = {
            enablePermanentDelegate: params.extensions.enablePermanentDelegate ?? false,
            enableTransferHook: params.extensions.enableTransferHook ?? false,
            defaultAccountFrozen: params.extensions.defaultAccountFrozen ?? false,
            enableConfidentialTransfer: params.extensions.enableConfidentialTransfer ?? false,
        };
    }
    else if (params.preset === "SSS_2") {
        config = exports.Presets.SSS_2;
    }
    else if (params.preset === "SSS_3") {
        config = exports.Presets.SSS_3;
    }
    else {
        // Default to SSS-1
        config = exports.Presets.SSS_1;
    }
    return {
        name: params.name,
        symbol: params.symbol,
        uri: params.uri ?? "",
        decimals: params.decimals ?? 6,
        ...config,
    };
}
