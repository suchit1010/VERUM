use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use sss_common::seeds::*;

use crate::errors::SssError;
use crate::events::{RoleUpdated, AuthorityTransferred, MinterUpdated};
use crate::state::{StablecoinConfig, RoleConfig, MinterQuota};

/// Role types that can be updated
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum RoleType {
    Pauser,
    Burner,
    Blacklister,
    Seizer,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateRoleParams {
    pub role: RoleType,
    pub new_account: Pubkey,
}

// ─── Update Role ─────────────────────────────────────────────────

#[derive(Accounts)]
pub struct UpdateRole<'info> {
    /// Must be master authority
    pub authority: Signer<'info>,

    /// Stablecoin config (to verify compliance for SSS-2 roles)
    #[account(
        seeds = [SEED_CONFIG, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Role config to update
    #[account(
        mut,
        seeds = [SEED_ROLES, config.mint.as_ref()],
        bump = role_config.bump,
    )]
    pub role_config: Account<'info, RoleConfig>,
}

pub fn update_role_handler(ctx: Context<UpdateRole>, params: UpdateRoleParams) -> Result<()> {
    let role_config = &mut ctx.accounts.role_config;
    require!(
        role_config.is_master(&ctx.accounts.authority.key()),
        SssError::NotMasterAuthority
    );

    let config = &ctx.accounts.config;
    let clock = Clock::get()?;

    let role_name = match params.role {
        RoleType::Pauser => {
            role_config.pauser = params.new_account;
            "pauser"
        }
        RoleType::Burner => {
            role_config.burner = params.new_account;
            "burner"
        }
        RoleType::Blacklister => {
            require!(config.is_compliant(), SssError::ComplianceNotEnabled);
            role_config.blacklister = params.new_account;
            "blacklister"
        }
        RoleType::Seizer => {
            require!(config.enable_permanent_delegate, SssError::PermanentDelegateNotEnabled);
            role_config.seizer = params.new_account;
            "seizer"
        }
    };

    emit!(RoleUpdated {
        mint: config.mint,
        role: role_name.to_string(),
        account: params.new_account,
        granted: params.new_account != Pubkey::default(),
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Add Minter ──────────────────────────────────────────────────

#[derive(Accounts)]
pub struct AddMinter<'info> {
    /// Must be master authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Stablecoin config
    #[account(
        seeds = [SEED_CONFIG, mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Role config
    #[account(
        seeds = [SEED_ROLES, mint.key().as_ref()],
        bump = role_config.bump,
    )]
    pub role_config: Account<'info, RoleConfig>,

    /// The stablecoin mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// The minter being added
    /// CHECK: This is the minter's wallet address
    pub minter: UncheckedAccount<'info>,

    /// Minter quota PDA — newly created
    #[account(
        init,
        payer = authority,
        space = 8 + MinterQuota::INIT_SPACE,
        seeds = [SEED_MINTER, mint.key().as_ref(), minter.key().as_ref()],
        bump,
    )]
    pub minter_quota: Account<'info, MinterQuota>,

    pub system_program: Program<'info, System>,
}

pub fn add_minter_handler(ctx: Context<AddMinter>, quota: u64) -> Result<()> {
    let role_config = &ctx.accounts.role_config;
    require!(
        role_config.is_master(&ctx.accounts.authority.key()),
        SssError::NotMasterAuthority
    );

    let clock = Clock::get()?;

    let minter_quota = &mut ctx.accounts.minter_quota;
    minter_quota.mint = ctx.accounts.mint.key();
    minter_quota.minter = ctx.accounts.minter.key();
    minter_quota.quota = quota;
    minter_quota.minted = 0;
    minter_quota.active = true;
    minter_quota.bump = ctx.bumps.minter_quota;
    minter_quota.created_at = clock.unix_timestamp;

    emit!(MinterUpdated {
        mint: ctx.accounts.mint.key(),
        minter: ctx.accounts.minter.key(),
        quota,
        added: true,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Remove Minter ───────────────────────────────────────────────

#[derive(Accounts)]
pub struct RemoveMinter<'info> {
    /// Must be master authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Role config
    #[account(
        seeds = [SEED_ROLES, minter_quota.mint.as_ref()],
        bump = role_config.bump,
    )]
    pub role_config: Account<'info, RoleConfig>,

    /// Minter quota PDA to deactivate
    #[account(
        mut,
        seeds = [SEED_MINTER, minter_quota.mint.as_ref(), minter_quota.minter.as_ref()],
        bump = minter_quota.bump,
    )]
    pub minter_quota: Account<'info, MinterQuota>,
}

pub fn remove_minter_handler(ctx: Context<RemoveMinter>) -> Result<()> {
    let role_config = &ctx.accounts.role_config;
    require!(
        role_config.is_master(&ctx.accounts.authority.key()),
        SssError::NotMasterAuthority
    );

    let clock = Clock::get()?;
    let minter_quota = &mut ctx.accounts.minter_quota;
    minter_quota.active = false;

    emit!(MinterUpdated {
        mint: minter_quota.mint,
        minter: minter_quota.minter,
        quota: minter_quota.quota,
        added: false,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Transfer Authority ──────────────────────────────────────────

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    /// Current master authority
    pub authority: Signer<'info>,

    /// Stablecoin config
    #[account(
        mut,
        seeds = [SEED_CONFIG, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Role config
    #[account(
        mut,
        seeds = [SEED_ROLES, config.mint.as_ref()],
        bump = role_config.bump,
    )]
    pub role_config: Account<'info, RoleConfig>,

    /// New authority
    /// CHECK: The new master authority pubkey
    pub new_authority: UncheckedAccount<'info>,
}

pub fn transfer_authority_handler(ctx: Context<TransferAuthority>) -> Result<()> {
    let role_config = &mut ctx.accounts.role_config;
    require!(
        role_config.is_master(&ctx.accounts.authority.key()),
        SssError::NotMasterAuthority
    );

    let clock = Clock::get()?;
    let old_authority = role_config.master_authority;
    let new_authority = ctx.accounts.new_authority.key();

    role_config.master_authority = new_authority;
    ctx.accounts.config.authority = new_authority;

    emit!(AuthorityTransferred {
        mint: ctx.accounts.config.mint,
        old_authority,
        new_authority,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
