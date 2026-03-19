use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface,
    FreezeAccount, ThawAccount, freeze_account, thaw_account};
use sss_common::seeds::*;

use crate::errors::SssError;
use crate::events::{AccountFrozen, AccountThawed};
use crate::state::{StablecoinConfig, RoleConfig};

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    /// Authority performing the freeze
    pub authority: Signer<'info>,

    /// Stablecoin config PDA (freeze authority)
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

    /// Stablecoin mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token account to freeze
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub target_account: InterfaceAccount<'info, TokenAccount>,

    /// Token-2022 program
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn freeze_handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    // Master authority or pauser can freeze
    let role_config = &ctx.accounts.role_config;
    require!(
        role_config.is_pauser(&ctx.accounts.authority.key()),
        SssError::NotPauser
    );

    let mint_key = ctx.accounts.mint.key();
    let config_bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_CONFIG,
        mint_key.as_ref(),
        &[config_bump],
    ]];

    freeze_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.target_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    let clock = Clock::get()?;
    emit!(AccountFrozen {
        mint: mint_key,
        account: ctx.accounts.target_account.key(),
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    /// Authority performing the thaw
    pub authority: Signer<'info>,

    /// Stablecoin config PDA (freeze authority)
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

    /// Stablecoin mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token account to thaw
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub target_account: InterfaceAccount<'info, TokenAccount>,

    /// Token-2022 program
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn thaw_handler(ctx: Context<ThawTokenAccount>) -> Result<()> {
    let role_config = &ctx.accounts.role_config;
    require!(
        role_config.is_pauser(&ctx.accounts.authority.key()),
        SssError::NotPauser
    );

    let mint_key = ctx.accounts.mint.key();
    let config_bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_CONFIG,
        mint_key.as_ref(),
        &[config_bump],
    ]];

    thaw_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccount {
                account: ctx.accounts.target_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    let clock = Clock::get()?;
    emit!(AccountThawed {
        mint: mint_key,
        account: ctx.accounts.target_account.key(),
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
