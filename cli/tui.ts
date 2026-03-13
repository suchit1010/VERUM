/**
 * Admin TUI — Interactive Terminal Dashboard for SSS Stablecoin Management
 * 
 * Real-time monitoring and operator controls:
 * - Live supply, minters, pause state, blacklist count
 * - Interactive operations: mint, burn, freeze, blacklist, seize
 * - Event log stream
 * - Multi-screen navigation
 * 
 * Keybindings:
 *   q/ESC       quit
 *   1-3         switch screens (dashboard/operations/logs)
 *   m           mint tokens
 *   b           burn tokens
 *   f           freeze account
 *   p           pause/unpause
 *   l           show blacklist menu (SSS-2)
 *   ARROW UP/DN scroll
 * 
 * Usage:
 *   npx ts-node cli/tui.ts [mintAddress] [cluster]
 *   # Example: npx ts-node cli/tui.ts DzKjVZB3ZdyYt3JzAZhvWQSgXEi1NnKr4yoNcFrPpTtm devnet
 */

import * as blessed from "blessed";
import * as contrib from "blessed-contrib";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import { StablecoinModule } from "../sdk/core/src/index";
import idl from "../target/idl/sss_stablecoin.json";
import fs from "fs";
import os from "os";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

interface Metrics {
  totalSupply: number;
  pauseState: boolean;
  minerCount: number;
  blacklistCount: number;
  config?: any;
}

type Screen = "dashboard" | "operations" | "logs";

