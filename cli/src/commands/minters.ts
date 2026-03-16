import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import { getCliConfig, createProvider, formatOutput, loadKeypair } from "../config";

export function registerMintersCommand(program: Command) {
  const minters = program
    .command("minters")
    .description("Manage minters");

  minters
    .command("list")
    .description("List all minters")
    .requiredOption("--mint <mintAddress>", "Stablecoin mint address")
    .action(async (opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const allMinters = await stablecoin.getAllMinters();

        console.log("\n👥 Minters List:\n");
        if (allMinters.length === 0) {
          console.log("No minters found.");
        } else {
          allMinters.forEach((m) => {
            console.log(formatOutput({
              minter: m.minter.toBase58(),
              active: m.active ? "✅" : "❌",
              quota: m.quota.toString(),
              minted: m.minted.toString(),
              remaining: (m.quota - m.minted).toString(),
            }, cliConfig.outputFormat));
            console.log("---");
          });
        }
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });

  minters
    .command("add <address>")
    .description("Add a new minter with quota")
    .requiredOption("--mint <mintAddress>", "Stablecoin mint address")
    .requiredOption("--quota <amount>", "Maximum mint quota")
    .action(async (address: string, opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log(`\n👤 Adding minter ${address} with quota ${opts.quota}...\n`);

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const authority = loadKeypair(cliConfig.keypairPath);

        const signature = await stablecoin.addMinter(
          new PublicKey(address),
          BigInt(opts.quota),
          authority
        );

        console.log(formatOutput({
          status: "✅ Minter added",
          minter: address,
          quota: opts.quota,
          signature,
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });

  minters
    .command("remove <address>")
    .description("Remove a minter")
    .requiredOption("--mint <mintAddress>", "Stablecoin mint address")
    .action(async (address: string, opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log(`\n🗑️ Removing minter ${address}...\n`);

      if (cliConfig.dryRun) {
        console.log("🔍 Dry run — no transaction sent.");
        return;
      }

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const authority = loadKeypair(cliConfig.keypairPath);

        const signature = await stablecoin.removeMinter(
          new PublicKey(address),
          authority
        );

        console.log(formatOutput({
          status: "✅ Minter removed",
          minter: address,
          signature,
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });

  minters
    .command("info <address>")
    .description("Get minter quota info")
    .requiredOption("--mint <mintAddress>", "Stablecoin mint address")
    .action(async (address: string, opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        const quota = await stablecoin.getMinterQuota(new PublicKey(address));

        if (!quota) {
          console.log("Minter not found");
          return;
        }

        console.log(formatOutput({
          minter: address,
          active: quota.active ? "✅" : "❌",
          quota: quota.quota.toString(),
          minted: quota.minted.toString(),
          remaining: (quota.quota - quota.minted).toString(),
        }, cliConfig.outputFormat));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });
}
