use anchor_lang::prelude::*;

/// Role-based access control configuration.
/// Stores the public keys authorized for each role.
/// Each role is optional (Pubkey::default() = unset).
///
/// PDA Seeds: ["roles", mint_pubkey]
#[account]
#[derive(InitSpace)]
pub struct RoleConfig {
    /// The stablecoin mint this config belongs to
    pub mint: Pubkey,

    /// Master authority — can assign/revoke all roles
    pub master_authority: Pubkey,

    /// Pauser — can pause/unpause all operations
    pub pauser: Pubkey,

    /// Burner — can burn tokens from own account
    pub burner: Pubkey,

    // ─── SSS-2 Compliance Roles ──────────────────────────────────
    /// Blacklister — can add/remove addresses from blacklist
    pub blacklister: Pubkey,

    /// Seizer — can seize tokens via permanent delegate
    pub seizer: Pubkey,

    /// PDA bump
    pub bump: u8,
}

impl RoleConfig {
    /// Check if a pubkey is the master authority
    pub fn is_master(&self, key: &Pubkey) -> bool {
        self.master_authority == *key
    }

    /// Check if a pubkey is a pauser (or master)
    pub fn is_pauser(&self, key: &Pubkey) -> bool {
        self.pauser == *key || self.is_master(key)
    }

    /// Check if a pubkey is a burner (or master)
    pub fn is_burner(&self, key: &Pubkey) -> bool {
        self.burner == *key || self.is_master(key)
    }

    /// Check if a pubkey is a blacklister (or master)
    pub fn is_blacklister(&self, key: &Pubkey) -> bool {
        self.blacklister == *key || self.is_master(key)
    }

    /// Check if a pubkey is a seizer (or master)
    pub fn is_seizer(&self, key: &Pubkey) -> bool {
        self.seizer == *key || self.is_master(key)
    }
}
