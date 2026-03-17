# Architecture

## Three-Layer Model

The SSS architecture follows a composable three-layer design:

### Layer 1 — Base
Token-2022 mint lifecycle with metadata, RBAC, pause state, and quota tracking.

### Layer 2 — Modules
- **Compliance Module** — transfer hook + blacklist PDAs + permanent delegate
- **Oracle Module** — keeper-updated oracle state + quote primitives
- **Basket Module** — collateral registry, weighted valuation, CR-gated minting
- **Privacy Module (SSS-3 roadmap)** — confidential transfer controls

### Layer 3 — Presets / Products
- **SSS-1**: minimal stablecoin (base only)
- **SSS-2**: compliant stablecoin (base + compliance)
- **Basket Vault (phase-2)**: collateral manager that authorizes CPI mint into SSS

## On-Chain Program Topology

| Program | Responsibility |
|---|---|
| `sss-stablecoin` | Core mint/burn/freeze/pause/role/compliance instructions |
| `sss-transfer-hook` | Runtime transfer enforcement for blacklist policy |
| `sss-oracle` | Price config + keeper-updated on-chain price/confidence state |
| `basket-vault` | Multi-asset collateral config, oracle ingestion, CR-based mint authorization |

## Core PDA Accounts

### `sss-stablecoin`
| PDA | Seeds | Purpose |
|-----|-------|---------|
| StablecoinConfig | `["config", mint]` | Feature flags + token config |
| RoleConfig | `["roles", mint]` | RBAC assignments |
| MinterQuota | `["minter", mint, minter]` | Per-minter lifetime caps |
| PauseState | `["pause", mint]` | Global pause toggle |
| BlacklistEntry | `["blacklist", mint, wallet]` | O(1) blacklist lookup |

### `sss-transfer-hook`
| PDA | Seeds | Purpose |
|-----|-------|---------|
| ExtraAccountMetaList | `["extra-account-metas", mint]` | Runtime account resolution for hook execution |

### `sss-oracle`
| PDA | Seeds | Purpose |
|-----|-------|---------|
| OracleConfig | `["oracle_cfg", stablecoin_mint]` | Feed identity + bounds + latest price/confidence |

### `basket-vault`
| PDA | Seeds | Purpose |
|-----|-------|---------|
| GlobalConfig | `["basket-config", basket_mint]` | Asset registry, CR params, oracle confidence limits |

## Runtime Flow: SSS-2 Transfer Enforcement

1. User submits Token-2022 `transfer_checked`.
2. Token runtime invokes `sss-transfer-hook::transfer_hook`.
3. Hook decodes source/destination token accounts with extension-aware parsing.
4. Hook derives blacklist PDAs from **owner wallets** (`["blacklist", mint, owner]`) for both ends.
5. Transfer is blocked if either blacklist account exists and is owned by `sss-stablecoin`.

This closes ATA-level bypasses by enforcing wallet-level sanctions state.

## Runtime Flow: Basket Collateral Mint Authorization

1. Governance initializes `basket-vault` for a basket mint and registers collateral assets.
2. Prices sync from `sss-oracle` through `update_asset_price_from_oracle` with feed/mint/decimals/confidence/staleness checks.
3. Vault computes weighted collateral value and effective required CR.
4. If constraints pass (not paused, max per tx, full weights, CR satisfied), vault signs CPI to `sss-stablecoin::mint_tokens`.

## Security Model

- Role-based authorization with explicit signer checks
- Owner-based blacklist enforcement on every transfer
- Program/account identity checks before compliance decisions
- Checked arithmetic for collateral valuation and CR gating
- Emergency controls: global pause, crisis mode, minting pause, per-tx mint cap
