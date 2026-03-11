import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import { getCliConfig, createProvider, formatOutput, loadKeypair } from "../config";

export function registerBurnCommand(program: Command) {
  program
    .command("burn <amount>")
    .description("Burn tokens from your account")
    .requiredOption("--mint <address>", "Stablecoin mint address")
    .action(async (amount: string, opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log(`\n🔥 Burning ${amount} tokens...\n`);

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);

        const burner = loadKeypair(cliConfig.keypairPath);
        const signature = await stablecoin.burn({
          amount: BigInt(amount),
          burner,
        });

        console.log(formatOutput({
          status: "✅ Tokens burned",
          amount,
          signature,
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });
}
