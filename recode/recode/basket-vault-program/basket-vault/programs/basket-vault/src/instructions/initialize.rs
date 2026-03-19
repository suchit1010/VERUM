// programs/basket-vault/src/instructions/initialize.rs
//
// One-time setup:
//   1. Creates GlobalConfig PDA
//   2. Transfers BASKET mint authority from deployer to vault_authority PDA
//
// After this call, only BasketVault can mint BASKET tokens.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint, SetAuthority};
use anchor_spl::token::spl_token::instruction::AuthorityType;
use crate::state::{
    GlobalConfig, AssetConfig,
    GLOBAL_CONFIG_SEED, VAULT_AUTH_SEED,
};

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct InitConfig {
    pub rebalance_authority:  Pubkey,
    pub emergency_authority:  Pubkey,
    pub sss_program:          Pubkey,
    pub asset_registry:       Vec<AssetConfig>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Protocol deployer — pays for accounts, transfers mint authority
    #[account(mut)]
    pub deployer: Signer<'info>,

    /// The BASKET SPL mint — must be pre-created, deployer is current authority
    #[account(
        mut,
        mint::authority = deployer,
    )]
    pub basket_mint: Account<'info, Mint>,

    /// Global config PDA — created here
    #[account(
        init,
        payer  = deployer,
        space  = GlobalConfig::LEN,
        seeds  = [GLOBAL_CONFIG_SEED],
        bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// Vault authority PDA — will become the BASKET mint authority.
    /// No data — exists only as a signer identity.
    /// CHECK: derived from VAULT_AUTH_SEED, no data to validate
    #[account(
        seeds = [VAULT_AUTH_SEED],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, config_data: InitConfig) -> Result<()> {

    let (_, vault_bump) = anchor_lang::prelude::Pubkey::find_program_address(
        &[VAULT_AUTH_SEED],
        ctx.program_id,
    );

    let config = &mut ctx.accounts.global_config;
    config.basket_mint                = ctx.accounts.basket_mint.key();
    config.sss_program                = config_data.sss_program;
    config.rebalance_authority        = config_data.rebalance_authority;
    config.emergency_authority        = config_data.emergency_authority;
    config.vault_authority_bump       = vault_bump;
    config.total_minted               = 0;
    config.insurance_fund_lamports    = 0;
    config.emergency_mode             = false;
    config.last_rebalance_timestamp   = 0;
    config.last_rebalance_request_id  = [0u8; 32];
    config.asset_registry             = config_data.asset_registry;

    // Transfer BASKET mint authority from deployer → vault PDA.
    // After this, only the vault program can mint BASKET via CPI.
    let set_auth_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        SetAuthority {
            current_authority: ctx.accounts.deployer.to_account_info(),
            account_or_mint:   ctx.accounts.basket_mint.to_account_info(),
        },
    );

    token::set_authority(
        set_auth_ctx,
        AuthorityType::MintTokens,
        Some(ctx.accounts.vault_authority.key()),
    )?;

    msg!(
        "BasketVault initialized. Mint authority transferred to PDA: {}",
        ctx.accounts.vault_authority.key()
    );

    Ok(())
}
