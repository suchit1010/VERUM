use anchor_lang::prelude::*;

#[error_code]
pub enum BasketVaultError {
    #[msg("Unauthorized authority")]
    Unauthorized,

    #[msg("Too many assets in registry")]
    TooManyAssets,

    #[msg("Asset already registered")]
    DuplicateAsset,

    #[msg("Asset weight must be greater than zero")]
    InvalidAssetWeight,

    #[msg("Asset minimum collateral ratio is invalid")]
    InvalidAssetMinCr,

    #[msg("Weight vector length does not match registered assets")]
    InvalidWeightsLen,

    #[msg("Total weight must equal 10_000 basis points")]
    InvalidWeightTotal,

    #[msg("Rebalance cooldown still active")]
    RebalanceCooldownActive,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Collateral amount vector length does not match asset registry")]
    InvalidCollateralVector,

    #[msg("Asset not found in registry")]
    AssetNotFound,

    #[msg("Invalid oracle price")]
    InvalidOraclePrice,

    #[msg("Oracle price is stale")]
    StaleOraclePrice,

    #[msg("Collateral is below required ratio")]
    UnderCollateralized,

    #[msg("Invalid basket mint decimals")]
    InvalidBasketDecimals,

    #[msg("Basket mint does not match global config")]
    InvalidBasketMint,

    #[msg("SSS program mismatch")]
    InvalidSssProgram,

    #[msg("Minting is currently paused")]
    MintingPaused,

    #[msg("Requested mint amount exceeds max per transaction")]
    MintAmountTooLarge,

    #[msg("Invalid asset decimals")]
    InvalidAssetDecimals,

    #[msg("Manual price updates are disabled unless emergency mode is enabled")]
    ManualPriceUpdateDisabled,

    #[msg("Oracle mint does not match registered asset mint")]
    OracleMintMismatch,

    #[msg("Oracle feed does not match registered feed")]
    OracleFeedMismatch,

    #[msg("Oracle token decimals mismatch")]
    OracleDecimalsMismatch,

    #[msg("Oracle confidence exceeds configured threshold")]
    OracleConfidenceTooWide,
}
