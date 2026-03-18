// SVS-1 CPI interface
//
// SVS-1 (solanabr/solana-vault-standard) is the ERC-4626 tokenized vault
// that physically holds all BASKET collateral.
//
// One SVS-1 vault per collateral asset:
//   PAXG vault  → holds all deposited PAXG
//   WBTC vault  → holds all deposited WBTC
//   tOIL vault  → holds all deposited tokenized WTI
//   etc.
//
// BasketVault CPIs into SVS-1 for deposits and redeems.
// SVS-1 handles: ERC-4626 accounting, inflation attack protection,
//                vault-favoring rounding, slippage, pause controls.
//
// HOW TO GET REAL DISCRIMINATORS:
//   anchor idl fetch SVS1VauLt1111111111111111111111111111111111 --output json
//   jq '.instructions[] | {name, discriminator}' idl.json
//
// SVS-1 Program ID: SVS1VauLt1111111111111111111111111111111111
// (update after forking/deploying SVS-1 to devnet)

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;

// ── Program ID ────────────────────────────────────────────────────────────────

pub fn svs1_program_id() -> Pubkey {
    // Replace with deployed SVS-1 program ID
    "SVS1VauLt1111111111111111111111111111111111".parse().unwrap()
}

// ── Discriminators ────────────────────────────────────────────────────────────
// sha256("global:deposit")[0..8] — verify against IDL before mainnet
pub const DEPOSIT_DISC:  [u8; 8] = [0xf2, 0x23, 0xc6, 0x89, 0x52, 0xe1, 0xf2, 0xbd];
// sha256("global:redeem")[0..8]
pub const REDEEM_DISC:   [u8; 8] = [0xaf, 0x74, 0x5e, 0x1c, 0x3b, 0x22, 0xd9, 0x61];
// sha256("global:preview_deposit")[0..8] — view function
pub const PREVIEW_DEPOSIT_DISC: [u8; 8] = [0x1a, 0x3f, 0x8c, 0x72, 0x44, 0xb9, 0x1d, 0xe0];

// ── SVS-1 Vault PDA derivation ────────────────────────────────────────────────
// SVS-1 seeds: ["vault", asset_mint, vault_id (u64 LE)]
// vault_id = 0 for the first (and only) vault per asset in BASKET

pub fn derive_svs_vault(asset_mint: &Pubkey, vault_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            b"vault",
            asset_mint.as_ref(),
            &vault_id.to_le_bytes(),
        ],
        &svs1_program_id(),
    )
}

// SVS-1 shares mint: ["shares", vault_pubkey]
pub fn derive_svs_shares_mint(vault: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"shares", vault.as_ref()],
        &svs1_program_id(),
    )
}

// SVS-1 vault token account: ["vault_token", vault_pubkey]
pub fn derive_svs_vault_token(vault: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"vault_token", vault.as_ref()],
        &svs1_program_id(),
    )
}

// SVS-1 token account owner PDA: ["token_account_owner_pda", vault_pubkey]
pub fn derive_svs_token_owner(vault: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"token_account_owner_pda", vault.as_ref()],
        &svs1_program_id(),
    )
}

// ── CPI: deposit ─────────────────────────────────────────────────────────────
//
// SVS-1::deposit(assets: u64, min_shares_out: u64)
//
// Accounts (SVS-1 order):
//   0. vault             [writable]
//   1. user_assets       [writable]  — user's asset token account
//   2. vault_assets      [writable]  — SVS-1 vault token account
//   3. user_shares       [writable]  — user's share token account
//   4. shares_mint       [writable]
//   5. token_owner_pda   [readonly, signer via SVS-1]
//   6. user              [signer]
//   7. token_program     [readonly]
//   8. system_program    [readonly]

