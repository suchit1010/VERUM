// programs/basket-vault/src/oracle.rs
//
// Core oracle math:
//   - Pyth price normalization (expo → 6 decimals)
//   - Adaptive collateral ratio via BTC confidence interval as VIX proxy
//   - Basket value calculation (weighted sum)
//   - Mint gate (CR check before CPI to SSS)

use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};
use crate::state::AssetConfig;
use crate::errors::VaultError;

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────

/// Reject Pyth price if older than 60 seconds.
/// 60s ≈ 150 Solana blocks — beyond this, network partition is likely.
pub const PYTH_MAX_AGE_SECS: u64 = 60;

/// Reject Pyth price if confidence interval > 2% of price (200 bps).
/// During Luna collapse BTC conf/price hit ~3.5% — correctly rejected here.
pub const MAX_CONF_BPS: u128 = 200;

// Adaptive CR thresholds (BTC conf/price in basis points)
pub const VOL_NORMAL_THRESHOLD: u128   = 30;   // < 0.30%  → CR 150%
pub const VOL_ELEVATED_THRESHOLD: u128 = 200;  // < 2.00%  → CR 200%
                                                // ≥ 2.00%  → CR 300%
// CR values (percentage integers)
pub const CR_NORMAL: u16   = 150;
pub const CR_ELEVATED: u16 = 200;
pub const CR_CRISIS: u16   = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Normalized price struct
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug)]
pub struct NormalizedPrice {
    /// USD price scaled to 6 decimals (1_000_000 = $1.00)
    pub price: u128,

    /// Confidence interval, same scale as price
    pub conf: u128,

    /// conf / price in basis points — used for adaptive_cr vol proxy
    pub conf_bps: u128,

    /// Unix timestamp of the published price
    pub publish_time: i64,
}

// ─────────────────────────────────────────────────────────────────────────────
// Pyth price normalization
// ─────────────────────────────────────────────────────────────────────────────

pub fn normalize_pyth_price(
    price_update: &PriceUpdateV2,
    feed_id_hex: &str,
    clock: &Clock,
) -> Result<NormalizedPrice> {

    let feed_id = get_feed_id_from_hex(feed_id_hex)
        .map_err(|_| error!(VaultError::InvalidFeedId))?;

    // get_price_no_older_than enforces staleness — returns Err if stale
    let price_data = price_update
        .get_price_no_older_than(clock, PYTH_MAX_AGE_SECS, &feed_id)
        .map_err(|_| error!(VaultError::StaleOracle))?;

    require!(price_data.price > 0, VaultError::NegativePrice);
    require!(price_data.conf > 0,  VaultError::ZeroConfidence);

    let raw_price = price_data.price as u128;
    let raw_conf  = price_data.conf  as u128;
    let expo      = price_data.exponent; // typically -8

    let (price_normalized, conf_normalized) =
        normalize_expo(raw_price, raw_conf, expo)?;

    // conf_bps = (conf / price) × 10_000
    let conf_bps = conf_normalized
        .checked_mul(10_000)
        .ok_or(error!(VaultError::MathOverflow))?
        .checked_div(price_normalized)
        .ok_or(error!(VaultError::MathOverflow))?;

    require!(conf_bps <= MAX_CONF_BPS, VaultError::OracleUnreliable);

    Ok(NormalizedPrice {
        price:        price_normalized,
        conf:         conf_normalized,
        conf_bps,
        publish_time: price_data.publish_time,
    })
}

