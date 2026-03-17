# Solana Stablecoin Standard (SSS)

Modular stablecoin framework and TypeScript SDK for building production-ready stablecoins on Solana. The framework provides standardized presets for minimal (SSS-1), compliant (SSS-2), and confidential (SSS-3) stablecoins using Token-2022 extensions.

Think **OpenZeppelin for Stablecoins** on Solana — the SDK makes deployment easy, while the standards (SSS-1, SSS-2) ensure regulatory compliance and ecosystem interoperability.

## SSS Variants

| Version | Name | Compliance | Transfer Hook | Delegate | Status |
|---------|------|------------|---------------|----------|--------|
| **SSS-1** | Minimal Stablecoin | Basic (Mint/Burn/Freeze) | ✗ | ✗ | ✅ Live |
| **SSS-2** | Compliant Stablecoin | Advanced (Blacklist/Seize) | ✓ | ✓ | ✅ Live |
| **SSS-3** | Private Stablecoin | ZK-Privacy | ✗ | ✗ | 🏗️ Research |

### Compliance Model Comparison

**SSS-1 (Minimal):**
- Standard Token-2022 Mint with Freeze authority.
- Suitable for DAO treasuries, internal ecosystem tokens, and settlement assets.
- Compliance is handled via manual freeze/thaw of accounts.

**SSS-2 (Compliant):**
- **Permanent Delegate:** Enables "Seize" operations for regulatory compliance (e.g., court orders).
- **Transfer Hook:** O(1) Blacklist enforcement on every transfer.
- **Default Frozen:** Optional flag to require "KYC/Waitlist" before tokens can be used.

## Program IDs

| Program | Devnet | Localnet |
|---------|--------|----------|
| SSS Core (`sss-stablecoin`) | `HJ6TUXQ34XhDrmvcozMsBWhSuEVkEcYeqoTWo1Bcmzet` | Same as devnet |
| SSS Hook (`sss-transfer-hook`) | `6x8XMLoA9FFmVJnaDou9tyKrh9CFynDY7TtKJ54p4dcN` | Same as devnet |
| SSS Oracle (`sss-oracle`) | `hntKYM3tbdSnAzYaSU1FvDpFoE8wwBRvY3hpsMHhrN6` | Same as devnet |
| Basket Vault (`basket-vault`) | `HJBBV5qRL9wQ1YmPtcPNESpEJJLVt9SyCnofmKi2PUCB` | Same as devnet |

> [!NOTE]  
> Verified working on Devnet. See [DEVNET_PROOF.md](DEVNET_PROOF.md) for transaction hashes.

## Latest Development (Mar 2026)

- **Transfer Hook security hardening (production-critical):** fixed blacklist enforcement to derive destination/source blacklist PDAs from **token account owner wallets** (not token account addresses), preventing blacklist bypass via new ATA creation.
- **Strict account validation in hook path:** added checks for expected stablecoin program, token-account decode validity, mint consistency, PDA correctness, and blacklist account ownership before allowing transfer.
- **Safety cleanup:** removed risky runtime parsing/unwrap patterns in transfer-hook PDA program ID wiring.
- **Clean compile state:** `cargo check -p sss-transfer-hook` now completes cleanly with no warnings.
- **Admin CLI modernization:** replaced legacy terminal dashboard flow with a modern single-page Ink-based dashboard and fixed Windows keypair home-dir expansion behavior.
- **BasketVault kickoff scaffold:** added new Anchor program at `programs/basket-vault` with production-shaped config/account model (`initialize`, `register_asset`, `update_weights`, `set_crisis_mode`), strict weight/authority checks, and crisis-mode controls. Chainlink pricing and SSS CPI mint authorization are the next implementation step.
- **BasketVault phase-2 (oracle + mint path):** added `update_asset_price` and `mint_against_collateral` instructions, collateral valuation with staleness checks, and guarded CPI mint execution into `sss-stablecoin` (`mint_tokens`) only when active collateral ratio requirements are satisfied.
- **BasketVault unit tests:** added deterministic tests for weighted collateral valuation and stale-price rejection (`cargo test -p basket-vault` passing).
- **BasketVault production hardening:** added mint circuit-breaker (`set_minting_paused`), per-transaction mint caps, effective required-CR floor using per-asset minimum CR, full-weight enforcement before mint authorization, and PDA-signed CPI minting into `sss-stablecoin`.
- **Oracle ingestion hardening:** added `update_asset_price_from_oracle` to sync prices only from verified `sss-oracle` PDA accounts (mint/feed/decimals checks + confidence threshold + staleness checks). Manual `update_asset_price` is now emergency-only.
- **CI hardening:** workflow now runs `cargo test -p basket-vault` as a dedicated gate in addition to existing Anchor and clippy checks.
- **Transfer hook Token-2022 compatibility fix:** hook now decodes token accounts with extension-aware parsing (`StateWithExtensions`), eliminating false negatives on valid extended token accounts.
- **SSS-2 regression test hardening:** the non-ATA blacklist bypass test now creates a true non-associated token account (explicit keypair), validating owner-based blacklist protection.
- **Runtime validation closure:** full TypeScript + SDK integration matrix now passes on localnet (`191 passing`) after deploying all programs and aligning Basket Vault program ID.