pub fn cpi_deposit<'info>(
    vault:          AccountInfo<'info>,
    user_assets:    AccountInfo<'info>,
    vault_assets:   AccountInfo<'info>,
    user_shares:    AccountInfo<'info>,
    shares_mint:    AccountInfo<'info>,
    token_owner_pda: AccountInfo<'info>,
    user:           AccountInfo<'info>,
    token_program:  AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    assets:         u64,
    min_shares_out: u64,
) -> Result<()> {
    let mut data = DEPOSIT_DISC.to_vec();
    data.extend_from_slice(&assets.to_le_bytes());
    data.extend_from_slice(&min_shares_out.to_le_bytes());

    let ix = Instruction {
        program_id: svs1_program_id(),
        accounts: vec![
            AccountMeta::new(*vault.key,           false),
            AccountMeta::new(*user_assets.key,     false),
            AccountMeta::new(*vault_assets.key,    false),
            AccountMeta::new(*user_shares.key,     false),
            AccountMeta::new(*shares_mint.key,     false),
            AccountMeta::new_readonly(*token_owner_pda.key, false),
            AccountMeta::new_readonly(*user.key,   true),
            AccountMeta::new_readonly(*token_program.key,  false),
            AccountMeta::new_readonly(*system_program.key, false),
        ],
        data,
    };

    invoke(&ix, &[
        vault, user_assets, vault_assets, user_shares,
        shares_mint, token_owner_pda, user, token_program, system_program,
    ]).map_err(Into::into)
}

// ── CPI: redeem ──────────────────────────────────────────────────────────────
//
// SVS-1::redeem(shares: u64, min_assets_out: u64)
//
// Same account order as deposit, user is signer.

pub fn cpi_redeem<'info>(
    vault:          AccountInfo<'info>,
    user_assets:    AccountInfo<'info>,
    vault_assets:   AccountInfo<'info>,
    user_shares:    AccountInfo<'info>,
    shares_mint:    AccountInfo<'info>,
    token_owner_pda: AccountInfo<'info>,
    user:           AccountInfo<'info>,
    token_program:  AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    shares:         u64,
    min_assets_out: u64,
) -> Result<()> {
    let mut data = REDEEM_DISC.to_vec();
    data.extend_from_slice(&shares.to_le_bytes());
    data.extend_from_slice(&min_assets_out.to_le_bytes());

    let ix = Instruction {
        program_id: svs1_program_id(),
        accounts: vec![
            AccountMeta::new(*vault.key,           false),
            AccountMeta::new(*user_assets.key,     false),
            AccountMeta::new(*vault_assets.key,    false),
            AccountMeta::new(*user_shares.key,     false),
            AccountMeta::new(*shares_mint.key,     false),
            AccountMeta::new_readonly(*token_owner_pda.key, false),
            AccountMeta::new_readonly(*user.key,   true),
            AccountMeta::new_readonly(*token_program.key,  false),
            AccountMeta::new_readonly(*system_program.key, false),
        ],
        data,
    };

    invoke(&ix, &[
        vault, user_assets, vault_assets, user_shares,
        shares_mint, token_owner_pda, user, token_program, system_program,
    ]).map_err(Into::into)
}

// ── Read SVS-1 vault total_assets ─────────────────────────────────────────────
//
// SVS-1 VaultState layout (from README + ERC-4626 source pattern):
//   [8  bytes] discriminator
//   [32 bytes] authority
//   [32 bytes] asset_mint
//   [32 bytes] shares_mint
//   [32 bytes] asset_vault (token account)
//   [8  bytes] total_assets  ← offset 112
//   [1  byte]  paused
//   [1  byte]  bump
//
// We read total_assets directly from the account data.
// This avoids a CPI just for a view — saves compute units.

pub fn read_total_assets(vault_account: &AccountInfo) -> Result<u64> {
    let data = vault_account.try_borrow_data()?;
    require!(data.len() >= 120, crate::errors::VaultError::InvalidOracleAccount);
    let bytes: [u8; 8] = data[112..120].try_into()
        .map_err(|_| error!(crate::errors::VaultError::MathOverflow))?;
    Ok(u64::from_le_bytes(bytes))
}
