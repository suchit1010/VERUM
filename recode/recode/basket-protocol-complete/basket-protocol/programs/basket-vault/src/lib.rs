// programs/basket-vault/src/lib.rs
//
// BasketVault — Layer 2 on top of:
//   SSS (suchit1010) → BASKET mint/burn
//   SVS-1 (solanabr) → ERC-4626 collateral vaults

use anchor_lang::prelude::*;

pub mod errors;
pub mod state;
pub mod oracle;
pub mod oracle_aggregator;
pub mod svs_interface;
pub mod sss_interface;
pub mod instructions;

use instructions::initialize::*;
use instructions::mint_basket::*;
use instructions::redeem_basket::*;
use instructions::rebalance_weights::*;
use instructions::emergency::*;

// ── Replace after `anchor build && anchor deploy` ─────────────────────────────
declare_id!("BASKETvau1tXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod basket_vault {
    use super::*;

    /// One-time setup. Transfers BASKET mint authority to vault PDA.
    pub fn initialize(ctx: Context<Initialize>, cfg: InitConfig) -> Result<()> {
        instructions::initialize::handler(ctx, cfg)
    }

    /// Mint BASKET against deposited SVS-1 collateral.
    ///
    /// remaining_accounts (in registry order, repeated twice):
    ///   [0..N]  Pyth PriceUpdateV2 accounts
    ///   [N..2N] SVS-1 vault accounts
    pub fn mint_basket(ctx: Context<MintBasket>, desired_amount: u64) -> Result<()> {
        instructions::mint_basket::handler(ctx, desired_amount)
    }

    /// Burn BASKET → redeem pro-rata collateral from SVS-1 vaults.
    /// Always available — even in emergency mode.
    ///
    /// remaining_accounts per asset (6 × N assets):
    ///   svs_vault, user_asset_account, vault_asset_account,
    ///   user_shares_account, shares_mint, token_owner_pda
    pub fn redeem_basket(
        ctx: Context<RedeemBasket>,
        basket_amount: u64,
        min_assets_per_vault: Vec<u64>,
    ) -> Result<()> {
        instructions::redeem_basket::handler(ctx, basket_amount, min_assets_per_vault)
    }

    /// Submit quarterly Chainlink Functions weight proposal.
    /// Caller must be rebalance_authority.
    pub fn rebalance_weights(
        ctx: Context<RebalanceWeights>,
        proposal: WeightProposal,
    ) -> Result<()> {
        instructions::rebalance_weights::handler(ctx, proposal)
    }

    /// Toggle emergency mode. Pauses mints; withdrawals stay open.
    pub fn set_emergency_mode(ctx: Context<SetEmergencyMode>, active: bool) -> Result<()> {
        instructions::emergency::handler(ctx, active)
    }
}
