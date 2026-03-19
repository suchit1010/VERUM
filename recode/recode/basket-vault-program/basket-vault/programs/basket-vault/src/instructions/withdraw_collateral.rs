// programs/basket-vault/src/instructions/withdraw_collateral.rs
//
// User withdraws SPL collateral from the vault.
// Vault PDA signs the outbound SPL transfer (via signer_seeds).

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use crate::state::{
    UserPosition, VaultCollateralConfig,
    COLLATERAL_VAULT_SEED, POSITION_SEED, VAULT_AUTH_SEED,
};
use crate::errors::VaultError;

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub asset_mint: Account<'info, Mint>,

    /// Destination — user receives collateral back here
    #[account(
        mut,
        token::mint      = asset_mint,
        token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Source — vault token account (PDA-owned)
    #[account(
        mut,
        seeds            = [COLLATERAL_VAULT_SEED, b"token", asset_mint.key().as_ref()],
        bump,
        token::mint      = asset_mint,
        token::authority = vault_authority,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [COLLATERAL_VAULT_SEED, asset_mint.key().as_ref()],
        bump  = vault_collateral_config.bump,
    )]
    pub vault_collateral_config: Account<'info, VaultCollateralConfig>,

    #[account(
        mut,
        seeds  = [POSITION_SEED, user.key().as_ref(), asset_mint.key().as_ref()],
        bump   = user_position.bump,
        constraint = user_position.owner == user.key() @ VaultError::PositionOwnerMismatch,
    )]
    pub user_position: Account<'info, UserPosition>,

    /// CHECK: PDA validated by seeds — signs the outbound transfer
    #[account(
        seeds = [VAULT_AUTH_SEED],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<WithdrawCollateral>,
    amount: u64,
    vault_authority_bump: u8,
) -> Result<()> {

    require!(amount > 0, VaultError::ZeroAmount);
    require!(
        ctx.accounts.user_position.deposited_amount >= amount,
        VaultError::InsufficientDeposit
    );
    require!(
        ctx.accounts.vault_token_account.amount >= amount,
        VaultError::InsufficientVaultBalance
    );

    // PDA-signed transfer: vault → user
    // vault_authority has no private key — seeds prove its identity
    let signer_seeds: &[&[&[u8]]] = &[&[
        VAULT_AUTH_SEED,
        &[vault_authority_bump],
    ]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from:      ctx.accounts.vault_token_account.to_account_info(),
            to:        ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, amount)?;

    // Update state
    let clock    = Clock::get()?;
    let position = &mut ctx.accounts.user_position;

    position.deposited_amount = position.deposited_amount
        .checked_sub(amount)
        .ok_or(error!(VaultError::MathOverflow))?;
    position.last_updated_slot = clock.slot;

    let vault_config = &mut ctx.accounts.vault_collateral_config;
    vault_config.total_deposited = vault_config.total_deposited
        .checked_sub(amount)
        .ok_or(error!(VaultError::MathOverflow))?;

    emit!(WithdrawEvent {
        user:       ctx.accounts.user.key(),
        asset_mint: ctx.accounts.asset_mint.key(),
        amount,
        new_total:  position.deposited_amount,
        slot:       clock.slot,
    });

    Ok(())
}

#[event]
pub struct WithdrawEvent {
    pub user:       Pubkey,
    pub asset_mint: Pubkey,
    pub amount:     u64,
    pub new_total:  u64,
    pub slot:       u64,
}
