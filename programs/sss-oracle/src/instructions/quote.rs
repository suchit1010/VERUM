use anchor_lang::prelude::*;

use crate::errors::OracleError;
use crate::events::{MintQuoteEvent, RedeemQuoteEvent};
use crate::state::OracleConfig;

#[derive(Accounts)]
pub struct GetQuote<'info> {
    /// Oracle config — read + analytics update (total_minted / total_redeemed).
    #[account(
        mut,
        seeds = [b"oracle_cfg", oracle_config.stablecoin_mint.as_ref()],
        bump = oracle_config.bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

/// Compute how many tokens to mint for a given USD input.
///
/// Formula: `token_amount = (usd_input * 10^decimals) / price_usd`
///
/// Example (EUR stablecoin, 6 decimals, EUR/USD = 1.08):
///   - usd_input  = 1_000_000 (1 USD)
///   - price_usd  = 1_080_000 (1.08 USD/EUR)
///   - token_amount = 1_000_000 * 1_000_000 / 1_080_000 ≈ 925_925 (0.925925 EUR)
///
/// Emits `MintQuoteEvent` — typically called via `simulateTransaction` in the SDK.
pub fn mint_quote_handler(ctx: Context<GetQuote>, usd_input: u64) -> Result<()> {
    let cfg = &mut ctx.accounts.oracle_config;
    let now = Clock::get()?.unix_timestamp;

    require!(cfg.price_usd > 0, OracleError::InvalidPrice);
    require!(cfg.is_price_fresh(now), OracleError::StalePrice);

    // token_amount = usd_input * 10^decimals / price_usd
    let scale = 10u128.pow(cfg.token_decimals as u32);
    let token_amount = (usd_input as u128)
        .checked_mul(scale)
        .ok_or(error!(OracleError::MathOverflow))?
        .checked_div(cfg.price_usd as u128)
        .ok_or(error!(OracleError::InvalidPrice))? as u64;

    cfg.total_minted = cfg.total_minted
        .checked_add(token_amount as u128)
        .ok_or(error!(OracleError::MathOverflow))?;

    let expires_at = cfg.last_update
        .checked_add(cfg.max_staleness)
        .ok_or(error!(OracleError::MathOverflow))?;

    emit!(MintQuoteEvent {
        oracle: cfg.key(),
        usd_input,
        token_amount,
        price_used: cfg.price_usd,
        expires_at,
    });

    msg!(
        "MintQuote[{}]: {} micro-USD → {} base-units at {} micro-USD/token (expires {})",
        cfg.currency_str(),
        usd_input,
        token_amount,
        cfg.price_usd,
        expires_at,
    );

    Ok(())
}

/// Compute how much USD is owed for a token redemption.
///
/// Formula: `usd_output = (token_amount * price_usd) / 10^decimals`
///
/// Example (EUR stablecoin, 6 decimals, EUR/USD = 1.08):
///   - token_amount = 1_000_000 (1 EUR token)
///   - price_usd    = 1_080_000 (1.08 USD/EUR)
///   - usd_output   = 1_000_000 * 1_080_000 / 1_000_000 = 1_080_000 (1.08 USD)
///
/// Emits `RedeemQuoteEvent` — typically called via `simulateTransaction` in the SDK.
pub fn redeem_quote_handler(ctx: Context<GetQuote>, token_amount: u64) -> Result<()> {
    let cfg = &mut ctx.accounts.oracle_config;
    let now = Clock::get()?.unix_timestamp;

    require!(cfg.price_usd > 0, OracleError::InvalidPrice);
    require!(cfg.is_price_fresh(now), OracleError::StalePrice);

    // usd_output = token_amount * price_usd / 10^decimals
    let scale = 10u128.pow(cfg.token_decimals as u32);
    let usd_output = (token_amount as u128)
        .checked_mul(cfg.price_usd as u128)
        .ok_or(error!(OracleError::MathOverflow))?
        .checked_div(scale)
        .ok_or(error!(OracleError::MathOverflow))? as u64;

    cfg.total_redeemed = cfg.total_redeemed
        .checked_add(token_amount as u128)
        .ok_or(error!(OracleError::MathOverflow))?;

    let expires_at = cfg.last_update
        .checked_add(cfg.max_staleness)
        .ok_or(error!(OracleError::MathOverflow))?;

    emit!(RedeemQuoteEvent {
        oracle: cfg.key(),
        token_amount,
        usd_output,
        price_used: cfg.price_usd,
        expires_at,
    });

    msg!(
        "RedeemQuote[{}]: {} base-units → {} micro-USD at {} micro-USD/token (expires {})",
        cfg.currency_str(),
        token_amount,
        usd_output,
        cfg.price_usd,
        expires_at,
    );

    Ok(())
}
