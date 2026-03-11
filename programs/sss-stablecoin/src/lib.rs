use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("HJ6TUXQ34XhDrmvcozMsBWhSuEVkEcYeqoTWo1Bcmzet");

#[program]
pub mod sss_stablecoin {
    use super::*;

    // ─── Core Instructions (All Presets) ─────────────────────────────

    /// Initialize a new stablecoin with Token-2022 extensions.
    /// Supports SSS-1 (minimal) and SSS-2 (compliant) via config flags.
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Mint tokens to a recipient. Requires minter role + checks quota.
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    /// Burn tokens. Requires burner role.
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    /// Freeze a token account. Requires master authority or pauser role.
    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze::freeze_handler(ctx)
    }

    /// Thaw a frozen token account. Requires master authority or pauser role.
    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::freeze::thaw_handler(ctx)
    }

    /// Pause all token operations globally.
    pub fn pause(ctx: Context<PauseOps>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    /// Unpause token operations.
    pub fn unpause(ctx: Context<UnpauseOps>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    // ─── Role Management ─────────────────────────────────────────────

    /// Update a role assignment. Requires master authority.
    pub fn update_role(ctx: Context<UpdateRole>, params: UpdateRoleParams) -> Result<()> {
        instructions::roles::update_role_handler(ctx, params)
    }

    /// Add a minter with a quota. Requires master authority.
    pub fn add_minter(ctx: Context<AddMinter>, quota: u64) -> Result<()> {
        instructions::roles::add_minter_handler(ctx, quota)
    }

    /// Remove a minter. Requires master authority.
    pub fn remove_minter(ctx: Context<RemoveMinter>) -> Result<()> {
        instructions::roles::remove_minter_handler(ctx)
    }

    /// Transfer master authority to a new key.
    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        instructions::roles::transfer_authority_handler(ctx)
    }

    // ─── SSS-2 Compliance (Feature-Gated) ────────────────────────────

    /// Add an address to the blacklist. SSS-2 only.
    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        reason: String,
    ) -> Result<()> {
        instructions::compliance::add_to_blacklist_handler(ctx, reason)
    }

    /// Remove an address from the blacklist. SSS-2 only.
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        instructions::compliance::remove_from_blacklist_handler(ctx)
    }

    /// Seize tokens from a frozen/blacklisted account via permanent delegate. SSS-2 only.
    pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
        instructions::compliance::seize_handler(ctx, amount)
    }
}
