# BASKET — World Reserve Protocol

> *The neutral, crisis-resilient reserve currency backed by what the world actually runs on.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built on Solana](https://img.shields.io/badge/Built%20on-Solana-9945FF)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.30-blue)](https://anchor-lang.com)
[![Network](https://img.shields.io/badge/Network-Devnet-green)](https://explorer.solana.com/?cluster=devnet)
[![Hackathon](https://img.shields.io/badge/Buildifi%20Hack%202-DeFi%20Track-orange)](https://www.buildifi.ai)

---

## Table of Contents

1. [What We Are Building](#what-we-are-building)
2. [The Problem We Are Solving](#the-problem-we-are-solving)
3. [Architecture](#architecture)
4. [Basket Composition](#basket-composition)
5. [Adaptive Collateral Ratio](#adaptive-collateral-ratio)
6. [Oracle Strategy](#oracle-strategy)
7. [Mathematical Specification](#mathematical-specification)
8. [Crisis Resilience](#crisis-resilience)
9. [Technical Stack](#technical-stack)
10. [Project Structure](#project-structure)
11. [How to Build This](#how-to-build-this)
12. [Governance Roadmap](#governance-roadmap)
13. [Security](#security)
14. [Reused Code Disclosure](#reused-code-disclosure)
15. [Reference Documentation](#reference-documentation)
16. [Launch Checklist](#launch-checklist)

---

## What We Are Building

Every stablecoin today is either a liability of one government (USDC, USDT), an experiment waiting to collapse (algorithmic), or a single-asset hedge that does not function as money (PAXG). When the dollar is weaponized through sanctions, when a central bank prints to fund a war, when one country's monetary policy exports inflation to every other country — there is no neutral alternative.

**BASKET is that neutral alternative.**

It is a fully on-chain stablecoin whose value is pegged to a dynamic basket of the exact assets global trade revolves around: crude oil, gold, silver, agricultural commodities, Bitcoin as a digital hedge, and tokenized real-world assets. No single government controls it. No single asset can break it. The collateral ratio automatically tightens when markets become volatile, so the peg holds exactly when it matters most — in a crisis.

This is not another yield farm. This is the reserve currency the world has needed since Bretton Woods failed.

---

## The Problem We Are Solving

| Problem | Current State | BASKET Solution |
|---------|--------------|-----------------|
| USD dominance is weaponized | Sanctions freeze reserves overnight | Neutral, decentralized, no single issuer |
| Stablecoins fail in crises | Terra/UST lost $40B in 72 hours | Adaptive CR auto-escalates to 300% in stress |
| Single-asset backing | PAXG = gold only, misses energy | Multi-asset basket mirrors real trade flows |
| Fiat-backed means fiat inflation | USDC tracks USD debasement | Backed by scarce real-world commodities |
| Oracle manipulation | Single source = single attack vector | Pyth + Switchboard median + spread check |
| Opaque collateral | Cannot verify backing in real time | Fully on-chain, readable 24/7 by anyone |

---

## Architecture

### Full System Stack

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          BASKET Protocol Stack                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER 4 — CROSS-CHAIN (post-MVP)                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Chainlink CCIP → BRICS CBDC bridge → mBridge / e-CNY / Digital INR  │   │
│  │  Oil & commodity trades settle in BASKET across chains                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  LAYER 3 — DATA & ORACLES                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐    │
│  │  Pyth Network   │  │  Switchboard    │  │  Chainlink Functions     │    │
│  │  PRIMARY        │  │  FALLBACK       │  │  QUARTERLY REBALANCING   │    │
│  │  Sub-second     │  │  Permissionless │  │  EIA oil supply/demand   │    │
│  │  XAU WTI BTC    │  │  Custom feeds   │  │  FAO food price index    │    │
│  │  XAG DXY        │  │  Uncorrelated   │  │  WTO trade volumes       │    │
│  │  Pushed on-chain│  │  failure modes  │  │  WGC gold reserves       │    │
│  └────────┬────────┘  └────────┬────────┘  └───────────┬──────────────┘    │
│           └─────────────────── ┼ ──────────────────────┘                   │
│                                ▼                                            │
│            Oracle Aggregator: median(valid_prices) + spread_check           │
│                                                                              │
│  LAYER 2 — BASKET VAULT (this repo)                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  BasketVault Anchor Program                                          │   │
│  │                                                                      │   │
│  │  initialize()          one-time setup, vault PDA becomes mint auth   │   │
│  │  mint_basket()         oracle prices → CR gate → SSS CPI mint        │   │
│  │  redeem_basket()       burn BASKET → SVS-1 redeem CPIs               │   │
│  │  rebalance_weights()   validate + apply Chainlink Functions result    │   │
│  │  set_emergency_mode()  pause mints, withdrawals always stay open      │   │
│  └────────────────────────┬────────────────────────┬─────────────────────┘  │
│                           │ CPI: mint/burn          │ CPI: deposit/redeem   │
│                           ▼                         ▼                       │
│  LAYER 1A                                  LAYER 1B                         │
│  ┌──────────────────────────┐   ┌──────────────────────────────────────┐   │
│  │  SSS Stablecoin SDK      │   │  Solana Vault Standard (SVS-1)       │   │
│  │  suchit1010              │   │  solanabr — ERC-4626                 │   │
│  │                          │   │                                      │   │
│  │  mint_tokens(amount)     │   │  One vault per collateral asset:     │   │
│  │  burn_tokens(amount)     │   │  PAXG vault / tOIL vault             │   │
│  │  freeze / thaw           │   │  WBTC vault / XAG vault              │   │
│  │                          │   │  DXY vault  / RWA vault              │   │
│  │  BASKET token lives here │   │                                      │   │
│  │  Vault PDA = mint auth   │   │  Inflation-attack protection         │   │
│  └──────────────────────────┘   │  Vault-favoring rounding             │   │
│                                 │  Slippage min/max parameters         │   │
│                                 │  Emergency pause per vault           │   │
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
    └── STEP 2: Mint BASKET
          User calls BasketVault::mint_basket(desired_amount)

          BasketVault reads total_assets from each SVS-1 vault
          BasketVault fetches Pyth PriceUpdateV2 for all 6 assets
          BasketVault tries Switchboard fallback if Pyth stale
          BasketVault computes median per asset, validates spread < 1.5%

          basket_value = Σ( normalize(amount[i]) × price[i] × weight_bps[i] / 10000 )
          btc_conf_bps = btc_conf / btc_price × 10000
          adaptive_cr  = 150 | 200 | 300 based on btc_conf_bps

          REQUIRE: basket_value >= desired × adaptive_cr / 100
          Deducts 0.1% to insurance fund
          CPIs to SSS::mint_tokens(net_amount)

          User receives BASKET tokens
```

### Redeem Flow

```
User wallet
    │
    └── Calls BasketVault::redeem_basket(basket_amount)

        BasketVault CPIs to SSS::burn_tokens(basket_amount)
        For each of 6 assets:
          pro_rata_shares = user_share_balance × basket_amount / total_supply
          CPI to SVS-1::redeem(pro_rata_shares, min_assets_out)

        User receives proportional collateral in all 6 assets
```

---

## Basket Composition

Initial weights mirror 2026 global trade flows. Rebalanced quarterly via Chainlink Functions.

| Index | Asset | Symbol | Weight | Oracle Feed | Strategic Role |
|-------|-------|--------|--------|-------------|----------------|
| 0 | Gold | XAU / PAXG | **20%** | Pyth XAU/USD | Central bank reserve, store of value |
| 1 | Crude Oil | WTI / tOIL | **25%** | Pyth WTI/USD | Energy — the global economy runs on it |
| 2 | Bitcoin | BTC / WBTC | **15%** | Pyth BTC/USD | Digital hedge + vol proxy for adaptive CR |
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

Pyth publishes a `conf` field alongside every price — the oracle network's own uncertainty estimate. When market stress rises, BTC conf/price spikes. This is on-chain, real-time, and manipulation-resistant.

**Historical calibration against real events:**

| Event | BTC conf/price | Regime triggered |
|-------|---------------|-----------------|
| Calm 2024 market | 0.08–0.15% | Normal (150%) |
| August 2024 yen carry unwind | ~1.8% | Elevated (200%) |
| FTX collapse November 2022 | ~2.8% | Crisis (300%) |
| Luna/UST collapse May 2022 | ~3.5% | Crisis (300%) |

---

## Oracle Strategy

Three oracles with deliberately different roles. Not redundant copies — separation of concerns.

**Real-time prices (every transaction):**

```
1. Pyth (primary)
   Why: Pushed on-chain — zero latency read. Sub-second updates.
        Best commodity + crypto coverage on Solana in 2026.
        Free to read — no LINK fees at scale.
   Reject: age > 60s  OR  conf/price > 2%

2. Switchboard (fallback)
   Why: Permissionless — can create custom feeds for FAO food price
        index, BRICS trade volumes, assets Pyth does not cover.
        Failure mode uncorrelated with Pyth (different node infra).
        Solana-native, clean Anchor SDK integration.
   Reject: age > 120s

3. Aggregation:
   Collect valid prices → sort → lower median (conservative)
   Reject if spread between sources > 150 bps (1.5%)
```

**Quarterly rebalancing (Chainlink Functions):**

```
4. Chainlink Functions
   Why: Pull model with off-chain compute. Perfect for calling
        REST APIs (EIA, FAO, WTO, WGC) and running weight logic.
        NOT used for real-time prices (too slow, costs LINK).
   Runs: Every 90 days
   Fetches: EIA oil supply/demand, FAO Food Price Index,
            WTO trade volume index, WGC gold reserve data
   Output: Signed uint16[6] weight proposal → on-chain validation
```

**Why not Chainlink for real-time prices?** Chainlink Data Streams on Solana use a pull model — each request costs LINK and adds 1–3 seconds of latency. At 10,000 mint transactions per day, this is a material protocol cost. Pyth data is already pushed on-chain, costs nothing to read, and updates sub-second.

---

## Mathematical Specification

### Basket Value

```
normalize(amount, decimals):
  if decimals > 6:  amount / 10^(decimals - 6)
  if decimals < 6:  amount × 10^(6 - decimals)
  if decimals = 6:  amount

basket_value = Σᵢ [
    normalize(collateral_amount[i], asset.decimals)
  × normalize_price(pyth_price[i], pyth_expo[i])
  / 1_000_000
  × asset.weight_bps[i]
  / 10_000
]
```

### Collateral Ratio

```
CR (%) = basket_value / basket_minted × 100
```

### Mint Gate

```
total_after  = current_supply + desired_amount
required     = total_after × adaptive_CR / 100
PASS if basket_value >= required
FAIL if basket_value <  required  →  error: UnderCollateralized
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
median = valid_prices[⌊n/2⌋]    ← lower median = conservative

spread_bps = (max_price - min_price) / median × 10_000
require spread_bps ≤ 150        ← reject if sources disagree
```

---

## Crisis Resilience

| Scenario | What Happens | Why BASKET Survives |
|----------|-------------|---------------------|
| 2008-style liquidity crunch | BTC vol spikes, conf/price > 2% | CR auto-escalates to 300%. New mints need 3× collateral. |
| Oil embargo / supply shock | WTI price surges | Oil is 25% of basket — BASKET value rises with oil. |
| Central bank gold buying surge | XAU price rises | Gold is 20% of basket — same positive effect. |
| Oracle manipulation attempt | Attacker spoof one feed | Median requires moving ALL valid sources. Spread check rejects >1.5% disagreement. |
| Solana network partition | Pyth feeds go stale | Switchboard (separate infra) takes over. CR defaults to Elevated. |
| Both oracles fail | Zero valid prices | InsufficientOracleSources error. Mints pause. Redeem stays open. |
| Terra/UST-style death spiral | Panic selling BASKET | BASKET is over-collateralized. Redeem always returns real collateral. |
| Smart contract bug discovered | Exploit found | Emergency mode pauses mints in <1 block. Withdrawals always open. |

### Defense in Depth

```
Layer 1  SVS-1 vault protection
         ERC-4626 inflation-attack prevention (virtual offset)
         Vault-favoring rounding on all operations
         Slippage parameters per deposit/redeem

Layer 2  Over-collateralization (150% minimum, 300% in crisis)
         Every single mint enforces the CR gate. No exceptions.

Layer 3  Adaptive CR (automatic, no governance delay)
         BTC vol proxy → regime detection in milliseconds

Layer 4  Multi-source oracle with median + spread check
         Pyth + Switchboard → reject manipulation, reject staleness

Layer 5  Insurance Fund
         0.1% of every mint + burn fee accumulates
         Covers bad debt if liquidation collateral < debt

Layer 6  Emergency Mode
         Multisig can pause mints in <1 block
         Withdrawals always stay open — user funds never locked

Layer 7  Checked arithmetic throughout
         All math uses checked_mul, checked_div, checked_add
         Overflow panics are impossible
```

---

## Technical Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Smart contracts | Anchor + Rust | 0.30 |
| Stablecoin engine | SSS SDK — suchit1010 | submission/final-hardening-20260314 |
| Collateral vaults | SVS-1 — solanabr | main |
| Primary oracle | Pyth Network | pyth-solana-receiver-sdk 0.3 |
| Fallback oracle | Switchboard | switchboard-solana 0.28 |
| Rebalancing compute | Chainlink Functions | — |
| Cross-chain bridge (v2) | Chainlink CCIP | — |
| Frontend framework | React + Vite | 18 / 5 |
| Wallet integration | Solana Wallet Adapter | 0.15 |
| Price streaming | Pyth Hermes WebSocket | hermes-client 1.3 |
| Network | Solana | Devnet → Mainnet |

---

## Project Structure

```
basket-protocol/
│
├── programs/
│   └── basket-vault/
│       └── src/
│           ├── lib.rs                    ← program entry point, all instructions
│           ├── state.rs                  ← GlobalConfig, AssetConfig, seeds, feed IDs
│           ├── errors.rs                 ← 25 VaultError codes
│           ├── oracle.rs                 ← Pyth normalization, adaptive CR, basket math
│           ├── oracle_aggregator.rs      ← multi-source median + spread check
│           ├── svs_interface.rs          ← CPI to SVS-1 vaults (deposit/redeem)
│           ├── sss_interface.rs          ← CPI to SSS (mint/burn)
│           └── instructions/
│               ├── initialize.rs         ← one-time setup, mint authority transfer
│               ├── mint_basket.rs        ← oracle → CR gate → SSS CPI mint
│               ├── redeem_basket.rs      ← burn BASKET → SVS-1 redeem CPIs
│               ├── rebalance_weights.rs  ← quarterly weight update from Chainlink
│               └── emergency.rs         ← pause/unpause mints
│
├── app/
│   └── src/
│       ├── App.tsx                       ← full UI: Deposit / Mint / Redeem tabs
│       ├── hooks/
│       │   ├── usePythPrices.ts          ← live Hermes WebSocket price streaming
│       │   └── useProtocolState.ts       ← reads on-chain GlobalConfig
│       └── utils/
│           ├── constants.ts              ← program IDs, feed IDs, vault addresses
│           └── basket-sdk.ts             ← PDA helpers, SVS-1 deposit, BASKET mint/redeem
│
├── tests/
│   └── basket-vault.ts                   ← 6 integration tests
│
├── scripts/
│   ├── deploy.ts                         ← initialize BasketVault on devnet
│   └── init-vaults.ts                    ← create SVS-1 vault for each asset
│
├── chainlink-functions/
│   └── rebalance-job.js                  ← quarterly EIA/FAO/WTO weight computation
│
├── deps/                                 ← Layer 1 dependencies (clone here)
│   ├── sss/                              ← suchit1010/solana-stablecoin-standard
│   └── svs/                              ← solanabr/solana-vault-standard
│
├── SETUP.md                              ← complete step-by-step from zero to running
└── README.md                             ← this file
```

---

## How to Build This

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
solana --version    # 1.18.x
anchor --version    # 0.30.x
node --version      # 18.x
```

### Clone and Build

```bash
# Clone Layer 1 dependencies
mkdir deps && cd deps
git clone https://github.com/suchit1010/solana-stablecoin-standard \
  --branch submission/final-hardening-20260314 sss
git clone https://github.com/solanabr/solana-vault-standard svs
cd ..

# Install workspace dependencies
npm install

# Build all programs
cd deps/sss && npm install && anchor build && cd ../..
cd deps/svs && npm install && anchor build && cd ../..
anchor build
```

### Deploy to Devnet

```bash
# Configure wallet
solana config set --url devnet
solana airdrop 5

# Create test mints (one per collateral type)
spl-token create-token --decimals 6    # BASKET mint
spl-token create-token --decimals 8    # PAXG (gold)
spl-token create-token --decimals 6    # tOIL (crude oil)
spl-token create-token --decimals 8    # WBTC
spl-token create-token --decimals 8    # XAG (silver/agri)
spl-token create-token --decimals 6    # DXY proxy
spl-token create-token --decimals 6    # RWA proxy

# Deploy Layer 1 programs
cd deps/sss && anchor deploy --provider.cluster devnet && cd ../..
cd deps/svs && anchor deploy --provider.cluster devnet && cd ../..

# Deploy BasketVault
anchor deploy --provider.cluster devnet

# Update program IDs in app/src/utils/constants.ts
# CRITICAL: verify CPI discriminators against deployed IDLs (see SETUP.md)

# Initialize protocol
npx ts-node scripts/deploy.ts
npx ts-node scripts/init-vaults.ts
# Copy printed vault addresses into constants.ts SVS_VAULTS
```

### Verify Discriminators (Critical Step)

```bash
# Get real discriminators from deployed programs
anchor idl fetch <SSS_PROGRAM_ID>  --output json > sss-idl.json
anchor idl fetch <SVS1_PROGRAM_ID> --output json > svs1-idl.json

# Check discriminators
jq '.instructions[] | {name, discriminator}' sss-idl.json
jq '.instructions[] | {name, discriminator}' svs1-idl.json

# Update sss_interface.rs MINT_DISC and BURN_DISC
# Update svs_interface.rs DEPOSIT_DISC and REDEEM_DISC
```

### Run Tests

```bash
anchor test
# Expected: 6 passing
```

### Start Frontend

```bash
cd app && npm install && npm run dev
# → http://localhost:5173
```

---

## Governance Roadmap

| Phase | Timeline | Authority | Rebalancing |
|-------|----------|-----------|-------------|
| Phase 1 (MVP) | Now | 3-of-5 multisig | Multisig submits Chainlink Functions output |
| Phase 2 | 3 months post-launch | BASKET governance DAO | Token-weighted voting on proposals |
| Phase 3 | 6 months | Chainlink DON (automated) | Fully automated, no human input |

Maximum shift constraint (±5% per quarter, enforced in Rust) means even a fully compromised governance actor cannot dump the basket in one transaction.

---

## After the Hackathon

```
Month 1   Hacken security audit (from Buildifi 1st prize)
Month 2   Mainnet collateral: PAXG, WBTC, tokenized oil (Ostium/Parcl)
Month 3   Governance token launch, Phase 2 DAO rebalancing
Month 4   Jupiter + Orca DEX liquidity pools
Month 6   Chainlink CCIP — BASKET on Ethereum
Month 9   SVS-2 confidential vaults — institutional reserve product
Month 12  BRICS payment rail pilot
Month 24  Central bank reserve discussions
```

---

## Security

### What is protected

- All arithmetic uses `checked_mul` / `checked_div` / `checked_add` — overflow panics impossible
- PDA bumps stored at `init` time — no canonical bump recomputation on hot paths
- SVS-1 virtual offset prevents inflation attacks on first deposit
- Oracle spread check prevents single-source manipulation
- Staleness check prevents stale prices from enabling cheap mints

### What is not audited

This is a hackathon MVP. Do not use on mainnet with real funds before a professional security review. Winning the Buildifi Hack 2 includes a Hacken audit — that is the planned path to production.

### Known limitations in MVP

- SVS-1 CPI discriminators must be verified against deployed IDL (see SETUP.md)
- Redemption pro-rata logic is simplified — production version tracks per-user SVS-1 share balances
- Chainlink Functions job requires manual multisig submission in Phase 1
- RWA weight uses DXY as oracle proxy pending real tokenized RWA feeds

---

## Reused Code Disclosure

Per Buildifi Hack 2 competition rules, all reused code is disclosed here.

| Component | Source | License | How Used |
|-----------|--------|---------|----------|
| SSS Stablecoin SDK | [suchit1010/solana-stablecoin-standard](https://github.com/suchit1010/solana-stablecoin-standard) branch: `submission/final-hardening-20260314` | MIT | BASKET token mint/burn engine. BasketVault CPIs into SSS for all mint and burn operations. Completely unchanged. |
| SVS-1 Vault Standard | [solanabr/solana-vault-standard](https://github.com/solanabr/solana-vault-standard) branch: `main` | MIT | ERC-4626 tokenized collateral vaults, one per asset. BasketVault CPIs into SVS-1 for deposit and redemption. Completely unchanged. |

All other code — BasketVault program, oracle aggregator, adaptive CR logic, interfaces, frontend, scripts, Chainlink Functions job — is original work written for this hackathon.

---

## Reference Documentation

### Solana + Anchor
- [Anchor Book](https://book.anchor-lang.com) — program development, PDAs, CPI
- [Solana Docs](https://docs.solana.com) — runtime, accounts model, transactions
- [SPL Token Program](https://spl.solana.com/token) — SPL token standard
- [Solana Cookbook](https://solanacookbook.com) — common patterns

### Oracle Documentation
- [Pyth Docs](https://docs.pyth.network) — price feeds, confidence intervals
- [Pyth Feed IDs — Devnet](https://pyth.network/developers/price-feed-ids#solana-devnet) — XAU, WTI, BTC, XAG, DXY addresses
- [Pyth Feed IDs — Mainnet](https://pyth.network/developers/price-feed-ids#solana-mainnet) — production addresses
- [Pyth Hermes API](https://hermes.pyth.network/docs) — WebSocket streaming for frontend
- [Switchboard Docs](https://docs.switchboard.xyz) — custom oracle feeds, Anchor SDK
- [Chainlink Functions Docs](https://docs.chain.link/chainlink-functions) — off-chain compute
- [Chainlink Functions Playground](https://functions.chain.link) — deploy and manage jobs
- [Chainlink CCIP Docs](https://docs.chain.link/ccip) — cross-chain messaging

### Layer 1 Dependencies
- [SSS SDK Repo](https://github.com/suchit1010/solana-stablecoin-standard)
- [SVS-1 Repo](https://github.com/solanabr/solana-vault-standard)
- [ERC-4626 on Solana](https://solana.com/developers/evm-to-svm/erc4626)

### DeFi Protocol Design
- [MakerDAO Docs](https://docs.makerdao.com) — CDP, surplus buffer, liquidation engine
- [Liquity Docs](https://docs.liquity.org) — zero-interest CDP, redemption mechanism

### Macro Data Sources (Chainlink Functions)
- [EIA API](https://www.eia.gov/opendata/) — US Energy Information Administration
- [FAO Food Price Index](https://www.fao.org/worldfoodsituation/foodpricesindex/en/)
- [WTO API](https://apiportal.wto.org) — global merchandise trade volumes
- [World Gold Council](https://www.gold.org/goldhub/data) — central bank gold demand

### Hackathon
- [Buildifi Hack 2](https://www.buildifi.ai/hackathon/693bb38c238f4bd5a9b40e7f) — competition page
- [DeAura](https://deaura.io) — token launch platform (required for submission)
- [Bonk Advisory](https://bonk.com) — 1st place investment interview
- [Hacken](https://hacken.io) — 1st place security audit

---

## Launch Checklist

Use this before submitting. Check every item. Tags: `BLOCKER` = disqualification risk. `JUDGE` = directly scored. `5MIN` = quick fix, do last.

### Eligibility — disqualified without these

- [ ] **[BLOCKER]** Token launched on DeAura
- [ ] **[BLOCKER]** $200,000 in trading volume reached (or clear path documented)
- [ ] **[BLOCKER]** Reused code (SSS SDK + SVS-1) disclosed in README and submission notes
- [ ] **[BLOCKER]** No wash trading — all volume is organic or from genuine liquidity

### Submission package

- [ ] **[JUDGE]** Working MVP deployed on Solana devnet (not localnet)
- [ ] **[JUDGE]** Frontend accessible via public URL or localhost demo
- [ ] **[JUDGE]** DeAura token launch link included in submission
- [ ] **[JUDGE]** README covers: what it is, architecture, reused code disclosure
- [ ] **[JUDGE]** Demo video recorded (2–3 min): wallet → deposit → mint → CR → redeem
- [ ] **[JUDGE]** Pitch covering: problem, solution, token utility, launch plan

### Rust program — does it actually work?

- [ ] **[BLOCKER]** `anchor build` completes with zero errors
- [ ] **[JUDGE]** `anchor test` passes — all 6 tests green
- [ ] **[BLOCKER]** `declare_id!` in `lib.rs` matches the deployed program ID
- [ ] **[BLOCKER]** SSS CPI discriminator verified against real SSS IDL (not placeholder bytes)
- [ ] **[BLOCKER]** SVS-1 CPI discriminator verified against real SVS-1 IDL
- [ ] **[JUDGE]** `anchor deploy` succeeds on devnet
- [ ] **[JUDGE]** `scripts/deploy.ts` runs cleanly — GlobalConfig created on-chain
- [ ] **[JUDGE]** `scripts/init-vaults.ts` creates SVS-1 vault for each of the 6 assets
- [ ] **[BLOCKER]** Vault authority PDA is the mint authority for BASKET mint
  ```bash
  spl-token display <BASKET_MINT_ADDRESS>
  # "Mint authority" should show your vault authority PDA address
  ```

### Core protocol flow — can a user actually mint BASKET?

- [ ] **[JUDGE]** User can deposit test PAXG into SVS-1 vault on devnet
- [ ] **[JUDGE]** SVS-1 vault `total_assets` increases after deposit (readable on-chain)
- [ ] **[BLOCKER]** `mint_basket` instruction executes successfully on devnet
- [ ] **[BLOCKER]** User receives BASKET tokens in wallet after mint
- [ ] **[JUDGE]** Mint correctly rejects when collateral is insufficient (`UnderCollateralized` error)
- [ ] **[JUDGE]** Adaptive CR changes based on BTC conf/price — test at 3 different vol levels
- [ ] **[JUDGE]** `redeem_basket` burns BASKET and returns collateral successfully
- [ ] **[JUDGE]** Insurance fund balance increases by 0.1% after each mint/redeem
- [ ] **[JUDGE]** Emergency mode pause blocks new mints but allows withdrawals

### Oracle integration — prices are real, not mocked

- [ ] **[JUDGE]** Pyth PriceUpdateV2 accounts fetched correctly for all 6 assets on devnet
- [ ] **[JUDGE]** Price normalization to 6 decimals verified — log the price in a test mint and check it looks right
- [ ] **[5MIN]** Staleness check fires — test with a 61-second-old price account
- [ ] **[5MIN]** Switchboard aggregator account readable on devnet for at least 1 asset
- [ ] **[JUDGE]** Frontend shows live Pyth prices updating every ~3 seconds

### Frontend — judges will click through it

- [ ] **[JUDGE]** Phantom wallet connects on devnet without errors
- [ ] **[JUDGE]** Deposit tab: asset selector, amount input, live preview all work
- [ ] **[JUDGE]** Mint tab: CR display shows correct value from on-chain state
- [ ] **[JUDGE]** Mint tab: adaptive CR badge changes color/label (Normal / Elevated / Crisis)
- [ ] **[BLOCKER]** Mint tab: clicking Mint triggers a real transaction, not a mock setTimeout
- [ ] **[JUDGE]** Redeem tab: burn + redeem flow completes end-to-end
- [ ] **[5MIN]** Basket weight bars show correct percentages from GlobalConfig on-chain
- [ ] **[5MIN]** Oracle status chips show real Pyth/Switchboard age, not hardcoded values
- [ ] **[5MIN]** Transaction links open correct Solscan devnet explorer pages
- [ ] **[5MIN]** No console errors when wallet is connected and all accounts exist

### Constants and config — most common source of silent failures

- [ ] **[BLOCKER]** `BASKET_VAULT_PROGRAM_ID` in `constants.ts` matches deployed program
- [ ] **[BLOCKER]** `SSS_PROGRAM_ID` in `constants.ts` matches deployed SSS program
- [ ] **[BLOCKER]** `SVS1_PROGRAM_ID` in `constants.ts` matches deployed SVS-1 program
- [ ] **[BLOCKER]** `BASKET_MINT` in `constants.ts` matches the real BASKET mint address
- [ ] **[BLOCKER]** All 6 `ASSET_MINTS` updated to real devnet test mint addresses
- [ ] **[BLOCKER]** All 6 `SVS_VAULTS` updated with addresses printed by `init-vaults.ts`
- [ ] **[BLOCKER]** `PYTH_ACCOUNTS` updated with real devnet PriceUpdateV2 account addresses

### Pitch — what you say to judges and investors

- [ ] **[JUDGE]** Can explain BASKET in one sentence without using the word "stablecoin"
- [ ] **[JUDGE]** Can answer: why adaptive CR is better than fixed CR (no governance delay — automatic)
- [ ] **[JUDGE]** Can answer: why Pyth as primary and not Chainlink (zero latency, free reads, on-chain)
- [ ] **[JUDGE]** Can answer: what makes this different from sDAI or FRAX (multi-commodity + adaptive CR)
- [ ] **[JUDGE]** Can answer: what is the BRICS story (neutral settlement unit for cross-border commodity trades)
- [ ] **[JUDGE]** Token utility clearly explained — what BASKET is needed for beyond speculation
- [ ] **[JUDGE]** Fee model explained: 0.1% mint + burn → insurance fund → bad debt coverage
- [ ] **[JUDGE]** Launch plan: DeAura → Jupiter listing → Orca liquidity pool

### Demo video — 2 minutes, judges watch this first

- [ ] **[JUDGE]** Opens with the problem in one sentence (10 seconds)
- [ ] **[JUDGE]** Shows wallet connect on devnet Phantom
- [ ] **[JUDGE]** Shows deposit of real test collateral into SVS-1 vault
- [ ] **[JUDGE]** Shows live CR ratio updating after deposit
- [ ] **[JUDGE]** Shows mint transaction signing and BASKET appearing in wallet
- [ ] **[JUDGE]** Shows the adaptive CR badge — ideally switching regime
- [ ] **[JUDGE]** Shows redeem flow — BASKET burns, collateral returns
- [ ] **[JUDGE]** Ends with launch plan: DeAura link, $200k volume target
- [ ] **[5MIN]** No background music, clear screen recording, no buffering pauses

---

> *"The world does not need another USD clone. It needs the coin everything revolves around."*

---

*Built for Buildifi Hack 2 — DeFi Track — March 2026.*
*License: MIT*