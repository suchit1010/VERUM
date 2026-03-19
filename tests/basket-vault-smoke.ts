import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

describe("BasketVault Smoke", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  it("has valid basket program id and provider", () => {
    const programId = new anchor.web3.PublicKey("HJBBV5qRL9wQ1YmPtcPNESpEJJLVt9SyCnofmKi2PUCB");
    expect(programId.toBase58()).to.equal("HJBBV5qRL9wQ1YmPtcPNESpEJJLVt9SyCnofmKi2PUCB");
    expect(provider.connection.rpcEndpoint).to.be.a("string");
  });
});
