use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint};
use crate::state::{GlobalConfig, vault_authority_pda, VAULT_AUTH_SEED, AssetConfig};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitConfig {
    pub target_weights: [u16; 6],
    pub asset_registry: Vec<AssetConfig>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub deployer: Signer<'info>,

    #[account(
        init,
        payer = deployer,
        space = 8 + std::mem::size_of::<GlobalConfig>() + 500, // adjust 500 for vector capacity
        seeds = [b"global_config"],
        bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub basket_mint: Account<'info, Mint>,

    /// CHECK: Target program to CPI to
    pub sss_program: UncheckedAccount<'info>,

    /// CHECK: Vault authority
    #[account(
        mut,
        seeds = [VAULT_AUTH_SEED],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, config_data: InitConfig) -> Result<()> {
    let (_, bump) = vault_authority_pda(&crate::ID);

    let config = &mut ctx.accounts.global_config;
    config.vault_authority_bump = bump;
    config.basket_mint          = ctx.accounts.basket_mint.key();
    config.sss_program          = ctx.accounts.sss_program.key();
    config.total_minted         = 0;
    config.target_weights       = config_data.target_weights;
    config.asset_registry       = config_data.asset_registry;
    config.emergency_mode       = false;

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token::SetAuthority {
            current_authority: ctx.accounts.deployer.to_account_info(),
            account_or_mint:   ctx.accounts.basket_mint.to_account_info(),
        },
    );

    anchor_spl::token::set_authority(
        cpi_ctx,
        anchor_spl::token::spl_token::instruction::AuthorityType::MintTokens,
        Some(ctx.accounts.vault_authority.key()),
    )?;

    msg!("Vault authority: {}", ctx.accounts.vault_authority.key());
    msg!("BASKET mint authority transferred to vault PDA");

    Ok(())
}
