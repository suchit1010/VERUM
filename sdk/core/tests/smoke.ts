import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { Presets } from "../src/presets";
import { SssAccounts } from "../src/accounts";

describe("SSS SDK Smoke Tests", () => {
  it("exports expected preset flags", () => {
    expect(Presets.SSS_1.enableTransferHook).to.equal(false);
    expect(Presets.SSS_2.enableTransferHook).to.equal(true);
    expect(Presets.SSS_3.enableConfidentialTransfer).to.equal(true);
  });

  it("derives deterministic config PDA", () => {
    const accounts = new SssAccounts();
    const mint = new PublicKey("So11111111111111111111111111111111111111112");

    const [configA] = accounts.getConfigPda(mint);
    const [configB] = accounts.getConfigPda(mint);

    expect(configA.toBase58()).to.equal(configB.toBase58());
  });
});
