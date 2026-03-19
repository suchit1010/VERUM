#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

pub use crate::instructions::*;
pub use crate::instructions::initialize::{InitOracleParams, InitializeOracle};
pub use crate::instructions::quote::GetQuote;
pub use crate::instructions::transfer_authority::TransferOracleAuthority;
pub use crate::instructions::update_price::UpdatePrice;

declare_id!("hntKYM3tbdSnAzYaSU1FvDpFoE8wwBRvY3hpsMHhrN6");

#[program]
pub mod sss_oracle {
    use super::*;

    /// Initialize a price oracle for a stablecoin.
    ///
    /// Creates an `OracleConfig` PDA that stores Switchboard feed metadata
    /// and the latest verified price. One oracle per stablecoin mint.
    ///
    /// # Arguments
    /// * `params` — currency code, Switchboard feed address, bounds, staleness window
    pub fn initialize_oracle(
        ctx: Context<InitializeOracle>,
        params: InitOracleParams,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Post a verified price update from the Switchboard keeper.
    ///
    /// Called by the off-chain keeper service after reading from Switchboard.
    /// Enforces staleness, sanity bounds, and maximum single-update deviation.
    ///
    /// # Arguments
    /// * `price`      — price in micro-USD (1 USD = 1_000_000). E.g. EUR/USD=1.08 → 1_080_000
    /// * `confidence` — 95% confidence interval from Switchboard (same units)
    /// * `timestamp`  — Switchboard-reported slot timestamp (unix seconds)
    pub fn update_price(
        ctx: Context<UpdatePrice>,
        price: i64,
        confidence: u64,
        timestamp: i64,
    ) -> Result<()> {
        instructions::update_price::handler(ctx, price, confidence, timestamp)
    }

    /// Compute how many tokens to mint for a given USD input.
    ///
    /// `token_amount = (usd_input * 10^decimals) / price_usd`
    ///
    /// Emits a `MintQuoteEvent` — read via `simulateTransaction` or event parsing.
    /// Also increments the oracle's `total_minted` analytics counter.
    ///
    /// # Arguments
    /// * `usd_input` — USD amount in micro-units (1 USD = 1_000_000)
    pub fn mint_quote(
        ctx: Context<GetQuote>,
        usd_input: u64,
    ) -> Result<()> {
        instructions::quote::mint_quote_handler(ctx, usd_input)
    }

    /// Compute how much USD is owed for a token redemption.
    ///
    /// `usd_output = (token_amount * price_usd) / 10^decimals`
    ///
    /// Emits a `RedeemQuoteEvent` — read via `simulateTransaction` or event parsing.
    /// Also increments the oracle's `total_redeemed` analytics counter.
    ///
    /// # Arguments
    /// * `token_amount` — token amount in base units (e.g. 1_000_000 = 1 token @ 6 decimals)
    pub fn redeem_quote(
        ctx: Context<GetQuote>,
        token_amount: u64,
    ) -> Result<()> {
        instructions::quote::redeem_quote_handler(ctx, token_amount)
    }

    /// Transfer oracle authority to a new key.
    ///
    /// Used when rotating the keeper key. Requires current authority signature.
    pub fn transfer_oracle_authority(
        ctx: Context<TransferOracleAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::transfer_authority::handler(ctx, new_authority)
    }
}
