use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::errors::VaultError;
use crate::oracle::{adaptive_cr, calculate_basket_value, normalize_pyth_price};
use crate::sss_interface;
use crate::state::*;
use crate::svs_interface::read_total_assets;

pub const LIQUIDATION_THRESHOLD_BPS: u128 = 12_000; // 120%
pub const KEEPER_BONUS_BPS: u64 = 500; // 5%

#[derive(Accounts)]
pub struct LiquidatePosition<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    /// CHECK: target account owner for the liquidated position
    pub target_user: UncheckedAccount<'info>,

    #[account(mut, seeds = [GLOBAL_CONFIG_SEED], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [USER_POSITION_SEED, target_user.key().as_ref()],
        bump,
        constraint = target_position.owner == target_user.key() @ VaultError::PositionOwnerMismatch,
    )]
    pub target_position: Account<'info, UserPosition>,

    #[account(mut, address = global_config.basket_mint)]
    pub basket_mint: Account<'info, Mint>,

    #[account(mut, token::mint = basket_mint, token::authority = liquidator)]
    pub liquidator_basket_account: Account<'info, TokenAccount>,

    /// CHECK: PDA signer for SSS mint
    #[account(seeds = [VAULT_AUTH_SEED], bump = global_config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: SSS program
    #[account(address = global_config.sss_program)]
    pub sss_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,

    // remaining_accounts layout (in registry order, repeated 4 times):
    //   [0..N]    Pyth PriceUpdateV2 accounts
    //   [N..2N]   SVS-1 vault accounts
    //   [2N..3N]  target user's SVS shares token accounts
    //   [3N..4N]  SVS shares mint accounts
}

