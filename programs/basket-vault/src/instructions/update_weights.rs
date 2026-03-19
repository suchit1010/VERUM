use anchor_lang::prelude::*;

use crate::{
    errors::BasketVaultError,
    events::BasketWeightsUpdated,
    state::{GlobalConfig, SEED_BASKET_CONFIG},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateWeightsParams {
    pub weights_bps: Vec<u16>,
}

#[derive(Accounts)]
pub struct UpdateWeights<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_BASKET_CONFIG, global_config.basket_mint.as_ref()],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn update_weights_handler(ctx: Context<UpdateWeights>, params: UpdateWeightsParams) -> Result<()> {
    let cfg = &mut ctx.accounts.global_config;
    let max_weight_step_bps = cfg.max_weight_step_bps;

    require_keys_eq!(ctx.accounts.authority.key(), cfg.authority, BasketVaultError::Unauthorized);
    require_eq!(params.weights_bps.len(), cfg.assets.len(), BasketVaultError::InvalidWeightsLen);

    let slot = Clock::get()?.slot;
    let next_allowed = cfg
        .last_rebalance_slot
        .checked_add(cfg.rebalance_cooldown_slots)
        .ok_or_else(|| error!(BasketVaultError::MathOverflow))?;

    require!(
        cfg.last_rebalance_slot == 0 || slot >= next_allowed,
        BasketVaultError::RebalanceCooldownActive
    );

    for (asset, next_weight) in cfg.assets.iter_mut().zip(params.weights_bps.iter()) {
        let diff = if asset.weight_bps >= *next_weight {
            asset.weight_bps - *next_weight
        } else {
            *next_weight - asset.weight_bps
        };

        require!(diff <= max_weight_step_bps, BasketVaultError::InvalidAssetWeight);
        asset.weight_bps = *next_weight;
    }

    cfg.assert_full_weight()?;
    cfg.last_rebalance_slot = slot;

    emit!(BasketWeightsUpdated {
        slot,
        assets: cfg.assets.len() as u16,
        total_weight_bps: cfg.total_weight_bps()?,
    });

    Ok(())
}
