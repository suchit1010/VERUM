use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint, SetAuthority};
use anchor_spl::token::spl_token::instruction::AuthorityType;
use crate::state::*;

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct InitConfig {
    pub sss_program:          Pubkey,
    pub svs_program:          Pubkey,
    pub rebalance_authority:  Pubkey,
    pub emergency_authority:  Pubkey,
    pub asset_registry:       Vec<AssetConfig>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub deployer: Signer<'info>,

    /// BASKET SPL mint — deployer is current mint authority
    #[account(mut, mint::authority = deployer)]
    pub basket_mint: Account<'info, Mint>,

    #[account(
        init,
        payer  = deployer,
        space  = GlobalConfig::LEN,
        seeds  = [GLOBAL_CONFIG_SEED],
        bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// Vault authority PDA — will become BASKET mint authority
    /// CHECK: PDA, no data
    #[account(seeds = [VAULT_AUTH_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, cfg: InitConfig) -> Result<()> {
    let (_, bump) = Pubkey::find_program_address(
        &[VAULT_AUTH_SEED], ctx.program_id,
    );

    let c = &mut ctx.accounts.global_config;
    c.basket_mint               = ctx.accounts.basket_mint.key();
    c.sss_program               = cfg.sss_program;
    c.svs_program               = cfg.svs_program;
    c.rebalance_authority       = cfg.rebalance_authority;
    c.emergency_authority       = cfg.emergency_authority;
    c.vault_authority_bump      = bump;
    c.total_minted              = 0;
    c.insurance_fund_lamports   = 0;
    c.emergency_mode            = false;
    c.last_rebalance_timestamp  = 0;
    c.last_rebalance_request_id = [0u8; 32];
    c.asset_registry            = cfg.asset_registry;

    // Transfer BASKET mint authority → vault PDA
    token::set_authority(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                current_authority: ctx.accounts.deployer.to_account_info(),
                account_or_mint:   ctx.accounts.basket_mint.to_account_info(),
            },
        ),
        AuthorityType::MintTokens,
        Some(ctx.accounts.vault_authority.key()),
    )?;

    msg!("BasketVault initialized. Mint authority → {}", ctx.accounts.vault_authority.key());
    Ok(())
}
