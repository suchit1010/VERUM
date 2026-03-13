import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionSignature,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";

import { SssAccounts } from "./accounts/index";
import { ComplianceModule } from "./compliance";
import {
  StablecoinCreateParams,
  resolveParams,
} from "./presets";
import {
  SSS_STABLECOIN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  StablecoinConfig,
  RoleConfig,
  PauseState,
  MinterQuota,
} from "./types";
import { parseSssError } from "./errors";
import { StablecoinInstructionBuilder } from "./instructions";
import SssStablecoinIdl from "./idl.json";

/**
 * SolanaStablecoin — Main SDK entry point.
 *
 * Usage:
 * ```ts
 * // Create with preset
 * const stable = await SolanaStablecoin.create(connection, {
 *   preset: "SSS_2",
 *   name: "My Stablecoin",
 *   symbol: "MYUSD",
 *   decimals: 6,
 *   authority: adminKeypair,
 * });
 *
 * // Load existing
 * const existing = await SolanaStablecoin.load(connection, mintAddress);
 *
 * // Operations
 * await stable.mint({ recipient, amount: 1_000_000n, minter });
 * await stable.freeze(accountAddress);
 * ```
 */
export class SolanaStablecoin {
  public readonly accounts: SssAccounts;
  public readonly compliance: ComplianceModule;
  public readonly instructionBuilder: StablecoinInstructionBuilder;

  private constructor(
    public readonly connection: Connection,
    public readonly program: Program,
    public readonly mintAddress: PublicKey,
    public readonly config: StablecoinConfig,
    public readonly programId: PublicKey = SSS_STABLECOIN_PROGRAM_ID
  ) {
    this.accounts = new SssAccounts(this.programId, SSS_TRANSFER_HOOK_PROGRAM_ID);
    this.compliance = new ComplianceModule(this);
    this.instructionBuilder = new StablecoinInstructionBuilder(this);
  }

