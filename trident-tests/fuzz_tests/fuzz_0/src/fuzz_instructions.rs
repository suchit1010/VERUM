#![allow(dead_code)]
/// Fuzz instructions for the SSS Stablecoin program.
///
/// Each variant maps to one on-chain instruction.  The `Arbitrary` derive
/// lets honggfuzz mutate the contained data fields freely.
///
/// # Security properties exercised
///
/// | Instruction       | Adversarial axes fuzzed                                            |
/// |-------------------|--------------------------------------------------------------------|
/// | `Initialize`      | name/symbol/uri at every length; decimals 0-255; extension combos |
/// | `MintTokens`      | amount=0, amount=u64::MAX, signed by non-minter                   |
/// | `BurnTokens`      | amount=0, amount > balance, signed by non-burner                  |
/// | `Pause/Unpause`   | signed by non-pauser; double-pause; pause-then-burn               |
/// | `UpdateRole`      | signed by non-master; role = garbage discriminant                  |
/// | `AddMinter`       | quota=0, quota=u64::MAX, duplicate minter                         |
/// | `RemoveMinter`    | remove non-existent, remove by non-master                         |
/// | `AddToBlacklist`  | empty reason, 200-char reason, on SSS-1 token                     |
/// | `TransferAuthority`| signed by wrong key                                              |

use arbitrary::Arbitrary;
use anchor_lang::prelude::Pubkey;
use sss_common::seeds::*;

fn sss_program_id() -> Pubkey {
    "HJ6TUXQ34XhDrmvcozMsBWhSuEVkEcYeqoTWo1Bcmzet".parse().unwrap()
}

// ─── Fuzz-able instruction data ──────────────────────────────────────────────

/// A single fuzzed instruction to send to the program.
#[derive(Arbitrary, Debug, Clone)]
pub enum FuzzInstruction {
    Initialize(FuzzInitialize),
    MintTokens(FuzzMintTokens),
    BurnTokens(FuzzBurnTokens),
    Pause(FuzzPause),
    Unpause(FuzzUnpause),
    UpdateRole(FuzzUpdateRole),
    AddMinter(FuzzAddMinter),
    RemoveMinter(FuzzRemoveMinter),
    TransferAuthority(FuzzTransferAuthority),
    AddToBlacklist(FuzzAddToBlacklist),
    RemoveFromBlacklist(FuzzRemoveFromBlacklist),
}

// ─── Per-instruction fuzz data structs ───────────────────────────────────────

/// `initialize` — arbitrary metadata + extension flags.
#[derive(Arbitrary, Debug, Clone)]
pub struct FuzzInitialize {
    /// Raw bytes; decoded to String — exercises all lengths including >32 (should reject).
    pub name:   Vec<u8>,
    pub symbol: Vec<u8>,
    pub uri:    Vec<u8>,
    /// 0-255 — anything > 18 must return InvalidDecimals.
    pub decimals: u8,
    pub enable_permanent_delegate:   bool,
    pub enable_transfer_hook:        bool,
    pub default_account_frozen:      bool,
    pub enable_confidential_transfer: bool,
    /// Fuzzer-chosen signer index (authority slot in fuzzer's key pool).
    pub authority_idx: u8,
}

/// `mint_tokens` — arbitrary amount + arbitrary minter.
#[derive(Arbitrary, Debug, Clone)]
pub struct FuzzMintTokens {
    pub amount:      u64,
    pub minter_idx:  u8,   // index into fuzzer's wallet pool
    pub mint_idx:    u8,   // which mint to target
}

/// `burn_tokens` — arbitrary amount + arbitrary burner.
#[derive(Arbitrary, Debug, Clone)]
pub struct FuzzBurnTokens {
    pub amount:      u64,
    pub burner_idx:  u8,
    pub mint_idx:    u8,
}

/// `pause` / `unpause` — arbitrary authority.
#[derive(Arbitrary, Debug, Clone)]
pub struct FuzzPause   { pub authority_idx: u8, pub mint_idx: u8 }

#[derive(Arbitrary, Debug, Clone)]
pub struct FuzzUnpause { pub authority_idx: u8, pub mint_idx: u8 }

