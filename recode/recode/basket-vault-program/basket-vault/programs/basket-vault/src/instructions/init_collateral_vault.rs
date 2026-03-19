// programs/basket-vault/src/instructions/init_collateral_vault.rs
//
// Creates the vault's SPL token account for one collateral asset.
// Call once per accepted collateral type during protocol setup.

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::state::{
    VaultCollateralConfig,
    COLLATERAL_VAULT_SEED, VAULT_AUTH_SEED,
};

#[derive(Accounts)]
pub struct InitCollateralVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// The SPL mint to accept as collateral (e.g. PAXG)
    pub asset_mint: Account<'info, Mint>,

    /// Config PDA — stores vault token account address and running total
    #[account(
        init,
        payer  = admin,
        space  = VaultCollateralConfig::LEN,
        seeds  = [COLLATERAL_VAULT_SEED, asset_mint.key().as_ref()],
        bump,
    )]
    pub vault_collateral_config: Account<'info, VaultCollateralConfig>,

    /// The SPL token account that will hold this collateral.
    /// Owned by vault_authority PDA — only the program can transfer out.
    #[account(
        init,
        payer            = admin,
        token::mint      = asset_mint,
        token::authority = vault_authority,
        seeds            = [COLLATERAL_VAULT_SEED, b"token", asset_mint.key().as_ref()],
        bump,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: derived deterministically, no data to validate
    #[account(
        seeds = [VAULT_AUTH_SEED],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitCollateralVault>) -> Result<()> {
    let config = &mut ctx.accounts.vault_collateral_config;

    config.asset_mint          = ctx.accounts.asset_mint.key();
    config.vault_token_account = ctx.accounts.vault_token_account.key();
    config.total_deposited     = 0;
    config.bump                = ctx.bumps.vault_collateral_config;

    msg!(
        "Collateral vault initialized: mint={} token_account={}",
        ctx.accounts.asset_mint.key(),
        ctx.accounts.vault_token_account.key()
    );

    Ok(())
}