pub fn handler(ctx: Context<LiquidatePosition>, repay_amount: u64) -> Result<()> {
    require!(repay_amount > 0, VaultError::ZeroAmount);

    let clock = Clock::get()?;
    let registry = &ctx.accounts.global_config.asset_registry;
    let n = registry.len();

    require!(ctx.remaining_accounts.len() >= n * 4, VaultError::MissingOracleAccounts);
    require!(ctx.accounts.target_position.debt > 0, VaultError::NoOutstandingDebt);

    let debt_before = ctx.accounts.target_position.debt;

    let mut collateral_amounts: Vec<u64> = Vec::with_capacity(n);
    for i in 0..n {
        let vault_info = &ctx.remaining_accounts[n + i];
        let target_shares_info = &ctx.remaining_accounts[(2 * n) + i];
        let shares_mint_info = &ctx.remaining_accounts[(3 * n) + i];

        let total_assets = read_total_assets(vault_info)?;

        let target_shares = TokenAccount::try_from(target_shares_info)
            .map_err(|_| error!(VaultError::InvalidOracleAccount))?;
        require_keys_eq!(
            target_shares.owner,
            ctx.accounts.target_user.key(),
            VaultError::InvalidUserSharesOwner
        );

        let shares_mint = Mint::try_from(shares_mint_info)
            .map_err(|_| error!(VaultError::InvalidOracleAccount))?;
        let total_shares = shares_mint.supply.max(1);

        let target_assets = (total_assets as u128)
            .checked_mul(target_shares.amount as u128)
            .ok_or(error!(VaultError::MathOverflow))?
            .checked_div(total_shares as u128)
            .ok_or(error!(VaultError::MathOverflow))? as u64;

        collateral_amounts.push(target_assets);
    }

    let mut prices = Vec::with_capacity(n);
    for (i, asset) in registry.iter().enumerate() {
        let pyth_info = &ctx.remaining_accounts[i];
        let pyth_acct: Account<PriceUpdateV2> = Account::try_from(pyth_info)
            .map_err(|_| error!(VaultError::InvalidOracleAccount))?;
        let normalized = normalize_pyth_price(&pyth_acct, &asset.pyth_feed_id_hex, &clock)?;
        prices.push(normalized);
    }

    let (collateral_value, btc_conf_bps) = calculate_basket_value(&collateral_amounts, registry, &prices)?;
    let cr_before_bps = (collateral_value)
        .checked_mul(10_000)
        .ok_or(error!(VaultError::MathOverflow))?
        .checked_div(debt_before as u128)
        .ok_or(error!(VaultError::MathOverflow))?;

    require!(cr_before_bps < LIQUIDATION_THRESHOLD_BPS, VaultError::NotLiquidatable);

    let burn_amount = repay_amount.min(ctx.accounts.target_position.debt);

    sss_interface::cpi_burn(
        ctx.accounts.sss_program.to_account_info(),
        ctx.accounts.basket_mint.to_account_info(),
        ctx.accounts.liquidator_basket_account.to_account_info(),
        ctx.accounts.liquidator.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        burn_amount,
    )?;

    let requested_bonus = burn_amount
        .checked_mul(KEEPER_BONUS_BPS)
        .ok_or(error!(VaultError::MathOverflow))?
        .checked_div(10_000)
        .ok_or(error!(VaultError::MathOverflow))?;

    let insurance_before = ctx.accounts.global_config.insurance_fund_lamports;
    let keeper_bonus = requested_bonus.min(insurance_before);

    let debt_reduction = burn_amount
        .checked_add(keeper_bonus)
        .ok_or(error!(VaultError::MathOverflow))?;

    ctx.accounts.target_position.debt = ctx.accounts.target_position.debt.saturating_sub(debt_reduction);

    let bump = ctx.accounts.global_config.vault_authority_bump;
    let seeds: &[&[&[u8]]] = &[&[VAULT_AUTH_SEED, &[bump]]];

    if keeper_bonus > 0 {
        sss_interface::cpi_mint(
            ctx.accounts.sss_program.to_account_info(),
            ctx.accounts.basket_mint.to_account_info(),
            ctx.accounts.liquidator_basket_account.to_account_info(),
            ctx.accounts.vault_authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            seeds,
            keeper_bonus,
        )?;
    }

    let config = &mut ctx.accounts.global_config;
    config.total_minted = config.total_minted.saturating_sub(burn_amount).saturating_add(keeper_bonus);
    config.insurance_fund_lamports = config.insurance_fund_lamports.saturating_sub(keeper_bonus);

    let debt_after_pre_cover = ctx.accounts.target_position.debt as u128;
    let bad_debt = debt_after_pre_cover.saturating_sub(collateral_value);

    let insurance_cover = bad_debt.min(config.insurance_fund_lamports as u128) as u64;
    if insurance_cover > 0 {
        ctx.accounts.target_position.debt = ctx.accounts.target_position.debt.saturating_sub(insurance_cover);
        config.insurance_fund_lamports = config.insurance_fund_lamports.saturating_sub(insurance_cover);
    }

    let remaining_bad_debt = bad_debt.saturating_sub(insurance_cover as u128);
    if remaining_bad_debt > 0 {
        config.emergency_mode = true;
    }

    ctx.accounts.target_position.last_liquidation_ts = clock.unix_timestamp;

    let debt_after = ctx.accounts.target_position.debt;
    let cr_after_bps = if debt_after == 0 {
        0
    } else {
        collateral_value
            .checked_mul(10_000)
            .ok_or(error!(VaultError::MathOverflow))?
            .checked_div(debt_after as u128)
            .ok_or(error!(VaultError::MathOverflow))?
    };

    emit!(LiquidationEvent {
        liquidator: ctx.accounts.liquidator.key(),
        target_user: ctx.accounts.target_user.key(),
        debt_before,
        debt_after,
        burned_amount: burn_amount,
        keeper_bonus,
        insurance_cover,
        remaining_bad_debt,
        collateral_value,
        cr_before_bps,
        cr_after_bps,
        btc_conf_bps: btc_conf_bps as u16,
        emergency_mode: config.emergency_mode,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct LiquidationEvent {
    pub liquidator: Pubkey,
    pub target_user: Pubkey,
    pub debt_before: u64,
    pub debt_after: u64,
    pub burned_amount: u64,
    pub keeper_bonus: u64,
    pub insurance_cover: u64,
    pub remaining_bad_debt: u128,
    pub collateral_value: u128,
    pub cr_before_bps: u128,
    pub cr_after_bps: u128,
    pub btc_conf_bps: u16,
    pub emergency_mode: bool,
    pub timestamp: i64,
}
