// tests/basket-vault.ts
import * as anchor from "@coral-xyz/anchor";
import { Program }  from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  createMint, getOrCreateAssociatedTokenAccount,
  mintTo, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

describe("basket-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program    = anchor.workspace.BasketVault as Program<any>;
  const wallet     = (provider.wallet as anchor.Wallet).payer;

  let basketMint:    PublicKey;
  let globalConfig:  PublicKey;
  let vaultAuthority: PublicKey;
  let authBump:      number;

  // Mock asset mints
  let paxgMint: PublicKey;
  let wbtcMint: PublicKey;

  before(async () => {
    // Derive PDAs
    [globalConfig]  = PublicKey.findProgramAddressSync(
      [Buffer.from("global_config")], program.programId
    );
    [vaultAuthority, authBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("basket_vault_authority")], program.programId
    );

    // Create test mints
    basketMint = await createMint(
      provider.connection, wallet, wallet.publicKey, null, 6
    );
    paxgMint = await createMint(
      provider.connection, wallet, wallet.publicKey, null, 8
    );
    wbtcMint = await createMint(
      provider.connection, wallet, wallet.publicKey, null, 8
    );

    console.log("basketMint:", basketMint.toBase58());
    console.log("paxgMint:", paxgMint.toBase58());
  });

  // ── 1. Initialize ─────────────────────────────────────────────────────────

  it("initializes the protocol", async () => {
    const mockRegistry = [paxgMint, wbtcMint].map((mint, i) => ({
      mint,
      svsVault:             Keypair.generate().publicKey, // mock vault
      pythFeedIdHex:        "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2",
      switchboardAggregator: Keypair.generate().publicKey,
      weightBps:            i === 0 ? 5000 : 5000,
      decimals:             8,
    }));

    await program.methods
      .initialize({
        sssProgram:         program.programId, // mock — use real SSS in integration
        svsProgramId:       program.programId,
        rebalanceAuthority: wallet.publicKey,
        emergencyAuthority: wallet.publicKey,
        assetRegistry:      mockRegistry,
      })
      .accounts({
        deployer:      wallet.publicKey,
        basketMint,
        globalConfig,
        vaultAuthority,
        tokenProgram:  TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent:          SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const config = await program.account.globalConfig.fetch(globalConfig);
    expect(config.emergencyMode).to.be.false;
    expect(config.totalMinted.toNumber()).to.eq(0);
    expect(config.assetRegistry.length).to.eq(2);
    console.log("✓ Initialize: passed");
  });

  // ── 2. Emergency mode ─────────────────────────────────────────────────────

  it("toggles emergency mode", async () => {
    await program.methods
      .setEmergencyMode(true)
      .accounts({ emergencyAuthority: wallet.publicKey, globalConfig })
      .rpc();

    let config = await program.account.globalConfig.fetch(globalConfig);
    expect(config.emergencyMode).to.be.true;

    await program.methods
      .setEmergencyMode(false)
      .accounts({ emergencyAuthority: wallet.publicKey, globalConfig })
      .rpc();

    config = await program.account.globalConfig.fetch(globalConfig);
    expect(config.emergencyMode).to.be.false;
    console.log("✓ Emergency mode: passed");
  });

  // ── 3. Rebalance weights ──────────────────────────────────────────────────

  it("rejects rebalance if too soon", async () => {
    const proposal = {
      weights:      [5500, 4500],
      jobTimestamp: new anchor.BN(Math.floor(Date.now() / 1000)),
      requestId:    Array(32).fill(0),
    };

    try {
      await program.methods
        .rebalanceWeights(proposal)
        .accounts({ rebalanceAuthority: wallet.publicKey, globalConfig })
        .rpc();
      expect.fail("Should have thrown RebalanceTooFrequent");
    } catch (e: any) {
      expect(e.message).to.include("RebalanceTooFrequent");
      console.log("✓ Rebalance too soon: correctly rejected");
    }
  });

  it("rejects mismatched weight sum", async () => {
    const proposal = {
      weights:      [5000, 4000],  // sums to 9000, not 10000
      jobTimestamp: new anchor.BN(Math.floor(Date.now() / 1000)),
      requestId:    Array(32).fill(0),
    };

    try {
      await program.methods
        .rebalanceWeights(proposal)
        .accounts({ rebalanceAuthority: wallet.publicKey, globalConfig })
        .rpc();
      expect.fail("Should have thrown WeightsDontSumToFull");
    } catch (e: any) {
      expect(e.message).to.include("WeightsDontSumToFull");
      console.log("✓ Weight sum validation: correctly rejected");
    }
  });

  // ── 4. Adaptive CR math ───────────────────────────────────────────────────

  it("validates adaptive CR thresholds", () => {
    // Test the JS-side CR calculation (mirrors Rust logic)
    function getAdaptiveCR(confBps: number) {
      if (confBps < 30)  return 150;
      if (confBps < 200) return 200;
      return 300;
    }

    expect(getAdaptiveCR(10)).to.eq(150);   // normal
    expect(getAdaptiveCR(29)).to.eq(150);   // still normal
    expect(getAdaptiveCR(30)).to.eq(200);   // elevated boundary
    expect(getAdaptiveCR(150)).to.eq(200);  // elevated
    expect(getAdaptiveCR(200)).to.eq(300);  // crisis boundary
    expect(getAdaptiveCR(350)).to.eq(300);  // crisis

    console.log("✓ Adaptive CR thresholds: passed");
  });

  // ── 5. Basket math ────────────────────────────────────────────────────────

  it("validates basket value calculation", () => {
    // Mirror Rust calculate_basket_value logic in JS for client-side preview
    function calcBasketValue(
      amounts:  number[],    // normalized to 6 dec
      prices:   number[],    // normalized to 6 dec
      weights:  number[],    // bps
    ): number {
      let total = 0;
      for (let i = 0; i < amounts.length; i++) {
        const usd      = (amounts[i] * prices[i]) / 1_000_000;
        const weighted = (usd * weights[i]) / 10_000;
        total += weighted;
      }
      return total;
    }

    // 1 PAXG ($3142) at 50% weight + 0.5 WBTC ($67420) at 50% weight
    const val = calcBasketValue(
      [1_000_000, 500_000],          // 1.0 and 0.5 normalized
      [3_142_000_000, 67_420_000_000], // prices in 6-dec units (×1e6)
      [5000, 5000],                    // 50% each
    );

    // Expected: (1×3142×0.5) + (0.5×67420×0.5) = 1571 + 16855 = 18426
    expect(val).to.be.closeTo(18_426, 10);
    console.log("✓ Basket value math: passed");
  });

  // ── 6. Mint gate ──────────────────────────────────────────────────────────

  it("validates CR mint gate", () => {
    function checkMintAllowed(
      basketValue:  number,
      currentSupply: number,
      desired:      number,
      cr:           number,
    ): boolean {
      const totalAfter = currentSupply + desired;
      const required   = totalAfter * cr / 100;
      return basketValue >= required;
    }

    // $18,426 collateral, 0 minted, want 10,000 BASKET at 150% CR
    // required = 10,000 × 1.5 = 15,000 → 18,426 >= 15,000 ✓
    expect(checkMintAllowed(18_426, 0, 10_000, 150)).to.be.true;

    // $18,426 collateral, want 15,000 BASKET at 150% → 15,000×1.5=22,500 → fails
    expect(checkMintAllowed(18_426, 0, 15_000, 150)).to.be.false;

    // Crisis mode: 300% CR → same collateral, max 6,142 BASKET
    expect(checkMintAllowed(18_426, 0, 6_000, 300)).to.be.true;
    expect(checkMintAllowed(18_426, 0, 6_200, 300)).to.be.false;

    console.log("✓ Mint gate logic: passed");
  });
});
