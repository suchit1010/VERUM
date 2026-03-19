// programs/basket-vault/src/oracle_aggregator.rs
//
// Multi-source oracle aggregator:
//   - Fetches from Pyth (primary) and Switchboard (secondary)
//   - Returns None for each source that fails — graceful fallback
//   - Computes median across valid sources
//   - Rejects entire batch if spread between sources > MAX_SOURCE_SPREAD_BPS
//   - Exposes Pyth conf_bps for adaptive_cr even when Switchboard is primary

use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};
use switchboard_solana::AggregatorAccountData;
use crate::errors::VaultError;

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────

/// Pyth: reject if price older than 60 seconds.
pub const PYTH_MAX_AGE_SECS: u64 = 60;

/// Switchboard: reject if updated more than 120 seconds ago.
/// Two missed heartbeats (typical heartbeat = 30-60s).
pub const SWITCHBOARD_MAX_AGE_SECS: u64 = 120;

/// Reject Pyth price if confidence interval > 2% of price.
pub const MAX_CONF_BPS: u128 = 200;

/// Reject aggregated price if spread between highest and lowest valid source
/// exceeds 1.5%. Above this, at least one source is wrong.
/// Normal oracle spread is 0.05-0.3%.
pub const MAX_SOURCE_SPREAD_BPS: u128 = 150;

/// Minimum valid oracle sources required to proceed.
/// 1 for devnet MVP; raise to 2 for mainnet.
pub const MIN_VALID_SOURCES: usize = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/// A price that has passed individual source validation.
#[derive(Clone, Copy, Debug)]
pub struct ValidatedPrice {
    /// USD price scaled to 6 decimals (1_000_000 = $1.00)
    pub price: u128,

    /// Confidence interval (Pyth only; 0 for Switchboard)
    pub conf: u128,

    /// conf / price in basis points
    pub conf_bps: u128,

    /// Unix timestamp
    pub publish_time: i64,

    pub source: OracleSource,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum OracleSource {
    Pyth,
    Switchboard,
}

/// Final result returned to vault instruction handlers.
#[derive(Clone, Copy, Debug)]
pub struct AggregatedPrice {
    /// Median price across all valid sources (6 decimals)
    pub price: u128,

    /// Pyth conf_bps — used for adaptive_cr vol proxy.
    /// None if Pyth was stale/invalid this round.
    /// Caller should default to VOL_ELEVATED_THRESHOLD if None.
    pub pyth_conf_bps: Option<u128>,

    /// Number of sources that contributed to the median
    pub valid_source_count: usize,

