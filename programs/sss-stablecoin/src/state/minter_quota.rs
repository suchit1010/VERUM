use anchor_lang::prelude::*;

/// Per-minter quota tracking.
/// Each minter has their own PDA — no shared state bottleneck.
/// Enables horizontal scaling of minting operations.
///
/// PDA Seeds: ["minter", mint_pubkey, minter_pubkey]
#[account]
#[derive(InitSpace)]
pub struct MinterQuota {
    /// The stablecoin mint
    pub mint: Pubkey,

    /// The minter's public key
    pub minter: Pubkey,

    /// Maximum amount this minter can mint (lifetime)
    pub quota: u64,

    /// Amount already minted against quota
    pub minted: u64,

    /// Whether this minter is currently active
    pub active: bool,

    /// PDA bump
    pub bump: u8,

    /// When this minter was added
    pub created_at: i64,
}

impl MinterQuota {
    /// Check if the minter can mint the given amount
    pub fn can_mint(&self, amount: u64) -> bool {
        self.active
            && self
                .minted
                .checked_add(amount)
                .is_some_and(|total| total <= self.quota)
    }

    /// Record a mint operation against the quota
    pub fn record_mint(&mut self, amount: u64) -> Result<()> {
        self.minted = self.minted.checked_add(amount).ok_or(error!(crate::errors::SssError::Overflow))?;
        Ok(())
    }

    /// Remaining mintable amount
    pub fn remaining(&self) -> u64 {
        self.quota.saturating_sub(self.minted)
    }
}
