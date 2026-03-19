#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use spl_token_2022::extension::StateWithExtensions;
use spl_token_2022::state::Account as TokenAccount;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use sss_common::seeds::*;

declare_id!("6x8XMLoA9FFmVJnaDou9tyKrh9CFynDY7TtKJ54p4dcN");

const SSS_STABLECOIN_PROGRAM_ID: Pubkey = pubkey!("HJ6TUXQ34XhDrmvcozMsBWhSuEVkEcYeqoTWo1Bcmzet");

/// Transfer Hook Program for SSS-2 Compliant Stablecoins.
///
/// This program is called automatically by the Token-2022 runtime on every
/// `transfer` and `transfer_checked` instruction for tokens that have the
/// TransferHook extension enabled.
///
/// It performs O(1) blacklist checks on both sender and receiver by attempting
/// to derive their BlacklistEntry PDAs. If either PDA exists, the transfer
/// is blocked.
#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Called by Token-2022 runtime on every transfer.
    /// Checks both source and destination against the blacklist.
    ///
    /// The extra_account_metas are resolved by the runtime and passed as
    /// remaining_accounts. We expect:
    ///   [0] = sss-stablecoin program
    ///   [1] = source owner blacklist PDA (may not exist = not blacklisted)
    ///   [2] = destination owner blacklist PDA (may not exist = not blacklisted)
    pub fn transfer_hook(
        ctx: Context<TransferHook>,
        _amount: u64,
    ) -> Result<()> {
        // Validate stablecoin program account used for external PDA derivation.
        require_keys_eq!(
            ctx.accounts.sss_program.key(),
            SSS_STABLECOIN_PROGRAM_ID,
            TransferHookError::InvalidStablecoinProgram,
        );
        require!(
            ctx.accounts.sss_program.executable,
            TransferHookError::InvalidStablecoinProgram,
        );

        // Parse token accounts so PDA checks are owner-based (wallet-level),
        // not ATA-level (account-level).
        let source_data = ctx.accounts.source.try_borrow_data()?;
        let source_token = StateWithExtensions::<TokenAccount>::unpack(&source_data)
            .map_err(|_| error!(TransferHookError::InvalidSourceTokenAccount))?;

        let destination_data = ctx.accounts.destination.try_borrow_data()?;
        let destination_token = StateWithExtensions::<TokenAccount>::unpack(&destination_data)
            .map_err(|_| error!(TransferHookError::InvalidDestinationTokenAccount))?;

        // Ensure both token accounts belong to this mint.
        require_keys_eq!(
            source_token.base.mint,
            ctx.accounts.mint.key(),
            TransferHookError::SourceMintMismatch,
        );
        require_keys_eq!(
            destination_token.base.mint,
            ctx.accounts.mint.key(),
            TransferHookError::DestinationMintMismatch,
        );

        // Re-derive expected blacklist PDAs from owner keys and verify the
        // runtime-resolved accounts match exactly.
        let mint_key = ctx.accounts.mint.key();

        let (expected_source_blacklist, _) = Pubkey::find_program_address(
            &[
                SEED_BLACKLIST,
                mint_key.as_ref(),
                source_token.base.owner.as_ref(),
            ],
            &SSS_STABLECOIN_PROGRAM_ID,
        );
        require_keys_eq!(
            ctx.accounts.source_blacklist.key(),
            expected_source_blacklist,
            TransferHookError::InvalidSourceBlacklistPda,
        );

        let (expected_destination_blacklist, _) = Pubkey::find_program_address(
            &[
                SEED_BLACKLIST,
                mint_key.as_ref(),
                destination_token.base.owner.as_ref(),
            ],
            &SSS_STABLECOIN_PROGRAM_ID,
        );
        require_keys_eq!(
            ctx.accounts.destination_blacklist.key(),
            expected_destination_blacklist,
            TransferHookError::InvalidDestinationBlacklistPda,
        );

        // Check if source is blacklisted
        let source_blacklist = &ctx.accounts.source_blacklist;
        if source_blacklist.data_len() > 0 {
            require_keys_eq!(
                *source_blacklist.owner,
                SSS_STABLECOIN_PROGRAM_ID,
                TransferHookError::InvalidSourceBlacklistOwner,
            );
            msg!("Transfer blocked: source address is blacklisted");
            return Err(error!(TransferHookError::SourceBlacklisted));
        }

        // Check if destination is blacklisted
        let dest_blacklist = &ctx.accounts.destination_blacklist;
        if dest_blacklist.data_len() > 0 {
            require_keys_eq!(
                *dest_blacklist.owner,
                SSS_STABLECOIN_PROGRAM_ID,
                TransferHookError::InvalidDestinationBlacklistOwner,
            );
            msg!("Transfer blocked: destination address is blacklisted");
            return Err(error!(TransferHookError::DestinationBlacklisted));
        }

        Ok(())
    }

    /// Initialize the ExtraAccountMetaList for this mint.
    /// Called once after mint initialization to set up the additional
    /// accounts that the transfer hook needs.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Define the extra accounts the hook needs:
        // 1. Source blacklist PDA: ["blacklist", mint, source_owner]
        // 2. Destination blacklist PDA: ["blacklist", mint, dest_owner]
        let extra_metas = vec![
            // index 5: The sss-stablecoin program ID
            ExtraAccountMeta::new_with_pubkey(
                &SSS_STABLECOIN_PROGRAM_ID,
                false,
                false,
            )?,
            // index 6: Source owner's blacklist entry
            ExtraAccountMeta::new_external_pda_with_seeds(
                5, // program id index
                &[
                    Seed::Literal {
                        bytes: SEED_BLACKLIST.to_vec(),
                    },
                    Seed::AccountKey { index: 1 }, // mint
                    Seed::AccountData { 
                        account_index: 0, // source token account
                        data_index: 32, // owner pubkey offset
                        length: 32, 
                    },
                ],
                false, // is_signer
                false, // is_writable
            )?,
            // index 7: Destination owner's blacklist entry
            ExtraAccountMeta::new_external_pda_with_seeds(
                5, // program id index
                &[
                    Seed::Literal {
                        bytes: SEED_BLACKLIST.to_vec(),
                    },
                    Seed::AccountKey { index: 1 }, // mint
                    Seed::AccountData { 
                        account_index: 2, // destination token account
                        data_index: 32, // owner pubkey offset
                        length: 32, 
                    },
                ],
                false,
                false,
            )?,
        ];

        // Allocate space for the ExtraAccountMetaList
        let account_size = ExtraAccountMetaList::size_of(
            extra_metas.len(),
        )?;

        // Calculate minimum rent
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(account_size);

        let mint_key = ctx.accounts.mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            SEED_EXTRA_ACCOUNT_METAS,
            mint_key.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ]];

        // Create the account via CPI to System Program
        anchor_lang::system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
                signer_seeds,
            ),
            lamports,
            account_size as u64,
            ctx.program_id,
        )?;

        // Initialize
        let extra_account_metas_info = ctx.accounts.extra_account_meta_list.to_account_info();
        let mut data = extra_account_metas_info.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut data,
            &extra_metas,
        )?;

        Ok(())
    }

    /// Fallback instruction handler required by the Transfer Hook interface.
    /// Routes Execute instructions to our transfer_hook handler.
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = spl_transfer_hook_interface::instruction::TransferHookInstruction::unpack(data)?;

        // Match the Execute instruction
        match instruction {
            spl_transfer_hook_interface::instruction::TransferHookInstruction::Execute { amount } => {
                // Re-route to transfer_hook
                let amount_bytes = amount.to_le_bytes();
                __private::__global::transfer_hook(program_id, accounts, &amount_bytes)
            }
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// The source token account
    /// CHECK: Validated by Token-2022 runtime
    pub source: UncheckedAccount<'info>,

    /// The mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// The destination token account
    /// CHECK: Validated by Token-2022 runtime
    pub destination: UncheckedAccount<'info>,

    /// The source authority (owner/delegate validated by Token-2022 before hook call)
    /// CHECK: Signer is validated by Token-2022 in the parent transfer instruction.
    pub authority: UncheckedAccount<'info>,

    /// Extra Account Meta List PDA
    /// CHECK: Validated by seeds constraint
    #[account(
        seeds = [SEED_EXTRA_ACCOUNT_METAS, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// The sss-stablecoin program ID
    /// CHECK: We added this to `initialize_extra_account_meta_list` as index 5
    /// so that we could use it to derive external PDAs for the blacklist.
    /// Token-2022 runtime passes accounts in the exact order they are added
    /// to the ExtraAccountMetaList, so we MUST expect it here before the blacklist PDAs.
    pub sss_program: UncheckedAccount<'info>,

    /// Source owner's blacklist PDA (may not exist)
    /// CHECK: We only check if it has data (exists = blacklisted)
    pub source_blacklist: UncheckedAccount<'info>,

    /// Destination owner's blacklist PDA (may not exist)
    /// CHECK: We only check if it has data (exists = blacklisted)
    pub destination_blacklist: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    /// The authority paying for the account
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The mint this hook is for
    pub mint: InterfaceAccount<'info, Mint>,

    /// The ExtraAccountMetaList PDA
    /// CHECK: Created and initialized in this instruction
    #[account(
        mut,
        seeds = [SEED_EXTRA_ACCOUNT_METAS, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum TransferHookError {
    #[msg("Transfer blocked: source address is blacklisted")]
    SourceBlacklisted,

    #[msg("Transfer blocked: destination address is blacklisted")]
    DestinationBlacklisted,

    #[msg("Invalid stablecoin program account")]
    InvalidStablecoinProgram,

    #[msg("Invalid source token account")]
    InvalidSourceTokenAccount,

    #[msg("Invalid destination token account")]
    InvalidDestinationTokenAccount,

    #[msg("Source token account mint mismatch")]
    SourceMintMismatch,

    #[msg("Destination token account mint mismatch")]
    DestinationMintMismatch,

    #[msg("Invalid source blacklist PDA")]
    InvalidSourceBlacklistPda,

    #[msg("Invalid destination blacklist PDA")]
    InvalidDestinationBlacklistPda,

    #[msg("Source blacklist account owner mismatch")]
    InvalidSourceBlacklistOwner,

    #[msg("Destination blacklist account owner mismatch")]
    InvalidDestinationBlacklistOwner,
}
