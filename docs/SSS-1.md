# SSS-1: Minimal Stablecoin Standard

## Overview

SSS-1 defines the minimal viable stablecoin on Solana. It provides the essential building blocks every stablecoin needs — nothing more.

## Use Cases
- Internal tokens
- DAO treasury management
- Ecosystem settlement tokens
- Simple pegged assets

## Token-2022 Extensions
- **MintCloseAuthority** — Allows closing the mint if supply is zero

## Features
- ✅ Mint authority (controlled by config PDA)
- ✅ Freeze authority (controlled by config PDA)
- ✅ Token metadata (name, symbol, URI, decimals)
- ✅ Role-based access control
- ✅ Per-minter quotas
- ✅ Global pause mechanism
- ❌ Permanent delegate (SSS-2)
- ❌ Transfer hook (SSS-2)
- ❌ Blacklist enforcement (SSS-2)

## Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize` | Create Token-2022 mint + config PDA |
| `mint_tokens` | Mint to recipient (minter role + quota) |
| `burn_tokens` | Burn from own account (burner role) |
| `freeze_account` | Freeze a token account |
| `thaw_account` | Thaw a frozen account |
| `pause` | Pause all operations |
| `unpause` | Resume operations |
| `add_minter` | Add minter with quota |
| `remove_minter` | Deactivate minter |
| `update_role` | Update role assignment |
| `transfer_authority` | Transfer master authority |

## Compliance Model
SSS-1 uses **reactive compliance** — freeze individual accounts as needed. No proactive transfer blocking.

## Configuration

```toml
# config.toml for SSS-1
name = "My Stablecoin"
symbol = "MYUSD"
uri = "https://example.com/metadata.json"
decimals = 6
enable_permanent_delegate = false
enable_transfer_hook = false
default_account_frozen = false
```
