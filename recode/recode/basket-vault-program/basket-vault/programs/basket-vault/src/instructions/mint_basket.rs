// programs/basket-vault/src/instructions/mint_basket.rs
//
// Core mint flow:
//   1. Fetch + normalize Pyth prices for all assets (via remaining_accounts)
//   2. Compute BTC vol proxy → adaptive CR
//   3. Calculate weighted basket value
//   4. Check basket_value >= desired_amount × CR
//   5. CPI to SSS::mint_tokens
//   6. Charge 0.1% fee to insurance fund

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::{GlobalConfig, GLOBAL_CONFIG_SEED, VAULT_AUTH_SEED};
use crate::oracle::{normalize_pyth_price, adaptive_cr, calculate_basket_value, check_mint_allowed};
use crate::oracle::NormalizedPrice;
use crate::cpi_interface::{cpi_mint_tokens, SssMintTokens};
use crate::errors::VaultError;

/// Insurance fund fee: 0.1% of every mint (10 bps)
pub const INSURANCE_FEE_BPS: u64 = 10;

#[derive(Accounts)]
pub struct MintBasket<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// Vault authority PDA — signs the CPI to SSS
    /// CHECK: derived from VAULT_AUTH_SEED
    #[account(
        seeds = [VAULT_AUTH_SEED],
        bump  = global_config.vault_authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    /// The BASKET mint — owned by SSS, vault_authority is the mint authority
    #[account(
        mut,
        address = global_config.basket_mint,
    )]
    pub basket_mint: Account<'info, Mint>,

    /// User's BASKET token account — receives minted tokens
    #[account(
        mut,
        token::mint      = basket_mint,
        token::authority = user,
    )]
    pub user_basket_account: Account<'info, TokenAccount>,

    /// SSS stablecoin program
    /// CHECK: address validated against global_config
    #[account(address = global_config.sss_program)]
    pub sss_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,

    // remaining_accounts: Pyth PriceUpdateV2 accounts, one per asset.
    // Must be in same order as global_config.asset_registry.
    // All are read-only, non-signers.
}

pub fn handler(
    ctx: Context<MintBasket>,
    collateral_amounts: Vec<u64>,
    desired_amount: u64,
) -> Result<()> {

    // ── Guard: emergency mode ─────────────────────────────────────────────
    require!(!ctx.accounts.global_config.emergency_mode, VaultError::EmergencyModeActive);

    let clock    = Clock::get()?;
    let config   = &ctx.accounts.global_config;
    let registry = &config.asset_registry;

    require!(collateral_amounts.len() == registry.len(), VaultError::AssetCountMismatch);
    require!(
        ctx.remaining_accounts.len() >= registry.len(),
        VaultError::MissingOracleAccounts
    );

    // ── 1. Fetch and normalize all Pyth prices ────────────────────────────
    let mut normalized_prices: Vec<NormalizedPrice> = Vec::with_capacity(registry.len());

    for (i, asset) in registry.iter().enumerate() {
        let price_info = &ctx.remaining_accounts[i];
        let price_account: Account<PriceUpdateV2> = Account::try_from(price_info)
            .map_err(|_| error!(VaultError::InvalidOracleAccount))?;

        let normalized = normalize_pyth_price(
            &price_account,
            &asset.pyth_feed_id_hex,
            &clock,
        )?;

        normalized_prices.push(normalized);
    }

    // ── 2. Basket value + BTC vol proxy ──────────────────────────────────
    let (basket_value, btc_conf_bps) = calculate_basket_value(
        &collateral_amounts,
        registry,
        &normalized_prices,
    )?;

    // Build a mock NormalizedPrice with just conf_bps set for adaptive_cr
    let btc_mock = NormalizedPrice {
        price:        1_000_000, // dummy — only conf_bps is used
        conf:         0,
        conf_bps:     btc_conf_bps,
        publish_time: clock.unix_timestamp,
    };
    let cr = adaptive_cr(&btc_mock);

    // ── 3. CR gate ────────────────────────────────────────────────────────
    check_mint_allowed(
        basket_value,
        ctx.accounts.basket_mint.supply,
        desired_amount,
        cr,
    )?;

    // ── 4. Insurance fund fee (0.1% of mint) ─────────────────────────────
    // Fee is denominated in BASKET units (not charged separately — deducted
    // from user's desired amount before CPI).
    let fee = desired_amount
        .checked_mul(INSURANCE_FEE_BPS)
        .ok_or(error!(VaultError::MathOverflow))?
        .checked_div(10_000)
        .ok_or(error!(VaultError::MathOverflow))?;

    let amount_to_user = desired_amount
        .checked_sub(fee)
        .ok_or(error!(VaultError::MathOverflow))?;

    // ── 5. CPI to SSS::mint_tokens ───────────────────────────────────────
    let vault_auth_bump = config.vault_authority_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_AUTH_SEED, &[vault_auth_bump]]];

    let cpi_accounts = SssMintTokens {
        mint:           ctx.accounts.basket_mint.to_account_info(),
        destination:    ctx.accounts.user_basket_account.to_account_info(),
        mint_authority: ctx.accounts.vault_authority.to_account_info(),
        token_program:  ctx.accounts.token_program.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.sss_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );

    cpi_mint_tokens(cpi_ctx, amount_to_user)?;

    // ── 6. Update state ───────────────────────────────────────────────────
    let config = &mut ctx.accounts.global_config;
    config.total_minted = config.total_minted
        .checked_add(amount_to_user)
        .ok_or(error!(VaultError::MathOverflow))?;

    // Convert fee to lamports approximation for insurance fund tracking
    // (actual fee accounting depends on SSS token value)
    config.insurance_fund_lamports = config.insurance_fund_lamports
        .checked_add(fee as u64)
        .unwrap_or(config.insurance_fund_lamports);

    // ── 7. Emit event ─────────────────────────────────────────────────────
    emit!(MintEvent {
        user:           ctx.accounts.user.key(),
        amount_minted:  amount_to_user,
        fee_collected:  fee,
        basket_value,
        cr_applied:     cr,
        btc_conf_bps:   btc_conf_bps as u16,
        timestamp:      clock.unix_timestamp,
    });

    msg!("Minted {} BASKET | CR: {}% | basket_value: {} | fee: {}",
        amount_to_user, cr, basket_value, fee);

    Ok(())
}

#[event]
pub struct MintEvent {
    pub user:          Pubkey,
    pub amount_minted: u64,
    pub fee_collected: u64,
    pub basket_value:  u128,
    pub cr_applied:    u16,
    pub btc_conf_bps:  u16,
    pub timestamp:     i64,
}
