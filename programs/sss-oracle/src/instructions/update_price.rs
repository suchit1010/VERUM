use anchor_lang::prelude::*;

use crate::errors::OracleError;
use crate::events::PriceUpdatedEvent;
use crate::state::OracleConfig;

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    /// Oracle keeper — must match `oracle_config.authority`.
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"oracle_cfg", oracle_config.stablecoin_mint.as_ref()],
        bump = oracle_config.bump,
        has_one = authority @ OracleError::Unauthorized,
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

/// Post a new price from the Switchboard keeper.
///
/// Security checks (in order):
/// 1. Authority — `has_one` constraint enforces keeper signature.
/// 2. Timestamp freshness — reject prices with older timestamps than cached.
/// 3. Slot timestamp recency — price must not be older than `max_staleness`.
/// 4. Sanity bounds — price must be within `[lower_bound, upper_bound]`.
/// 5. Max deviation — single-step change limited to `max_deviation_bps`.
pub fn handler(
    ctx: Context<UpdatePrice>,
    price: i64,
    confidence: u64,
    timestamp: i64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.oracle_config;
    let now = Clock::get()?.unix_timestamp;

    // —— 1. Timestamp must advance (prevents replay of old price data) ——
    require!(timestamp > cfg.last_update, OracleError::InvalidTimestamp);

    // —— 2. Price must not be too old ——
    require!(
        now.saturating_sub(timestamp) <= cfg.max_staleness,
        OracleError::StalePrice
    );

    // —— 3. Sanity bounds ——
    require!(price > 0, OracleError::InvalidPrice);
    require!(
        price >= cfg.price_lower_bound && price <= cfg.price_upper_bound,
        OracleError::PriceOutOfBounds
    );

    // —— 4. Deviation guard (only after first live update, bypass on bootstrap) ——
    if cfg.confidence > 0 {
        let prev = cfg.price_usd as i128;
        let next = price as i128;
        // deviation_bps = |next - prev| / prev * 10_000
        let deviation_bps = next.abs_diff(prev)
            .checked_mul(10_000)
            .unwrap_or(u128::MAX)
            .checked_div(prev.unsigned_abs())
            .unwrap_or(u128::MAX);
        require!(
            deviation_bps <= cfg.max_deviation_bps as u128,
            OracleError::DeviationTooLarge
        );
    }

    cfg.price_usd = price;
    cfg.confidence = confidence;
    cfg.last_update = timestamp;

    emit!(PriceUpdatedEvent {
        oracle: cfg.key(),
        stablecoin_mint: cfg.stablecoin_mint,
        currency_code: cfg.currency_code,
        price_usd: price,
        confidence,
        timestamp,
    });

    msg!(
        "Price updated: {}={} micro-USD (±{} confidence, slot_ts={})",
        cfg.currency_str(),
        price,
        confidence,
        timestamp,
    );

    Ok(())
}
