import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";

const SEED_CONFIG = Buffer.from("config");
const SEED_ROLES = Buffer.from("roles");
const SEED_PAUSE = Buffer.from("pause");

/**
 * Helper functions for test setup
 */

export async function createTestStablecoin(
  program: anchor.Program,
  authority: anchor.Wallet,
  options: {
    preset: "sss-1" | "sss-2";
    name?: string;
    symbol?: string;
    decimals?: number;
  }
) {
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  const [configPda] = PublicKey.findProgramAddressSync(
    [SEED_CONFIG, mint.toBuffer()],
    program.programId
  );
  const [rolesPda] = PublicKey.findProgramAddressSync(
    [SEED_ROLES, mint.toBuffer()],
    program.programId
  );
  const [pausePda] = PublicKey.findProgramAddressSync(
    [SEED_PAUSE, mint.toBuffer()],
    program.programId
  );

  const isSss2 = options.preset === "sss-2";

  const params = {
    name: options.name || `Test ${options.preset.toUpperCase()}`,
    symbol: options.symbol || (isSss2 ? "TS2" : "TS1"),
    uri: "",
    decimals: options.decimals || 6,
    enablePermanentDelegate: isSss2,
    enableTransferHook: isSss2,
    defaultAccountFrozen: false,
    enableConfidentialTransfer: false,
  };

  await program.methods
    .initialize(params)
    .accounts({
      authority: authority.publicKey,
      mint: mint,
      config: configPda,
      roleConfig: rolesPda,
      pauseState: pausePda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([mintKeypair])
    .rpc();

  return {
    mint,
    mintKeypair,
    configPda,
    rolesPda,
    pausePda,
    params,
  };
}

export function expectError(err: any, errorName: string) {
  expect(err).to.not.be.undefined;
  const msg = err.message || err.toString();
  expect(msg).to.include(errorName);
}
