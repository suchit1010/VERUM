use anchor_lang::prelude::*;

use crate::{
    errors::BasketVaultError,
    events::AssetPriceUpdated,
    state::{GlobalConfig, SEED_BASKET_CONFIG},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateAssetPriceParams {
    pub asset_mint: Pubkey,
    pub price_micro_usd: u64,
}

#[derive(Accounts)]
pub struct UpdateAssetPrice<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_BASKET_CONFIG, global_config.basket_mint.as_ref()],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn update_asset_price_handler(ctx: Context<UpdateAssetPrice>, params: UpdateAssetPriceParams) -> Result<()> {
    let cfg = &mut ctx.accounts.global_config;
    require_keys_eq!(ctx.accounts.authority.key(), cfg.authority, BasketVaultError::Unauthorized);
    require!(cfg.emergency_mode, BasketVaultError::ManualPriceUpdateDisabled);
    require!(params.price_micro_usd > 0, BasketVaultError::InvalidOraclePrice);

    let now = Clock::get()?.unix_timestamp;

    let maybe_asset = cfg
        .assets
        .iter_mut()
        .find(|asset| asset.mint == params.asset_mint);

    let asset = match maybe_asset {
        Some(asset) => asset,
        None => return Err(error!(BasketVaultError::AssetNotFound)),
    };

    asset.price_micro_usd = params.price_micro_usd;
    asset.price_updated_at = now;

    emit!(AssetPriceUpdated {
        mint: asset.mint,
        oracle_feed: asset.oracle_feed,
        price_micro_usd: asset.price_micro_usd,
        updated_at: asset.price_updated_at,
    });

    Ok(())
}
