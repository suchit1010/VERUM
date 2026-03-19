use anchor_lang::prelude::*;

/// Emitted when a stablecoin is initialized
#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub preset: String,
    pub timestamp: i64,
}

/// Emitted on mint operations
#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

/// Emitted on burn operations
#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub burner: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

/// Emitted when an account is frozen
#[event]
pub struct AccountFrozen {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

/// Emitted when an account is thawed
#[event]
pub struct AccountThawed {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

/// Emitted when operations are paused/unpaused
#[event]
pub struct PauseStatusChanged {
    pub mint: Pubkey,
    pub paused: bool,
    pub authority: Pubkey,
    pub timestamp: i64,
}

/// Emitted when a role is updated
#[event]
pub struct RoleUpdated {
    pub mint: Pubkey,
    pub role: String,
    pub account: Pubkey,
    pub granted: bool,
    pub authority: Pubkey,
    pub timestamp: i64,
}

/// Emitted when master authority is transferred
#[event]
pub struct AuthorityTransferred {
    pub mint: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

/// Emitted when an address is blacklisted (SSS-2)
#[event]
pub struct AddressBlacklisted {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub blacklister: Pubkey,
    pub timestamp: i64,
}

/// Emitted when an address is removed from blacklist (SSS-2)
#[event]
pub struct AddressUnblacklisted {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

/// Emitted when tokens are seized via permanent delegate (SSS-2)
#[event]
pub struct TokensSeized {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub seizer: Pubkey,
    pub timestamp: i64,
}

/// Emitted when a minter is added/removed
#[event]
pub struct MinterUpdated {
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub quota: u64,
    pub added: bool,
    pub authority: Pubkey,
    pub timestamp: i64,
}
