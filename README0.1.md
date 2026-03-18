# BASKET — World Reserve Protocol

Multi-asset basket stablecoin on Solana. Built on top of:
- **SSS SDK** (suchit1010) — BASKET mint/burn engine (Layer 1)
- **SVS-1** (solanabr) — ERC-4626 tokenized collateral vaults (Layer 1)
- **BasketVault** (this repo) — Oracle aggregation, CR engine, mint gate (Layer 2)
- **Pyth + Switchboard** — Real-time price feeds (Layer 3)
- **Chainlink Functions** — Quarterly rebalancing jobs (Layer 3)

> Reused code disclosed per Buildifi Hack 2 rules.

---

## Project Structure

```
basket-protocol/
├── programs/
│   └── basket-vault/
│       └── src/
│           ├── lib.rs                    ← program entry, all instructions
│           ├── state.rs                  ← account structs + seeds
│           ├── oracle.rs                 ← Pyth normalization + adaptive CR
│           ├── oracle_aggregator.rs      ← median + spread check
│           ├── svs_interface.rs          ← CPI to SVS-1 vaults
│           ├── sss_interface.rs          ← CPI to SSS mint/burn
│           ├── errors.rs                 ← all error codes
│           └── instructions/
│               ├── mod.rs
│               ├── initialize.rs         ← one-time setup
│               ├── mint_basket.rs        ← core: oracle→CR→CPI mint
│               ├── redeem_basket.rs      ← burn BASKET → withdraw collateral
│               ├── rebalance_weights.rs  ← quarterly weight update
│               └── emergency.rs         ← pause/unpause
├── app/
│   └── src/
│       ├── components/
│       │   ├── CRGauge.tsx
│       │   ├── BasketWeights.tsx
│       │   ├── DepositPanel.tsx
│       │   ├── MintPanel.tsx
│       │   └── RedeemPanel.tsx
│       ├── hooks/
│       │   ├── useProtocolState.ts
│       │   └── usePythPrices.ts
│       ├── utils/
│       │   ├── basket-sdk.ts             ← Solana program interactions
│       │   ├── svs-sdk.ts                ← SVS-1 deposit/redeem helpers
│       │   └── constants.ts              ← program IDs, feed IDs
│       ├── App.tsx
│       └── index.tsx
├── tests/
│   ├── basket-vault.ts                   ← full integration tests
│   └── helpers.ts
├── scripts/
│   ├── deploy.ts                         ← devnet deploy sequence
│   └── init-vaults.ts                    ← initialize SVS-1 vaults for each asset
├── chainlink-functions/
│   └── rebalance-job.js                  ← quarterly weight computation
├── Anchor.toml
├── Cargo.toml
└── package.json
```

---

## Quick Setup

### Prerequisites

```bash
# Solana CLI 1.18+
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"

# Anchor 0.30
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# Node 18+
nvm install 18 && nvm use 18
```

### Clone dependencies

```bash
# Clone SVS into workspace (required for CPI)
git clone https://github.com/solanabr/solana-vault-standard deps/svs

# Clone SSS into workspace  
git clone https://github.com/suchit1010/solana-stablecoin-standard \
  --branch submission/final-hardening-20260314 deps/sss
```

### Install & Build

```bash
npm install
anchor build
```

### Deploy to devnet

```bash
solana config set --url devnet
solana airdrop 5

# Deploy
anchor deploy

# Initialize protocol (run once)
npx ts-node scripts/deploy.ts
npx ts-node scripts/init-vaults.ts
```

### Run tests

```bash
anchor test
```

### Start frontend

```bash
cd app
npm install
npm run dev
# → http://localhost:5173
```

---

## Basket Weights (Initial)

| Asset         | Weight | Oracle      |
|---------------|--------|-------------|
| Gold (PAXG)   | 20%    | Pyth XAU    |
| Crude Oil     | 25%    | Pyth WTI    |
| Bitcoin       | 15%    | Pyth BTC    |
| Silver + Farm | 15%    | Pyth XAG    |
| DXY / Bonds   | 15%    | Pyth DXY    |
| RWAs          | 10%    | Pyth proxy  |

Rebalanced quarterly via Chainlink Functions (EIA + FAO + WTO data).

## Adaptive CR

| BTC conf/price | Regime   | Min CR |
|----------------|----------|--------|
| < 0.30%        | Normal   | 150%   |
| 0.30 – 2.00%   | Elevated | 200%   |
| ≥ 2.00%        | Crisis   | 300%   |

## Security

Unaudited MVP. Use only on devnet.
Win the Hacken audit from the bounty, then mainnet.
