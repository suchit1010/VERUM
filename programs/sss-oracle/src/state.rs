use anchor_lang::prelude::*;

/// Per-stablecoin oracle configuration (PDA).
///
/// Seeds: `[b"oracle_cfg", stablecoin_mint]`
///
/// Stores the latest Switchboard-verified price and all configuration
/// needed to compute mint/redeem quotes without external calls.
#[account]
pub struct OracleConfig {
    /// Authority allowed to post price updates (the Switchboard keeper key).
    pub authority: Pubkey,

    /// The stablecoin mint this oracle prices.
    pub stablecoin_mint: Pubkey,

    /// Switchboard feed account address — stored for auditability.
    /// The keeper reads from this feed off-chain and posts verified prices on-chain.
    pub switchboard_feed: Pubkey,

    /// ISO 4217 currency code, null-padded to 8 bytes.
    /// Examples: b"EUR\0\0\0\0\0", b"BRL\0\0\0\0\0", b"JPY\0\0\0\0\0"
    pub currency_code: [u8; 8],

    /// Latest accepted price in micro-USD (1 USD = 1_000_000).
    /// Example: EUR/USD = 1.08 → price_usd = 1_080_000
    pub price_usd: i64,

    /// Oracle confidence interval (same scale as price_usd).
    /// From Switchboard's 95% confidence band.
    pub confidence: u64,

    /// Unix timestamp of the last accepted price update.
    pub last_update: i64,

    /// Maximum allowed age of a price before it is considered stale (seconds).
    /// Recommended: 60 for FX, 300 for CPI/slow-moving pegs.
    pub max_staleness: i64,

    /// Minimum sanity-check price (micro-USD). Prevents zero or negative prices.
    /// Example: 100_000 = $0.10 minimum
    pub price_lower_bound: i64,

    /// Maximum sanity-check price (micro-USD). Prevents obviously wrong prices.
    /// Example: 5_000_000 = $5.00 maximum (for a currency near parity with USD)
    pub price_upper_bound: i64,

    /// Maximum allowed single-update price deviation in basis points.
    /// Example: 500 = 5% max deviation per update.
    /// Prevents a compromised keeper from causing large single-step price jumps.
    pub max_deviation_bps: u16,

    /// Token decimal places (same as the stablecoin mint's decimals).
    /// Used for quote calculations.
    pub token_decimals: u8,

    /// PDA bump seed.
    pub bump: u8,

    /// Cumulative token units minted through this oracle (analytics).
    pub total_minted: u128,

    /// Cumulative token units redeemed through this oracle (analytics).
    pub total_redeemed: u128,
}

impl OracleConfig {
    pub const LEN: usize = 8    // discriminator
        + 32  // authority
        + 32  // stablecoin_mint
        + 32  // switchboard_feed
        + 8   // currency_code
        + 8   // price_usd
        + 8   // confidence
        + 8   // last_update
        + 8   // max_staleness
        + 8   // price_lower_bound
        + 8   // price_upper_bound
        + 2   // max_deviation_bps
        + 1   // token_decimals
        + 1   // bump
        + 16  // total_minted
        + 16; // total_redeemed

    /// Check if the cached price is within the staleness window.
    pub fn is_price_fresh(&self, now: i64) -> bool {
        now.saturating_sub(self.last_update) <= self.max_staleness
    }

    /// Decode the currency code as a UTF-8 string.
    pub fn currency_str(&self) -> String {
        String::from_utf8_lossy(&self.currency_code)
            .trim_end_matches('\0')
            .to_string()
    }
}