// programs/basket-vault/src/errors.rs

use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    // ── Oracle errors ────────────────────────────────────────────────────────
    #[msg("Pyth price is stale (>60s since publish)")]
    StaleOracle,

    #[msg("Oracle confidence interval too wide (>2% of price)")]
    OracleUnreliable,

    #[msg("Oracle returned negative or zero price")]
    NegativePrice,

    #[msg("Oracle returned zero confidence interval")]
    ZeroConfidence,

    #[msg("Not enough valid oracle sources (minimum: 1)")]
    InsufficientOracleSources,

    #[msg("Price spread between oracle sources too wide (>1.5%) — possible manipulation")]
    PriceSpreadTooWide,

    #[msg("Invalid Pyth feed ID hex string")]
    InvalidFeedId,

    #[msg("Could not deserialize oracle account")]
    InvalidOracleAccount,

    #[msg("Missing oracle accounts in remaining_accounts")]
    MissingOracleAccounts,

    // ── Collateral / math errors ─────────────────────────────────────────────
    #[msg("Arithmetic overflow")]
    MathOverflow,

    #[msg("Collateral value below required ratio")]
    UnderCollateralized,

    #[msg("Asset count in collateral_amounts does not match registry")]
    AssetCountMismatch,

    // ── Deposit / withdrawal errors ──────────────────────────────────────────
    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Insufficient token balance in user account")]
    InsufficientBalance,

    #[msg("Insufficient deposited amount to withdraw")]
    InsufficientDeposit,

    #[msg("Vault token account has insufficient balance")]
    InsufficientVaultBalance,

    #[msg("Position owner does not match signer")]
    PositionOwnerMismatch,

    #[msg("Position asset mint does not match provided mint")]
    PositionMintMismatch,

    // ── Protocol state errors ────────────────────────────────────────────────
    #[msg("Emergency mode is active — mints and new deposits are paused")]
    EmergencyModeActive,

    #[msg("Caller is not the authorized rebalance authority")]
    UnauthorizedRebalance,

    #[msg("Caller is not the authorized emergency authority")]
    UnauthorizedEmergency,

    #[msg("Rebalance called too soon — 90 day interval not elapsed")]
    RebalanceTooFrequent,

    #[msg("Weight proposal is stale (>24h since Chainlink Functions job ran)")]
    StaleWeightProposal,

    #[msg("Proposed weight count does not match asset registry length")]
    WeightCountMismatch,

    #[msg("Proposed weights do not sum to 10_000 bps (100%)")]
    WeightsDontSumToFull,

    #[msg("A proposed weight is below minimum (500 bps = 5%)")]
    WeightBelowMinimum,

    #[msg("A proposed weight exceeds maximum (3_500 bps = 35%)")]
    WeightAboveMaximum,

    #[msg("A proposed weight shift exceeds 500 bps (5%) per quarter")]
    WeightShiftTooLarge,

    // ── Liquidation errors ───────────────────────────────────────────────────
    #[msg("Position is not below liquidation threshold (120%)")]
    NotLiquidatable,

    #[msg("Insurance fund has insufficient balance to cover bad debt")]
    InsuranceFundDepleted,
}
