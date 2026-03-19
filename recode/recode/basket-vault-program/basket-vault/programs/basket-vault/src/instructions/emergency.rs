// programs/basket-vault/src/instructions/emergency.rs
//
// Emergency mode: pauses all mints and deposits.
// Existing positions can still be redeemed (withdrawals stay open).

use anchor_lang::prelude::*;
use crate::state::{GlobalConfig, GLOBAL_CONFIG_SEED};
use crate::errors::VaultError;

#[derive(Accounts)]
pub struct SetEmergencyMode<'info> {
    pub emergency_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump,
        constraint = global_config.emergency_authority == emergency_authority.key()
            @ VaultError::UnauthorizedEmergency,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handler(ctx: Context<SetEmergencyMode>, active: bool) -> Result<()> {
    ctx.accounts.global_config.emergency_mode = active;

    emit!(EmergencyModeEvent {
        active,
        triggered_by: ctx.accounts.emergency_authority.key(),
        timestamp:    Clock::get()?.unix_timestamp,
    });

    msg!("Emergency mode: {}", if active { "ACTIVATED" } else { "DEACTIVATED" });
    Ok(())
}

#[event]
pub struct EmergencyModeEvent {
    pub active:       bool,
    pub triggered_by: Pubkey,
    pub timestamp:    i64,
}
