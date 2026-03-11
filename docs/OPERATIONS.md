# Operations Runbook

## Quick Reference

| Operation | Command | Role Required |
|-----------|---------|---------------|
| Initialize | `sss-token init --preset <p>` | N/A (creator) |
| Mint | `sss-token mint <to> <amount>` | Minter |
| Burn | `sss-token burn <amount>` | Burner |
| Freeze | `sss-token freeze <account>` | Pauser / Master |
| Thaw | `sss-token thaw <account>` | Pauser / Master |
| Pause | `sss-token pause` | Pauser / Master |
| Unpause | `sss-token unpause` | Pauser / Master |
| Blacklist Add | `sss-token blacklist add <addr>` | Blacklister (SSS-2) |
| Blacklist Remove | `sss-token blacklist remove <addr>` | Blacklister (SSS-2) |
| Seize | `sss-token seize <from> --to <treasury>` | Seizer (SSS-2) |
| Add Minter | `sss-token minters add <addr>` | Master |
| Remove Minter | `sss-token minters remove <addr>` | Master |
| Transfer Authority | Via SDK | Master |

## Roles

| Role | Capabilities | Default |
|------|-------------|---------|
| **Master Authority** | All operations, assign roles | Creator |
| **Minter** | Mint tokens (within quota) | None (add via master) |
| **Burner** | Burn own tokens | Creator |
| **Pauser** | Pause/unpause, freeze/thaw | Creator |
| **Blacklister** | Blacklist management (SSS-2) | Creator (SSS-2 only) |
| **Seizer** | Token seizure (SSS-2) | Creator (SSS-2 only) |

## Emergency Procedures

### Freeze All Operations
```bash
sss-token pause --mint <address>
```

### Freeze Individual Account
```bash
sss-token freeze <account_address> --mint <address>
```

### Respond to Sanctions Alert (SSS-2)
```bash
# 1. Blacklist the address
sss-token blacklist add <address> --reason "OFAC match" --mint <address>

# 2. Freeze their token account
sss-token freeze <token_account> --mint <address>

# 3. Seize tokens to treasury
sss-token seize <token_account> --to <treasury> --mint <address>
```
