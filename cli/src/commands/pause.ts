import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import { getCliConfig, createProvider, formatOutput, loadKeypair } from "../config";

export function registerPauseCommand(program: Command) {
  program
    .command("pause")
    .description("Pause all token operations")
    .requiredOption("--mint <address>", "Stablecoin mint address")
    .action(async (opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log("\n⏸️ Pausing token operations...\n");

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const authority = loadKeypair(cliConfig.keypairPath);
        const signature = await stablecoin.pause(authority);

        console.log(formatOutput({
          status: "✅ Operations paused",
          signature,
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command("unpause")
    .description("Unpause token operations")
    .requiredOption("--mint <address>", "Stablecoin mint address")
    .action(async (opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log("\n▶️ Unpausing token operations...\n");

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const authority = loadKeypair(cliConfig.keypairPath);
        const signature = await stablecoin.unpause(authority);

        console.log(formatOutput({
          status: "✅ Operations unpaused",
          signature,
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });
}
