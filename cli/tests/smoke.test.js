const { execFileSync } = require("child_process");
const { expect } = require("chai");
const path = require("path");

describe("CLI smoke tests", function () {
  this.timeout(30000);

  const cliEntry = path.resolve(__dirname, "../dist/index.js");

  it("shows top-level help", () => {
    const output = execFileSync("node", [cliEntry, "--help"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(output).to.include("Admin CLI for the Solana Stablecoin Standard");
    expect(output).to.include("Commands:");
    expect(output).to.include("init");
    expect(output).to.include("status");
  });

  it("shows command help for init", () => {
    const output = execFileSync("node", [cliEntry, "init", "--help"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(output).to.include("Initialize a new stablecoin");
    expect(output).to.include("--preset <preset>");
  });
});
