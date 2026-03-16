use anchor_lang::prelude::*;

use crate::{
    errors::BasketVaultError,
    events::AssetPriceUpdatedFromOracle,
    state::{GlobalConfig, SEED_BASKET_CONFIG},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateAssetPriceFromOracleParams {
    pub asset_mint: Pubkey,
}

#[derive(Accounts)]
pub struct UpdateAssetPriceFromOracle<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_BASKET_CONFIG, global_config.basket_mint.as_ref()],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// CHECK: explicit address check below for clarity and future migrations
    #[account(address = sss_oracle::ID)]
    pub oracle_program: UncheckedAccount<'info>,

    #[account(
        seeds = [b"oracle_cfg", oracle_config.stablecoin_mint.as_ref()],
        bump = oracle_config.bump,
        seeds::program = sss_oracle::ID,
    )]
    pub oracle_config: Account<'info, sss_oracle::state::OracleConfig>,
}

pub fn update_asset_price_from_oracle_handler(
    ctx: Context<UpdateAssetPriceFromOracle>,
    params: UpdateAssetPriceFromOracleParams,
) -> Result<()> {
    let cfg = &mut ctx.accounts.global_config;
    let oracle = &ctx.accounts.oracle_config;
    let max_oracle_confidence_bps = cfg.max_oracle_confidence_bps;

    require_keys_eq!(ctx.accounts.authority.key(), cfg.authority, BasketVaultError::Unauthorized);

    let asset = cfg
        .assets
        .iter_mut()
        .find(|asset| asset.mint == params.asset_mint)
        .ok_or_else(|| error!(BasketVaultError::AssetNotFound))?;

    require_keys_eq!(oracle.stablecoin_mint, asset.mint, BasketVaultError::OracleMintMismatch);
    require_keys_eq!(oracle.switchboard_feed, asset.oracle_feed, BasketVaultError::OracleFeedMismatch);
    require_eq!(oracle.token_decimals, asset.decimals, BasketVaultError::OracleDecimalsMismatch);
    require!(oracle.price_usd > 0, BasketVaultError::InvalidOraclePrice);

    let now = Clock::get()?.unix_timestamp;
    let age = now.saturating_sub(oracle.last_update);
    require!(age <= oracle.max_staleness, BasketVaultError::StaleOraclePrice);
    require!(age <= asset.price_max_age_secs, BasketVaultError::StaleOraclePrice);

    let confidence_bps = (oracle.confidence as u128)
        .checked_mul(10_000u128)
        .ok_or_else(|| error!(BasketVaultError::MathOverflow))?
        .checked_div(oracle.price_usd as u128)
        .ok_or_else(|| error!(BasketVaultError::MathOverflow))?;

    require!(
        confidence_bps <= max_oracle_confidence_bps as u128,
        BasketVaultError::OracleConfidenceTooWide
    );

    let price_micro_usd = oracle.price_usd as u64;
    asset.price_micro_usd = price_micro_usd;
    asset.price_updated_at = oracle.last_update;

    emit!(AssetPriceUpdatedFromOracle {
        mint: asset.mint,
        oracle_feed: asset.oracle_feed,
        oracle_account: oracle.key(),
        price_micro_usd,
        confidence_micro_usd: oracle.confidence,
        updated_at: oracle.last_update,
    });

    Ok(())
}
