import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import { getCliConfig, createProvider, formatOutput } from "../config";

export function registerStatusCommand(program: Command) {
  program
    .command("status")
    .description("Show stablecoin status and configuration")
    .requiredOption("--mint <address>", "Stablecoin mint address")
    .action(async (opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const config = await stablecoin.getConfig();
        const supply = await stablecoin.getTotalSupply();
        const paused = await stablecoin.isPaused();

        const preset = config.enablePermanentDelegate && config.enableTransferHook
          ? "SSS-2 (Compliant)"
          : "SSS-1 (Minimal)";

        const output = {
          name: config.name,
          symbol: config.symbol,
          mint: config.mint.toBase58(),
          authority: config.authority.toBase58(),
          decimals: config.decimals,
          preset,
          totalSupply: supply.toString(),
          paused: paused ? "⏸️ YES" : "▶️ NO",
          permanentDelegate: config.enablePermanentDelegate ? "✅" : "❌",
          transferHook: config.enableTransferHook ? "✅" : "❌",
          defaultFrozen: config.defaultAccountFrozen ? "✅" : "❌",
          createdAt: new Date(config.createdAt * 1000).toISOString(),
        };

        console.log("\n📊 Stablecoin Status\n");
        console.log(formatOutput(output, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command("supply")
    .description("Get total token supply")
    .requiredOption("--mint <address>", "Stablecoin mint address")
    .action(async (opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const supply = await stablecoin.getTotalSupply();

        console.log(formatOutput({
          totalSupply: supply.toString(),
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });
}
