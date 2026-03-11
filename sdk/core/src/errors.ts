export class SssError extends Error {
  constructor(
    message: string,
    public code: string,
    public logs?: string[]
  ) {
    super(message);
    this.name = "SssError";
  }
}

/**
 * Error codes matching the on-chain SssError enum
 */
export const ErrorCodes = {
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
} as const;

/**
 * Parse an Anchor program error into a typed SssError
 */
export function parseSssError(err: unknown): SssError {
  if (err instanceof SssError) return err;

  const error = err as any;
  const message = error?.message ?? String(err);
  const logs = error?.logs as string[] | undefined;

  // Try to match known error codes
  for (const [code, name] of Object.entries(ErrorCodes)) {
    if (message.includes(name) || message.includes(code)) {
      return new SssError(message, code, logs);
    }
  }

  return new SssError(message, "Unknown", logs);
}
