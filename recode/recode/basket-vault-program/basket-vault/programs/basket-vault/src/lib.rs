// programs/basket-vault/src/lib.rs
//
// BasketVault — Anchor program entry point.
// Wires all instructions. SSS SDK is Layer 1 (untouched).
// This is Layer 2: collateral management, oracle aggregation, CR gating.

use anchor_lang::prelude::*;

pub mod state;
pub mod oracle;
pub mod oracle_aggregator;
pub mod cpi_interface;
pub mod errors;
pub mod instructions;

use instructions::initialize::*;
use instructions::init_collateral_vault::*;
use instructions::deposit_collateral::*;
use instructions::withdraw_collateral::*;
use instructions::mint_basket::*;
use instructions::rebalance_weights::*;
use instructions::emergency::*;

// Replace with your deployed program ID after `anchor build`
declare_id!("BASKETvau1tXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod basket_vault {
    use super::*;

    /// One-time protocol setup. Transfers BASKET mint authority to vault PDA.
    pub fn initialize(
        ctx: Context<Initialize>,
        config_data: InitConfig,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, config_data)
    }

    /// Create vault token account for one collateral asset. Call once per asset.
    pub fn init_collateral_vault(
        ctx: Context<InitCollateralVault>,
    ) -> Result<()> {
        instructions::init_collateral_vault::handler(ctx)
    }

    /// Deposit SPL collateral tokens into the vault.
    /// Creates UserPosition account on first call for this (user, asset) pair.
    pub fn deposit_collateral(
        ctx: Context<DepositCollateral>,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit_collateral::handler(ctx, amount)
    }

    /// Withdraw SPL collateral tokens back to user.
    /// Vault PDA signs the outbound transfer.
    pub fn withdraw_collateral(
        ctx: Context<WithdrawCollateral>,
        amount: u64,
        vault_authority_bump: u8,
    ) -> Result<()> {
        instructions::withdraw_collateral::handler(ctx, amount, vault_authority_bump)
    }

    /// Core mint flow:
    ///   1. Fetch Pyth prices (passed via remaining_accounts, one per asset)
    ///   2. Compute adaptive CR from BTC vol proxy
    ///   3. Check basket_value >= desired × CR
    ///   4. CPI to SSS::mint_tokens
    ///
    /// remaining_accounts must contain one PriceUpdateV2 account per asset
    /// in the same order as global_config.asset_registry.
    pub fn mint_basket(
        ctx: Context<MintBasket>,
        collateral_amounts: Vec<u64>,
        desired_amount: u64,
    ) -> Result<()> {
        instructions::mint_basket::handler(ctx, collateral_amounts, desired_amount)
    }

    /// Submit quarterly rebalance from Chainlink Functions job result.
    /// Caller must be the designated rebalance_authority.
    pub fn rebalance_weights(
        ctx: Context<RebalanceWeights>,
        proposal: WeightProposal,
    ) -> Result<()> {
        instructions::rebalance_weights::handler(ctx, proposal)
    }

    /// Toggle emergency mode. Only emergency_authority can call.
    /// When active: mints and deposits are paused; withdrawals remain open.
    pub fn set_emergency_mode(
        ctx: Context<SetEmergencyMode>,
        active: bool,
    ) -> Result<()> {
        instructions::emergency::handler(ctx, active)
    }
}
