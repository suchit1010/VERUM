use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    errors::BasketVaultError,
    events::MintAuthorizedAndExecuted,
    state::{pow10_u128, GlobalConfig, SEED_BASKET_CONFIG},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MintAgainstCollateralParams {
    pub desired_mint_amount: u64,
    pub collateral_amounts: Vec<u64>,
}

#[derive(Accounts)]
pub struct MintAgainstCollateral<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_BASKET_CONFIG, global_config.basket_mint.as_ref()],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub sss_program: Program<'info, sss_stablecoin::program::SssStablecoin>,

    /// CHECK: validated in SSS CPI + global config checks
    pub sss_config: UncheckedAccount<'info>,

    /// CHECK: validated in SSS CPI
    pub sss_role_config: UncheckedAccount<'info>,

    /// CHECK: validated in SSS CPI
    pub sss_minter_quota: UncheckedAccount<'info>,

    /// CHECK: validated in SSS CPI
    pub sss_pause_state: UncheckedAccount<'info>,

    #[account(mut)]
    pub basket_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = basket_mint,
        token::token_program = token_program,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn mint_against_collateral_handler(
    ctx: Context<MintAgainstCollateral>,
    params: MintAgainstCollateralParams,
) -> Result<()> {
    let cfg = &ctx.accounts.global_config;

    require_keys_eq!(ctx.accounts.authority.key(), cfg.authority, BasketVaultError::Unauthorized);
    require_keys_eq!(ctx.accounts.sss_program.key(), cfg.sss_program, BasketVaultError::InvalidSssProgram);
    require_keys_eq!(ctx.accounts.basket_mint.key(), cfg.basket_mint, BasketVaultError::InvalidBasketMint);
    require!(params.desired_mint_amount > 0, BasketVaultError::InvalidOraclePrice);
    require!(!cfg.minting_paused, BasketVaultError::MintingPaused);
    require!(params.desired_mint_amount <= cfg.max_mint_per_tx, BasketVaultError::MintAmountTooLarge);
    cfg.assert_full_weight()?;

    let now = Clock::get()?.unix_timestamp;
    let weighted_collateral_micro_usd = cfg.weighted_collateral_micro_usd(&params.collateral_amounts, now)?;

    let basket_scale = pow10_u128(ctx.accounts.basket_mint.decimals)
        .map_err(|_| error!(BasketVaultError::InvalidBasketDecimals))?;

    let mint_notional_micro_usd = (params.desired_mint_amount as u128)
        .checked_mul(1_000_000u128)
        .ok_or_else(|| error!(BasketVaultError::MathOverflow))?
        .checked_div(basket_scale)
        .ok_or_else(|| error!(BasketVaultError::MathOverflow))?;

    let effective_required_cr_bps = cfg.effective_required_cr_bps();
    let required_collateral_micro_usd = mint_notional_micro_usd
        .checked_mul(effective_required_cr_bps as u128)
        .ok_or_else(|| error!(BasketVaultError::MathOverflow))?
        .checked_div(10_000u128)
        .ok_or_else(|| error!(BasketVaultError::MathOverflow))?;

    require!(
        weighted_collateral_micro_usd >= required_collateral_micro_usd,
        BasketVaultError::UnderCollateralized
    );

    let cpi_accounts = sss_stablecoin::cpi::accounts::MintTokens {
        minter: ctx.accounts.global_config.to_account_info(),
        config: ctx.accounts.sss_config.to_account_info(),
        role_config: ctx.accounts.sss_role_config.to_account_info(),
        minter_quota: ctx.accounts.sss_minter_quota.to_account_info(),
        pause_state: ctx.accounts.sss_pause_state.to_account_info(),
        mint: ctx.accounts.basket_mint.to_account_info(),
        recipient_token_account: ctx.accounts.recipient_token_account.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
    };

    let basket_mint_key = ctx.accounts.basket_mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_BASKET_CONFIG,
        basket_mint_key.as_ref(),
        &[cfg.bump],
    ]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.sss_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    sss_stablecoin::cpi::mint_tokens(cpi_ctx, params.desired_mint_amount)?;

    emit!(MintAuthorizedAndExecuted {
        authority: ctx.accounts.authority.key(),
        recipient_token_account: ctx.accounts.recipient_token_account.key(),
        amount: params.desired_mint_amount,
        weighted_collateral_micro_usd,
        required_collateral_micro_usd,
        active_cr_bps: effective_required_cr_bps,
    });

    Ok(())
}
