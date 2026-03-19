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
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::*;
use crate::oracle::*;
use crate::sss_interface;
use crate::svs_interface::read_total_assets;
use crate::errors::VaultError;

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

    /// CHECK: SSS program
    #[account(address = global_config.sss_program)]
    pub sss_program: UncheckedAccount<'info>,

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
        let pyth_acct: Account<PriceUpdateV2> = Account::try_from(pyth_info)
            .map_err(|_| error!(VaultError::InvalidOracleAccount))?;
        let p = normalize_pyth_price(&pyth_acct, &asset.pyth_feed_id_hex, &clock)?;
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

    // ── 7. Update state ────────────────────────────────────────────────────
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

    msg!("Minted {} BASKET | fee={} | CR={}% | basket_value={}", net, fee, cr, basket_value);
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
