"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCodes = exports.SssError = void 0;
exports.parseSssError = parseSssError;
class SssError extends Error {
    constructor(message, code, logs) {
        super(message);
        this.code = code;
        this.logs = logs;
        this.name = "SssError";
    }
}
exports.SssError = SssError;
/**
 * Error codes matching the on-chain SssError enum
 */
exports.ErrorCodes = {
    Unauthorized: "Unauthorized",
    NotMasterAuthority: "NotMasterAuthority",
    NotMinter: "NotMinter",
    NotBurner: "NotBurner",
    NotPauser: "NotPauser",
    NotBlacklister: "NotBlacklister",
    NotSeizer: "NotSeizer",
    Paused: "Paused",
    NotPaused: "NotPaused",
    QuotaExceeded: "QuotaExceeded",
    AlreadyBlacklisted: "AlreadyBlacklisted",
    NotBlacklisted: "NotBlacklisted",
    ComplianceNotEnabled: "ComplianceNotEnabled",
    TransferHookNotEnabled: "TransferHookNotEnabled",
    PermanentDelegateNotEnabled: "PermanentDelegateNotEnabled",
    InvalidAmount: "InvalidAmount",
    InvalidName: "InvalidName",
    InvalidSymbol: "InvalidSymbol",
    InvalidUri: "InvalidUri",
    InvalidDecimals: "InvalidDecimals",
    InvalidReason: "InvalidReason",
    Overflow: "Overflow",
};
/**
 * Parse an Anchor program error into a typed SssError
 */
function parseSssError(err) {
    if (err instanceof SssError)
        return err;
    const error = err;
    const message = error?.message ?? String(err);
    const logs = error?.logs;
    // Try to match known error codes
    for (const [code, name] of Object.entries(exports.ErrorCodes)) {
        if (message.includes(name) || message.includes(code)) {
            return new SssError(message, code, logs);
        }
    }
    return new SssError(message, "Unknown", logs);
}
