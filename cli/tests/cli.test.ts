const { expect } = require("chai");
const { spawnSync } = require("child_process");
const path = require("path");

describe("CLI Smoke Tests", () => {
  it("prints help successfully from built binary", () => {
    const cliPath = path.resolve(__dirname, "../dist/index.js");
    const result = spawnSync(process.execPath, [cliPath, "--help"], {
      encoding: "utf8",
    });

    expect(result.status).to.equal(0);
    expect(result.stdout).to.include("sss-token");
    expect(result.stdout).to.include("Admin CLI for the Solana Stablecoin Standard");
  });
});
