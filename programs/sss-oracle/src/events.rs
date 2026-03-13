use anchor_lang::prelude::*;

/// Emitted whenever the oracle keeper successfully posts a new price.
#[event]
pub struct PriceUpdatedEvent {
    /// Oracle config PDA.
    pub oracle: Pubkey,
    /// The stablecoin mint being priced.
    pub stablecoin_mint: Pubkey,
    /// ISO 4217 currency code (null-padded, e.g. b"EUR\0\0\0\0\0").
    pub currency_code: [u8; 8],
    /// New price in micro-USD (1 USD = 1_000_000).
    pub price_usd: i64,
    /// Oracle confidence interval (same units as price_usd).
    pub confidence: u64,
    /// Switchboard-reported timestamp for this price (unix seconds).
    pub timestamp: i64,
}

/// Emitted by `mint_quote`. Readable via `simulateTransaction` or event logs.
///
/// The TypeScript SDK calls `mint_quote` via simulation and parses this event
/// to get the exact token amount without submitting a real transaction.
#[event]
pub struct MintQuoteEvent {
    /// Oracle config PDA.
    pub oracle: Pubkey,
    /// USD input amount (micro-USD).
    pub usd_input: u64,
    /// Token output amount (in token base units, e.g. 1_000_000 = 1 token @ 6 decimals).
    pub token_amount: u64,
    /// Price used for the calculation (micro-USD per token).
    pub price_used: i64,
    /// Unix timestamp after which this quote should be re-fetched.
    pub expires_at: i64,
}

/// Emitted by `redeem_quote`. Readable via `simulateTransaction` or event logs.
#[event]
pub struct RedeemQuoteEvent {
    /// Oracle config PDA.
    pub oracle: Pubkey,
    /// Token input amount (base units).
    pub token_amount: u64,
    /// USD output amount (micro-USD).
    pub usd_output: u64,
    /// Price used for the calculation (micro-USD per token).
    pub price_used: i64,
    /// Unix timestamp after which this quote should be re-fetched.
    pub expires_at: i64,
}

/// Emitted when oracle authority is transferred to a new key.
#[event]
pub struct OracleAuthorityTransferredEvent {
    /// Oracle config PDA.
    pub oracle: Pubkey,
    /// Previous authority.
    pub old_authority: Pubkey,
    /// New authority.
    pub new_authority: Pubkey,
}
