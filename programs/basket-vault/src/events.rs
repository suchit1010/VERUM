use anchor_lang::prelude::*;

#[event]
pub struct GlobalConfigInitialized {
    pub authority: Pubkey,
    pub basket_mint: Pubkey,
    pub sss_program: Pubkey,
    pub base_cr_bps: u16,
    pub crisis_cr_bps: u16,
    pub max_weight_step_bps: u16,
    pub default_price_max_age_secs: i64,
    pub max_oracle_confidence_bps: u16,
    pub max_mint_per_tx: u64,
    pub rebalance_cooldown_slots: u64,
}

#[event]
pub struct AssetRegistered {
    pub mint: Pubkey,
    pub oracle_feed: Pubkey,
    pub weight_bps: u16,
    pub min_cr_bps: u16,
}

#[event]
pub struct BasketWeightsUpdated {
    pub slot: u64,
    pub assets: u16,
    pub total_weight_bps: u16,
}

#[event]
pub struct CrisisModeChanged {
    pub enabled: bool,
    pub active_cr_bps: u16,
}

#[event]
pub struct AssetPriceUpdated {
    pub mint: Pubkey,
    pub oracle_feed: Pubkey,
    pub price_micro_usd: u64,
    pub updated_at: i64,
}

#[event]
pub struct AssetPriceUpdatedFromOracle {
    pub mint: Pubkey,
    pub oracle_feed: Pubkey,
    pub oracle_account: Pubkey,
    pub price_micro_usd: u64,
    pub confidence_micro_usd: u64,
    pub updated_at: i64,
}

#[event]
pub struct MintAuthorizedAndExecuted {
    pub authority: Pubkey,
    pub recipient_token_account: Pubkey,
    pub amount: u64,
    pub weighted_collateral_micro_usd: u128,
    pub required_collateral_micro_usd: u128,
    pub active_cr_bps: u16,
}

#[event]
pub struct MintingPauseChanged {
    pub paused: bool,
}