  /**
   * Create a new stablecoin with the given parameters.
   * Supports SSS-1 and SSS-2 presets, or fully custom configuration.
   */
  static async create(
    provider: AnchorProvider,
    params: StablecoinCreateParams & { authority: Keypair },
    programId: PublicKey = SSS_STABLECOIN_PROGRAM_ID
  ): Promise<{ stablecoin: SolanaStablecoin; mint: Keypair; signature: TransactionSignature }> {
    const program = new Program(
      SssStablecoinIdl as anchor.Idl,
      provider
    );

    const initParams = resolveParams(params);
    const mintKeypair = Keypair.generate();
    const accounts = new SssAccounts(programId);

    const [configPda] = accounts.getConfigPda(mintKeypair.publicKey);
    const [rolesPda] = accounts.getRolesPda(mintKeypair.publicKey);
    const [pausePda] = accounts.getPausePda(mintKeypair.publicKey);

    try {
      const signature = await program.methods
        .initialize(initParams)
        .accounts({
          authority: params.authority.publicKey,
          mint: mintKeypair.publicKey,
          config: configPda,
          roleConfig: rolesPda,
          pauseState: pausePda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([params.authority, mintKeypair])
        .rpc();

      const stablecoin = await SolanaStablecoin.load(
        provider,
        mintKeypair.publicKey,
        programId
      );

      return { stablecoin, mint: mintKeypair, signature };
    } catch (err) {
      throw parseSssError(err);
    }
  }

  /**
   * Load an existing stablecoin by its mint address.
   */
  static async load(
    provider: AnchorProvider,
    mint: PublicKey,
    programId: PublicKey = SSS_STABLECOIN_PROGRAM_ID
  ): Promise<SolanaStablecoin> {
    const program = new Program(
      SssStablecoinIdl as anchor.Idl,
      provider
    );

    const accounts = new SssAccounts(programId);
    const [configPda] = accounts.getConfigPda(mint);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const configAccount = await (program.account as any).stablecoinConfig.fetch(configPda);
    const config: StablecoinConfig = {
      mint: configAccount.mint,
      authority: configAccount.authority,
      name: configAccount.name,
      symbol: configAccount.symbol,
      uri: configAccount.uri,
      decimals: configAccount.decimals,
      enablePermanentDelegate: configAccount.enablePermanentDelegate,
      enableTransferHook: configAccount.enableTransferHook,
      defaultAccountFrozen: configAccount.defaultAccountFrozen,
      enableConfidentialTransfer: configAccount.enableConfidentialTransfer,
      bump: configAccount.bump,
      createdAt: configAccount.createdAt.toNumber(),
    };

    return new SolanaStablecoin(provider.connection, program, mint, config, programId);
  }

  // ─── Core Operations ────────────────────────────────────────────

  /**
   * Mint tokens to a recipient.
   */
  async mint(params: {
    recipient: PublicKey;
    amount: bigint | number;
    minter: Keypair;
  }): Promise<TransactionSignature> {
    const amount = new BN(params.amount.toString());
    const [configPda] = this.accounts.getConfigPda(this.mintAddress);
    const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
    const [minterQuotaPda] = this.accounts.getMinterQuotaPda(this.mintAddress, params.minter.publicKey);
    const [pausePda] = this.accounts.getPausePda(this.mintAddress);

    const recipientAta = getAssociatedTokenAddressSync(
      this.mintAddress,
      params.recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    try {
      return await this.program.methods
        .mintTokens(amount)
        .accounts({
          minter: params.minter.publicKey,
          config: configPda,
          roleConfig: rolesPda,
          minterQuota: minterQuotaPda,
          pauseState: pausePda,
          mint: this.mintAddress,
          recipientTokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([params.minter])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  /**
   * Burn tokens from the burner's account.
   */
  async burn(params: {
    amount: bigint | number;
    burner: Keypair;
  }): Promise<TransactionSignature> {
    const amount = new BN(params.amount.toString());
    const [configPda] = this.accounts.getConfigPda(this.mintAddress);
    const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
    const [pausePda] = this.accounts.getPausePda(this.mintAddress);

    const burnerAta = getAssociatedTokenAddressSync(
      this.mintAddress,
      params.burner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    try {
      return await this.program.methods
        .burnTokens(amount)
        .accounts({
          burner: params.burner.publicKey,
          config: configPda,
          roleConfig: rolesPda,
          pauseState: pausePda,
          mint: this.mintAddress,
          burnerTokenAccount: burnerAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([params.burner])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  /**
   * Freeze a token account.
   */
  async freeze(
    targetAccount: PublicKey,
    authority: Keypair
  ): Promise<TransactionSignature> {
    const [configPda] = this.accounts.getConfigPda(this.mintAddress);
    const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);

    try {
      return await this.program.methods
        .freezeAccount()
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          roleConfig: rolesPda,
          mint: this.mintAddress,
          targetAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  /**
   * Thaw a frozen token account.
   */
  async thaw(
    targetAccount: PublicKey,
    authority: Keypair
  ): Promise<TransactionSignature> {
    const [configPda] = this.accounts.getConfigPda(this.mintAddress);
    const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);

    try {
      return await this.program.methods
        .thawAccount()
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          roleConfig: rolesPda,
          mint: this.mintAddress,
          targetAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  /**
   * Pause all operations.
   */
  async pause(authority: Keypair): Promise<TransactionSignature> {
    const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
    const [pausePda] = this.accounts.getPausePda(this.mintAddress);

    try {
      return await this.program.methods
        .pause()
        .accounts({
          authority: authority.publicKey,
          roleConfig: rolesPda,
          pauseState: pausePda,
        })
        .signers([authority])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  /**
   * Unpause operations.
   */
  async unpause(authority: Keypair): Promise<TransactionSignature> {
    const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
    const [pausePda] = this.accounts.getPausePda(this.mintAddress);

    try {
      return await this.program.methods
        .unpause()
        .accounts({
          authority: authority.publicKey,
          roleConfig: rolesPda,
          pauseState: pausePda,
        })
        .signers([authority])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  // ─── Role Management ────────────────────────────────────────────

  /**
   * Add a minter with a quota.
   */
  async addMinter(
    minter: PublicKey,
    quota: bigint | number,
    authority: Keypair
  ): Promise<TransactionSignature> {
    const [configPda] = this.accounts.getConfigPda(this.mintAddress);
    const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
    const [minterQuotaPda] = this.accounts.getMinterQuotaPda(this.mintAddress, minter);

    try {
      return await this.program.methods
        .addMinter(new BN(quota.toString()))
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          roleConfig: rolesPda,
          mint: this.mintAddress,
          minter,
          minterQuota: minterQuotaPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  /**
   * Remove a minter.
   */
  async removeMinter(
    minter: PublicKey,
    authority: Keypair
  ): Promise<TransactionSignature> {
    const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);
    const [minterQuotaPda] = this.accounts.getMinterQuotaPda(this.mintAddress, minter);

    try {
      return await this.program.methods
        .removeMinter()
        .accounts({
          authority: authority.publicKey,
          roleConfig: rolesPda,
          minterQuota: minterQuotaPda,
        })
        .signers([authority])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  /**
   * Transfer master authority.
   */
  async transferAuthority(
    newAuthority: PublicKey,
    currentAuthority: Keypair
  ): Promise<TransactionSignature> {
    const [configPda] = this.accounts.getConfigPda(this.mintAddress);
    const [rolesPda] = this.accounts.getRolesPda(this.mintAddress);

    try {
      return await this.program.methods
        .transferAuthority()
        .accounts({
          authority: currentAuthority.publicKey,
          config: configPda,
          roleConfig: rolesPda,
          newAuthority,
        })
        .signers([currentAuthority])
        .rpc();
    } catch (err) {
      throw parseSssError(err);
    }
  }

  // ─── Read Operations ────────────────────────────────────────────

  /**
   * Get current total supply of the stablecoin.
   */
  async getTotalSupply(): Promise<bigint> {
    const mintInfo = await this.connection.getTokenSupply(this.mintAddress);
    return BigInt(mintInfo.value.amount);
  }

  /**
   * Get the stablecoin configuration.
   */
  async getConfig(): Promise<StablecoinConfig> {
    const [configPda] = this.accounts.getConfigPda(this.mintAddress);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = await (this.program.account as any).stablecoinConfig.fetch(configPda);
    return {
      mint: account.mint,
      authority: account.authority,
      name: account.name,
      symbol: account.symbol,
      uri: account.uri,
      decimals: account.decimals,
      enablePermanentDelegate: account.enablePermanentDelegate,
      enableTransferHook: account.enableTransferHook,
      defaultAccountFrozen: account.defaultAccountFrozen,
      enableConfidentialTransfer: account.enableConfidentialTransfer,
      bump: account.bump,
      createdAt: account.createdAt.toNumber(),
    };
  }

  /**
   * Get the pause state.
   */
  async isPaused(): Promise<boolean> {
    const [pausePda] = this.accounts.getPausePda(this.mintAddress);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = await (this.program.account as any).pauseState.fetch(pausePda);
    return account.paused;
  }

  /**
   * Get a minter's quota info.
   */
  async getMinterQuota(minter: PublicKey): Promise<MinterQuota | null> {
    const [minterQuotaPda] = this.accounts.getMinterQuotaPda(this.mintAddress, minter);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = await (this.program.account as any).minterQuota.fetch(minterQuotaPda);
      return {
        mint: account.mint,
        minter: account.minter,
        quota: BigInt(account.quota.toString()),
        minted: BigInt(account.minted.toString()),
        active: account.active,
        bump: account.bump,
        createdAt: account.createdAt.toNumber(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if an address is blacklisted (SSS-2).
   */
  async isBlacklisted(address: PublicKey): Promise<boolean> {
    const [blacklistPda] = this.accounts.getBlacklistPda(this.mintAddress, address);
    const accountInfo = await this.connection.getAccountInfo(blacklistPda);
    return accountInfo !== null;
  }
}
