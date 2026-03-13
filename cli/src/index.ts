#!/usr/bin/env node

// Suppress bigint bindings warning for a cleaner CLI UX
const originalEmitWarning = process.emitWarning;
// @ts-ignore
process.emitWarning = function(warning: any, ...args: any[]) {
  if (warning && typeof warning === 'string' && warning.includes("Failed to load bindings")) {
    return;
  }
  return originalEmitWarning.call(this, warning, ...args);
};
const originalConsoleError = console.error;
console.error = function(...args: any[]) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes("bigint: Failed to load bindings")) {
    return;
  }
  originalConsoleError.apply(console, args);
};

import { Command } from "commander";
import { spawn } from "child_process";
import path from "path";
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

// TUI command
program
  .command("tui <mintAddress> [cluster]")
  .description("Launch interactive terminal dashboard (admin mode)")
  .option("-u, --url <url>", "Custom RPC URL")
  .action((mintAddress: string, cluster: string = "devnet", opts: any) => {
    const tuiPath = path.join(__dirname, "../tui.ts");
    const child = spawn("npx", ["ts-node", tuiPath, mintAddress, cluster], {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });

    child.on("exit", (code) => {
      process.exit(code || 0);
    });
  });

program.parse(process.argv);
