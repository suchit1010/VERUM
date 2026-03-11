# Solana Stablecoin Standard (SSS)

Modular stablecoin SDK with standardized presets for Solana. Build, deploy, and manage stablecoins using Token-2022 extensions with production-ready compliance features.

Think OpenZeppelin for stablecoins on Solana — the SDK makes deployment easy, the standards (SSS-1, SSS-2) are what get adopted.

## Program IDs

```
sss-stablecoin:     SSS1111111111111111111111111111111111111111
sss-transfer-hook:  SSSHOOK1111111111111111111111111111111111
```

> Update these after devnet deployment.

## Presets

| Standard | Name | What It Is |
|----------|------|------------|
| **SSS-1** | Minimal Stablecoin | Mint + freeze + metadata. For DAO treasuries, internal tokens, ecosystem settlement. |
| **SSS-2** | Compliant Stablecoin | SSS-1 + permanent delegate + transfer hook + blacklist enforcement. For regulated tokens (USDC/USDT-class). |

## Quick Start

### Prerequisites

- Solana CLI ≥ 3.0
- Anchor CLI ≥ 0.32
- Rust ≥ 1.75
- Node.js ≥ 18

### Install

```bash
# Clone
git clone https://github.com/solanabr/solana-stablecoin-standard
cd solana-stablecoin-standard

# Install dependencies
npm install

# Build programs
anchor build

# Run tests
anchor test
```

### CLI

```bash
# Install the CLI globally
npm install -g @stbr/sss-token-cli

# Initialize an SSS-1 stablecoin
sss-token init --preset sss-1 --name "My Token" --symbol "MYUSD"

# Initialize an SSS-2 compliant stablecoin
sss-token init --preset sss-2 --name "Compliant Token" --symbol "cUSDC"

# Operations
sss-token mint <recipient> <amount> --mint <address>
sss-token burn <amount> --mint <address>
sss-token freeze <account> --mint <address>
sss-token status --mint <address>

# SSS-2 Compliance
sss-token blacklist add <address> --reason "OFAC match" --mint <address>
sss-token seize <address> --to <treasury> --mint <address>
```

### TypeScript SDK

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

// Create SSS-2 stablecoin
const { stablecoin, mint } = await SolanaStablecoin.create(provider, {
  preset: "SSS_2",
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
  authority: adminKeypair,
});

// Operations
await stablecoin.mint({ recipient, amount: 1_000_000n, minter });
await stablecoin.freeze(accountAddress, authority);
await stablecoin.compliance.blacklistAdd(address, "Sanctions match", authority);
await stablecoin.compliance.seize(from, treasury, amount, authority);
const supply = await stablecoin.getTotalSupply();
```

### Backend Services

```bash
cd backend
docker compose up
```

Services:
- **:3001** — Mint/Burn lifecycle service
- **:3002** — Event indexer + audit log
- **:3003** — Compliance service (SSS-2)
- **:3004** — Webhook service (SSS-2)

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    CLIENTS                            │
│  CLI (sss-token) │ SDK (@stbr/sss-token) │ Frontend  │
└────────┬─────────┴──────────┬────────────┴───────────┘
         │                    │
         ▼                    ▼
┌──────────────────────────────┐  ┌───────────────────┐
│    sss-stablecoin Program    │  │   Backend Services │
│                              │  │   (Docker)         │
│  Layer 3: Presets            │  │                    │
│   SSS-1 │ SSS-2             │  │  Mint/Burn  │ Idx  │
│                              │  │  Compliance │ Hook │
│  Layer 2: Modules            │  └───────────────────┘
│   Compliance │ Privacy       │
│                              │
│  Layer 1: Base               │
│   Token-2022 │ Roles │ Pause │
└──────────────┬───────────────┘
               │
┌──────────────┴───────────────┐
│ sss-transfer-hook Program    │
│ O(1) blacklist enforcement   │
└──────────────────────────────┘
```

## Project Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── sss-stablecoin/       # Main program (SSS-1 + SSS-2)
│   └── sss-transfer-hook/    # Transfer hook (SSS-2 blacklist)
├── modules/
│   └── sss-common/           # Shared types, seeds, validation
├── sdk/
│   └── core/                 # @stbr/sss-token TypeScript SDK
├── cli/                      # sss-token Admin CLI
├── backend/                  # Docker backend services
├── tests/                    # Anchor integration tests
├── docs/                     # Documentation
└── scripts/                  # Deploy & utility scripts
```

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Layer model, data flows, security
- [SDK.md](docs/SDK.md) — Presets, custom config, TypeScript examples
- [OPERATIONS.md](docs/OPERATIONS.md) — Operator runbook
- [SSS-1.md](docs/SSS-1.md) — Minimal stablecoin spec
- [SSS-2.md](docs/SSS-2.md) — Compliant stablecoin spec
- [COMPLIANCE.md](docs/COMPLIANCE.md) — Regulatory considerations, audit trail
- [API.md](docs/API.md) — Backend API reference

## Testing

```bash
# All tests
anchor test

# SDK tests
cd sdk/core && npm test

# Backend tests
cd backend && npm test
```

## Resources

- [Solana Vault Standard](https://github.com/solanabr/solana-vault-standard) — Quality reference
- [Token-2022 Extensions](https://solana.com/solutions/token-extensions)
- [Anchor Docs](https://www.anchor-lang.com/)

## License

MIT
