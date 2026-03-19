use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use sss_common::seeds::*;

use crate::errors::SssError;
use crate::events::{AddressBlacklisted, AddressUnblacklisted, TokensSeized};
use crate::state::{StablecoinConfig, RoleConfig, BlacklistEntry};

// ─── Add to Blacklist (SSS-2) ────────────────────────────────────

#[derive(Accounts)]
pub struct AddToBlacklist<'info> {
    /// Blacklister authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Stablecoin config — must have compliance enabled
    #[account(
        seeds = [SEED_CONFIG, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Role config
    #[account(
        seeds = [SEED_ROLES, config.mint.as_ref()],
        bump = role_config.bump,
    )]
    pub role_config: Account<'info, RoleConfig>,

    /// The address being blacklisted
    /// CHECK: This is just the pubkey we're blacklisting
    pub address_to_blacklist: UncheckedAccount<'info>,

    /// Blacklist entry PDA — newly created
    #[account(
        init,
        payer = authority,
        space = 8 + BlacklistEntry::INIT_SPACE,
        seeds = [SEED_BLACKLIST, config.mint.as_ref(), address_to_blacklist.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist_handler(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
    // Feature gate: must be SSS-2
    let config = &ctx.accounts.config;
    require!(config.is_compliant(), SssError::ComplianceNotEnabled);

    // Role check
    let role_config = &ctx.accounts.role_config;
    require!(
        role_config.is_blacklister(&ctx.accounts.authority.key()),
        SssError::NotBlacklister
    );

    // Validate reason
    require!(
        !reason.is_empty() && reason.len() <= 128,
        SssError::InvalidReason
    );

    let clock = Clock::get()?;

    // Initialize blacklist entry
    let entry = &mut ctx.accounts.blacklist_entry;
    entry.mint = config.mint;
    entry.address = ctx.accounts.address_to_blacklist.key();
    entry.reason = reason.clone();
    entry.blacklisted_by = ctx.accounts.authority.key();
    entry.blacklisted_at = clock.unix_timestamp;
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(AddressBlacklisted {
        mint: config.mint,
        address: ctx.accounts.address_to_blacklist.key(),
        reason,
        blacklister: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Remove from Blacklist (SSS-2) ──────────────────────────────

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    /// Blacklister authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Stablecoin config
    #[account(
        seeds = [SEED_CONFIG, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Role config
    #[account(
        seeds = [SEED_ROLES, config.mint.as_ref()],
        bump = role_config.bump,
    )]
    pub role_config: Account<'info, RoleConfig>,

    /// Blacklist entry PDA — will be closed (rent returned to authority)
    #[account(
        mut,
        close = authority,
        seeds = [SEED_BLACKLIST, config.mint.as_ref(), blacklist_entry.address.as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn remove_from_blacklist_handler(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(config.is_compliant(), SssError::ComplianceNotEnabled);

    let role_config = &ctx.accounts.role_config;
    require!(
        role_config.is_blacklister(&ctx.accounts.authority.key()),
        SssError::NotBlacklister
    );

    let clock = Clock::get()?;

    emit!(AddressUnblacklisted {
        mint: config.mint,
        address: ctx.accounts.blacklist_entry.address,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    // Account is closed via the `close` constraint — rent returned to authority

    Ok(())
}

// ─── Seize Tokens (SSS-2, Permanent Delegate) ───────────────────

#[derive(Accounts)]
pub struct Seize<'info> {
    /// Seizer authority
    pub authority: Signer<'info>,

    /// Stablecoin config PDA (permanent delegate authority)
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
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Source token account (the account being seized from)
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub from_account: InterfaceAccount<'info, TokenAccount>,

    /// Destination token account (treasury receiving seized tokens)
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub to_account: InterfaceAccount<'info, TokenAccount>,

    /// Token-2022 program
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn seize_handler<'info>(ctx: Context<'_, '_, '_, 'info, Seize<'info>>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::InvalidAmount);

    // Feature gate: must have permanent delegate enabled
    let config = &ctx.accounts.config;
    require!(config.enable_permanent_delegate, SssError::PermanentDelegateNotEnabled);

    // Role check: must be seizer
    let role_config = &ctx.accounts.role_config;
    require!(
        role_config.is_seizer(&ctx.accounts.authority.key()),
        SssError::NotSeizer
    );

    let clock = Clock::get()?;
    let mint_key = ctx.accounts.mint.key();
    let config_bump = config.bump;

    // Transfer via permanent delegate (config PDA has delegate authority)
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_CONFIG,
        mint_key.as_ref(),
        &[config_bump],
    ]];

    // Construct the Token-2022 transfer_checked instruction manually
    // because Anchor's CPI helper does NOT add remaining_accounts to the instruction's AccountMetas
    let mut transfer_ix = spl_token_2022::instruction::transfer_checked(
        ctx.accounts.token_program.key,
        &ctx.accounts.from_account.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.to_account.key(),
        &ctx.accounts.config.key(), // The permanent delegate is the authority
        &[],
        amount,
        ctx.accounts.mint.decimals,
    )?;

    // Append the remaining accounts to the instruction's AccountMetas
    for acc in ctx.remaining_accounts {
        transfer_ix.accounts.push(anchor_lang::solana_program::instruction::AccountMeta {
            pubkey: *acc.key,
            is_signer: acc.is_signer,
            is_writable: acc.is_writable,
        });
    }

    // Build the array of AccountInfos for invoke_signed
    let mut account_infos = vec![
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.from_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.to_account.to_account_info(),
        ctx.accounts.config.to_account_info(),
    ];
    account_infos.extend_from_slice(ctx.remaining_accounts);

    anchor_lang::solana_program::program::invoke_signed(
        &transfer_ix,
        &account_infos,
        signer_seeds,
    )?;

    emit!(TokensSeized {
        mint: mint_key,
        from: ctx.accounts.from_account.key(),
        to: ctx.accounts.to_account.key(),
        amount,
        seizer: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
