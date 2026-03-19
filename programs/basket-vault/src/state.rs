use anchor_lang::prelude::*;

// ── Seeds ─────────────────────────────────────────────────────────────────────
pub const GLOBAL_CONFIG_SEED: &[u8] = b"global_config";
pub const VAULT_AUTH_SEED: &[u8] = b"basket_vault_authority";

// ── Pyth devnet feed IDs (hex) ────────────────────────────────────────────────
// Replace with mainnet IDs before production.
// Verify at: https://pyth.network/developers/price-feed-ids#solana-devnet
pub const FEED_XAU: &str = "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
pub const FEED_WTI: &str = "a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b";
pub const FEED_BTC: &str = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
pub const FEED_XAG: &str = "f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e";
pub const FEED_DXY: &str = "a39b82aa35a53d7afbef02e1f5c57ebf6b0c1f957a0a35ec1f6e50c7d89d5af5";

// BTC is index 2 in the registry → used as vol proxy for adaptive CR
pub const BTC_REGISTRY_INDEX: usize = 2;

// ── Per-asset configuration ───────────────────────────────────────────────────

#[derive(AnchorDeserialize, AnchorSerialize, Clone, Debug)]
pub struct AssetConfig {
    /// SPL mint of the collateral token (e.g. PAXG mint)
    pub mint: Pubkey,

    /// Corresponding SVS-1 vault PDA for this asset.
    /// Seeds (SVS-1): ["vault", asset_mint, vault_id_u64_le]
    /// This is where collateral physically lives.
    pub svs_vault: Pubkey,

    /// Pyth PriceUpdateV2 account for this asset
    pub pyth_feed_id_hex: String,

    /// Switchboard AggregatorAccountData — fallback oracle
    pub switchboard_aggregator: Pubkey,

    /// Basket weight in basis points (10_000 = 100%)
    pub weight_bps: u16,

    /// SPL token decimals (e.g. PAXG = 8, USDC = 6)
    pub decimals: u8,
}

// ── Global protocol config ────────────────────────────────────────────────────

#[account]
pub struct GlobalConfig {
    pub basket_mint: Pubkey,               // BASKET SPL mint (owned by SSS)
    pub sss_program: Pubkey,               // SSS stablecoin program ID
    pub svs_program: Pubkey,               // SVS-1 vault program ID
    pub rebalance_authority: Pubkey,       // multisig → DAO
    pub emergency_authority: Pubkey,
    pub vault_authority_bump: u8,
    pub total_minted: u64,                 // BASKET in circulation (6 dec)
    pub insurance_fund_lamports: u64,
    pub emergency_mode: bool,
    pub last_rebalance_timestamp: i64,
    pub last_rebalance_request_id: [u8; 32],
    pub asset_registry: Vec<AssetConfig>, // 6 assets
}

impl GlobalConfig {
    // 8 disc + fields + Vec<AssetConfig> * 6 (~180 bytes each)
    pub const LEN: usize = 1360;
}

/// User Collateralized Debt Position (CDP)
/// Each user can have one active position. Tracks debt and collateral value.
#[account]
pub struct UserPosition {
    pub owner: Pubkey,
    pub debt: u64,             // BASKET tokens minted (owed)
    pub collateral_value: u64, // Total value of collateral locked in micro-USD
    pub cr_bps: u64,           // Current collateral ratio in basis points
    pub bump: u8,
}

impl UserPosition {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 1;

    pub fn collateral_ratio_bps(&self) -> u64 {
        if self.debt == 0 {
            return u64::MAX;
        }

        (self.collateral_value as u128)
            .checked_mul(10_000)
            .and_then(|v| v.checked_div(self.debt as u128))
            .unwrap_or(u64::MAX) as u64
    }
}
