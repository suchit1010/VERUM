use anchor_lang::prelude::*;

use crate::errors::OracleError;
use crate::events::PriceUpdatedEvent;
use crate::state::OracleConfig;

/// Parameters for initializing an oracle.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitOracleParams {
    /// ISO 4217 currency code, null-padded (e.g. *b"EUR\0\0\0\0\0"*).
    pub currency_code: [u8; 8],

    /// Switchboard aggregator/pull-feed account for this currency pair.
    /// Stored on-chain for transparency; the keeper reads from this address off-chain.
    pub switchboard_feed: Pubkey,

    /// Token decimals — must match the stablecoin mint.
    pub token_decimals: u8,

    /// Maximum age (seconds) before a price is considered stale.
    /// Recommended: 60 for FX pairs, 300 for CPI/slow pegs.
    pub max_staleness: i64,

    /// Minimum allowed price in micro-USD. Must be > 0.
    /// Example: 100_000 = $0.10 floor.
    pub price_lower_bound: i64,

    /// Maximum allowed price in micro-USD.
    /// Example: 5_000_000 = $5.00 ceiling (for near-parity currencies).
    pub price_upper_bound: i64,

    /// Maximum single-update deviation in basis points (e.g. 500 = 5%).
    pub max_deviation_bps: u16,

    /// Bootstrap price in micro-USD — the initial cached value before the keeper
    /// posts the first live price. Must be within [lower_bound, upper_bound].
    pub initial_price: i64,
}

#[derive(Accounts)]
#[instruction(params: InitOracleParams)]
pub struct InitializeOracle<'info> {
    /// Payer and initial oracle authority (typically the protocol admin).
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The stablecoin mint this oracle prices.
    ///
    /// CHECK: We only use the pubkey as a PDA seed; the stablecoin program
    /// validates mint ownership independently.
    pub stablecoin_mint: UncheckedAccount<'info>,

    /// Oracle configuration PDA.
    #[account(
        init,
        payer = authority,
        space = OracleConfig::LEN,
        seeds = [b"oracle_cfg", stablecoin_mint.key().as_ref()],
        bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeOracle>, params: InitOracleParams) -> Result<()> {
    // Validate configuration
    require!(params.max_staleness > 0, OracleError::InvalidStaleness);
    require!(
        params.price_lower_bound > 0,
        OracleError::InvalidPrice
    );
    require!(
        params.price_lower_bound < params.price_upper_bound,
        OracleError::InvalidBounds
    );
    require!(
        params.initial_price >= params.price_lower_bound
            && params.initial_price <= params.price_upper_bound,
        OracleError::PriceOutOfBounds
    );

    let now = Clock::get()?.unix_timestamp;
    let cfg = &mut ctx.accounts.oracle_config;

    cfg.authority = ctx.accounts.authority.key();
    cfg.stablecoin_mint = ctx.accounts.stablecoin_mint.key();
    cfg.switchboard_feed = params.switchboard_feed;
    cfg.currency_code = params.currency_code;
    cfg.price_usd = params.initial_price;
    cfg.confidence = 0; // bootstrap — no real confidence yet
    cfg.last_update = now;
    cfg.max_staleness = params.max_staleness;
    cfg.price_lower_bound = params.price_lower_bound;
    cfg.price_upper_bound = params.price_upper_bound;
    cfg.max_deviation_bps = params.max_deviation_bps;
    cfg.token_decimals = params.token_decimals;
    cfg.bump = ctx.bumps.oracle_config;
    cfg.total_minted = 0;
    cfg.total_redeemed = 0;

    emit!(PriceUpdatedEvent {
        oracle: cfg.key(),
        stablecoin_mint: cfg.stablecoin_mint,
        currency_code: cfg.currency_code,
        price_usd: cfg.price_usd,
        confidence: cfg.confidence,
        timestamp: now,
    });

    msg!(
        "Oracle initialized: currency={} feed={} price={} bounds=[{},{}] staleness={}s",
        cfg.currency_str(),
        params.switchboard_feed,
        params.initial_price,
        params.price_lower_bound,
        params.price_upper_bound,
        params.max_staleness,
    );

    Ok(())
}
