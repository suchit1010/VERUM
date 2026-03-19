use anchor_lang::prelude::*;

#[error_code]
pub enum OracleError {
    /// The cached price is older than `max_staleness` seconds.
    /// The keeper must call `update_price` before quotes can be computed.
    #[msg("Price data is stale — keeper must push a fresh Switchboard price update")]
    StalePrice,

    /// The posted price is below `price_lower_bound` or above `price_upper_bound`.
    /// Indicates either a misconfigured oracle or a bad feed.
    #[msg("Price is outside the configured sanity bounds (lower/upper)")]
    PriceOutOfBounds,

    /// The new price deviates from the current cached price by more than `max_deviation_bps`.
    /// Protects against large single-step price manipulation by a compromised keeper.
    #[msg("Price update deviation exceeds max_deviation_bps — possible manipulation")]
    DeviationTooLarge,

    /// The `timestamp` argument is not strictly more recent than `last_update`.
    /// Prevents replay attacks with stale price data.
    #[msg("Timestamp must be strictly more recent than the current cached price timestamp")]
    InvalidTimestamp,

    /// Price must be a positive integer in micro-USD.
    #[msg("Price must be positive (micro-USD)")]
    InvalidPrice,

    /// Integer overflow in mint/redeem quote computation.
    #[msg("Arithmetic overflow in quote calculation")]
    MathOverflow,

    /// Caller is not the `authority` stored in the oracle config.
    #[msg("Unauthorized — must be signed by the oracle authority")]
    Unauthorized,

    /// Attempted to initialize with lower_bound >= upper_bound.
    #[msg("price_lower_bound must be strictly less than price_upper_bound")]
    InvalidBounds,

    /// max_staleness must be positive.
    #[msg("max_staleness must be greater than zero")]
    InvalidStaleness,
}
