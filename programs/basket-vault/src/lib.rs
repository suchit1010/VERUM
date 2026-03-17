#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

pub use crate::instructions::*;

declare_id!("HJBBV5qRL9wQ1YmPtcPNESpEJJLVt9SyCnofmKi2PUCB");

#[program]
pub mod basket_vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        params: InitializeParams,
    ) -> Result<()> {
        instructions::initialize::initialize_handler(ctx, params)
    }

    pub fn register_asset(
        ctx: Context<RegisterAsset>,
        params: RegisterAssetParams,
    ) -> Result<()> {
        instructions::register_asset::register_asset_handler(ctx, params)
    }

    pub fn update_weights(
        ctx: Context<UpdateWeights>,
        params: UpdateWeightsParams,
    ) -> Result<()> {
        instructions::update_weights::update_weights_handler(ctx, params)
    }

    pub fn update_asset_price(
        ctx: Context<UpdateAssetPrice>,
        params: UpdateAssetPriceParams,
    ) -> Result<()> {
        instructions::update_asset_price::update_asset_price_handler(ctx, params)
    }

    pub fn update_asset_price_from_oracle(
        ctx: Context<UpdateAssetPriceFromOracle>,
        params: UpdateAssetPriceFromOracleParams,
    ) -> Result<()> {
        instructions::update_asset_price_from_oracle::update_asset_price_from_oracle_handler(ctx, params)
    }

    pub fn mint_against_collateral(
        ctx: Context<MintAgainstCollateral>,
        params: MintAgainstCollateralParams,
    ) -> Result<()> {
        instructions::mint_against_collateral::mint_against_collateral_handler(ctx, params)
    }

    pub fn set_crisis_mode(
        ctx: Context<SetCrisisMode>,
        enabled: bool,
    ) -> Result<()> {
        instructions::set_crisis_mode::set_crisis_mode_handler(ctx, enabled)
    }

    pub fn set_minting_paused(
        ctx: Context<SetMintingPaused>,
        paused: bool,
    ) -> Result<()> {
        instructions::set_minting_paused::set_minting_paused_handler(ctx, paused)
    }
}
