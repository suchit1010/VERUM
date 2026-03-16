use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{
    errors::BasketVaultError,
    events::GlobalConfigInitialized,
    state::{GlobalConfig, SEED_BASKET_CONFIG},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeParams {
    pub base_cr_bps: u16,
    pub crisis_cr_bps: u16,
    pub max_weight_step_bps: u16,
    pub rebalance_cooldown_slots: u64,
    pub max_price_age_secs: i64,
    pub max_oracle_confidence_bps: u16,
    pub max_mint_per_tx: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub authority: Signer<'info>,

    pub basket_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: validated by governance and CPI wiring at integration time
    pub sss_program: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = GlobalConfig::LEN,
        seeds = [SEED_BASKET_CONFIG, basket_mint.key().as_ref()],
        bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(params.base_cr_bps >= 10_000, BasketVaultError::InvalidAssetMinCr);
    require!(params.crisis_cr_bps >= params.base_cr_bps, BasketVaultError::InvalidAssetMinCr);
    require!(params.max_weight_step_bps > 0, BasketVaultError::InvalidAssetWeight);
    require!(params.max_price_age_secs > 0, BasketVaultError::InvalidOraclePrice);
    require!(params.max_oracle_confidence_bps > 0, BasketVaultError::OracleConfidenceTooWide);
    require!(params.max_mint_per_tx > 0, BasketVaultError::MintAmountTooLarge);

    let cfg = &mut ctx.accounts.global_config;
    cfg.authority = ctx.accounts.authority.key();
    cfg.basket_mint = ctx.accounts.basket_mint.key();
    cfg.sss_program = ctx.accounts.sss_program.key();
    cfg.base_cr_bps = params.base_cr_bps;
    cfg.crisis_cr_bps = params.crisis_cr_bps;
    cfg.max_weight_step_bps = params.max_weight_step_bps;
    cfg.default_price_max_age_secs = params.max_price_age_secs;
    cfg.max_oracle_confidence_bps = params.max_oracle_confidence_bps;
    cfg.max_mint_per_tx = params.max_mint_per_tx;
    cfg.minting_paused = false;
    cfg.rebalance_cooldown_slots = params.rebalance_cooldown_slots;
    cfg.last_rebalance_slot = 0;
    cfg.emergency_mode = false;
    cfg.assets = Vec::new();
    cfg.bump = ctx.bumps.global_config;

    emit!(GlobalConfigInitialized {
        authority: cfg.authority,
        basket_mint: cfg.basket_mint,
        sss_program: cfg.sss_program,
        base_cr_bps: cfg.base_cr_bps,
        crisis_cr_bps: cfg.crisis_cr_bps,
        max_weight_step_bps: cfg.max_weight_step_bps,
        default_price_max_age_secs: cfg.default_price_max_age_secs,
        max_oracle_confidence_bps: cfg.max_oracle_confidence_bps,
        max_mint_per_tx: cfg.max_mint_per_tx,
        rebalance_cooldown_slots: cfg.rebalance_cooldown_slots,
    });

    Ok(())
}
