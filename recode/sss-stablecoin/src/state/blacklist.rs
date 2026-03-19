use anchor_lang::prelude::*;

/// Blacklist entry — one PDA per blacklisted address per mint.
/// O(1) lookup: the PDA either exists (blacklisted) or doesn't.
/// This is the key scalability design: no iteration, no lists to scan.
///
/// PDA Seeds: ["blacklist", mint_pubkey, blacklisted_address]
#[account]
#[derive(InitSpace)]
pub struct BlacklistEntry {
    /// The stablecoin mint
    pub mint: Pubkey,

    /// The blacklisted address
    pub address: Pubkey,

    /// Reason for blacklisting (e.g., "OFAC match", "Sanctions")
    #[max_len(128)]
    pub reason: String,

    /// Who blacklisted this address
    pub blacklisted_by: Pubkey,

    /// When the address was blacklisted
    pub blacklisted_at: i64,

    /// PDA bump
    pub bump: u8,
}
