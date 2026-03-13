import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import { getCliConfig, createProvider, formatOutput, loadKeypair } from "../config";

export function registerComplianceCommand(program: Command) {
  const blacklist = program
    .command("blacklist")
    .description("SSS-2 blacklist management");

  blacklist
    .command("add <address>")
    .description("Add an address to the blacklist")
    .requiredOption("--mint <mintAddress>", "Stablecoin mint address")
    .requiredOption("--reason <reason>", "Reason for blacklisting (e.g., 'OFAC match')")
    .action(async (address: string, opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log(`\n🚫 Adding ${address} to blacklist...\n`);
      console.log(`  Reason: ${opts.reason}\n`);

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const authority = loadKeypair(cliConfig.keypairPath);

        const signature = await stablecoin.compliance.blacklistAdd(
          new PublicKey(address),
          opts.reason,
          authority
        );

        console.log(formatOutput({
          status: "✅ Address blacklisted",
          address,
          reason: opts.reason,
          signature,
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });

  blacklist
    .command("remove <address>")
    .description("Remove an address from the blacklist")
    .requiredOption("--mint <mintAddress>", "Stablecoin mint address")
    .action(async (address: string, opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log(`\n✅ Removing ${address} from blacklist...\n`);

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const authority = loadKeypair(cliConfig.keypairPath);

        const signature = await stablecoin.compliance.blacklistRemove(
          new PublicKey(address),
          authority
        );

        console.log(formatOutput({
          status: "✅ Address removed from blacklist",
          address,
          signature,
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });

  blacklist
    .command("check <address>")
    .description("Check if an address is blacklisted")
    .requiredOption("--mint <mintAddress>", "Stablecoin mint address")
    .action(async (address: string, opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const isBlacklisted = await stablecoin.isBlacklisted(new PublicKey(address));

        console.log(formatOutput({
          address,
          blacklisted: isBlacklisted ? "🚫 YES" : "✅ NO",
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });

  // Seize command
  program
    .command("seize <address>")
    .description("Seize tokens from a blacklisted account (SSS-2)")
    .requiredOption("--mint <mintAddress>", "Stablecoin mint address")
    .requiredOption("--to <treasury>", "Treasury address to send seized tokens")
    .option("--amount <amount>", "Amount to seize (default: all)")
    .action(async (address: string, opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log(`\n⚖️ Seizing tokens from ${address}...\n`);
      console.log(`  To: ${opts.to}\n`);

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const authority = loadKeypair(cliConfig.keypairPath);

        const amount = opts.amount ? BigInt(opts.amount) : BigInt(0); // 0 = all

        const signature = await stablecoin.compliance.seize(
          new PublicKey(address),
          new PublicKey(opts.to),
          amount,
          authority
        );

        console.log(formatOutput({
          status: "✅ Tokens seized",
          from: address,
          to: opts.to,
          signature,
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });
}
