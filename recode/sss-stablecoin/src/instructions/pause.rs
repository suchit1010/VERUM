use anchor_lang::prelude::*;
use sss_common::seeds::*;

use crate::errors::SssError;
use crate::events::PauseStatusChanged;
use crate::state::{RoleConfig, PauseState};

#[derive(Accounts)]
pub struct PauseOps<'info> {
    /// Authority performing the pause
    pub authority: Signer<'info>,

    /// Role configuration
    #[account(
        seeds = [SEED_ROLES, pause_state.mint.as_ref()],
        bump = role_config.bump,
    )]
    pub role_config: Account<'info, RoleConfig>,

    /// Pause state PDA
    #[account(
        mut,
        seeds = [SEED_PAUSE, pause_state.mint.as_ref()],
        bump = pause_state.bump,
        constraint = !pause_state.paused @ SssError::Paused,
    )]
    pub pause_state: Account<'info, PauseState>,
}

pub fn pause_handler(ctx: Context<PauseOps>) -> Result<()> {
    let role_config = &ctx.accounts.role_config;
    require!(
        role_config.is_pauser(&ctx.accounts.authority.key()),
        SssError::NotPauser
    );

    let clock = Clock::get()?;
    let pause_state = &mut ctx.accounts.pause_state;
    pause_state.paused = true;
    pause_state.last_changed_by = ctx.accounts.authority.key();
    pause_state.last_changed_at = clock.unix_timestamp;

    emit!(PauseStatusChanged {
        mint: pause_state.mint,
        paused: true,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UnpauseOps<'info> {
    /// Authority performing the unpause
    pub authority: Signer<'info>,

    /// Role configuration
    #[account(
        seeds = [SEED_ROLES, pause_state.mint.as_ref()],
        bump = role_config.bump,
    )]
    pub role_config: Account<'info, RoleConfig>,

    /// Pause state PDA
    #[account(
        mut,
        seeds = [SEED_PAUSE, pause_state.mint.as_ref()],
        bump = pause_state.bump,
        constraint = pause_state.paused @ SssError::NotPaused,
    )]
    pub pause_state: Account<'info, PauseState>,
}

pub fn unpause_handler(ctx: Context<UnpauseOps>) -> Result<()> {
    let role_config = &ctx.accounts.role_config;
    require!(
        role_config.is_pauser(&ctx.accounts.authority.key()),
        SssError::NotPauser
    );

    let clock = Clock::get()?;
    let pause_state = &mut ctx.accounts.pause_state;
    pause_state.paused = false;
    pause_state.last_changed_by = ctx.accounts.authority.key();
    pause_state.last_changed_at = clock.unix_timestamp;

    emit!(PauseStatusChanged {
        mint: pause_state.mint,
        paused: false,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
