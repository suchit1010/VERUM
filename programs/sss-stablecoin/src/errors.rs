use anchor_lang::prelude::*;

/// Custom error codes for the SSS program.
#[error_code]
pub enum SssError {
    // ─── Authorization ───────────────────────────────────────────
    #[msg("Unauthorized: caller does not have the required role")]
    Unauthorized,

    #[msg("Unauthorized: only master authority can perform this action")]
    NotMasterAuthority,

    #[msg("Unauthorized: caller is not an active minter")]
    NotMinter,

    #[msg("Unauthorized: caller is not a burner")]
    NotBurner,

    #[msg("Unauthorized: caller is not a pauser")]
    NotPauser,

    #[msg("Unauthorized: caller is not a blacklister")]
    NotBlacklister,

    #[msg("Unauthorized: caller is not a seizer")]
    NotSeizer,

    // ─── State ───────────────────────────────────────────────────
    #[msg("Token operations are currently paused")]
    Paused,

    #[msg("Token operations are not paused")]
    NotPaused,

    #[msg("Minter quota exceeded")]
    QuotaExceeded,

    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,

    #[msg("Address is not blacklisted")]
    NotBlacklisted,

    // ─── Feature Gating ──────────────────────────────────────────
    #[msg("Compliance features are not enabled on this stablecoin (SSS-1). Initialize with SSS-2 preset to use compliance features.")]
    ComplianceNotEnabled,

    #[msg("Transfer hook is not enabled on this stablecoin")]
    TransferHookNotEnabled,

    #[msg("Permanent delegate is not enabled on this stablecoin")]
    PermanentDelegateNotEnabled,

    // ─── Validation ──────────────────────────────────────────────
    #[msg("Invalid amount: must be greater than zero")]
    InvalidAmount,

    #[msg("Invalid name: must be 1-32 characters")]
    InvalidName,

    #[msg("Invalid symbol: must be 1-10 characters")]
    InvalidSymbol,

    #[msg("Invalid URI: must be 0-200 characters")]
    InvalidUri,

    #[msg("Invalid decimals: must be 0-18")]
    InvalidDecimals,

    #[msg("Invalid reason: must be 1-128 characters")]
    InvalidReason,

    #[msg("Arithmetic overflow")]
    Overflow,
}