    /// Spread between highest and lowest valid price (bps)
    pub spread_bps: u128,
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual oracle fetchers
// ─────────────────────────────────────────────────────────────────────────────

/// Fetch and validate a Pyth price.
/// Returns None (not Err) on failure — allows graceful fallback to Switchboard.
pub fn fetch_pyth_price(
    price_account: &Account<PriceUpdateV2>,
    feed_id_hex:   &str,
    clock:         &Clock,
) -> Option<ValidatedPrice> {

    let feed_id = get_feed_id_from_hex(feed_id_hex).ok()?;

    let price_data = price_account
        .get_price_no_older_than(clock, PYTH_MAX_AGE_SECS, &feed_id)
        .ok()?;

    if price_data.price <= 0 || price_data.conf == 0 {
        return None;
    }

    let raw_price = price_data.price as u128;
    let raw_conf  = price_data.conf  as u128;
    let expo      = price_data.exponent;

    let (price_norm, conf_norm) = normalize_pyth_expo(raw_price, raw_conf, expo)?;

    let conf_bps = conf_norm
        .checked_mul(10_000)?
        .checked_div(price_norm)?;

    if conf_bps > MAX_CONF_BPS {
        msg!("Pyth rejected: conf_bps={} > MAX={}", conf_bps, MAX_CONF_BPS);
        return None;
    }

    Some(ValidatedPrice {
        price:        price_norm,
        conf:         conf_norm,
        conf_bps,
        publish_time: price_data.publish_time,
        source:       OracleSource::Pyth,
    })
}

/// Normalize Pyth expo to 6 decimal places.
fn normalize_pyth_expo(
    raw_price: u128,
    raw_conf:  u128,
    expo:      i32,
) -> Option<(u128, u128)> {
    let shift = 6i32 + expo; // target 6 decimals
    if shift >= 0 {
        let factor = 10u128.pow(shift as u32);
        Some((raw_price.checked_mul(factor)?, raw_conf.checked_mul(factor)?))
    } else {
        let divisor = 10u128.pow((-shift) as u32);
        Some((raw_price.checked_div(divisor)?, raw_conf.checked_div(divisor)?))
    }
}

/// Fetch and validate a Switchboard price.
/// Returns None on failure.
pub fn fetch_switchboard_price(
    aggregator_account: &AccountLoader<AggregatorAccountData>,
    clock:              &Clock,
) -> Option<ValidatedPrice> {

    let aggregator  = aggregator_account.load().ok()?;
    let result      = aggregator.latest_confirmed_round.result;
    let round_time  = aggregator.latest_confirmed_round.round_open_timestamp as u64;
    let current     = clock.unix_timestamp as u64;

    if current.saturating_sub(round_time) > SWITCHBOARD_MAX_AGE_SECS {
        msg!("Switchboard rejected: age={}s", current.saturating_sub(round_time));
        return None;
    }

    if result.mantissa <= 0 {
        return None;
    }

    let price_norm = normalize_switchboard_decimal(
        result.mantissa as u128,
        result.scale,
    )?;

    Some(ValidatedPrice {
        price:        price_norm,
        conf:         0,
        conf_bps:     0,
        publish_time: round_time as i64,
        source:       OracleSource::Switchboard,
    })
}

/// Convert Switchboard SwitchboardDecimal (mantissa × 10^-scale) to 6 decimals.
fn normalize_switchboard_decimal(mantissa: u128, scale: u32) -> Option<u128> {
    match scale.cmp(&6) {
        std::cmp::Ordering::Greater => {
            mantissa.checked_div(10u128.pow(scale - 6))
        }
        std::cmp::Ordering::Less => {
            mantissa.checked_mul(10u128.pow(6 - scale))
        }
        std::cmp::Ordering::Equal => Some(mantissa),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregator — median + spread check
// ─────────────────────────────────────────────────────────────────────────────

/// Aggregate validated prices into a single trusted price.
///
/// Algorithm:
///   1. Require MIN_VALID_SOURCES passed validation
///   2. Sort prices ascending
///   3. Compute spread (max-min)/median — reject if > MAX_SOURCE_SPREAD_BPS
///   4. Return lower median (conservative — understates collateral, never overstates)
pub fn aggregate_prices(
    valid_prices: &mut Vec<ValidatedPrice>,
) -> Result<AggregatedPrice> {

    require!(
        valid_prices.len() >= MIN_VALID_SOURCES,
        VaultError::InsufficientOracleSources
    );

    // Sort ascending by price
    valid_prices.sort_unstable_by_key(|p| p.price);

    let min_price = valid_prices.first().unwrap().price;
    let max_price = valid_prices.last().unwrap().price;
    let median    = compute_median(valid_prices);

    // spread_bps = (max - min) / median × 10_000
    let spread_bps = if median > 0 {
        (max_price.saturating_sub(min_price))
            .checked_mul(10_000)
            .unwrap_or(u128::MAX)
            .checked_div(median)
            .unwrap_or(u128::MAX)
    } else {
        u128::MAX
    };

    msg!(
        "Oracle spread: {}bps | sources: {} | max allowed: {}bps",
        spread_bps,
        valid_prices.len(),
        MAX_SOURCE_SPREAD_BPS
    );

    require!(
        spread_bps <= MAX_SOURCE_SPREAD_BPS,
        VaultError::PriceSpreadTooWide
    );

    // Extract Pyth conf_bps for adaptive_cr (None if Pyth was unavailable)
    let pyth_conf_bps = valid_prices
        .iter()
        .find(|p| p.source == OracleSource::Pyth)
        .map(|p| p.conf_bps);

    Ok(AggregatedPrice {
        price: median,
        pyth_conf_bps,
        valid_source_count: valid_prices.len(),
        spread_bps,
    })
}

/// Median of a *sorted* slice.
/// Even-length: returns lower median (conservative — understates collateral).
fn compute_median(sorted: &[ValidatedPrice]) -> u128 {
    let n = sorted.len();
    if n == 0 { return 0; }
    if n % 2 == 1 {
        sorted[n / 2].price
    } else {
        sorted[(n / 2) - 1].price // lower median
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level entry point
// ─────────────────────────────────────────────────────────────────────────────

/// Fetch, validate, and aggregate the price for one asset.
/// Called once per asset inside calculate_basket_value.
pub fn get_aggregated_price(
    pyth_account:        &Account<PriceUpdateV2>,
    switchboard_account: &AccountLoader<AggregatorAccountData>,
    feed_id_hex:         &str,
    clock:               &Clock,
) -> Result<AggregatedPrice> {

    let mut valid_prices: Vec<ValidatedPrice> = Vec::with_capacity(2);

    if let Some(p) = fetch_pyth_price(pyth_account, feed_id_hex, clock) {
        valid_prices.push(p);
    } else {
        msg!("Pyth unavailable for feed: {}", &feed_id_hex[..8]);
    }

    if let Some(p) = fetch_switchboard_price(switchboard_account, clock) {
        valid_prices.push(p);
    } else {
        msg!("Switchboard unavailable");
    }

    aggregate_prices(&mut valid_prices)
}
