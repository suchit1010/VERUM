// programs/basket-vault/src/state.rs

use anchor_lang::prelude::*;

// ─────────────────────────────────────────────────────────────────────────────
// Seeds
// ─────────────────────────────────────────────────────────────────────────────

/// One vault token account per collateral asset.
/// Seeds: ["collateral", asset_mint_pubkey]
pub const COLLATERAL_VAULT_SEED: &[u8] = b"collateral";

/// One position account per (user, asset) pair.
/// Seeds: ["position", user_pubkey, asset_mint_pubkey]
pub const POSITION_SEED: &[u8] = b"position";

/// Global vault authority — signs all outbound transfers and SSS CPI mints.
/// Seeds: ["basket_vault_authority"]
pub const VAULT_AUTH_SEED: &[u8] = b"basket_vault_authority";

/// Global config PDA.
/// Seeds: ["global_config"]
pub const GLOBAL_CONFIG_SEED: &[u8] = b"global_config";

// ─────────────────────────────────────────────────────────────────────────────
// Feed IDs — Pyth devnet (hex strings)
// Replace with mainnet IDs before production deployment
// ─────────────────────────────────────────────────────────────────────────────

pub const FEED_XAU_USD: &str =
    "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
pub const FEED_WTI_USD: &str =
    "a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b";
pub const FEED_BTC_USD: &str =
    "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
pub const FEED_XAG_USD: &str =
    "f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e";
pub const FEED_DXY_USD: &str =
    "a39b82aa35a53d7afbef02e1f5c57ebf6b0c1f957a0a35ec1f6e50c7d89d5af5";
// RWA: stub until tokenized RWA feeds mature on devnet
pub const FEED_RWA_USD: &str = "";

// ─────────────────────────────────────────────────────────────────────────────
// Per-asset configuration (stored inside GlobalConfig)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(AnchorDeserialize, AnchorSerialize, Clone, Debug)]
pub struct AssetConfig {
    /// The SPL mint for this collateral (e.g. PAXG mint address)
    pub mint: Pubkey,

    /// Pyth price feed ID hex string (32 bytes encoded as hex)
    pub pyth_feed_id_hex: String,

    /// Switchboard AggregatorAccountData pubkey — fallback oracle
    pub switchboard_aggregator: Pubkey,

    /// Weight of this asset in the basket (basis points, 10_000 = 100%)
    pub weight_bps: u16,

    /// Decimals of the SPL token (e.g. PAXG = 8, USDC = 6, WBTC = 8)
    pub decimals: u8,

    /// Per-asset minimum CR — can be higher than global for volatile assets
    pub min_cr: u16,
}

// ─────────────────────────────────────────────────────────────────────────────
// Global protocol config
// ─────────────────────────────────────────────────────────────────────────────

/// Single PDA account storing all protocol-level state.
/// Seeds: ["global_config"]
#[account]
pub struct GlobalConfig {
    /// The BASKET SPL mint — owned by SSS program
    pub basket_mint: Pubkey,

    /// SSS stablecoin program ID — target of CPI mints/burns
    pub sss_program: Pubkey,

    /// Pubkey authorized to submit quarterly rebalance proposals
    /// Phase 1: multisig. Phase 2: DAO program.
    pub rebalance_authority: Pubkey,

    /// Pubkey authorized to trigger emergency mode
    pub emergency_authority: Pubkey,

    /// Bump for the vault authority PDA — stored to avoid recomputing
    pub vault_authority_bump: u8,

    /// Current total BASKET in circulation (tracks mint.supply as double-check)
    pub total_minted: u64,

    /// Insurance fund balance in lamports (funded by 0.1% mint/burn fee)
    pub insurance_fund_lamports: u64,

    /// Whether the protocol is in emergency mode (mints + new deposits paused)
    pub emergency_mode: bool,

    /// Unix timestamp of the last successful rebalance
    pub last_rebalance_timestamp: i64,

    /// Chainlink Functions request ID of the last rebalance — audit trail
    pub last_rebalance_request_id: [u8; 32],

    /// Per-asset configuration (6 assets in the initial basket)
    pub asset_registry: Vec<AssetConfig>,
}

impl GlobalConfig {
    /// Approximate space for the account.
    /// Vec<AssetConfig> with 6 entries: each ~160 bytes.
    pub const LEN: usize = 8     // discriminator
        + 32                      // basket_mint
        + 32                      // sss_program
        + 32                      // rebalance_authority
        + 32                      // emergency_authority
        + 1                       // vault_authority_bump
        + 8                       // total_minted
        + 8                       // insurance_fund_lamports
        + 1                       // emergency_mode
        + 8                       // last_rebalance_timestamp
        + 32                      // last_rebalance_request_id
        + 4 + (6 * 160);          // Vec<AssetConfig> (4 byte length prefix + 6 entries)
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-user position for one asset
// ─────────────────────────────────────────────────────────────────────────────

/// Tracks a user's collateral deposit for a single asset.
/// One account per (user, asset_mint) pair.
/// Seeds: ["position", user_pubkey, asset_mint_pubkey]
#[account]
pub struct UserPosition {
    /// The depositor's wallet
    pub owner: Pubkey,

    /// Which SPL mint this position tracks
    pub asset_mint: Pubkey,

    /// Raw SPL token amount currently deposited (native decimals)
    pub deposited_amount: u64,

    /// Slot of last update — for off-chain monitoring
    pub last_updated_slot: u64,

    /// Bump for this position PDA — stored to avoid recomputing
    pub bump: u8,
}

impl UserPosition {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1; // 89 bytes
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-asset vault token account config
// ─────────────────────────────────────────────────────────────────────────────

/// Metadata for the vault's SPL token account for one collateral asset.
/// Seeds: ["collateral", asset_mint_pubkey]
#[account]
pub struct VaultCollateralConfig {
    /// The SPL mint this vault account accepts
    pub asset_mint: Pubkey,

    /// The actual SPL token account holding deposited collateral
    pub vault_token_account: Pubkey,

    /// Total deposited across all users (for TVL display)
    pub total_deposited: u64,

    /// Bump for this config PDA
    pub bump: u8,
}

impl VaultCollateralConfig {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1; // 81 bytes
}
