//! PDA seed constants — single source of truth for both programs.
//! O(1) PDA derivation ensures constant-time lookups at any scale.

/// Seed for StablecoinConfig PDA: ["config", mint_pubkey]
pub const SEED_CONFIG: &[u8] = b"config";

/// Seed for RoleConfig PDA: ["roles", mint_pubkey]
pub const SEED_ROLES: &[u8] = b"roles";

/// Seed for MinterQuota PDA: ["minter", mint_pubkey, minter_pubkey]
pub const SEED_MINTER: &[u8] = b"minter";

/// Seed for BlacklistEntry PDA: ["blacklist", mint_pubkey, address]
pub const SEED_BLACKLIST: &[u8] = b"blacklist";

/// Seed for PauseState PDA: ["pause", mint_pubkey]
pub const SEED_PAUSE: &[u8] = b"pause";

/// Seed for TransferHook ExtraAccountMetaList: ["extra-account-metas", mint_pubkey]
pub const SEED_EXTRA_ACCOUNT_METAS: &[u8] = b"extra-account-metas";
