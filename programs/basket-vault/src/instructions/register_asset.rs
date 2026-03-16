use anchor_lang::prelude::*;

use crate::{
    errors::BasketVaultError,
    events::AssetRegistered,
    state::{AssetConfig, GlobalConfig, MAX_ASSETS, SEED_BASKET_CONFIG, TOTAL_WEIGHT_BPS},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RegisterAssetParams {
    pub mint: Pubkey,
    pub oracle_feed: Pubkey,
    pub decimals: u8,
    pub weight_bps: u16,
    pub min_cr_bps: u16,
    pub price_max_age_secs: Option<i64>,
}

#[derive(Accounts)]
pub struct RegisterAsset<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_BASKET_CONFIG, global_config.basket_mint.as_ref()],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn register_asset_handler(ctx: Context<RegisterAsset>, params: RegisterAssetParams) -> Result<()> {
    let cfg = &mut ctx.accounts.global_config;

    require_keys_eq!(ctx.accounts.authority.key(), cfg.authority, BasketVaultError::Unauthorized);
    require!((cfg.assets.len() + 1) <= MAX_ASSETS, BasketVaultError::TooManyAssets);
    require!(params.weight_bps > 0, BasketVaultError::InvalidAssetWeight);
    require!(params.min_cr_bps >= 10_000, BasketVaultError::InvalidAssetMinCr);
    require!(params.decimals <= 18, BasketVaultError::InvalidAssetDecimals);
    require!(
        !cfg.assets.iter().any(|asset| asset.mint == params.mint),
        BasketVaultError::DuplicateAsset
    );

    let price_max_age_secs = params
        .price_max_age_secs
        .unwrap_or(cfg.default_price_max_age_secs);
    require!(price_max_age_secs > 0, BasketVaultError::InvalidOraclePrice);

    let current_total = cfg.total_weight_bps()?;
    let next_total = current_total
        .checked_add(params.weight_bps)
        .ok_or_else(|| error!(BasketVaultError::MathOverflow))?;
    require!(next_total <= TOTAL_WEIGHT_BPS, BasketVaultError::InvalidWeightTotal);

    cfg.assets.push(AssetConfig {
        mint: params.mint,
        oracle_feed: params.oracle_feed,
        decimals: params.decimals,
        weight_bps: params.weight_bps,
        min_cr_bps: params.min_cr_bps,
        price_micro_usd: 0,
        price_updated_at: 0,
        price_max_age_secs,
        enabled: true,
    });

    emit!(AssetRegistered {
        mint: params.mint,
        oracle_feed: params.oracle_feed,
        weight_bps: params.weight_bps,
        min_cr_bps: params.min_cr_bps,
    });

    Ok(())
}
