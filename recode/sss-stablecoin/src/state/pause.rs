use anchor_lang::prelude::*;

/// Global pause state for a stablecoin.
/// When paused, mint/burn/transfer operations are blocked.
///
/// PDA Seeds: ["pause", mint_pubkey]
#[account]
#[derive(InitSpace)]
pub struct PauseState {
    /// The stablecoin mint
    pub mint: Pubkey,

    /// Whether operations are currently paused
    pub paused: bool,

    /// Who last changed the pause state
    pub last_changed_by: Pubkey,

    /// When the pause state was last changed
    pub last_changed_at: i64,

    /// PDA bump
    pub bump: u8,
}
