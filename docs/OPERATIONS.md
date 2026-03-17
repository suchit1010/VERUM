# Operations Runbook

## Localnet Preflight (Recommended)

### 1) Start validator

On Windows, prefer WSL for `solana-test-validator` execution.

```bash
wsl --exec bash -lc 'cd /mnt/c/Users/<you>/earn/solana-stablecoin-standard; solana-test-validator --reset'
```

### 2) Deploy all programs to localnet

```bash
wsl --exec bash -lc '
	cd /mnt/c/Users/<you>/earn/solana-stablecoin-standard
	WALLET=/mnt/c/Users/<you>/.config/solana/id.json
	solana airdrop 100 --url http://127.0.0.1:8899 --keypair $WALLET
	solana program deploy --url http://127.0.0.1:8899 --keypair $WALLET --program-id target/deploy/sss_stablecoin-keypair.json target/deploy/sss_stablecoin.so
	solana program deploy --url http://127.0.0.1:8899 --keypair $WALLET --program-id target/deploy/sss_transfer_hook-keypair.json target/deploy/sss_transfer_hook.so
	solana program deploy --url http://127.0.0.1:8899 --keypair $WALLET --program-id target/deploy/sss_oracle-keypair.json target/deploy/sss_oracle.so
	solana program deploy --url http://127.0.0.1:8899 --keypair $WALLET --program-id target/deploy/basket_vault-keypair.json target/deploy/basket_vault.so
'
```

### 3) Run full integration matrix

```bash
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
ANCHOR_WALLET=~/.config/solana/id.json \
npx ts-mocha -p ./tsconfig.json -t 1000000 \
	tests/sss-1.ts tests/sss-2.ts tests/sss-3.ts \
	tests/sss-1-advanced.ts tests/sss-2-advanced.ts \
	tests/sss-lifecycle.ts tests/sss-oracle.ts tests/basket-vault.ts \
	sdk/core/tests/sdk.test.ts sdk/core/tests/sdk-advanced.ts
```

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

## Basket Vault Operator Actions (Phase-2)

| Operation | Who | Notes |
|---|---|---|
| `initialize` | Basket authority | Sets CR params, confidence threshold, mint cap |
| `register_asset` | Basket authority | Adds mint/feed/weight/min-CR |
| `update_weights` | Basket authority | Controlled reweighting with limits |
| `update_asset_price_from_oracle` | Basket authority/keeper flow | Enforces oracle provenance + staleness/confidence checks |
| `mint_against_collateral` | Basket authority | CPI mints into `sss-stablecoin` only if CR constraints pass |
| `set_minting_paused` | Basket authority | Emergency circuit breaker |
