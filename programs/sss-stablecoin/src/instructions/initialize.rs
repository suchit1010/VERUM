use anchor_lang::prelude::*;
use anchor_spl::token_2022;
use anchor_spl::token_interface::{Mint, TokenInterface};
use sss_common::seeds::*;

use crate::errors::SssError;
use crate::events::StablecoinInitialized;
use crate::state::{StablecoinConfig, RoleConfig, PauseState};

/// Parameters for stablecoin initialization
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    /// Enable permanent delegate (SSS-2)
    pub enable_permanent_delegate: bool,
    /// Enable transfer hook (SSS-2)
    pub enable_transfer_hook: bool,
    /// Whether new accounts start frozen
    pub default_account_frozen: bool,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    /// The authority initializing the stablecoin
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The Token-2022 mint to be created.
    /// We use init externally via Token-2022 CPIs to enable extensions.
    /// CHECK: Created and initialized in this instruction via CPI
    #[account(mut)]
    pub mint: Signer<'info>,

    /// Stablecoin configuration PDA
    #[account(
        init,
        payer = authority,
        space = 8 + StablecoinConfig::INIT_SPACE,
        seeds = [SEED_CONFIG, mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Role configuration PDA
    #[account(
        init,
        payer = authority,
        space = 8 + RoleConfig::INIT_SPACE,
        seeds = [SEED_ROLES, mint.key().as_ref()],
        bump,
    )]
    pub role_config: Account<'info, RoleConfig>,

    /// Pause state PDA
    #[account(
        init,
        payer = authority,
        space = 8 + PauseState::INIT_SPACE,
        seeds = [SEED_PAUSE, mint.key().as_ref()],
        bump,
    )]
    pub pause_state: Account<'info, PauseState>,

    /// Token-2022 program
    pub token_program: Interface<'info, TokenInterface>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Rent sysvar
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    // ─── Validate inputs ─────────────────────────────────────────
    require!(
        !params.name.is_empty() && params.name.len() <= 32,
        SssError::InvalidName
    );
    require!(
        !params.symbol.is_empty() && params.symbol.len() <= 10,
        SssError::InvalidSymbol
    );
    require!(params.uri.len() <= 200, SssError::InvalidUri);
    require!(params.decimals <= 18, SssError::InvalidDecimals);

    let clock = Clock::get()?;

    // ─── Initialize Token-2022 Mint with Extensions ──────────────
    // We calculate the space needed based on which extensions are enabled.
    // Extensions are added BEFORE InitializeMint2 per Token-2022 spec.

    let mint_account = &ctx.accounts.mint;
    let token_program = &ctx.accounts.token_program;

    // Calculate extension space
    let mut extension_types = vec![
        spl_token_2022::extension::ExtensionType::MintCloseAuthority,
    ];

    if params.enable_permanent_delegate {
        extension_types.push(spl_token_2022::extension::ExtensionType::PermanentDelegate);
    }

    if params.enable_transfer_hook {
        extension_types.push(spl_token_2022::extension::ExtensionType::TransferHook);
    }

    if params.default_account_frozen {
        extension_types.push(spl_token_2022::extension::ExtensionType::DefaultAccountState);
    }

    let space = spl_token_2022::extension::ExtensionType::try_calculate_account_len::<
        spl_token_2022::state::Mint,
    >(&extension_types)?;

    // Create the mint account
    let rent = &ctx.accounts.rent;
    let lamports = rent.minimum_balance(space);

    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &mint_account.key(),
            lamports,
            space as u64,
            &token_program.key(),
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            mint_account.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // Initialize extensions before InitializeMint2
    // MintCloseAuthority
    anchor_lang::solana_program::program::invoke(
        &spl_token_2022::instruction::initialize_mint_close_authority(
            &token_program.key(),
            &mint_account.key(),
            Some(&ctx.accounts.config.key()),
        )?,
        &[
            mint_account.to_account_info(),
        ],
    )?;

    if params.enable_permanent_delegate {
        anchor_lang::solana_program::program::invoke(
            &spl_token_2022::instruction::initialize_permanent_delegate(
                &token_program.key(),
                &mint_account.key(),
                &ctx.accounts.config.key(),
            )?,
            &[
                mint_account.to_account_info(),
            ],
        )?;
    }

    if params.enable_transfer_hook {
        // Transfer hook points to the sss-transfer-hook program
        // The transfer hook program ID will be set as a constant
        anchor_lang::solana_program::program::invoke(
            &spl_token_2022::extension::transfer_hook::instruction::initialize(
                &token_program.key(),
                &mint_account.key(),
                Some(ctx.accounts.authority.key()),
                Some(crate::ID), // Hook program ID — in production, use transfer hook program ID
            )?,
            &[
                mint_account.to_account_info(),
            ],
        )?;
    }

    if params.default_account_frozen {
        anchor_lang::solana_program::program::invoke(
            &spl_token_2022::extension::default_account_state::instruction::initialize_default_account_state(
                &token_program.key(),
                &mint_account.key(),
                &spl_token_2022::state::AccountState::Frozen,
            )?,
            &[
                mint_account.to_account_info(),
            ],
        )?;
    }

    // Initialize the mint
    anchor_lang::solana_program::program::invoke(
        &spl_token_2022::instruction::initialize_mint2(
            &token_program.key(),
            &mint_account.key(),
            &ctx.accounts.config.key(),  // mint authority = config PDA
            Some(&ctx.accounts.config.key()), // freeze authority = config PDA
            params.decimals,
        )?,
        &[
            mint_account.to_account_info(),
        ],
    )?;

    // ─── Initialize Config PDA ───────────────────────────────────
    let config = &mut ctx.accounts.config;
    config.mint = mint_account.key();
    config.authority = ctx.accounts.authority.key();
    config.name = params.name.clone();
    config.symbol = params.symbol.clone();
    config.uri = params.uri;
    config.decimals = params.decimals;
    config.enable_permanent_delegate = params.enable_permanent_delegate;
    config.enable_transfer_hook = params.enable_transfer_hook;
    config.default_account_frozen = params.default_account_frozen;
    config.bump = ctx.bumps.config;
    config.created_at = clock.unix_timestamp;

    // ─── Initialize Role Config ──────────────────────────────────
    let role_config = &mut ctx.accounts.role_config;
    role_config.mint = mint_account.key();
    role_config.master_authority = ctx.accounts.authority.key();
    role_config.pauser = ctx.accounts.authority.key();
    role_config.burner = ctx.accounts.authority.key();
    role_config.blacklister = if params.enable_permanent_delegate || params.enable_transfer_hook {
        ctx.accounts.authority.key()
    } else {
        Pubkey::default()
    };
    role_config.seizer = if params.enable_permanent_delegate {
        ctx.accounts.authority.key()
    } else {
        Pubkey::default()
    };
    role_config.bump = ctx.bumps.role_config;

    // ─── Initialize Pause State ──────────────────────────────────
    let pause_state = &mut ctx.accounts.pause_state;
    pause_state.mint = mint_account.key();
    pause_state.paused = false;
    pause_state.last_changed_by = ctx.accounts.authority.key();
    pause_state.last_changed_at = clock.unix_timestamp;
    pause_state.bump = ctx.bumps.pause_state;

    // ─── Emit Event ──────────────────────────────────────────────
    let preset = if params.enable_permanent_delegate && params.enable_transfer_hook {
        "SSS-2"
    } else {
        "SSS-1"
    };

    emit!(StablecoinInitialized {
        mint: mint_account.key(),
        authority: ctx.accounts.authority.key(),
        name: params.name,
        symbol: params.symbol,
        decimals: params.decimals,
        preset: preset.to_string(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
