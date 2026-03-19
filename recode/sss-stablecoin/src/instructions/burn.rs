use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, Burn, burn};
use sss_common::seeds::*;

use crate::errors::SssError;
use crate::events::TokensBurned;
use crate::state::{StablecoinConfig, RoleConfig, PauseState};

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    /// The burner performing the burn
    #[account(mut)]
    pub burner: Signer<'info>,

    /// Stablecoin config PDA
    #[account(
        seeds = [SEED_CONFIG, mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Role configuration
    #[account(
        seeds = [SEED_ROLES, mint.key().as_ref()],
        bump = role_config.bump,
    )]
    pub role_config: Account<'info, RoleConfig>,

    /// Pause state
    #[account(
        seeds = [SEED_PAUSE, mint.key().as_ref()],
        bump = pause_state.bump,
        constraint = !pause_state.paused @ SssError::Paused,
    )]
    pub pause_state: Account<'info, PauseState>,

    /// The stablecoin mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Burner's token account (burns from their own tokens)
    #[account(
        mut,
        token::mint = mint,
        token::authority = burner,
        token::token_program = token_program,
    )]
    pub burner_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Token-2022 program
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::InvalidAmount);

    // Verify burner role
    let role_config = &ctx.accounts.role_config;
    require!(
        role_config.is_burner(&ctx.accounts.burner.key()),
        SssError::NotBurner
    );

    let clock = Clock::get()?;

    // Burn tokens — burner burns from their own account
    burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.burner_token_account.to_account_info(),
                authority: ctx.accounts.burner.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(TokensBurned {
        mint: ctx.accounts.mint.key(),
        burner: ctx.accounts.burner.key(),
        amount,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
