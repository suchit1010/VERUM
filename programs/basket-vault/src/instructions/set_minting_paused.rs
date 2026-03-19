use anchor_lang::prelude::*;

use crate::{
    errors::BasketVaultError,
    events::MintingPauseChanged,
    state::{GlobalConfig, SEED_BASKET_CONFIG},
};

#[derive(Accounts)]
pub struct SetMintingPaused<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_BASKET_CONFIG, global_config.basket_mint.as_ref()],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn set_minting_paused_handler(ctx: Context<SetMintingPaused>, paused: bool) -> Result<()> {
    let cfg = &mut ctx.accounts.global_config;
    require_keys_eq!(ctx.accounts.authority.key(), cfg.authority, BasketVaultError::Unauthorized);

    cfg.minting_paused = paused;

    emit!(MintingPauseChanged { paused });
    Ok(())
}
