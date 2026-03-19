// mint_basket.rs
//
// Core protocol flow:
//   1. User has already deposited collateral into SVS-1 vaults
//   2. We read total_assets from each SVS-1 vault (no CPI needed — direct read)
//   3. Fetch Pyth prices (via remaining_accounts)
//   4. Compute weighted basket value + adaptive CR
//   5. Check basket_value >= desired × CR
//   6. Charge 0.1% insurance fee
//   7. CPI to SSS mint_tokens

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::state::*;
use crate::oracle::*;
use crate::sss_interface;
use crate::svs_interface::read_total_assets;
use crate::errors::VaultError;
use std::cmp::min;

pub const INSURANCE_FEE_BPS: u64 = 10; // 0.1%

#[derive(Accounts)]
pub struct MintBasket<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_CONFIG_SEED], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    /// CHECK: PDA — signs SSS CPI
    #[account(seeds = [VAULT_AUTH_SEED], bump = global_config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut, address = global_config.basket_mint)]
    pub basket_mint: Account<'info, Mint>,

    #[account(mut, token::mint = basket_mint, token::authority = user)]
    pub user_basket_account: Account<'info, TokenAccount>,

    /// User's CDP position tracking (debt + collateral ratio)
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 8 + 8 + 8 + 1,
        seeds = [b"position", user.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    /// CHECK: SSS program
    #[account(address = global_config.sss_program)]
    pub sss_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,

    // remaining_accounts layout (in registry order, repeated twice):
    //   [0..N]    Pyth PriceUpdateV2 accounts  (one per asset)
    //   [N..2N]   SVS-1 vault accounts          (one per asset)
}

pub fn handler(
    ctx: Context<MintBasket>,
    desired_amount: u64,
) -> Result<()> {
    require!(!ctx.accounts.global_config.emergency_mode, VaultError::EmergencyModeActive);
    require!(desired_amount > 0, VaultError::ZeroAmount);

    let clock    = Clock::get()?;
    let config   = &ctx.accounts.global_config;
    let registry = &config.asset_registry;
    let n        = registry.len();

    require!(ctx.remaining_accounts.len() >= n * 2, VaultError::MissingOracleAccounts);

    // ── 1. Read SVS-1 vault balances (direct account read) ────────────────
    let mut collateral_amounts: Vec<u64> = Vec::with_capacity(n);
    for i in 0..n {
        let vault_info = &ctx.remaining_accounts[n + i];
        let total = read_total_assets(vault_info)?;
        collateral_amounts.push(total);
    }

    // ── 2. Fetch Pyth prices ───────────────────────────────────────────────
    let mut prices: Vec<NormalizedPrice> = Vec::with_capacity(n);
    for (i, asset) in registry.iter().enumerate() {
        let pyth_info = &ctx.remaining_accounts[i];
        let p = normalize_pyth_price(pyth_info, &asset.pyth_feed_id_hex, &clock)?;
        prices.push(p);
    }

    // ── 3. Basket value + adaptive CR ─────────────────────────────────────
    let (basket_value, btc_conf_bps) =
        calculate_basket_value(&collateral_amounts, registry, &prices)?;

    let cr = adaptive_cr(btc_conf_bps);

    msg!("basket_value={} btc_conf_bps={} cr={}", basket_value, btc_conf_bps, cr);

    // ── 4. CR gate ─────────────────────────────────────────────────────────
    check_mint_allowed(
        basket_value,
        ctx.accounts.basket_mint.supply,
        desired_amount,
        cr,
    )?;

    // ── 5. Insurance fee (0.1%) ────────────────────────────────────────────
    let fee    = desired_amount.saturating_mul(INSURANCE_FEE_BPS) / 10_000;
    let net    = desired_amount.checked_sub(fee).ok_or(error!(VaultError::MathOverflow))?;

    // ── 5.5 Update CDP position BEFORE minting ────────────────────────────
    let position = &mut ctx.accounts.user_position;
    
    // Initialize position if first mint
    if position.owner == Pubkey::default() {
        position.owner = ctx.accounts.user.key();
        position.bump = ctx.bumps.user_position;
    }

    // Update debt: add the net amount being minted
    position.debt = position.debt
        .checked_add(net)
        .ok_or(error!(VaultError::MathOverflow))?;

    // Store collateral value as u64 by normalizing from u128
    // basket_value is in micro-USD (10^6 = 1 USD), safe to cast
    position.collateral_value = min(basket_value as u64, u64::MAX);

    // Calculate and store CR in basis points (e.g., 15000 = 150%)
    let cr_bps = if position.debt == 0 {
        u64::MAX
    } else {
        (position.collateral_value as u128)
            .checked_mul(10_000).ok_or(error!(VaultError::MathOverflow))?
            .checked_div(position.debt as u128).ok_or(error!(VaultError::MathOverflow))?
            as u64
    };
    position.cr_bps = cr_bps;

    emit!(MintPositionUpdated {
        user: position.owner,
        new_debt: position.debt,
        new_collateral_value: position.collateral_value,
        new_cr_bps: position.cr_bps,
    });

    // ── 6. CPI → SSS mint_tokens ───────────────────────────────────────────
    let bump   = config.vault_authority_bump;
    let seeds: &[&[&[u8]]] = &[&[VAULT_AUTH_SEED, &[bump]]];

    sss_interface::cpi_mint(
        ctx.accounts.sss_program.to_account_info(),
        ctx.accounts.basket_mint.to_account_info(),
        ctx.accounts.user_basket_account.to_account_info(),
        ctx.accounts.vault_authority.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        seeds,
        net,
    )?;

    // ── 7. Update global state ────────────────────────────────────────────────────
    let config = &mut ctx.accounts.global_config;
    config.total_minted = config.total_minted
        .checked_add(net).ok_or(error!(VaultError::MathOverflow))?;
    config.insurance_fund_lamports = config.insurance_fund_lamports
        .saturating_add(fee);

    emit!(MintEvent {
        user:          ctx.accounts.user.key(),
        amount_minted: net,
        fee,
        basket_value,
        cr_applied:    cr,
        btc_conf_bps:  btc_conf_bps as u16,
        timestamp:     clock.unix_timestamp,
    });

    msg!("Minted {} BASKET | fee={} | CR={}% | basket_value={} | user_cr={}%", 
        net, fee, cr, basket_value, position.cr_bps / 100);
    Ok(())
}

#[event]
pub struct MintEvent {
    pub user:          Pubkey,
    pub amount_minted: u64,
    pub fee:           u64,
    pub basket_value:  u128,
    pub cr_applied:    u16,
    pub btc_conf_bps:  u16,
    pub timestamp:     i64,
}

#[event]
pub struct MintPositionUpdated {
    pub user: Pubkey,
    pub new_debt: u64,
    pub new_collateral_value: u64,
    pub new_cr_bps: u64,
}