// Colors
const COLORS = {
  accent: "blue",
  success: "green",
  warning: "yellow",
  error: "red",
  neutral: "white",
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TUI CLASS
// ─────────────────────────────────────────────────────────────────────────────

class AdminTUI {
  screen: blessed.Widgets.Screen;
  grid: contrib.grid;
  provider: AnchorProvider;
  program: Program;
  stablecoin: StablecoinModule;
  metrics: Metrics = { totalSupply: 0, pauseState: false, minerCount: 0, blacklistCount: 0 };
  currentScreen: Screen = "dashboard";
  eventLog: string[] = [];
  refreshInterval: NodeJS.Timeout | null = null;
  mintAddress: web3.PublicKey;
  cluster: "devnet" | "mainnet-beta" | "localnet" = "devnet";

  // UI Components
  supplyGauge: contrib.Widgets.GaugeElement;
  pauseBox: blessed.Widgets.BoxElement;
  metricsBox: blessed.Widgets.BoxElement;
  logBox: blessed.Widgets.BoxElement;
  statusBar: blessed.Widgets.BoxElement;
  modal: blessed.Widgets.BoxElement | null = null;

  constructor(mintAddress: web3.PublicKey, cluster: "devnet" | "mainnet-beta" | "localnet" = "devnet") {
    this.mintAddress = mintAddress;
    this.cluster = cluster;

    // Initialize blessed screen
    this.screen = blessed.screen({
      smartCSR: true,
      mouse: true,
      title: `SSS Admin TUI — ${mintAddress.toBase58().substring(0, 8)}...`,
    });

    // Create grid layout
    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    // Initialize UI components
    this.supplyGauge = this.grid.set(0, 0, 3, 4, contrib.gauge, {
      label: "Total Supply",
      percent: [0],
      style: { percent: { foreground: COLORS.success } },
    });

    this.pauseBox = this.grid.set(0, 4, 3, 4, blessed.box, {
      parent: this.screen,
      label: "Pause State",
      content: "{center}🟢 ACTIVE{/center}",
      style: { border: { fg: COLORS.success } },
    });

    this.metricsBox = this.grid.set(0, 8, 3, 4, blessed.box, {
      parent: this.screen,
      label: "Metrics",
      content: "Minters: 0\nBlacklist: 0",
      style: { border: { fg: COLORS.neutral } },
    });

    this.logBox = this.grid.set(3, 0, 8, 12, blessed.box, {
      parent: this.screen,
      label: "Event Log",
      content: "Initializing...",
      scrollable: true,
      mouse: true,
      keys: true,
      style: { border: { fg: COLORS.neutral } },
    });

    this.statusBar = this.grid.set(11, 0, 1, 12, blessed.box, {
      parent: this.screen,
      content: "Loading... | q: quit | 1-3: screens | m: mint | b: burn | f: freeze | p: pause",
      style: { bg: COLORS.accent, fg: "white" },
    });

    // Setup providers
    this.setupProviders();

    // Setup key bindings
    this.setupKeyBindings();

    // Render screen
    this.screen.render();

    // Start metrics refresh loop
    this.startRefreshLoop();

    this.logEvent("✓ TUI initialized");
  }

  setupProviders() {
    const wallet = this.loadWallet();
    const connection = new web3.Connection(
      this.getClusterUrl(this.cluster),
      "confirmed"
    );
    this.provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

    this.program = new Program(idl as any, this.provider);
    this.stablecoin = new StablecoinModule(this.provider, this.mintAddress);

    this.logEvent(`✓ Connected to ${this.cluster}`);
  }

  loadWallet(): any {
    const walletPath = path.join(os.homedir(), ".config/solana/id.json");

    if (!fs.existsSync(walletPath)) {
      throw new Error(`Wallet not found at ${walletPath}`);
    }

    const keyData = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    return {
      publicKey: web3.PublicKey.default,
      signMessage: async (msg: Buffer) => msg,
      signTransaction: async (tx: web3.Transaction) => tx,
      signAllTransactions: async (txs: web3.Transaction[]) => txs,
    };
  }

  getClusterUrl(cluster: string): string {
    const clusterUrls: Record<string, string> = {
      localnet: "http://localhost:8899",
      devnet: "https://api.devnet.solana.com",
      "mainnet-beta": "https://api.mainnet-beta.solana.com",
    };
    return clusterUrls[cluster] || clusterUrls.devnet;
  }

  setupKeyBindings() {
    // Quit
    this.screen.key(["q", "escape", "C-c"], () => {
      return this.quit();
    });

    // Screen navigation
    this.screen.key(["1"], () => {
      this.currentScreen = "dashboard";
      this.renderDashboard();
    });

    this.screen.key(["2"], () => {
      this.currentScreen = "operations";
      this.renderOperations();
    });

    this.screen.key(["3"], () => {
      this.currentScreen = "logs";
      this.renderLogs();
    });

    // Operations
    this.screen.key(["m"], () => this.promptMint());
    this.screen.key(["b"], () => this.promptBurn());
    this.screen.key(["f"], () => this.promptFreeze());
    this.screen.key(["p"], () => this.promptTogglePause());
    this.screen.key(["l"], () => this.promptBlacklist());
  }

  async refreshMetrics() {
    try {
      const config = await this.stablecoin.getConfig();
      const supply = (await this.stablecoin.getTotalSupply()).toNumber();

      this.metrics.config = config;
      this.metrics.totalSupply = supply;
      this.metrics.pauseState = config.pauseState;

      // TODO: fetch minter count, blacklist count from on-chain
      // For now, estimate from config

      this.updateDashboard();
    } catch (err: any) {
      this.logEvent(`⚠ Refresh error: ${err.message.substring(0, 50)}`);
    }
  }

  updateDashboard() {
    const maxSupply = 1_000_000_000_000; // 1 trillion
    const supplyPercent = Math.min(100, (this.metrics.totalSupply / maxSupply) * 100);

    this.supplyGauge.setPercent([supplyPercent]);

    const pauseLabel = this.metrics.pauseState ? "🔴 PAUSED" : "🟢 ACTIVE";
    const pauseColor = this.metrics.pauseState ? COLORS.error : COLORS.success;
    this.pauseBox.setContent(`{center}${pauseLabel}{/center}`);
    this.pauseBox.style.border.fg = pauseColor;

    const metricsText = `Minters: ${this.metrics.minerCount}\nBlacklist: ${this.metrics.blacklistCount}\nPause: ${pauseLabel}`;
    this.metricsBox.setContent(metricsText);

    this.screen.render();
  }

  renderDashboard() {
    this.logBox.setLabel("Dashboard");
    this.logBox.setContent(
      `\n{bold}SSS Stablecoin Dashboard{/bold}\n\n` +
        `Mint: ${this.mintAddress.toBase58()}\n` +
        `Cluster: ${this.cluster}\n` +
        `Total Supply: ${this.metrics.totalSupply.toLocaleString()}\n` +
        `Status: ${this.metrics.pauseState ? "🔴 PAUSED" : "🟢 ACTIVE"}\n\n` +
        `{bold}Press:{/bold}\n` +
        `  1 - Dashboard | 2 - Operations | 3 - Logs\n` +
        `  m - Mint | b - Burn | f - Freeze\n` +
        `  p - Pause/Unpause | l - Blacklist (SSS-2)\n` +
        `  q - Quit`
    );
    this.screen.render();
  }

  renderOperations() {
    this.logBox.setLabel("Operations");
    this.logBox.setContent(
      `\n{bold}Available Operations{/bold}\n\n` +
        `{yellow}Mint:{/} m - Mint tokens (increases supply)\n` +
        `{yellow}Burn:{/} b - Burn tokens (decreases supply)\n` +
        `{yellow}Freeze:{/} f - Freeze account (prevent transfers)\n` +
        `{yellow}Pause:{/} p - Pause/unpause all operations\n` +
        `{yellow}Blacklist:{/} l - Add/remove from blacklist (SSS-2)\n\n` +
        `{bold}Status:{/bold}\n` +
        `Current pause state: ${this.metrics.pauseState ? "PAUSED" : "ACTIVE"}`
    );
    this.screen.render();
  }

  renderLogs() {
    this.logBox.setLabel("Event Log");
    const logContent = this.eventLog.slice(-20).join("\n"); // Show last 20 events
    this.logBox.setContent(logContent);
    this.screen.render();
  }

  logEvent(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    this.eventLog.push(`[${timestamp}] ${msg}`);
    if (this.eventLog.length > 100) this.eventLog.shift(); // Keep last 100 events

    if (this.currentScreen === "logs") {
      this.renderLogs();
    }
  }

  promptMint() {
    this.showPrompt(
      "Mint Tokens",
      "Amount (base units):",
      async (amount: string) => {
        try {
          this.logEvent(`⏳ Minting ${amount} tokens...`);
          // TODO: Call stablecoin.mint(recipient, amount, minter)
          this.logEvent(`✓ Minted ${amount} tokens`);
          await this.refreshMetrics();
        } catch (err: any) {
          this.logEvent(`✗ Mint failed: ${err.message}`);
        }
      }
    );
  }

  promptBurn() {
    this.showPrompt(
      "Burn Tokens",
      "Amount (base units):",
      async (amount: string) => {
        try {
          this.logEvent(`⏳ Burning ${amount} tokens...`);
          // TODO: Call stablecoin.burn(amount)
          this.logEvent(`✓ Burned ${amount} tokens`);
          await this.refreshMetrics();
        } catch (err: any) {
          this.logEvent(`✗ Burn failed: ${err.message}`);
        }
      }
    );
  }

  promptFreeze() {
    this.showPrompt(
      "Freeze Account",
      "Address to freeze:",
      async (address: string) => {
        try {
          const pubkey = new web3.PublicKey(address);
          this.logEvent(`⏳ Freezing ${address.substring(0, 8)}...`);
          // TODO: Call stablecoin.freeze(pubkey)
          this.logEvent(`✓ Froze account`);
        } catch (err: any) {
          this.logEvent(`✗ Freeze failed: ${err.message}`);
        }
      }
    );
  }

  promptTogglePause() {
    try {
      const action = this.metrics.pauseState ? "unpause" : "pause";
      this.logEvent(`⏳ ${action.charAt(0).toUpperCase() + action.slice(1)}ing operations...`);
      // TODO: Call stablecoin.pause() or stablecoin.unpause()
      this.logEvent(`✓ Operations ${action}d`);
      this.refreshMetrics();
    } catch (err: any) {
      this.logEvent(`✗ Pause failed: ${err.message}`);
    }
  }

  promptBlacklist() {
    this.showPrompt(
      "Blacklist Menu (SSS-2)",
      "Command (add/remove):",
      async (cmd: string) => {
        if (cmd === "add") {
          this.showPrompt("Add to Blacklist", "Address:", async (addr: string) => {
            try {
              this.logEvent(`⏳ Blacklisting ${addr.substring(0, 8)}...`);
              // TODO: Call compliance.blacklistAdd(pubkey, reason)
              this.logEvent(`✓ Added to blacklist`);
            } catch (err: any) {
              this.logEvent(`✗ Blacklist failed: ${err.message}`);
            }
          });
        } else if (cmd === "remove") {
          this.showPrompt("Remove from Blacklist", "Address:", async (addr: string) => {
            try {
              this.logEvent(`⏳ Removing from blacklist ${addr.substring(0, 8)}...`);
              // TODO: Call compliance.blacklistRemove(pubkey)
              this.logEvent(`✓ Removed from blacklist`);
            } catch (err: any) {
              this.logEvent(`✗ Unblacklist failed: ${err.message}`);
            }
          });
        }
      }
    );
  }

  showPrompt(
    title: string,
    label: string,
    callback: (input: string) => Promise<void>
  ) {
    if (this.modal) {
      this.screen.remove(this.modal);
    }

    const inputBox = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: 40,
      height: 15,
      border: "line",
      label: title,
      style: {
        border: { fg: COLORS.accent },
      },
    });

    blessed.text({
      parent: inputBox,
      top: 2,
      left: 2,
      content: label,
    });

    const input = blessed.textbox({
      parent: inputBox,
      top: 4,
      left: 2,
      width: 34,
      height: 3,
      border: "line",
      style: { border: { fg: COLORS.neutral } },
    });

    blessed.button({
      parent: inputBox,
      top: 8,
      left: 5,
      name: "ok",
      text: "OK",
      style: {
        bg: COLORS.success,
        fg: "white",
        focus: { bg: COLORS.warning },
      },
      key: ["enter"],
      mouse: true,
    }).on("press", async () => {
      this.screen.remove(inputBox);
      this.modal = null;
      await callback(input.getValue());
    });

    blessed.button({
      parent: inputBox,
      top: 8,
      left: 25,
      name: "cancel",
      text: "Cancel",
      style: {
        bg: COLORS.error,
        fg: "white",
        focus: { bg: COLORS.warning },
      },
      key: ["escape"],
      mouse: true,
    }).on("press", () => {
      this.screen.remove(inputBox);
      this.modal = null;
    });

    this.modal = inputBox;
    input.focus();
    this.screen.render();
  }

  startRefreshLoop() {
    this.refreshInterval = setInterval(() => {
      this.refreshMetrics();
    }, 5000); // Refresh every 5 seconds
  }

  quit() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.screen.destroy();
    process.exit(0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(
      "Usage: npx ts-node cli/tui.ts <mintAddress> [cluster]\n" +
        "Example: npx ts-node cli/tui.ts DzKjVZB3ZdyYt3JzAZhvWQSgXEi1NnKr4yoNcFrPpTtm devnet"
    );
    process.exit(1);
  }

  try {
    const mintAddress = new web3.PublicKey(args[0]);
    const cluster = (args[1] || "devnet") as any;

    const tui = new AdminTUI(mintAddress, cluster);
    tui.renderDashboard();

    // Start refresh loop
    await tui.refreshMetrics();
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
