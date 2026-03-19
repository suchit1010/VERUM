// programs/basket-vault/src/cpi_interface.rs
//
// Manual CPI interface to the SSS stablecoin program.
//
// Used when SSS does not export an Anchor CPI crate.
// If SSS exports `sss-stablecoin` with `features = ["cpi"]`,
// replace this file with: use sss_stablecoin::cpi::mint_tokens;
//
// To find the correct discriminator for your SSS deployment:
//   anchor idl fetch <SSS_PROGRAM_ID> | jq '.instructions[] | select(.name=="mint_tokens")'

use anchor_lang::prelude::*;

/// 8-byte discriminator for SSS::mint_tokens.
/// Computed as: sha256("global:mint_tokens")[0..8]
///
/// IMPORTANT: Replace this with the actual discriminator from your SSS IDL.
/// Wrong discriminator = silent failure with error code 0x1.
pub const MINT_TOKENS_DISCRIMINATOR: [u8; 8] =
    [0xa7, 0x4e, 0x86, 0x5f, 0x3b, 0x12, 0xc9, 0x41];

/// Accounts expected by SSS::mint_tokens.
/// Order must exactly match the SSS program's instruction definition.
pub struct SssMintTokens<'info> {
    /// The BASKET SPL mint account
    /// CHECK: validated by SSS program
    pub mint: AccountInfo<'info>,

    /// Destination token account to receive minted BASKET
    /// CHECK: validated by SSS program
    pub destination: AccountInfo<'info>,

    /// The PDA designated as mint authority by SSS
    /// CHECK: validated by SSS program via seeds
    pub mint_authority: AccountInfo<'info>,

    /// SPL Token program
    pub token_program: AccountInfo<'info>,
}

/// CPI call to SSS::mint_tokens.
/// Pass signer_seeds containing the vault_authority PDA seeds.
pub fn cpi_mint_tokens<'info>(
    ctx: CpiContext<'_, '_, '_, 'info, SssMintTokens<'info>>,
    amount: u64,
) -> Result<()> {

    // Serialize instruction data: [discriminator (8 bytes)] + [amount LE u64 (8 bytes)]
    let mut data = MINT_TOKENS_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: *ctx.program.key,
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(
                *ctx.accounts.mint.key, false,
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new(
                *ctx.accounts.destination.key, false,
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                *ctx.accounts.mint_authority.key, true, // signer
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                *ctx.accounts.token_program.key, false,
            ),
        ],
        data,
    };

    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[
            ctx.accounts.mint.clone(),
            ctx.accounts.destination.clone(),
            ctx.accounts.mint_authority.clone(),
            ctx.accounts.token_program.clone(),
        ],
        ctx.signer_seeds,
    )
    .map_err(Into::into)
}
