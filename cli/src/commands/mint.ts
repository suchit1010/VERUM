import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import { getCliConfig, createProvider, formatOutput, loadKeypair } from "../config";

export function registerMintCommand(program: Command) {
  program
    .command("mint <recipient> <amount>")
    .description("Mint tokens to a recipient address")
    .requiredOption("--mint <address>", "Stablecoin mint address")
    .action(async (recipient: string, amount: string, opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log(`\n🪙 Minting ${amount} tokens to ${recipient}...\n`);

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const recipientPubkey = new PublicKey(recipient);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);

        const minter = loadKeypair(cliConfig.keypairPath);
        const signature = await stablecoin.mint({
          recipient: recipientPubkey,
          amount: BigInt(amount),
          minter,
        });

        console.log(formatOutput({
          status: "✅ Tokens minted",
          amount,
          recipient,
          signature,
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });
}
