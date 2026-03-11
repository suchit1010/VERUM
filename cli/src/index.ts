#!/usr/bin/env node

import { Command } from "commander";
import { registerInitCommand } from "./commands/init";
import { registerMintCommand } from "./commands/mint";
import { registerBurnCommand } from "./commands/burn";
import { registerFreezeCommand } from "./commands/freeze";
import { registerPauseCommand } from "./commands/pause";
import { registerStatusCommand } from "./commands/status";
import { registerComplianceCommand } from "./commands/compliance";
import { registerMintersCommand } from "./commands/minters";
import { registerAuditCommand } from "./commands/audit";

const program = new Command();

program
  .name("sss-token")
  .description(
    "Admin CLI for the Solana Stablecoin Standard (SSS)\n\n" +
    "Manage SSS-1 (Minimal) and SSS-2 (Compliant) stablecoins on Solana."
  )
  .version("0.1.0")
  .option("-k, --keypair <path>", "Path to keypair file", "~/.config/solana/id.json")
  .option("-u, --url <url>", "Solana RPC URL", "http://localhost:8899")
  .option("--output <format>", "Output format: text | json", "text")
  .option("--dry-run", "Simulate transaction without sending")
  .option("-y, --yes", "Skip confirmation prompts");

// Register all commands
registerInitCommand(program);
registerMintCommand(program);
registerBurnCommand(program);
registerFreezeCommand(program);
registerPauseCommand(program);
registerStatusCommand(program);
registerComplianceCommand(program);
registerMintersCommand(program);
registerAuditCommand(program);

program.parse(process.argv);
