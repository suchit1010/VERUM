use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::VaultError;

#[derive(Accounts)]
pub struct SetEmergencyMode<'info> {
    pub emergency_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED], bump,
        constraint = global_config.emergency_authority == emergency_authority.key()
            @ VaultError::UnauthorizedEmergency,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handler(ctx: Context<SetEmergencyMode>, active: bool) -> Result<()> {
    ctx.accounts.global_config.emergency_mode = active;
    emit!(EmergencyEvent {
        active,
        by:        ctx.accounts.emergency_authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    msg!("Emergency mode: {}", if active { "ON" } else { "OFF" });
    Ok(())
}

#[event]
pub struct EmergencyEvent {
    pub active:    bool,
    pub by:        Pubkey,
    pub timestamp: i64,
}
