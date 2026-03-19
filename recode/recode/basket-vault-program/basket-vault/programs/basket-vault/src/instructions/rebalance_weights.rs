// programs/basket-vault/src/instructions/rebalance_weights.rs
//
// Quarterly weight rebalancing via Chainlink Functions proposal.
// Phase 1: multisig submits verified weights.
// Phase 2: DAO program calls this directly.

use anchor_lang::prelude::*;
use crate::state::{GlobalConfig, GLOBAL_CONFIG_SEED};
use crate::errors::VaultError;

pub const REBALANCE_INTERVAL_SECS: i64  = 90 * 24 * 60 * 60; // 90 days
pub const MAX_WEIGHT_SHIFT_BPS: u16     = 500;   // 5% max shift per quarter
pub const MAX_SINGLE_WEIGHT_BPS: u16    = 3_500; // 35% cap on any single asset
pub const MIN_SINGLE_WEIGHT_BPS: u16    = 500;   // 5% floor

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct WeightProposal {
    /// New weights in bps for each asset (must sum to exactly 10_000)
    pub weights: Vec<u16>,

    /// Unix timestamp of the Chainlink Functions job execution
    pub job_timestamp: i64,

    /// Chainlink Functions request ID — stored for audit trail
    pub request_id: [u8; 32],
}

#[derive(Accounts)]
pub struct RebalanceWeights<'info> {
    /// Must be the designated rebalance authority
    pub rebalance_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump,
        constraint = global_config.rebalance_authority == rebalance_authority.key()
            @ VaultError::UnauthorizedRebalance,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handler(
    ctx: Context<RebalanceWeights>,
    proposal: WeightProposal,
) -> Result<()> {
    let clock  = Clock::get()?;
    let config = &mut ctx.accounts.global_config;

    // ── 1. Enforce 90-day interval ────────────────────────────────────────
    let elapsed = clock.unix_timestamp
        .checked_sub(config.last_rebalance_timestamp)
        .unwrap_or(0);
    require!(elapsed >= REBALANCE_INTERVAL_SECS, VaultError::RebalanceTooFrequent);

    // ── 2. Proposal freshness (<24h old) ─────────────────────────────────
    let job_age = clock.unix_timestamp
        .checked_sub(proposal.job_timestamp)
        .unwrap_or(i64::MAX);
    require!(job_age <= 86_400, VaultError::StaleWeightProposal);

    // ── 3. Count matches registry ─────────────────────────────────────────
    require!(
        proposal.weights.len() == config.asset_registry.len(),
        VaultError::WeightCountMismatch
    );

    // ── 4. Per-weight validation ──────────────────────────────────────────
    for (i, &new_weight) in proposal.weights.iter().enumerate() {
        let old_weight = config.asset_registry[i].weight_bps;

        require!(new_weight >= MIN_SINGLE_WEIGHT_BPS, VaultError::WeightBelowMinimum);
        require!(new_weight <= MAX_SINGLE_WEIGHT_BPS, VaultError::WeightAboveMaximum);

        let shift = (new_weight as i32 - old_weight as i32).unsigned_abs() as u16;
        require!(shift <= MAX_WEIGHT_SHIFT_BPS, VaultError::WeightShiftTooLarge);
    }

    // ── 5. Sum to 10_000 ─────────────────────────────────────────────────
    let total: u32 = proposal.weights.iter().map(|&w| w as u32).sum();
    require!(total == 10_000, VaultError::WeightsDontSumToFull);

    // ── 6. Apply weights ──────────────────────────────────────────────────
    for (i, &new_weight) in proposal.weights.iter().enumerate() {
        let old = config.asset_registry[i].weight_bps;
        config.asset_registry[i].weight_bps = new_weight;
        msg!("Asset {}: {} bps → {} bps", i, old, new_weight);
    }

    config.last_rebalance_timestamp  = clock.unix_timestamp;
    config.last_rebalance_request_id = proposal.request_id;

    emit!(RebalanceEvent {
        new_weights:   proposal.weights.clone(),
        job_timestamp: proposal.job_timestamp,
        request_id:    proposal.request_id,
        executed_at:   clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct RebalanceEvent {
    pub new_weights:   Vec<u16>,
    pub job_timestamp: i64,
    pub request_id:    [u8; 32],
    pub executed_at:   i64,
}