## Installation

```bash
# Core SDK
npm install @stbr/sss-token

# Admin CLI
npm install -g @stbr/sss-token-cli

# Backend Services (Docker)
cd backend && docker compose up
```

## Quick Start

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

// 1. Initialize SSS-2 (Compliant) Stablecoin
const { stablecoin, mint } = await SolanaStablecoin.create(provider, {
  preset: Presets.SSS_2,
  name: "Euro Standard",
  symbol: "EURS",
  decimals: 6,
  authority: adminKeypair,
});

// 2. Mint tokens to recipient (Checks Minters Quota)
await stablecoin.mint({ 
  recipient: userAddress, 
  amount: 1_000_000n 
});

// 3. Blacklist an address (Enforced via Transfer Hook)
await stablecoin.compliance.blacklistAdd(
  maliciousAddress, 
  "OFAC Sanctions match"
);

// 4. Seize assets from blacklisted account (SSS-2 only)
await stablecoin.compliance.seize(
  maliciousAddress, 
  treasuryVault, 
  amount
);
```

## Features

| Feature | Description |
|---------|-------------|
| **Minter Quotas** | Prevent infinite minting bugs by setting lifetime caps per minter PDA. |
| **O(1) Blacklisting** | Transfer hook performs constant-time lookup; scales to millions of addresses. |
| **Modular Roles** | Granular permissions for Master Authority, Minters, Burners, and Blacklisters. |
| **Emergency Pause** | Global circuit breaker to halt all token operations in case of exploit. |
| **Audit Trails** | Comprehensive Anchor Events for all administrative and compliance actions. |
| **Token-2022 Native** | Leverages official Solana extensions for maximum security and efficiency. |

## Backend Services

The standard includes a robust backend suite for institutional operators:

| Service | Port | Description |
|---------|------|-------------|
| **Mint/Burn API** | `3001` | REST API for triggering mint/burn from centralized systems. |
| **Audit Indexer** | `3002` | Real-time indexing of all SSS events into PostgreSQL. |
| **Compliance API** | `3003` | Integration point for Chainalysis/TRM/Elliptic blacklisting. |
| **Webhooks** | `3004` | Outbound notifications for large transfers or admin actions. |

## Core Operations

| Operation | Requirement | Protection | Favors |
|-----------|-------------|------------|--------|
| **Mint** | Minter Role + Quota | Lifetime Caps | Exact |
| **Burn** | Burner Role | Proof of Burn | Exact |
| **Freeze** | Freeze Authority | Regulatory | Security |
| **Blacklist**| Blacklister Role | O(1) Hook Enforcement | Compliance |
| **Seize** | Seizer Role | Permanent Delegate | Recovery |

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
│   Compliance │ Roles         │
│                              │
│  Layer 1: Base               │
│   Token-2022 │ Metadata      │
└──────────────┬───────────────┘
               │
┌──────────────┴───────────────┐
│ sss-transfer-hook Program    │
│ O(1) Blacklist Enforcement   │
└──────────────────────────────┘
```

## PDA Derivation

### Stablecoin Config
**Seeds:** `["config", mint_pubkey]`
```typescript
const [config] = PublicKey.findProgramAddressSync(
  [Buffer.from("config"), mint.toBuffer()],
  programId
);
```