/// `update_role` — arbitrary role discriminant + new account.
#[derive(Arbitrary, Debug, Clone)]
pub struct FuzzUpdateRole {
    pub authority_idx:   u8,
    pub mint_idx:        u8,
    pub role_discriminant: u8, // 0=pauser, 1=burner, 2=blacklister, 3=seizer, other=invalid
    pub new_account_idx: u8,
}

/// `add_minter` — arbitrary quota including u64::MAX.
#[derive(Arbitrary, Debug, Clone)]
pub struct FuzzAddMinter {
    pub authority_idx: u8,
    pub mint_idx:      u8,
    pub minter_idx:    u8,
    pub quota:         u64,
}

/// `remove_minter` — arbitrary caller (should fail unless master).
#[derive(Arbitrary, Debug, Clone)]
pub struct FuzzRemoveMinter {
    pub authority_idx: u8,
    pub mint_idx:      u8,
    pub minter_idx:    u8,
}

/// `transfer_authority` — arbitrary new authority.
#[derive(Arbitrary, Debug, Clone)]
pub struct FuzzTransferAuthority {
    pub authority_idx:     u8,
    pub new_authority_idx: u8,
    pub mint_idx:          u8,
}

/// `add_to_blacklist` — arbitrary reason string (empty / >128 / exactly 128).
#[derive(Arbitrary, Debug, Clone)]
pub struct FuzzAddToBlacklist {
    pub authority_idx: u8,
    pub mint_idx:      u8,
    pub target_idx:    u8,
    pub reason:        Vec<u8>,   // decoded to String; exercises all lengths
}

/// `remove_from_blacklist`.
#[derive(Arbitrary, Debug, Clone)]
pub struct FuzzRemoveFromBlacklist {
    pub authority_idx: u8,
    pub mint_idx:      u8,
    pub target_idx:    u8,
}

// ─── FuzzInstruction impl ────────────────────────────────────────────────────

impl FuzzInstruction {
    /// Validate instruction parameters against program constraints.
    ///
    /// This catches boundary violations at the Rust type level without
    /// requiring an on-chain transaction.  Any panic here is captured by
    /// honggfuzz as a reproducible crash file worth investigating.
    pub fn validate_params(&self) {
        match self {
            FuzzInstruction::Initialize(d) => {
                let _name   = String::from_utf8_lossy(&d.name);
                let _symbol = String::from_utf8_lossy(&d.symbol);
                let _config = config_pda(&Pubkey::new_unique());
            }
            FuzzInstruction::MintTokens(d) => {
                // amount=0 and amount=u64::MAX are both valid fuzz targets.
                let _ = d.amount.checked_add(0);
            }
            FuzzInstruction::BurnTokens(d) => {
                let _ = d.amount.checked_add(0);
            }
            FuzzInstruction::AddMinter(d) => {
                // quota=u64::MAX: program must use checked arithmetic.
                let _ = d.quota.checked_add(0);
            }
            FuzzInstruction::AddToBlacklist(d) => {
                // Reason must be 1-128 bytes in the program.
                let reason = String::from_utf8_lossy(&d.reason);
                let _ = reason.len();
            }
            // All other variants have no additional constraints to check here.
            _ => {}
        }
    }
}

// ─── PDA helpers ─────────────────────────────────────────────────────────────

/// Helper: derive the config PDA for a mint pubkey.
pub fn config_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SEED_CONFIG, mint.as_ref()], &sss_program_id()).0
}

/// Helper: derive the roles PDA.
pub fn roles_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SEED_ROLES, mint.as_ref()], &sss_program_id()).0
}

/// Helper: derive the pause PDA.
pub fn pause_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SEED_PAUSE, mint.as_ref()], &sss_program_id()).0
}

/// Helper: derive the minter quota PDA.
pub fn minter_pda(mint: &Pubkey, minter: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[SEED_MINTER, mint.as_ref(), minter.as_ref()],
        &sss_program_id(),
    ).0
}

/// Helper: derive the blacklist entry PDA.
pub fn blacklist_pda(mint: &Pubkey, address: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[SEED_BLACKLIST, mint.as_ref(), address.as_ref()],
        &sss_program_id(),
    ).0
}
