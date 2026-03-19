// redeem_basket.rs
//
// Burns BASKET tokens → redeems pro-rata share of each SVS-1 vault.
// Withdrawals always open — even in emergency mode.

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::state::*;
use crate::sss_interface;
use crate::svs_interface;
use crate::errors::VaultError;

pub const REDEEM_FEE_BPS: u64 = 10; // 0.1%

#[derive(Accounts)]
pub struct RedeemBasket<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_CONFIG_SEED], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    /// CHECK: PDA
    #[account(seeds = [VAULT_AUTH_SEED], bump = global_config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut, address = global_config.basket_mint)]
    pub basket_mint: Account<'info, Mint>,

    /// User's BASKET account — burned here
    #[account(mut, token::mint = basket_mint, token::authority = user)]
    pub user_basket_account: Account<'info, TokenAccount>,

    /// CHECK: SSS program — for burn CPI
    #[account(address = global_config.sss_program)]
    pub sss_program: UncheckedAccount<'info>,

    /// CHECK: SVS-1 program — for redeem CPIs
    #[account(address = global_config.svs_program)]
    pub svs_program: UncheckedAccount<'info>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,

    // remaining_accounts: for each asset (in registry order):
    //   svs_vault           [writable]
    //   user_asset_account  [writable]
    //   vault_asset_account [writable]
    //   user_shares_account [writable]
    //   shares_mint         [writable]
    //   token_owner_pda     [readonly]
    // = 6 accounts × N assets
}

pub fn handler(
    ctx: Context<RedeemBasket>,
    basket_amount: u64,
    min_assets_per_vault: Vec<u64>,  // slippage protection per asset
) -> Result<()> {
    require!(basket_amount > 0, VaultError::ZeroAmount);
    require!(ctx.accounts.user_basket_account.amount >= basket_amount, VaultError::InsufficientBalance);

    let config   = &ctx.accounts.global_config;
    let registry = &config.asset_registry;
    let n        = registry.len();

    require!(min_assets_per_vault.len() == n, VaultError::AssetCountMismatch);
    require!(ctx.remaining_accounts.len() >= n * 6, VaultError::MissingOracleAccounts);

    // ── 1. Burn BASKET first ───────────────────────────────────────────────
    sss_interface::cpi_burn(
        ctx.accounts.sss_program.to_account_info(),
        ctx.accounts.basket_mint.to_account_info(),
        ctx.accounts.user_basket_account.to_account_info(),
        ctx.accounts.user.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        basket_amount,
    )?;

    // ── 2. Calculate pro-rata shares to redeem per vault ──────────────────
    // shares_to_redeem[i] = (basket_amount / total_supply) × vault_shares_balance
    // For MVP: use weight-proportional redemption
    // In production: track user's share positions per vault

    let fee           = basket_amount.saturating_mul(REDEEM_FEE_BPS) / 10_000;
    let net_basket    = basket_amount.checked_sub(fee).ok_or(error!(VaultError::MathOverflow))?;
    let total_supply  = ctx.accounts.basket_mint.supply.max(1);

    // ── 3. Redeem from each SVS-1 vault ───────────────────────────────────
    for (i, _asset) in registry.iter().enumerate() {
        let base = i * 6;
        let svs_vault    = ctx.remaining_accounts[base + 0].clone();
        let user_assets  = ctx.remaining_accounts[base + 1].clone();
        let vault_assets = ctx.remaining_accounts[base + 2].clone();
        let user_shares  = ctx.remaining_accounts[base + 3].clone();
        let shares_mint  = ctx.remaining_accounts[base + 4].clone();
        let tok_owner    = ctx.remaining_accounts[base + 5].clone();

        // Pro-rata shares: how many SVS share tokens to burn
        // (This is simplified — in production track per-user share balances)
        let user_shares_acct = TokenAccount::try_from(&user_shares)?;
        let user_share_bal   = user_shares_acct.amount;

        let shares_to_redeem = (user_share_bal as u128)
            .checked_mul(net_basket as u128).ok_or(error!(VaultError::MathOverflow))?
            .checked_div(total_supply as u128).ok_or(error!(VaultError::MathOverflow))? as u64;

        if shares_to_redeem == 0 { continue; }

        svs_interface::cpi_redeem(
            svs_vault,
            user_assets,
            vault_assets,
            user_shares,
            shares_mint,
            tok_owner,
            ctx.accounts.user.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            shares_to_redeem,
            min_assets_per_vault[i],
        )?;
    }

    // ── 4. Update state ────────────────────────────────────────────────────
    let config = &mut ctx.accounts.global_config;
    config.total_minted = config.total_minted.saturating_sub(basket_amount);
    config.insurance_fund_lamports = config.insurance_fund_lamports.saturating_add(fee);

    emit!(RedeemEvent {
        user:            ctx.accounts.user.key(),
        basket_burned:   basket_amount,
        fee,
        timestamp:       Clock::get()?.unix_timestamp,
    });

    msg!("Redeemed {} BASKET | fee={}", basket_amount, fee);
    Ok(())
}

#[event]
pub struct RedeemEvent {
    pub user:          Pubkey,
    pub basket_burned: u64,
    pub fee:           u64,
    pub timestamp:     i64,
}
