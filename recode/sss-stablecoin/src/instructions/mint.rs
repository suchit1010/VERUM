use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, MintTo, mint_to};
use sss_common::seeds::*;

use crate::errors::SssError;
use crate::events::TokensMinted;
use crate::state::{StablecoinConfig, RoleConfig, MinterQuota, PauseState};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    /// The minter performing the mint
    #[account(mut)]
    pub minter: Signer<'info>,

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

    /// Minter quota PDA
    #[account(
        mut,
        seeds = [SEED_MINTER, mint.key().as_ref(), minter.key().as_ref()],
        bump = minter_quota.bump,
        constraint = minter_quota.active @ SssError::NotMinter,
    )]
    pub minter_quota: Account<'info, MinterQuota>,

    /// Pause state to check if operations are paused
    #[account(
        seeds = [SEED_PAUSE, mint.key().as_ref()],
        bump = pause_state.bump,
        constraint = !pause_state.paused @ SssError::Paused,
    )]
    pub pause_state: Account<'info, PauseState>,

    /// The stablecoin mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Recipient's token account
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Token-2022 program
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::InvalidAmount);

    // Check quota
    let minter_quota = &ctx.accounts.minter_quota;
    require!(minter_quota.can_mint(amount), SssError::QuotaExceeded);

    let clock = Clock::get()?;
    let mint_key = ctx.accounts.mint.key();

    // Mint tokens via CPI — config PDA is mint authority
    let config_bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_CONFIG,
        mint_key.as_ref(),
        &[config_bump],
    ]];

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Record mint against quota
    let minter_quota = &mut ctx.accounts.minter_quota;
    minter_quota.record_mint(amount)?;

    // Emit event
    emit!(TokensMinted {
        mint: mint_key,
        minter: ctx.accounts.minter.key(),
        recipient: ctx.accounts.recipient_token_account.key(),
        amount,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
