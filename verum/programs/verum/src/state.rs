use anchor_lang::prelude::*;

pub const VAULT_AUTH_SEED: &[u8] = b"basket_vault_authority";

pub fn vault_authority_pda(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_AUTH_SEED], program_id)
}

#[account]
pub struct GlobalConfig {
    pub vault_authority_bump: u8,
    pub basket_mint: Pubkey,
    pub sss_program: Pubkey,
    pub total_minted: u64,
    pub target_weights: [u16; 6],
    pub asset_registry: Vec<AssetConfig>,
    pub insurance_fund_lamports: u64,
    pub emergency_mode: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AssetConfig {
    pub mint: Pubkey,
    pub pyth_feed_id_hex: String,
    pub switchboard_aggregator: Pubkey,
    pub weight_bps: u16,
    pub decimals: u8,
    pub min_cr: u16,
}
