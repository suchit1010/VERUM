use anchor_lang::prelude::*;

use crate::{
    errors::BasketVaultError,
    events::CrisisModeChanged,
    state::{GlobalConfig, SEED_BASKET_CONFIG},
};

#[derive(Accounts)]
pub struct SetCrisisMode<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_BASKET_CONFIG, global_config.basket_mint.as_ref()],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn set_crisis_mode_handler(ctx: Context<SetCrisisMode>, enabled: bool) -> Result<()> {
    let cfg = &mut ctx.accounts.global_config;
    require_keys_eq!(ctx.accounts.authority.key(), cfg.authority, BasketVaultError::Unauthorized);

    cfg.emergency_mode = enabled;

    emit!(CrisisModeChanged {
        enabled,
        active_cr_bps: cfg.active_cr_bps(),
    });

    Ok(())
}
