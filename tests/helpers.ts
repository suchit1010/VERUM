import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  TransactionSignature,
} from "@solana/web3.js";

export function getProvider(): anchor.AnchorProvider {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  return provider;
}

export function getBasketVaultProgram(): Program<any> {
  return anchor.workspace.BasketVault as Program<any>;
}

export async function airdropSol(
  provider: anchor.AnchorProvider,
  to: PublicKey,
  solAmount = 2
): Promise<TransactionSignature> {
  const sig = await provider.connection.requestAirdrop(
    to,
    Math.round(solAmount * LAMPORTS_PER_SOL)
  );

  await provider.connection.confirmTransaction(sig, "confirmed");
  return sig;
}

export async function fundedKeypair(
  provider: anchor.AnchorProvider,
  solAmount = 2
): Promise<Keypair> {
  const keypair = Keypair.generate();
  await airdropSol(provider, keypair.publicKey, solAmount);
  return keypair;
}
