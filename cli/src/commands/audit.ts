import { Command } from "commander";

export function registerAuditCommand(program: Command) {
  program
    .command("audit-log")
    .description("View audit log (from backend indexer)")
    .requiredOption("--mint <address>", "Stablecoin mint address")
    .option("--action <type>", "Filter by action type (mint, burn, freeze, blacklist, seize)")
    .option("--limit <n>", "Number of entries to show", "20")
    .action(async (opts: any) => {
      console.log("\n📋 Audit Log\n");
      console.log("  ⚠️  Audit log requires the backend indexer to be running.");
      console.log("  Start it with: cd backend && docker compose up\n");
      console.log("  Once running, query: GET http://localhost:3000/api/audit-log");
      console.log(`  Mint: ${opts.mint}`);
      if (opts.action) {
        console.log(`  Filter: ${opts.action}`);
      }
      console.log(`  Limit: ${opts.limit}\n`);

      // In production, this would query the backend API
      // For now, point users to the backend service
      console.log("  Tip: Use --output json for programmatic access\n");
    });
}
