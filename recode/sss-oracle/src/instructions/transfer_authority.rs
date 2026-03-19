use anchor_lang::prelude::*;

use crate::errors::OracleError;
use crate::events::OracleAuthorityTransferredEvent;
use crate::state::OracleConfig;

#[derive(Accounts)]
pub struct TransferOracleAuthority<'info> {
    /// Current oracle authority.
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"oracle_cfg", oracle_config.stablecoin_mint.as_ref()],
        bump = oracle_config.bump,
        has_one = authority @ OracleError::Unauthorized,
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

pub fn handler(
    ctx: Context<TransferOracleAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let cfg = &mut ctx.accounts.oracle_config;
    let old_authority = cfg.authority;

    cfg.authority = new_authority;

    emit!(OracleAuthorityTransferredEvent {
        oracle: cfg.key(),
        old_authority,
        new_authority,
    });

    msg!(
        "Oracle authority transferred: {} → {}",
        old_authority,
        new_authority,
    );

    Ok(())
}
