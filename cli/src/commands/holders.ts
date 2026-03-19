import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { SolanaStablecoin } from "@stbr/sss-token";
import { getCliConfig, createProvider, formatOutput } from "../config";

export function registerHoldersCommand(program: Command) {
  program
    .command("holders")
    .description("List all token holders")
    .requiredOption("--mint <mintAddress>", "Stablecoin mint address")
    .option("--min-balance <amount>", "Minimum balance to filter", "0")
    .action(async (opts: any) => {
      const cliConfig = getCliConfig(program.opts());
      const provider = createProvider(cliConfig);

      console.log(`\n👥 Fetching token holders...`);
      if (opts.minBalance !== "0") {
        console.log(`   Filter: Balance >= ${opts.minBalance}`);
      }
      console.log();

      try {
        const mintPubkey = new PublicKey(opts.mint);
        const stablecoin = await SolanaStablecoin.load(provider, mintPubkey);
        
        const accounts = await provider.connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
          filters: [
            { dataSize: 165 }, // SPL Token account size
            { memcmp: { offset: 0, bytes: mintPubkey.toBase58() } } // Mint is at offset 0
          ]
        });

        // Parse balances (we assume standard layout)
        const holders: Array<{ owner: string; balance: bigint }> = [];
        const decimalsBigInt = BigInt(Math.pow(10, stablecoin.config.decimals));

        for (const accountInfo of accounts) {
            const data = accountInfo.account.data;
            const owner = new PublicKey(data.slice(32, 64)).toBase58();
            // Balance is at offset 64, 8 bytes, little endian
            const balanceBuf = data.slice(64, 72);
            let balance = BigInt(0);
            for (let i = 0; i < 8; i++) {
                balance += BigInt(balanceBuf[i]) << BigInt(8 * i);
            }

            if (balance >= BigInt(opts.minBalance)) {
                holders.push({ owner, balance });
            }
        }

        // Sort by balance descending
        holders.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));

        if (holders.length === 0) {
            console.log("No holders found.");
        } else {
            holders.forEach((h) => {
                console.log(formatOutput({
                    owner: h.owner,
                    balance: h.balance.toString(),
                }, cliConfig.outputFormat));
                console.log("---");
            });
            console.log(`\nTotal Holders: ${holders.length}`);
        }
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      }
    });
}
