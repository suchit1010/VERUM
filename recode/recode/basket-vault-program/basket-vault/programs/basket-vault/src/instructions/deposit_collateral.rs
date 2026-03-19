// programs/basket-vault/src/instructions/deposit_collateral.rs
//
// User deposits SPL collateral tokens into the vault.
// Creates a UserPosition on first deposit (init_if_needed).
// No oracle interaction here — purely SPL token transfer + accounting.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use crate::state::{
    UserPosition, VaultCollateralConfig,
    COLLATERAL_VAULT_SEED, POSITION_SEED, VAULT_AUTH_SEED,
};
use crate::errors::VaultError;

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub asset_mint: Account<'info, Mint>,

    /// User's source token account for this asset
    #[account(
        mut,
        token::mint      = asset_mint,
        token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Vault token account — destination
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

    /// Created on first deposit via init_if_needed
    #[account(
        init_if_needed,
        payer  = user,
        space  = UserPosition::LEN,
        seeds  = [POSITION_SEED, user.key().as_ref(), asset_mint.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,

    /// CHECK: derived from VAULT_AUTH_SEED, validated by seeds
    #[account(
        seeds = [VAULT_AUTH_SEED],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {

    require!(amount > 0, VaultError::ZeroAmount);
    require!(
        ctx.accounts.user_token_account.amount >= amount,
        VaultError::InsufficientBalance
    );

    // SPL transfer: user → vault (user signs, no PDA needed for inbound)
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from:      ctx.accounts.user_token_account.to_account_info(),
            to:        ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // Update / initialize user position
    let clock    = Clock::get()?;
    let position = &mut ctx.accounts.user_position;

    if position.owner == Pubkey::default() {
        // First deposit — initialize the position
        position.owner      = ctx.accounts.user.key();
        position.asset_mint = ctx.accounts.asset_mint.key();
        position.bump       = ctx.bumps.user_position;
    }

    require!(position.owner == ctx.accounts.user.key(), VaultError::PositionOwnerMismatch);
    require!(position.asset_mint == ctx.accounts.asset_mint.key(), VaultError::PositionMintMismatch);

    position.deposited_amount = position.deposited_amount
        .checked_add(amount)
        .ok_or(error!(VaultError::MathOverflow))?;
    position.last_updated_slot = clock.slot;

    // Update vault-wide total
    let vault_config = &mut ctx.accounts.vault_collateral_config;
    vault_config.total_deposited = vault_config.total_deposited
        .checked_add(amount)
        .ok_or(error!(VaultError::MathOverflow))?;

    emit!(DepositEvent {
        user:        ctx.accounts.user.key(),
        asset_mint:  ctx.accounts.asset_mint.key(),
        amount,
        new_total:   position.deposited_amount,
        vault_total: vault_config.total_deposited,
        slot:        clock.slot,
    });

    msg!("Deposited {} | position: {} | vault: {}",
        amount, position.deposited_amount, vault_config.total_deposited);

    Ok(())
}

#[event]
pub struct DepositEvent {
    pub user:        Pubkey,
    pub asset_mint:  Pubkey,
    pub amount:      u64,
    pub new_total:   u64,
    pub vault_total: u64,
    pub slot:        u64,
}