/// Normalize Pyth raw price/conf from expo to 6 decimal places.
/// expo = -8 → divide by 100  (10^(6 + (-8)) = 10^-2)
/// expo = -6 → no change
/// expo = -5 → multiply by 10
fn normalize_expo(
    raw_price: u128,
    raw_conf: u128,
    expo: i32,
) -> Result<(u128, u128)> {
    let target: i32 = 6;
    let shift = target + expo; // e.g. 6 + (-8) = -2

    if shift >= 0 {
        let factor = 10u128.pow(shift as u32);
        Ok((
            raw_price.checked_mul(factor).ok_or(error!(VaultError::MathOverflow))?,
            raw_conf.checked_mul(factor).ok_or(error!(VaultError::MathOverflow))?,
        ))
    } else {
        let divisor = 10u128.pow((-shift) as u32);
        Ok((
            raw_price.checked_div(divisor).ok_or(error!(VaultError::MathOverflow))?,
            raw_conf.checked_div(divisor).ok_or(error!(VaultError::MathOverflow))?,
        ))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptive CR — BTC confidence interval as VIX proxy
// ─────────────────────────────────────────────────────────────────────────────

/// Computes minimum collateral ratio based on BTC volatility.
///
/// Uses BTC as the vol proxy because:
///   1. Highest oracle update frequency on Pyth
///   2. Confidence interval correlates strongly with cross-asset vol
///   3. Already in the basket — no extra oracle account needed
///
/// Returns CR as percentage integer: 150, 200, or 300.
pub fn adaptive_cr(btc_price: &NormalizedPrice) -> u16 {
    match btc_price.conf_bps {
        v if v < VOL_NORMAL_THRESHOLD   => CR_NORMAL,    // < 0.30% → 150%
        v if v < VOL_ELEVATED_THRESHOLD => CR_ELEVATED,  // 0.30–2% → 200%
        _                               => CR_CRISIS,    // ≥ 2.00% → 300%
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Collateral amount normalization
// ─────────────────────────────────────────────────────────────────────────────

/// Normalize a raw SPL token amount to 6 decimal places.
/// e.g. PAXG has 8 decimals: 1_00000000 raw → 1_000000 normalized
pub fn normalize_collateral_amount(amount: u64, decimals: u8) -> Result<u128> {
    let amount_u128 = amount as u128;
    if decimals > 6 {
        amount_u128
            .checked_div(10u128.pow((decimals - 6) as u32))
            .ok_or(error!(VaultError::MathOverflow))
    } else {
        amount_u128
            .checked_mul(10u128.pow((6 - decimals) as u32))
            .ok_or(error!(VaultError::MathOverflow))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Basket value calculation
// ─────────────────────────────────────────────────────────────────────────────

/// Computes total weighted USD value of all deposited collateral.
/// Returns (basket_value, btc_conf_bps).
///
/// basket_value is scaled to 6 decimals (same as NormalizedPrice).
/// btc_conf_bps is used by adaptive_cr — caller should pass to that function.
///
/// BTC is expected at index 2 in the default registry order:
///   [gold=0, oil=1, btc=2, silver+farm=3, dxy=4, rwa=5]
/// Adjust BTC_INDEX if your registry differs.
pub fn calculate_basket_value(
    collateral_amounts: &[u64],
    asset_configs:      &[AssetConfig],
    normalized_prices:  &[NormalizedPrice],
) -> Result<(u128, u128)> {

    const BTC_INDEX: usize = 2;

    require!(
        collateral_amounts.len() == asset_configs.len()
            && asset_configs.len() == normalized_prices.len(),
        VaultError::AssetCountMismatch
    );

    let mut total: u128        = 0;
    let mut btc_conf_bps: u128 = VOL_ELEVATED_THRESHOLD; // conservative default

    for (i, ((amount, config), price_data)) in collateral_amounts
        .iter()
        .zip(asset_configs.iter())
        .zip(normalized_prices.iter())
        .enumerate()
    {
        // Capture BTC conf for adaptive_cr
        if i == BTC_INDEX {
            btc_conf_bps = price_data.conf_bps;
        }

        let amount_normalized =
            normalize_collateral_amount(*amount, config.decimals)?;

        // USD value = amount × price / 1_000_000 (both at 6 decimals)
        let usd_value = amount_normalized
            .checked_mul(price_data.price)
            .ok_or(error!(VaultError::MathOverflow))?
            .checked_div(1_000_000)
            .ok_or(error!(VaultError::MathOverflow))?;

        // Apply basket weight
        let weighted = usd_value
            .checked_mul(config.weight_bps as u128)
            .ok_or(error!(VaultError::MathOverflow))?
            .checked_div(10_000)
            .ok_or(error!(VaultError::MathOverflow))?;

        total = total.checked_add(weighted).ok_or(error!(VaultError::MathOverflow))?;
    }

    Ok((total, btc_conf_bps))
}

// ─────────────────────────────────────────────────────────────────────────────
// Mint gate
// ─────────────────────────────────────────────────────────────────────────────

/// Returns Ok(()) if minting desired_amount new BASKET tokens is safe.
/// Call this before every CPI to SSS mint_tokens.
///
/// basket_value   — from calculate_basket_value(), 6 decimal USD
/// basket_minted  — current total BASKET supply (6 decimals)
/// desired_amount — new BASKET to mint (6 decimals)
/// cr             — from adaptive_cr(), percentage integer (150/200/300)
pub fn check_mint_allowed(
    basket_value:   u128,
    basket_minted:  u64,
    desired_amount: u64,
    cr:             u16,
) -> Result<()> {

    let total_after_mint = (basket_minted as u128)
        .checked_add(desired_amount as u128)
        .ok_or(error!(VaultError::MathOverflow))?;

    // required_collateral = total_after_mint × cr / 100
    let required = total_after_mint
        .checked_mul(cr as u128)
        .ok_or(error!(VaultError::MathOverflow))?
        .checked_div(100)
        .ok_or(error!(VaultError::MathOverflow))?;

    require!(basket_value >= required, VaultError::UnderCollateralized);

    Ok(())
}
