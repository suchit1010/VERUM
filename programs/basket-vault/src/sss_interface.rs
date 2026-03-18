// SSS stablecoin SDK — CPI interface
//
// SSS (suchit1010/solana-stablecoin-standard) is the BASKET mint/burn engine.
// BasketVault CPIs into SSS to mint BASKET after CR check passes,
// and to burn BASKET during redemption.
//
// HOW TO GET REAL DISCRIMINATORS:
//   anchor idl fetch <SSS_PROGRAM_ID> --output json
//   jq '.instructions[] | {name, discriminator}' idl.json
//
// SSS Program ID: update in constants.ts after deploying SSS to devnet.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

// ── Discriminators (verify against SSS IDL) ───────────────────────────────────
pub const MINT_DISC: [u8; 8] = [0xa7, 0x4e, 0x86, 0x5f, 0x3b, 0x12, 0xc9, 0x41];
pub const BURN_DISC: [u8; 8] = [0x74, 0x2e, 0x5c, 0x3a, 0x1f, 0x88, 0xd2, 0x07];

// ── CPI: mint_tokens ─────────────────────────────────────────────────────────
//
// SSS::mint_tokens(amount: u64)
// Accounts: [mint writable, destination writable, mint_authority readonly+signer, token_program]

pub fn cpi_mint<'info>(
    sss_program:    AccountInfo<'info>,
    mint:           AccountInfo<'info>,
    destination:    AccountInfo<'info>,
    mint_authority: AccountInfo<'info>,
    token_program:  AccountInfo<'info>,
    signer_seeds:   &[&[&[u8]]],
    amount:         u64,
) -> Result<()> {
    let mut data = MINT_DISC.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: *sss_program.key,
        accounts: vec![
            AccountMeta::new(*mint.key,           false),
            AccountMeta::new(*destination.key,    false),
            AccountMeta::new_readonly(*mint_authority.key, true),
            AccountMeta::new_readonly(*token_program.key,  false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[mint, destination, mint_authority, token_program],
        signer_seeds,
    ).map_err(Into::into)
}

// ── CPI: burn_tokens ─────────────────────────────────────────────────────────
//
// SSS::burn_tokens(amount: u64)
// Accounts: [mint writable, source writable, burn_authority signer, token_program]

pub fn cpi_burn<'info>(
    sss_program:    AccountInfo<'info>,
    mint:           AccountInfo<'info>,
    source:         AccountInfo<'info>,
    burn_authority: AccountInfo<'info>,
    token_program:  AccountInfo<'info>,
    amount:         u64,
) -> Result<()> {
    let mut data = BURN_DISC.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: *sss_program.key,
        accounts: vec![
            AccountMeta::new(*mint.key,            false),
            AccountMeta::new(*source.key,          false),
            AccountMeta::new_readonly(*burn_authority.key, true),
            AccountMeta::new_readonly(*token_program.key,  false),
        ],
        data,
    };

    anchor_lang::solana_program::program::invoke(
        &ix,
        &[mint, source, burn_authority, token_program],
    ).map_err(Into::into)
}
