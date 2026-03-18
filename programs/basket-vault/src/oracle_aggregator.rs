use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};
use switchboard_solana::AggregatorAccountData;
use crate::errors::VaultError;

pub const PYTH_MAX_AGE_SECS:      u64  = 60;
pub const SB_MAX_AGE_SECS:        u64  = 120;
pub const MAX_CONF_BPS:           u128 = 200;
pub const MAX_SPREAD_BPS:         u128 = 150;  // 1.5% max disagreement
pub const MIN_VALID_SOURCES:      usize = 1;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum OracleSource { Pyth, Switchboard }

#[derive(Clone, Copy, Debug)]
pub struct ValidatedPrice {
    pub price:        u128,
    pub conf_bps:     u128,
    pub publish_time: i64,
    pub source:       OracleSource,
}

#[derive(Clone, Copy, Debug)]
pub struct AggregatedPrice {
    pub price:             u128,
    pub pyth_conf_bps:     Option<u128>,
    pub valid_sources:     usize,
    pub spread_bps:        u128,
}

// ── Pyth fetch ────────────────────────────────────────────────────────────────

pub fn fetch_pyth(
    account:     &Account<PriceUpdateV2>,
    feed_id_hex: &str,
    clock:       &Clock,
) -> Option<ValidatedPrice> {
    let feed_id = get_feed_id_from_hex(feed_id_hex).ok()?;
    let p = account.get_price_no_older_than(clock, PYTH_MAX_AGE_SECS, &feed_id).ok()?;
    if p.price <= 0 || p.conf == 0 { return None; }

    let shift = 6i32 + p.exponent;
    let (price_n, conf_n) = if shift >= 0 {
        let f = 10u128.pow(shift as u32);
        (p.price as u128 * f, p.conf as u128 * f)
    } else {
        let d = 10u128.pow((-shift) as u32);
        (p.price as u128 / d, p.conf as u128 / d)
    };

    let conf_bps = conf_n.checked_mul(10_000)?.checked_div(price_n)?;
    if conf_bps > MAX_CONF_BPS {
        msg!("Pyth: conf_bps {} > max {}", conf_bps, MAX_CONF_BPS);
        return None;
    }

    Some(ValidatedPrice { price: price_n, conf_bps, publish_time: p.publish_time, source: OracleSource::Pyth })
}

// ── Switchboard fetch ─────────────────────────────────────────────────────────

pub fn fetch_switchboard(
    loader: &AccountLoader<AggregatorAccountData>,
    clock:  &Clock,
) -> Option<ValidatedPrice> {
    let agg       = loader.load().ok()?;
    let result    = agg.latest_confirmed_round.result;
    let round_ts  = agg.latest_confirmed_round.round_open_timestamp as u64;
    let now       = clock.unix_timestamp as u64;

    if now.saturating_sub(round_ts) > SB_MAX_AGE_SECS {
        msg!("Switchboard stale: age={}s", now.saturating_sub(round_ts));
        return None;
    }
    if result.mantissa <= 0 { return None; }

    let price_n = match result.scale.cmp(&6) {
        std::cmp::Ordering::Greater => (result.mantissa as u128).checked_div(10u128.pow(result.scale - 6))?,
        std::cmp::Ordering::Less    => (result.mantissa as u128).checked_mul(10u128.pow(6 - result.scale))?,
        std::cmp::Ordering::Equal   => result.mantissa as u128,
    };

    Some(ValidatedPrice { price: price_n, conf_bps: 0, publish_time: round_ts as i64, source: OracleSource::Switchboard })
}

// ── Aggregator ────────────────────────────────────────────────────────────────

pub fn aggregate(valid: &mut Vec<ValidatedPrice>) -> Result<AggregatedPrice> {
    require!(valid.len() >= MIN_VALID_SOURCES, VaultError::InsufficientOracleSources);

    valid.sort_unstable_by_key(|p| p.price);

    let min_p  = valid.first().unwrap().price;
    let max_p  = valid.last().unwrap().price;
    let median = if valid.len() % 2 == 1 {
        valid[valid.len() / 2].price
    } else {
        valid[(valid.len() / 2) - 1].price  // lower median = conservative
    };

    let spread_bps = if median > 0 {
        (max_p.saturating_sub(min_p)).saturating_mul(10_000) / median
    } else { u128::MAX };

    msg!("Oracle spread: {}bps | sources: {}", spread_bps, valid.len());
    require!(spread_bps <= MAX_SPREAD_BPS, VaultError::PriceSpreadTooWide);

    let pyth_conf_bps = valid.iter()
        .find(|p| p.source == OracleSource::Pyth)
        .map(|p| p.conf_bps);

    Ok(AggregatedPrice { price: median, pyth_conf_bps, valid_sources: valid.len(), spread_bps })
}

pub fn get_price(
    pyth:        &Account<PriceUpdateV2>,
    switchboard: &AccountLoader<AggregatorAccountData>,
    feed_id_hex: &str,
    clock:       &Clock,
) -> Result<AggregatedPrice> {
    let mut valid: Vec<ValidatedPrice> = Vec::with_capacity(2);

    if let Some(p) = fetch_pyth(pyth, feed_id_hex, clock) { valid.push(p); }
    else { msg!("Pyth unavailable"); }

    if let Some(p) = fetch_switchboard(switchboard, clock) { valid.push(p); }
    else { msg!("Switchboard unavailable"); }

    aggregate(&mut valid)
}
