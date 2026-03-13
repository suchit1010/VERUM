# SSS-2: Compliant Stablecoin Standard

## Overview

SSS-2 extends SSS-1 with on-chain compliance enforcement. Designed for regulated stablecoins where regulators expect blacklist enforcement and token seizure capabilities — USDC/USDT-class tokens.

## Use Cases
- Regulated stablecoins
- Cross-border payment tokens
- Central Bank Digital Currencies (CBDCs)
- Tokenized deposits

## Token-2022 Extensions
- **MintCloseAuthority** — Allows closing the mint
- **PermanentDelegate** — Config PDA can transfer from any account (seizure)
- **TransferHook** — Every transfer checked against blacklist
- **DefaultAccountState** (optional) — New accounts start frozen

## Additional Features (over SSS-1)
- ✅ On-chain blacklist with O(1) lookup via PDAs
- ✅ Transfer hook blocking blacklisted addresses
- ✅ Token seizure via permanent delegate
- ✅ Blacklister and seizer roles
- ✅ Audit trail via events

## Additional Instructions

| Instruction | Description |
|-------------|-------------|
| `add_to_blacklist` | Add address to blacklist PDA |
| `remove_from_blacklist` | Close blacklist PDA (returns rent) |
| `seize` | Transfer tokens from any account via permanent delegate |

## Transfer Hook Flow

```
User calls transfer_checked()
        │
        ▼
Token-2022 runtime detects TransferHook extension
        │
        ▼
Runtime calls sss-transfer-hook::transfer_hook()
        │
        ├── Derive source BlacklistEntry PDA
        │   └── PDA exists? → BLOCK transfer
        │
        ├── Derive destination BlacklistEntry PDA
        │   └── PDA exists? → BLOCK transfer
        │
        └── Neither blacklisted → ALLOW transfer
```

## Compliance Model
SSS-2 uses **proactive compliance** — every transfer is checked against the blacklist in real-time. No gaps.

## Configuration

```toml
# config.toml for SSS-2
name = "Compliant USDC"
symbol = "cUSDC"
uri = ""
decimals = 6
enable_permanent_delegate = true
enable_transfer_hook = true
default_account_frozen = false
```
