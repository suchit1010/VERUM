use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    // Oracle
    #[msg("Pyth price stale (>60s)")]             StaleOracle,
    #[msg("Oracle confidence >2% of price")]      OracleUnreliable,
    #[msg("Oracle returned negative price")]      NegativePrice,
    #[msg("Oracle returned zero confidence")]     ZeroConfidence,
    #[msg("Not enough valid oracle sources")]      InsufficientOracleSources,
    #[msg("Oracle spread >1.5% — manipulation?")] PriceSpreadTooWide,
    #[msg("Invalid Pyth feed ID")]                InvalidFeedId,
    #[msg("Cannot deserialize oracle account")]   InvalidOracleAccount,
    #[msg("Missing oracle remaining_accounts")]   MissingOracleAccounts,

    // Math
    #[msg("Arithmetic overflow")]                 MathOverflow,
    #[msg("Collateral below required CR")]        UnderCollateralized,
    #[msg("Asset count mismatch")]                AssetCountMismatch,

    // Deposit / withdraw
    #[msg("Amount must be > 0")]                  ZeroAmount,
    #[msg("Insufficient user balance")]           InsufficientBalance,
    #[msg("Slippage exceeded")]                   SlippageExceeded,

    // Protocol
    #[msg("Emergency mode active")]               EmergencyModeActive,
    #[msg("Unauthorized rebalance caller")]       UnauthorizedRebalance,
    #[msg("Unauthorized emergency caller")]       UnauthorizedEmergency,
    #[msg("Rebalance interval not elapsed (90d)")] RebalanceTooFrequent,
    #[msg("Weight proposal >24h old")]            StaleWeightProposal,
    #[msg("Weight count != registry length")]     WeightCountMismatch,
    #[msg("Weights don't sum to 10_000 bps")]     WeightsDontSumToFull,
    #[msg("Weight below 5% minimum")]             WeightBelowMinimum,
    #[msg("Weight above 35% maximum")]            WeightAboveMaximum,
    #[msg("Weight shift >5% per quarter")]        WeightShiftTooLarge,
    // Liquidation
    #[msg("Position not liquidatable (healthy CR)")]    PositionNotLiquidatable,
    #[msg("Insufficient collateral for liquidation")]   InsufficientCollateralForLiquidation,
    #[msg("No valid oracles found or all stale")]       NoValidOracles,
    #[msg("Liquidator is position owner")]              LiquidatorIsOwner,
    #[msg("Liquidation would exceed max per zone")]     LiquidationExceedsMaxPerZone,
    #[msg("Liquidation circuit breaker triggered")]     LiquidationCircuitBreakerTriggered,

    // CPI & account validation
    #[msg("CPI call failed")]                           CPIFailed,
    #[msg("Invalid account discriminator")]             InvalidDiscriminator,
    #[msg("SVS-1 vault account mismatch")]              SVSVaultMismatch,
    #[msg("SSS program account mismatch")]              SSSProgramMismatch,
}
