import { PublicKey } from "@solana/web3.js";
import { SEEDS, SSS_STABLECOIN_PROGRAM_ID, SSS_TRANSFER_HOOK_PROGRAM_ID } from "../types";

/**
 * PDA derivation helpers — mirrors the on-chain PDA seeds exactly.
 * All derivations are O(1) and deterministic.
 */
export class SssAccounts {
  constructor(
    private programId: PublicKey = SSS_STABLECOIN_PROGRAM_ID,
    private hookProgramId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
  ) {}

  /** Derive StablecoinConfig PDA: ["config", mint] */
  getConfigPda(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEEDS.CONFIG, mint.toBuffer()],
      this.programId
    );
  }

  /** Derive RoleConfig PDA: ["roles", mint] */
  getRolesPda(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEEDS.ROLES, mint.toBuffer()],
      this.programId
    );
  }

  /** Derive MinterQuota PDA: ["minter", mint, minter_pubkey] */
  getMinterQuotaPda(mint: PublicKey, minter: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEEDS.MINTER, mint.toBuffer(), minter.toBuffer()],
      this.programId
    );
  }

  /** Derive BlacklistEntry PDA: ["blacklist", mint, address] */
  getBlacklistPda(mint: PublicKey, address: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEEDS.BLACKLIST, mint.toBuffer(), address.toBuffer()],
      this.programId
    );
  }

  /** Derive PauseState PDA: ["pause", mint] */
  getPausePda(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEEDS.PAUSE, mint.toBuffer()],
      this.programId
    );
  }

  /** Derive ExtraAccountMetaList PDA for transfer hook: ["extra-account-metas", mint] */
  getExtraAccountMetaListPda(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEEDS.EXTRA_ACCOUNT_METAS, mint.toBuffer()],
      this.hookProgramId
    );
  }

  /** Get all PDAs for a given mint (convenience method) */
  getAllPdas(mint: PublicKey) {
    return {
      config: this.getConfigPda(mint),
      roles: this.getRolesPda(mint),
      pause: this.getPausePda(mint),
      extraAccountMetaList: this.getExtraAccountMetaListPda(mint),
    };
  }
}

export default SssAccounts;
