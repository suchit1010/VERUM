use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};
use crate::state::AssetConfig;
use crate::errors::VaultError;

// ── Thresholds ────────────────────────────────────────────────────────────────

pub const PYTH_MAX_AGE_SECS: u64  = 60;   // reject if >60s stale
pub const MAX_CONF_BPS:      u128 = 200;  // reject if conf >2% of price

// Adaptive CR tiers (BTC conf/price in basis points)
pub const VOL_NORMAL_BPS:   u128 = 30;    // <0.30%  → CR 150%
pub const VOL_ELEVATED_BPS: u128 = 200;   // <2.00%  → CR 200%
                                           // ≥2.00%  → CR 300%
pub const CR_NORMAL:   u16 = 150;
pub const CR_ELEVATED: u16 = 200;
pub const CR_CRISIS:   u16 = 300;

// ── Normalized price ──────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug)]
pub struct NormalizedPrice {
    pub price:        u128,  // USD × 10^6  (1_000_000 = $1.00)
    pub conf:         u128,
    pub conf_bps:     u128,  // conf/price × 10_000
    pub publish_time: i64,
}

// ── Pyth normalization ────────────────────────────────────────────────────────

pub fn normalize_pyth_price(
    price_update: &PriceUpdateV2,
    feed_id_hex:  &str,
    clock:        &Clock,
) -> Result<NormalizedPrice> {

    let feed_id = get_feed_id_from_hex(feed_id_hex)
        .map_err(|_| error!(VaultError::InvalidFeedId))?;

    let p = price_update
        .get_price_no_older_than(clock, PYTH_MAX_AGE_SECS, &feed_id)
        .map_err(|_| error!(VaultError::StaleOracle))?;

    require!(p.price > 0, VaultError::NegativePrice);
    require!(p.conf  > 0, VaultError::ZeroConfidence);

    let (price_n, conf_n) = norm_expo(p.price as u128, p.conf as u128, p.exponent)?;

    let conf_bps = conf_n
        .checked_mul(10_000).ok_or(error!(VaultError::MathOverflow))?
        .checked_div(price_n).ok_or(error!(VaultError::MathOverflow))?;

    require!(conf_bps <= MAX_CONF_BPS, VaultError::OracleUnreliable);

    Ok(NormalizedPrice { price: price_n, conf: conf_n, conf_bps, publish_time: p.publish_time })
}

fn norm_expo(raw_price: u128, raw_conf: u128, expo: i32) -> Result<(u128, u128)> {
    let shift = 6i32 + expo; // target 6 decimals
    if shift >= 0 {
        let f = 10u128.pow(shift as u32);
        Ok((raw_price.checked_mul(f).ok_or(error!(VaultError::MathOverflow))?,
            raw_conf .checked_mul(f).ok_or(error!(VaultError::MathOverflow))?))
    } else {
        let d = 10u128.pow((-shift) as u32);
        Ok((raw_price.checked_div(d).ok_or(error!(VaultError::MathOverflow))?,
            raw_conf .checked_div(d).ok_or(error!(VaultError::MathOverflow))?))
    }
}

// ── Adaptive CR ───────────────────────────────────────────────────────────────

/// BTC confidence interval / price → CR tier.
/// BTC is the vol proxy: conf/price widens in stress exactly like VIX.
pub fn adaptive_cr(btc_conf_bps: u128) -> u16 {
    match btc_conf_bps {
        v if v < VOL_NORMAL_BPS   => CR_NORMAL,
        v if v < VOL_ELEVATED_BPS => CR_ELEVATED,
        _                         => CR_CRISIS,
    }
}

// ── Collateral normalization ──────────────────────────────────────────────────

pub fn normalize_amount(amount: u64, decimals: u8) -> Result<u128> {
    let a = amount as u128;
    if decimals > 6 {
        a.checked_div(10u128.pow((decimals - 6) as u32))
         .ok_or(error!(VaultError::MathOverflow))
    } else {
        a.checked_mul(10u128.pow((6 - decimals) as u32))
         .ok_or(error!(VaultError::MathOverflow))
    }
}

// ── Basket value ──────────────────────────────────────────────────────────────

/// Returns (basket_value_usd_6dec, btc_conf_bps).
/// basket_value = Σ  normalize(amount[i]) × price[i] / 1e6  × weight_bps[i] / 10000
pub fn calculate_basket_value(
    collateral_amounts: &[u64],
    asset_configs:      &[AssetConfig],
    prices:             &[NormalizedPrice],
) -> Result<(u128, u128)> {

    require!(
        collateral_amounts.len() == asset_configs.len()
            && asset_configs.len() == prices.len(),
        VaultError::AssetCountMismatch
    );

    use crate::state::BTC_REGISTRY_INDEX;
    let mut total:        u128 = 0;
    let mut btc_conf_bps: u128 = VOL_ELEVATED_BPS; // conservative default

    for (i, ((amt, cfg), price)) in collateral_amounts.iter()
        .zip(asset_configs.iter())
        .zip(prices.iter())
        .enumerate()
    {
        if i == BTC_REGISTRY_INDEX { btc_conf_bps = price.conf_bps; }

        let amt_n = normalize_amount(*amt, cfg.decimals)?;

        let usd = amt_n
            .checked_mul(price.price).ok_or(error!(VaultError::MathOverflow))?
            .checked_div(1_000_000)  .ok_or(error!(VaultError::MathOverflow))?;

        let weighted = usd
            .checked_mul(cfg.weight_bps as u128).ok_or(error!(VaultError::MathOverflow))?
            .checked_div(10_000)               .ok_or(error!(VaultError::MathOverflow))?;

        total = total.checked_add(weighted).ok_or(error!(VaultError::MathOverflow))?;
    }

    Ok((total, btc_conf_bps))
}

// ── Mint gate ─────────────────────────────────────────────────────────────────

pub fn check_mint_allowed(
    basket_value:   u128,
    current_supply: u64,
    desired:        u64,
    cr:             u16,
) -> Result<()> {
    let total_after = (current_supply as u128)
        .checked_add(desired as u128).ok_or(error!(VaultError::MathOverflow))?;

    let required = total_after
        .checked_mul(cr as u128).ok_or(error!(VaultError::MathOverflow))?
        .checked_div(100)       .ok_or(error!(VaultError::MathOverflow))?;

    require!(basket_value >= required, VaultError::UnderCollateralized);
    Ok(())
}

pub fn check_position_mint_allowed(
    collateral_value: u128,
    current_debt:     u64,
    mint_amount:      u64,
    cr:               u16,
) -> Result<()> {
    let debt_after = (current_debt as u128)
        .checked_add(mint_amount as u128).ok_or(error!(VaultError::MathOverflow))?;

    let required = debt_after
        .checked_mul(cr as u128).ok_or(error!(VaultError::MathOverflow))?
        .checked_div(100).ok_or(error!(VaultError::MathOverflow))?;

    require!(collateral_value >= required, VaultError::UnderCollateralized);
    Ok(())
}