### Minter Quota
**Seeds:** `["minter", mint_pubkey, minter_pubkey]`
```typescript
const [quota] = PublicKey.findProgramAddressSync(
  [Buffer.from("minter"), mint.toBuffer(), minter.toBuffer()],
  programId
);
```

### Blacklist Entry
**Seeds:** `["blacklist", mint_pubkey, address_pubkey]`
```typescript
const [entry] = PublicKey.findProgramAddressSync(
  [Buffer.from("blacklist"), mint.toBuffer(), address.toBuffer()],
  programId
);
```

## Instructions

### Base Operations (SSS-1 & SSS-2)
| Instruction | Roll | Description |
|-------------|------|-------------|
| `initialize` | Authority | Setup mint and configure SSS preset |
| `mint_tokens`| Minter | Mint tokens within quota limits |
| `burn_tokens`| Burner | Burn tokens from caller account |
| `freeze_account`| Authority | Halt a specific token account |
| `set_pause` | Pauser | Toggle global emergency pause |

### Compliance Operations (SSS-2 Only)
| Instruction | Role | Description |
|-------------|------|-------------|
| `add_to_blacklist` | Blacklister | Prevents address from sending/receiving |
| `remove_from_blacklist`| Blacklister | Restores transfer capabilities |
| `seize_tokens` | Seizer | Force transfer from blacklisted to treasury |

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | `Unauthorized` | Caller missing required role |
| 6007 | `Paused` | Operations are globally paused |
| 6009 | `QuotaExceeded` | Minter exceeded lifetime limit |
| 6012 | `ComplianceNotEnabled` | SSS-2 feature called on SSS-1 mint |
| 6016 | `AlreadyBlacklisted` | Address already in blacklist |

## Events

| Event | Description |
|-------|-------------|
| `StablecoinInitialized` | Metadata and preset selection |
| `TokensMinted` | Tracking minter, recipient, and amount |
| `AddressBlacklisted` | Audit log for compliance actions |
| `TokensSeized` | Permanent delegate recovery log |
| `RoleUpdated` | Permission changes (RBAC) |

## Security

- **RBAC (Role-Based Access Control):** Separates keys for minting, blacklisting, and freezing.
- **Quota Systems:** Limits "Blast radius" of compromised minter keys.
- **O(1) Verification:** Blacklist enforcement does not slow down with scale.
- **Multisig Ready:** All authorities can be transferred to Squads/Multisig.

## Project Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── sss-stablecoin/       # Main program (SSS-1 + SSS-2)
│   ├── sss-oracle/           # Oracle config + keeper update path
│   ├── sss-transfer-hook/    # Transfer hook (SSS-2 compliance)
│   └── basket-vault/         # Multi-asset collateral manager (phase-2)
├── sdk/
│   └── core/                 # @stbr/sss-token TypeScript SDK
├── cli/                      # sss-token Admin CLI
├── backend/                  # Mint/Burn, Compliance APIs (Docker)
├── tests/                    # Integration tests (Anchor + SDK)
└── docs/                     # Detailed specifications
```

## Testing

```bash
# Run full integration + SDK matrix on localnet
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
ANCHOR_WALLET=~/.config/solana/id.json \
npx ts-mocha -p ./tsconfig.json -t 1000000 \
  tests/sss-1.ts tests/sss-2.ts tests/sss-3.ts \
  tests/sss-1-advanced.ts tests/sss-2-advanced.ts \
  tests/sss-lifecycle.ts tests/sss-oracle.ts tests/basket-vault.ts \
  sdk/core/tests/sdk.test.ts sdk/core/tests/sdk-advanced.ts

# Run SDK unit tests
cd sdk/core && npm test

# Run Backend integration tests
cd backend && npm test
```

## Resources

- [Solana Vault Standard](https://github.com/solanabr/solana-vault-standard) — Reference Implementation
- [Token-2022 Guide](https://spl.solana.com/token-2022)
- [Anchor Framework](https://www.anchor-lang.com/)

## License

MIT

## Disclaimer

This software is provided "as is". Not audited. Use with caution for large-scale mainnet deployments.
