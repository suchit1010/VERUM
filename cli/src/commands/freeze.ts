import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import { getCliConfig, createProvider, formatOutput, loadKeypair } from "../config";

export function registerFreezeCommand(program: Command) {
  const freeze = program
    .command("freeze <address>")
    .description("Freeze a token account")
    .requiredOption("--mint <mintAddress>", "Stablecoin mint address")
    .action(async (address: string, opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log(`\n❄️ Freezing account ${address}...\n`);

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const authority = loadKeypair(cliConfig.keypairPath);
        const signature = await stablecoin.freeze(new PublicKey(address), authority);

        console.log(formatOutput({
          status: "✅ Account frozen",
          account: address,
          signature,
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command("thaw <address>")
    .description("Thaw a frozen token account")
    .requiredOption("--mint <mintAddress>", "Stablecoin mint address")
    .action(async (address: string, opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log(`\n🔥 Thawing account ${address}...\n`);

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const authority = loadKeypair(cliConfig.keypairPath);
        const signature = await stablecoin.thaw(new PublicKey(address), authority);

        console.log(formatOutput({
          status: "✅ Account thawed",
          account: address,
          signature,
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });
}
