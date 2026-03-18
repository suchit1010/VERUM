// instructions/rebalance_weights.rs
use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::VaultError;

pub const REBALANCE_INTERVAL: i64 = 90 * 24 * 60 * 60;
pub const MAX_SHIFT_BPS:      u16 = 500;
pub const MAX_WEIGHT_BPS:     u16 = 3_500;
pub const MIN_WEIGHT_BPS:     u16 = 500;

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct WeightProposal {
    pub weights:       Vec<u16>,   // bps, must sum to 10_000
    pub job_timestamp: i64,        // Chainlink Functions job execution time
    pub request_id:    [u8; 32],   // Chainlink request ID — audit trail
}

#[derive(Accounts)]
pub struct RebalanceWeights<'info> {
    pub rebalance_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED], bump,
        constraint = global_config.rebalance_authority == rebalance_authority.key()
            @ VaultError::UnauthorizedRebalance,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handler(ctx: Context<RebalanceWeights>, p: WeightProposal) -> Result<()> {
    let clock  = Clock::get()?;
    let config = &mut ctx.accounts.global_config;

    // 90-day interval
    require!(
        clock.unix_timestamp - config.last_rebalance_timestamp >= REBALANCE_INTERVAL,
        VaultError::RebalanceTooFrequent
    );

    // Proposal freshness <24h
    require!(
        clock.unix_timestamp - p.job_timestamp <= 86_400,
        VaultError::StaleWeightProposal
    );

    require!(p.weights.len() == config.asset_registry.len(), VaultError::WeightCountMismatch);

    for (i, &w) in p.weights.iter().enumerate() {
        let old = config.asset_registry[i].weight_bps;
        require!(w >= MIN_WEIGHT_BPS, VaultError::WeightBelowMinimum);
        require!(w <= MAX_WEIGHT_BPS, VaultError::WeightAboveMaximum);
        let shift = (w as i32 - old as i32).unsigned_abs() as u16;
        require!(shift <= MAX_SHIFT_BPS, VaultError::WeightShiftTooLarge);
    }

    let total: u32 = p.weights.iter().map(|&w| w as u32).sum();
    require!(total == 10_000, VaultError::WeightsDontSumToFull);

    for (i, &w) in p.weights.iter().enumerate() {
        msg!("Asset {} weight: {} → {}", i, config.asset_registry[i].weight_bps, w);
        config.asset_registry[i].weight_bps = w;
    }

    config.last_rebalance_timestamp  = clock.unix_timestamp;
    config.last_rebalance_request_id = p.request_id;

    emit!(RebalanceEvent {
        new_weights: p.weights,
        job_ts:      p.job_timestamp,
        request_id:  p.request_id,
        executed_at: clock.unix_timestamp,
    });
    Ok(())
}

#[event]
pub struct RebalanceEvent {
    pub new_weights: Vec<u16>,
    pub job_ts:      i64,
    pub request_id:  [u8; 32],
    pub executed_at: i64,
}
