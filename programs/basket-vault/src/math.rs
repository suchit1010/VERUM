use anchor_lang::prelude::*;

/// Oracle Aggregator & Adaptive CR Math
/// Based on the VERUM Resilient Stablecoin Specification.

pub struct OraclePrice {
    pub price: u64,       // in micro-USD (1_000_000 = $1.00)
    pub confidence: u64,  // 95% confidence interval
    pub timestamp: i64,
}

pub struct BasketMath;

impl BasketMath {
    /// Calculate Adaptive Collateral Ratio based on Volatility Proxy (BTC confidence ratio)
    /// 
    /// Formula:
    /// vol_ratio = btc_conf / btc_price
    /// if vol_ratio < 0.005 (0.5%)   -> CR = 150%
    /// if 0.005 <= vol_ratio < 0.02  -> CR = 200%
    /// if vol_ratio >= 0.02 (2.0%)   -> CR = 300%
    pub fn calculate_adaptive_cr(btc_price: u64, btc_conf: u64) -> Result<u64> {
        require!(btc_price > 0, BasketError::InvalidPrice);
        
        // Multiply by 10_000 to get basis points precision (e.g. 50 bps = 0.5%)
        let vol_ratio_bps = (btc_conf.checked_mul(10_000).unwrap())
            .checked_div(btc_price)
            .unwrap();

        let cr_bps = if vol_ratio_bps < 50 {
            15000 // 150%
        } else if vol_ratio_bps < 200 {
            20000 // 200%
        } else {
            30000 // 300%
        };

        Ok(cr_bps)
    }

    /// Validates the price spread between Pyth and Switchboard.
    /// If spread is > 1.5%, we reject it (circuit breaker).
    /// Returns the lower median (safe path/conservative) of valid oracles.
    pub fn aggregate_prices(
        pyth_price: Option<OraclePrice>,
        switchboard_price: Option<OraclePrice>,
        max_staleness: i64,
        current_ts: i64,
    ) -> Result<u64> {
        let mut valid_prices = vec![];

        if let Some(p) = pyth_price {
            if current_ts - p.timestamp <= max_staleness {
                valid_prices.push(p.price);
            }
        }

        if let Some(s) = switchboard_price {
            if current_ts - s.timestamp <= max_staleness {
                valid_prices.push(s.price);
            }
        }

        require!(valid_prices.len() > 0, BasketError::NoValidOracles);

        if valid_prices.len() == 1 {
            return Ok(valid_prices[0]);
        }

        // Spread check between exactly two oracles here
        let p1 = valid_prices[0];
        let p2 = valid_prices[1];
        let max_p = p1.max(p2);
        let min_p = p1.min(p2);

        let spread_bps = (max_p.checked_sub(min_p).unwrap())
            .checked_mul(10_000)
            .unwrap()
            .checked_div(min_p)
            .unwrap();

        // 150 bps = 1.5%
        require!(spread_bps <= 150, BasketError::OracleSpreadTooHigh);

        // Lower median (conservative valuation)
        Ok(min_p)
    }

    /// Calculates graduation liquidation penalty based on Collateral Ratio (CR_BPS)
    /// Red zone (<= 100%): 8% penalty, 100% liqudation
    /// Orange zone (100% - 105%): 5% penalty, 25% max per tx
    /// Yellow zone (105% - 115%): 2% penalty
    pub fn calculate_liquidation_penalty(cr_bps: u64) -> Result<(u64, u64)> {
        // Returns (penalty_bps, max_liquidation_pct)
        if cr_bps <= 10000 {
            // RED ZONE
            Ok((800, 100)) // 8% penalty, 100% of position can be liquidated
        } else if cr_bps <= 10500 {
            // ORANGE ZONE
            Ok((500, 25))  // 5% penalty, 25% of position
        } else if cr_bps <= 11500 {
            // YELLOW ZONE
            Ok((200, 10))  // 2% penalty, 10% of position
        } else {
            err!(BasketError::PositionNotLiquidatable)
        }
    }
}

#[error_code]
pub enum BasketError {
    #[msg("Invalid price from oracle (zero or negative)")]
    InvalidPrice,
    #[msg("No valid oracles found or all oracles are stale")]
    NoValidOracles,
    #[msg("Oracle spread exceeds 1.5% maximum allowable deviation")]
    OracleSpreadTooHigh,
    #[msg("Position is healthy and cannot be liquidated")]
    PositionNotLiquidatable,
}
