import { Command } from "commander";
import { Keypair, PublicKey } from "@solana/web3.js";
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import { getCliConfig, createProvider, loadCustomConfig, formatOutput } from "../config";

export function registerInitCommand(program: Command) {
  program
    .command("init")
    .description("Initialize a new stablecoin")
    .option("--preset <preset>", "Use preset: sss-1 or sss-2")
    .option("--custom <config>", "Path to custom TOML/JSON config file")
    .option("--name <name>", "Token name")
    .option("--symbol <symbol>", "Token symbol")
    .option("--decimals <decimals>", "Decimal precision", "6")
    .option("--uri <uri>", "Metadata URI", "")
    .action(async (opts) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      let name = opts.name;
      let symbol = opts.symbol;
      let decimals = parseInt(opts.decimals);
      let uri = opts.uri || "";
      let preset: "SSS_1" | "SSS_2" | undefined;

      if (opts.custom) {
        const config = loadCustomConfig(opts.custom);
        name = config.name || name;
        symbol = config.symbol || symbol;
        decimals = config.decimals ?? decimals;
        uri = config.uri || uri;
      } else if (opts.preset) {
        preset = opts.preset === "sss-2" ? "SSS_2" : "SSS_1";
      } else {
        preset = "SSS_1";
      }

      if (!name || !symbol) {
        console.error("Error: --name and --symbol are required");
        process.exit(1);
      }

      console.log(`\n✨ Initializing ${preset || "custom"} stablecoin...\n`);
      console.log(`  Name:     ${name}`);
      console.log(`  Symbol:   ${symbol}`);
      console.log(`  Decimals: ${decimals}`);
      console.log(`  Preset:   ${preset || "custom"}\n`);

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const authority = Keypair.fromSecretKey(
          (provider.wallet as any).payer.secretKey
        );

        const { stablecoin, mint, signature } = await SolanaStablecoin.create(
          provider,
          { preset, name, symbol, decimals, uri, authority }
        );

        const output = {
          status: "✅ Stablecoin initialized",
          mint: mint.publicKey.toBase58(),
          preset: preset || "custom",
          signature,
        };

        console.log(formatOutput(output, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });
}
