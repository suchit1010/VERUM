use anchor_lang::prelude::*;

/// Core stablecoin configuration — created once during initialization.
/// Stores metadata and feature flags that determine SSS-1 vs SSS-2 behavior.
///
/// PDA Seeds: ["config", mint_pubkey]
#[account]
#[derive(InitSpace)]
pub struct StablecoinConfig {
    /// The Token-2022 mint address
    pub mint: Pubkey,

    /// Master authority — can update roles, transfer authority
    pub authority: Pubkey,

    /// Human-readable name (e.g., "My Stablecoin")
    #[max_len(32)]
    pub name: String,

    /// Token symbol (e.g., "MYUSD")
    #[max_len(10)]
    pub symbol: String,

    /// Metadata URI for off-chain metadata
    #[max_len(200)]
    pub uri: String,

    /// Decimal precision (typically 6 for stablecoins)
    pub decimals: u8,

    // ─── SSS-2 Feature Flags ─────────────────────────────────────
    /// Whether permanent delegate extension is enabled (SSS-2)
    pub enable_permanent_delegate: bool,

    /// Whether transfer hook extension is enabled (SSS-2)
    pub enable_transfer_hook: bool,

    /// Whether new token accounts start frozen by default (SSS-2)
    pub default_account_frozen: bool,

    // ─── SSS-3 Feature Flags ─────────────────────────────────────
    /// Whether Confidential Transfer extension is enabled (SSS-3)
    pub enable_confidential_transfer: bool,

    /// PDA bump for efficient re-derivation
    pub bump: u8,

    /// Initialization timestamp
    pub created_at: i64,
}

impl StablecoinConfig {
    /// Returns true if this is an SSS-2 compliant stablecoin
    pub fn is_compliant(&self) -> bool {
        self.enable_permanent_delegate || self.enable_transfer_hook
    }

    /// Returns true if this is an SSS-3 confidential stablecoin
    pub fn is_confidential(&self) -> bool {
        self.enable_confidential_transfer
    }
}
