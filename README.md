# VERUM
The world doesn't need another stablecoin. It needs a programmable unit of account that no single nation can weaponize. The dollar's dominance is 80% structural inertia — whoever removes the friction of "which currency do we settle in?" for cross-border commodity trades wins. VERUM is the answer.

# VERUM — World Reserve Protocol

> *The neutral, crisis-resilient reserve currency backed by what the world actually runs on.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built on Solana](https://img.shields.io/badge/Built%20on-Solana-9945FF)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.30-blue)](https://anchor-lang.com)
[![Network](https://img.shields.io/badge/Network-Devnet-green)](https://explorer.solana.com/?cluster=devnet)
[![Hackathon](https://img.shields.io/badge/Buildifi%20Hack%202-DeFi%20Track-orange)](https://www.buildifi.ai)

---

## What We Are Building

Every stablecoin today is either a liability of one government (USDC, USDT), an experiment waiting to collapse (algorithmic), or a single-asset hedge that does not function as money (PAXG). When the dollar is weaponized through sanctions, when a central bank prints to fund a war, when one country's monetary policy exports inflation to every other country — there is no neutral alternative.

**VERUM is that neutral alternative.**

It is a fully on-chain stablecoin whose value is pegged to a dynamic VERUM of the exact assets global trade revolves around: crude oil, gold, silver, agricultural commodities, Bitcoin as a digital hedge, and tokenized real-world assets. No single government controls it. No single asset can break it. The collateral ratio automatically tightens when markets become volatile, so the peg holds exactly when it matters most — in a crisis.

This is not another yield farm. This is the reserve currency the world has needed since Bretton Woods failed.

---

## The Problem We Are Solving

| Problem | Current State | VERUM Solution |
|---------|--------------|-----------------|
| USD dominance is weaponized | Sanctions freeze reserves overnight | Neutral, decentralized, no single issuer |
| Stablecoins fail in crises | Terra/UST lost $40B in 72h | Adaptive CR auto-escalates to 300% in stress |
| Single-asset backing | PAXG = gold only, misses energy | Multi-asset VERUM mirrors real trade flows |
| Fiat-backed means fiat inflation | USDC tracks USD debasement | Backed by scarce real-world commodities |
| Oracle manipulation | Single source = single attack vector | Pyth + Switchboard median + spread check |
| Opaque collateral | Can't verify backing in real time | Fully on-chain, readable 24/7 by anyone |

---

## Architecture

### Full System Stack

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          VERUM Protocol Stack                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER 4 — CROSS-CHAIN (post-MVP)                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Chainlink CCIP → BRICS CBDC bridge → mBridge / e-CNY / Digital INR  │   │
│  │  Oil & commodity trades settle in VERUM across chains                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  LAYER 3 — DATA & ORACLES                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐    │
│  │  Pyth Network   │  │  Switchboard    │  │  Chainlink Functions     │    │
│  │  PRIMARY        │  │  FALLBACK       │  │  QUARTERLY REBALANCING   │    │
│  │  Sub-second     │  │  Permissionless │  │  EIA oil supply/demand   │    │
│  │  XAU WTI BTC    │  │  Custom feeds   │  │  FAO food price index    │    │
│  │  XAG DXY        │  │  FAO WTO feeds  │  │  WTO trade volumes       │    │
│  │  Pushed on-chain│  │  Uncorrelated   │  │  WGC gold reserves       │    │
│  └────────┬────────┘  └────────┬────────┘  └───────────┬──────────────┘    │
│           └─────────────────── ┼ ──────────────────────┘                   │
│                                ▼                                            │
│             Oracle Aggregator: median(valid_prices) + spread_check          │
│                                                                              │
│  LAYER 2 — VERUM VAULT (this repo — Layer 2 logic)                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  VERUMVault Anchor Program                                          │   │
│  │                                                                      │   │
│  │  initialize()          → one-time setup, PDA becomes mint authority  │   │
│  │  mint_VERUM()         → prices → CR gate → SSS CPI mint             │   │
│  │  redeem_VERUM()       → burn VERUM → SVS-1 redeem CPIs             │   │
│  │  rebalance_weights()   → validate + apply Chainlink Functions result  │   │
│  │  set_emergency_mode()  → pause mints, withdrawals always stay open    │   │
│  └────────────────────────┬────────────────────────┬─────────────────────┘  │
│                           │ CPI: mint/burn          │ CPI: deposit/redeem   │
│                           ▼                         ▼                       │
│  LAYER 1A                                  LAYER 1B                         │
│  ┌──────────────────────────┐   ┌──────────────────────────────────────┐   │
│  │  SSS Stablecoin SDK      │   │  Solana Vault Standard (SVS-1)       │   │
│  │  (suchit1010)            │   │  (solanabr) — ERC-4626               │   │
│  │                          │   │                                      │   │
│  │  mint_tokens(amount)     │   │  One vault per collateral asset:     │   │
│  │  burn_tokens(amount)     │   │  ┌──────────┐  ┌──────────┐         │   │
│  │  freeze / thaw           │   │  │PAXG Vault│  │tOIL Vault│  ...    │   │
│  │                          │   │  └──────────┘  └──────────┘         │   │
│  │  VERUM token lives here │   │  ┌──────────┐  ┌──────────┐         │   │
│  │  Vault PDA = mint auth   │   │  │WBTC Vault│  │XAG Vault │  ...    │   │
│  └──────────────────────────┘   │  └──────────┘  └──────────┘         │   │
│                                 │                                      │   │
│                                 │  Features per vault:                 │   │
│                                 │  • Inflation attack protection       │   │
│                                 │  • Vault-favoring rounding           │   │
│                                 │  • Slippage min/max parameters       │   │
│                                 │  • Emergency pause                   │   │
│                                 │  • CPI-composable preview functions  │   │
│                                 └──────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mint Flow

```
User wallet
    │
    ├── STEP 1: Deposit collateral into SVS-1 vault
    │     User calls SVS-1::deposit(PAXG, amount)
    │     SVS-1 transfers PAXG to vault token account
    │     SVS-1 mints share tokens to user (ERC-4626 shares)
    │     SVS-1 handles: rounding, slippage check, inflation protection
    │
    └── STEP 2: Mint VERUM
          User calls VERUMVault::mint_VERUM(desired_amount)

          VERUMVault:
          ├─ Reads total_assets from each SVS-1 vault (direct account read)
          ├─ Fetches Pyth PriceUpdateV2 for all 6 assets (remaining_accounts)
          ├─ Tries Switchboard fallback per asset if Pyth stale
          ├─ Computes median per asset, validates spread < 1.5%
          ├─ VERUM_value = Σ( normalize(amount[i]) × price[i] × weight_bps[i] / 10000 )
          ├─ btc_conf_bps = btc_conf / btc_price × 10000  ← vol proxy
          ├─ adaptive_cr  = 150 | 200 | 300  based on btc_conf_bps
          ├─ REQUIRE: VERUM_value >= desired × adaptive_cr / 100
          ├─ Deducts 0.1% to insurance fund
          └─ CPI → SSS::mint_tokens(net_amount)

          User receives VERUM tokens
```

### Redeem Flow

```
User wallet
    │
    └── Calls VERUMVault::redeem_VERUM(VERUM_amount)

        VERUMVault:
        ├─ CPI → SSS::burn_tokens(VERUM_amount)
        ├─ For each of 6 assets:
        │   pro_rata_shares = user_share_balance × VERUM_amount / total_supply
        │   CPI → SVS-1::redeem(pro_rata_shares, min_assets_out)
        └─ User receives proportional collateral in all 6 assets
```

---

## VERUM Composition

Initial weights mirror 2026 global trade flows. Rebalanced quarterly via Chainlink Functions.

| Index | Asset | Symbol | Weight | Oracle Feed | Strategic Role |
|-------|-------|--------|--------|-------------|---------------|
| 0 | Gold | XAU / PAXG | **20%** | Pyth XAU/USD | Central bank reserve, store of value |
| 1 | Crude Oil | WTI / tOIL | **25%** | Pyth WTI/USD | Energy — the global economy runs on it |
| 2 | Bitcoin | BTC / WBTC | **15%** | Pyth BTC/USD | Digital hedge + **vol proxy for adaptive CR** |
| 3 | Silver + Agri | XAG | **15%** | Pyth XAG/USD | Industrial metals + food security |
| 4 | DXY / Bonds | DXY | **15%** | Pyth DXY | Forex stability anchor |
| 5 | Tokenized RWAs | RWA | **10%** | Pyth proxy | Real estate, infrastructure |

**Weight constraints enforced on-chain:**
- Maximum shift per asset per rebalance: ±500 bps (5%)
- Hard cap on any single asset: 3,500 bps (35%)
- Hard floor per asset: 500 bps (5%)
- Weights must sum to exactly 10,000 bps (100%)

---

## Adaptive Collateral Ratio

The most important innovation. The minimum CR responds automatically to market volatility using BTC's Pyth confidence interval as a real-time VIX proxy. No governance vote. No delay. Automatic.

```
BTC conf/price (basis points)    Regime      Min CR Required
────────────────────────────────────────────────────────────
< 30 bps  (< 0.30%)          →  NORMAL    →  150%
30–200 bps (0.30–2.00%)      →  ELEVATED  →  200%
≥ 200 bps  (≥ 2.00%)         →  CRISIS    →  300%
```

**Why BTC confidence interval?**
Pyth publishes a `conf` field alongside every price — the oracle network's own uncertainty estimate based on spread across its data providers. When market stress rises, BTC conf/price spikes. This is on-chain, real-time, and fully verifiable.

**Historical calibration against real events:**
- Calm 2024 market conditions: BTC conf/price ≈ 0.08–0.15% → Normal (150%)
- August 2024 Yen carry trade unwind: ≈ 1.8% → Elevated (200%)
- FTX collapse November 2022: ≈ 2.8% → Crisis (300%)
- Luna/UST collapse May 2022: ≈ 3.5% → Crisis (300%)

---

## Oracle Strategy

Three oracles with deliberately different roles. Not redundant copies — separation of concerns.

```
Real-time prices (every transaction):
───────────────────────────────────────────────────────────────────
  1. Pyth (primary)
     Why: Pushed on-chain → zero latency read. Sub-second updates.
          Best commodity + crypto coverage on Solana in 2026.
          Free to read — no LINK fees at scale.
     Reject: age > 60s OR conf/price > 2%

  2. Switchboard (fallback)
     Why: Permissionless — can create custom feeds for FAO food price
          index, BRICS trade volumes, assets Pyth doesn't cover.
          Failure mode uncorrelated with Pyth (different node infra).
          Solana-native, clean Anchor SDK.
     Reject: age > 120s

  3. Aggregation:
     Collect valid prices → sort → lower median (conservative)
     Reject if spread between sources > 150 bps (1.5%)

Quarterly rebalancing (Chainlink Functions):
───────────────────────────────────────────────────────────────────
  4. Chainlink Functions
     Why: Pull model with off-chain compute. Perfect for calling
          REST APIs (EIA, FAO, WTO, WGC) and running weight logic.
          NOT used for real-time prices (too slow, costs LINK).
     Runs: Every 90 days
     Fetches: EIA oil supply/demand, FAO Food Price Index,
              WTO trade volume index, WGC gold reserve data
     Output: Signed uint16[6] weight proposal → on-chain validation
```

---

## Mathematical Specification

### VERUM Value Calculation

```
normalize(amount, decimals):
  if decimals > 6: amount / 10^(decimals - 6)
  if decimals < 6: amount × 10^(6 - decimals)
  if decimals = 6: amount

VERUM_value = Σᵢ [
    normalize(collateral_amount[i], asset.decimals)
  × normalize_price(pyth_price[i], pyth_expo[i])       ← to 6 dec
  / 1_000_000
  × asset.weight_bps[i]
  / 10_000
]
```

### Collateral Ratio

```
CR (%) = VERUM_value / VERUM_minted × 100
```

### Mint Gate

```
total_after  = current_supply + desired_amount
required     = total_after × adaptive_CR / 100
PASS if VERUM_value ≥ required
FAIL if VERUM_value <  required  →  error: UnderCollateralized
```

### Adaptive CR

```
btc_conf_bps = (btc_conf / btc_price) × 10_000

CR = 150   if btc_conf_bps < 30
   = 200   if 30 ≤ btc_conf_bps < 200
   = 300   if btc_conf_bps ≥ 200
```

### Oracle Aggregation

```
for each source in [Pyth, Switchboard]:
  if fresh AND confidence_ok: add to valid_prices

require len(valid_prices) ≥ 1

sort(valid_prices by price)
median = valid_prices[ ⌊n/2⌋ ]    ← lower median = conservative

spread_bps = (max_price - min_price) / median × 10_000
require spread_bps ≤ 150          ← reject if sources disagree
```

---

## Crisis Resilience Analysis

| Scenario | What Happens | Why VERUM Survives |
|----------|-------------|---------------------|
| 2008-style liquidity crunch | BTC vol spikes → conf/price > 2% | CR auto-escalates to 300%. New mints require 3× collateral. No under-collateralization possible. |
| Oil embargo / supply shock | WTI price surges | Oil is 25% of VERUM → VERUM value rises with oil. Protocol gets stronger, not weaker. |
| Central bank gold buying surge | XAU price rises | Gold is 20% of VERUM → same positive effect. Chainlink job increases gold weight next quarter. |
| Oracle manipulation attempt | Attacker tries to spoof one feed | Median aggregation requires moving ALL valid sources. Spread check rejects >1.5% disagreement. |
| Solana network partition | Pyth feeds go stale | Switchboard (separate infra) takes over. CR defaults to Elevated (200%) during outage. |
| Both oracles fail | Zero valid prices | InsufficientOracleSources error. Mints pause. Existing positions redeemable. |
| Terra/UST-style death spiral | Panic selling VERUM | VERUM is over-collateralized. No algorithmic backing. Redeem always returns real collateral. |
| Protocol contract bug | Discovery of exploit | Emergency mode pauses mints in <1 block. Withdrawals always stay open — user funds never locked. |

---

## Defense In Depth

```
Layer 1  — SVS-1 vault protection
           ERC-4626 inflation-attack prevention (virtual offset)
           Vault-favoring rounding on all operations
           Slippage parameters per deposit/redeem

Layer 2  — Over-collateralization (150% → 300%)
           Every single mint enforces CR gate. No exceptions.

Layer 3  — Adaptive CR (automatic, no governance delay)
           BTC vol proxy → regime detection in milliseconds

Layer 4  — Multi-source oracle with median + spread check
           Pyth + Switchboard → reject manipulation, reject staleness

Layer 5  — Insurance Fund
           0.1% of every mint + burn fee accumulates
           Covers bad debt if liquidation collateral < debt

Layer 6  — Emergency Mode
           Multisig can pause mints in <1 block
           Withdrawals always stay open

Layer 7  — Checked arithmetic everywhere
           No overflow can panic or brick accounts
           All math uses checked_mul, checked_div, checked_add
```

---

## Technical Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Smart contracts | Anchor + Rust | 0.30 |
| Stablecoin engine (Layer 1) | SSS SDK — suchit1010 | submission/final-hardening-20260314 |
| Collateral vaults (Layer 1) | SVS-1 — solanabr | main |
| Primary oracle | Pyth Network | pyth-solana-receiver-sdk 0.3 |
| Fallback oracle | Switchboard | switchboard-solana 0.28 |
| Rebalancing compute | Chainlink Functions | — |
| Cross-chain bridge (v2) | Chainlink CCIP | — |
| Frontend framework | React + Vite | 18 / 5 |
| Frontend language | TypeScript | 5 |
| Wallet integration | Solana Wallet Adapter | 0.15 |
| Price streaming | Pyth Hermes WebSocket | hermes-client 1.3 |
| Network | Solana | Devnet → Mainnet |

---

## Project Structure

```
VERUM-protocol/
│
├── programs/
│   └── VERUM-vault/
│       └── src/
│           ├── lib.rs                    ← program entry point, all instructions
│           ├── state.rs                  ← GlobalConfig, AssetConfig, seeds, feed IDs
│           ├── errors.rs                 ← 25 VaultError codes
│           ├── oracle.rs                 ← Pyth normalization, adaptive CR, VERUM math
│           ├── oracle_aggregator.rs      ← multi-source median + spread check
│           ├── svs_interface.rs          ← CPI to SVS-1 vaults (deposit/redeem)
│           ├── sss_interface.rs          ← CPI to SSS (mint/burn)
│           └── instructions/
│               ├── mod.rs
│               ├── initialize.rs         ← one-time setup, mint authority transfer
│               ├── mint_VERUM.rs        ← oracle → CR gate → SSS CPI mint
│               ├── redeem_VERUM.rs      ← burn VERUM → SVS-1 redeem CPIs
│               ├── rebalance_weights.rs  ← quarterly weight update from Chainlink
│               └── emergency.rs         ← pause/unpause mints
│
├── app/
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── src/
│       ├── index.tsx
│       ├── App.tsx                       ← full UI: Deposit / Mint / Redeem tabs
│       ├── hooks/
│       │   ├── usePythPrices.ts          ← live Hermes WebSocket price streaming
│       │   └── useProtocolState.ts       ← reads on-chain GlobalConfig
│       └── utils/
│           ├── constants.ts              ← program IDs, feed IDs, vault addresses
│           └── VERUM-sdk.ts             ← PDA helpers, SVS-1 deposit, VERUM mint/redeem
│
├── tests/
│   └── VERUM-vault.ts                   ← 6 integration tests
│
├── scripts/
│   ├── deploy.ts                         ← initialize VERUMVault protocol on devnet
│   └── init-vaults.ts                    ← create SVS-1 vault for each collateral asset
│
├── chainlink-functions/
│   └── rebalance-job.js                  ← quarterly EIA/FAO/WTO weight computation job
│
├── deps/                                 ← cloned Layer 1 dependencies (gitignored)
│   ├── sss/                              ← suchit1010/solana-stablecoin-standard
│   └── svs/                              ← solanabr/solana-vault-standard
│
├── SETUP.md                              ← complete step-by-step from zero to running
├── README.md                             ← this file
├── Anchor.toml
├── Cargo.toml
├── package.json
└── tsconfig.json
```

---

## How to Build This (Quick Start)

### Prerequisites

```bash
# Solana CLI 1.18+
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"

# Anchor 0.30
cargo install --git https://github.com/coral-xyz/anchor anchor-cli \
  --tag v0.30.0 --locked

# Node 18+
nvm install 18 && nvm use 18

# Verify
solana --version   # should show 1.18.x
anchor --version   # should show 0.30.x
node --version     # should show 18.x
```

### Clone and Build

```bash
# 1. Clone Layer 1 dependencies
mkdir deps && cd deps
git clone https://github.com/suchit1010/solana-stablecoin-standard \
  --branch submission/final-hardening-20260314 sss
git clone https://github.com/solanabr/solana-vault-standard svs
cd ..

# 2. Install workspace dependencies
npm install

# 3. Build Layer 1 programs
cd deps/sss && npm install && anchor build && cd ../..
cd deps/svs && npm install && anchor build && cd ../..

# 4. Build VERUMVault
anchor build
```

### Deploy to Devnet

```bash
# Configure wallet
solana config set --url devnet
solana airdrop 5

# Create test mints (one per collateral)
spl-token create-token --decimals 6   # VERUM
spl-token create-token --decimals 8   # PAXG (gold)
spl-token create-token --decimals 6   # tOIL (crude oil)
spl-token create-token --decimals 8   # WBTC
# ... etc — save all addresses

# Deploy Layer 1
cd deps/sss && anchor deploy --provider.cluster devnet && cd ../..
cd deps/svs && anchor deploy --provider.cluster devnet && cd ../..

# Deploy VERUMVault
anchor deploy --provider.cluster devnet

# Update program IDs in app/src/utils/constants.ts
# CRITICAL: verify CPI discriminators (see SETUP.md)

# Initialize protocol
npx ts-node scripts/deploy.ts
npx ts-node scripts/init-vaults.ts
# → Copy printed vault addresses to constants.ts SVS_VAULTS
```

### Run Tests

```bash
anchor test
# Expected output:
#   6 passing
```

### Start Frontend

```bash
cd app
npm install
npm run dev
# → Open http://localhost:5173
# → Connect Phantom on devnet
# → Deposit test collateral → Mint VERUM → Redeem
```

**For the complete step-by-step guide including discriminator verification and test token minting, see `SETUP.md`.**

---

## Governance Roadmap

| Phase | When | Rebalancing Authority | Weight Determination |
|-------|------|-----------------------|---------------------|
| Phase 1 (MVP) | Now | 3-of-5 multisig | Multisig submits Chainlink Functions output on-chain |
| Phase 2 | 3 months post-launch | VERUM governance DAO | Token-weighted quadratic voting on proposals |
| Phase 3 | 6 months | Chainlink DON (automated) | Fully automated — no human involvement for routine rebalances |

The maximum shift constraint (±5% per quarter, enforced in Rust) means even a fully compromised governance actor cannot dump the VERUM composition in a single transaction.

---

## After the Hackathon

```
Month 1   →  Hacken security audit (from Buildifi 1st prize)
Month 2   →  Mainnet collateral integrations:
              PAXG (Paxos), WBTC (Portal), tokenized oil (Ostium/Parcl)
Month 3   →  Governance token launch, Phase 2 DAO rebalancing
Month 4   →  Jupiter + Orca DEX liquidity pools
Month 6   →  Chainlink CCIP → VERUM on Ethereum
Month 9   →  SVS-2 confidential vaults → institutional reserve product
Month 12  →  BRICS payment rail pilot
Month 24  →  Central bank reserve discussions
```

---

## Security

### What is protected
- All arithmetic uses `checked_mul` / `checked_div` / `checked_add` throughout — overflow panics impossible
- PDA bumps stored at `init` time — no canonical bump recomputation on hot paths
- SVS-1 virtual offset prevents inflation attacks on first deposit
- Oracle spread check prevents single-source manipulation
- Staleness check prevents stale prices from enabling cheap mints

### What is NOT audited
This is a hackathon MVP. Do not use on mainnet with real funds before a professional security review. Winning the Buildifi Hack 2 includes a Hacken audit — that is the planned path to production.

### Known limitations in MVP
- SVS-1 CPI discriminators must be verified against deployed IDL before devnet use (see SETUP.md)
- Redemption pro-rata logic is simplified — production version tracks per-user SVS-1 share balances per vault
- Chainlink Functions job not live — rebalancing requires manual multisig submission in Phase 1
- RWA weight uses DXY as oracle proxy — real tokenized RWA price feeds needed for mainnet

---

## Reused Code Disclosure

Per Buildifi Hack 2 competition rules, all reused code is disclosed here.

| Component | Source Repo | License | Usage in VERUM |
|-----------|-------------|---------|----------------|
| SSS Stablecoin SDK | [suchit1010/solana-stablecoin-standard](https://github.com/suchit1010/solana-stablecoin-standard) branch: `submission/final-hardening-20260314` | MIT | VERUM token mint/burn engine. `VERUMVault` CPIs into SSS for `mint_tokens` and `burn_tokens`. SSS code is completely unchanged. |
| SVS-1 Vault Standard | [solanabr/solana-vault-standard](https://github.com/solanabr/solana-vault-standard) branch: `main` | MIT | ERC-4626 tokenized collateral vaults, one per asset. `VERUMVault` CPIs into SVS-1 for collateral deposit and redemption. SVS-1 code is completely unchanged. |

All other code — `VERUMVault` program, oracle aggregator, adaptive CR logic, `svs_interface.rs`, `sss_interface.rs`, frontend, scripts, Chainlink Functions job — is original work written for this hackathon.

---

## Reference Documentation

### Solana + Anchor
- [Anchor Book](https://book.anchor-lang.com) — program development, PDAs, CPI
- [Solana Docs](https://docs.solana.com) — runtime, accounts model, transactions
- [SPL Token Program](https://spl.solana.com/token) — SPL token standard
- [Token-2022](https://spl.solana.com/token-2022) — confidential transfers (future)
- [Solana Cookbook](https://solanacookbook.com) — common patterns

### Oracle Documentation
- [Pyth Docs](https://docs.pyth.network) — price feeds, confidence intervals, PriceUpdateV2
- [Pyth Feed IDs — Devnet](https://pyth.network/developers/price-feed-ids#solana-devnet) — XAU, WTI, BTC, XAG, DXY feed addresses
- [Pyth Feed IDs — Mainnet](https://pyth.network/developers/price-feed-ids#solana-mainnet) — production addresses
- [Pyth Hermes API](https://hermes.pyth.network/docs) — WebSocket streaming for frontend
- [Pyth Solana Receiver SDK](https://github.com/pyth-network/pyth-crosschain/tree/main/target_chains/solana/sdk/js/pyth_solana_receiver) — on-chain integration
- [Switchboard Docs](https://docs.switchboard.xyz) — custom oracle feeds, aggregator accounts
- [Switchboard Solana SDK](https://docs.switchboard.xyz/solana) — Anchor integration
- [Chainlink Functions Docs](https://docs.chain.link/chainlink-functions) — off-chain compute with on-chain verification
- [Chainlink Functions Playground](https://functions.chain.link) — deploy and manage jobs
- [Chainlink CCIP Docs](https://docs.chain.link/ccip) — cross-chain token transfers (post-MVP)

### Layer 1 Dependencies
- [SSS — Solana Stablecoin Standard](https://github.com/suchit1010/solana-stablecoin-standard) — mint/burn SDK
- [SVS-1 — Solana Vault Standard](https://github.com/solanabr/solana-vault-standard) — ERC-4626 vaults
- [ERC-4626 on Solana](https://solana.com/developers/evm-to-svm/erc4626) — vault standard reference

### DeFi Protocol Design
- [MakerDAO Docs](https://docs.makerdao.com) — CDP, surplus buffer, liquidation engine
- [Euler Finance Docs](https://docs.euler.finance) — reactive interest rates, liquidation design
- [Liquity Docs](https://docs.liquity.org) — zero-interest CDP, redemption mechanism
- [Frax Finance Docs](https://docs.frax.finance) — fractional-algorithmic stablecoin design

### Macro Data Sources (Chainlink Functions)
- [EIA API Docs](https://www.eia.gov/opendata/) — US Energy Information Administration oil data
- [FAO Food Price Index](https://www.fao.org/worldfoodsituation/foodpricesindex/en/) — UN agricultural prices
- [WTO API](https://apiportal.wto.org) — global merchandise trade volumes
- [World Gold Council](https://www.gold.org/goldhub/data) — central bank gold demand data

### Hackathon
- [Buildifi Hack 2](https://www.buildifi.ai/hackathon/693bb38c238f4bd5a9b40e7f) — competition page + resources
- [DeAura](https://deaura.io) — token launch platform (required for submission)
- [Bonk Advisory](https://bonk.com) — 1st place: investment interview opportunity
- [Hacken](https://hacken.io) — 1st place: professional smart contract security audit

---

## Evaluation Criteria Alignment

| Criterion | VERUM Approach |
|-----------|----------------|
| **Technical Quality** | Production Anchor patterns. Checked arithmetic everywhere. Multi-oracle with fallback. PDA signer model for CPI. SVS-1 and SSS are production-hardened dependencies. |
| **Token Utility** | VERUM is the settlement unit. Minting requires real over-collateralized assets. Redeeming returns real assets. 0.1% fee funds insurance. Governance potential in Phase 2. |
| **Product Experience** | Live CR gauge with adaptive regime display. Real-time Pyth price ticker. Deposit → Mint → Redeem in 3 tabs. Oracle status. BTC vol proxy gauge. |
| **Innovation** | Adaptive CR using BTC Pyth confidence interval (first on Solana). Multi-asset VERUM with on-chain dynamic weights. Two-layer architecture (SVS-1 + SSS) enables composability. |
| **Launch Readiness** | DeAura token created. $200k volume target via Jupiter/Orca listing plan. Complete whitepaper. Demo video. Deploy scripts ready. |

---

## License

MIT — see LICENSE.

---

> *"The world does not need another USD clone. It needs the coin everything revolves around."*
