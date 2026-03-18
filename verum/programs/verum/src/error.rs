use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Pyth price is stale (>60s)")]
    StaleOracle,
    #[msg("Oracle confidence too wide (>10% of price)")]
    OracleUnreliable,
    #[msg("Negative price from oracle")]
    NegativePrice,
    #[msg("Zero confidence interval")]
    ZeroConfidence,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Collateral below required ratio")]
    UnderCollateralized,
    #[msg("Asset count mismatch")]
    AssetCountMismatch,
    #[msg("Invalid Pyth feed ID")]
    InvalidFeedId,
    #[msg("Emergency Mode Active")]
    EmergencyModeActive,
    #[msg("Missing Oracle Accounts")]
    MissingOracleAccounts,
    #[msg("Invalid Oracle Account")]
    InvalidOracleAccount,
}
