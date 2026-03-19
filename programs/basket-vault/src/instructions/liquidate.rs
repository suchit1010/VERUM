use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::*;
use crate::errors::VaultError;
use crate::math::BasketMath;

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub target_position: Account<'info, UserPosition>, // Assuming a UserPosition struct exists to map debt to collateral

    /// The token account holding the BASKET tokens the liquidator is repaying
    #[account(mut)]
    pub liquidator_basket_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub basket_mint: Account<'info, Mint>,

    /// The insurance fund BASKET/USDC repository
    #[account(mut)]
    pub insurance_fund: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Graduated liquidation engine based on the mathematical CR calculations.
pub fn handler(ctx: Context<Liquidate>, repay_amount: u64) -> Result<()> {
    let position = &mut ctx.accounts.target_position;
    
    // 1. Calculate actual CR of the position using existing oracle integration
    // For MVP demonstration, assume we have fetched the latest asset values 
    // and total debt.
    let position_cr_bps = position.collateral_ratio_bps(); // Placeholder function on `UserPosition`
    
    // 2. Determine liquidation parameters from the math engine
    let (penalty_bps, max_liquidation_pct) = BasketMath::calculate_liquidation_penalty(position_cr_bps)?;

    // 3. Enforce circuit breakers
    // E.g. Cannot liquidate more than max_liquidation_pct of the position
    let max_allowable_repay = (position.debt * max_liquidation_pct) / 100;
    let actual_repay = repay_amount.min(max_allowable_repay);

    require!(actual_repay > 0, VaultError::MathOverflow);
    
    // 4. Calculate distributions
    // collateral_seized = actual_repay + penalty
    let penalty_amount = (actual_repay * penalty_bps) / 10_000;
    let collateral_to_seize = actual_repay + penalty_amount;

    require!(collateral_to_seize <= position.collateral_value, VaultError::InsufficientCollateralForLiquidation);

    // Split the penalty:
    // 50% Liquidator, 30% Insurance, 20% Burned
    let _liquidator_reward = actual_repay + (penalty_amount * 50 / 100);
    let insurance_cut = penalty_amount * 30 / 100;
    let _burn_cut = penalty_amount - (penalty_amount * 50 / 100) - insurance_cut;

    // 5. Apply state changes 
    position.debt = position.debt.checked_sub(actual_repay).unwrap();
    // Reduce collateral value directly or through SVS-1 vault tokens withdrawal
    position.collateral_value = position.collateral_value.checked_sub(collateral_to_seize).unwrap();

    // 6. Perform the transfers
    // Transfer `actual_repay` + `burn_cut` from liquidator to the protocol/burn address
    // Transfer `insurance_cut` to the insurance fund
    
    emit!(LiquidationEvent {
        position_owner: position.owner,
        liquidator: ctx.accounts.liquidator.key(),
        debt_repaid: actual_repay,
        penalty_charged: penalty_amount,
        cr_at_liquidation: position_cr_bps,
    });

    Ok(())
}

#[event]
pub struct LiquidationEvent {
    pub position_owner: Pubkey,
    pub liquidator: Pubkey,
    pub debt_repaid: u64,
    pub penalty_charged: u64,
    pub cr_at_liquidation: u64,
}
