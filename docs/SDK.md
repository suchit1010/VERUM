# SDK Reference

## Installation

```bash
npm install @stbr/sss-token
```

## Presets

```typescript
import { Presets } from "@stbr/sss-token";

// SSS-1: Minimal — mint + freeze + metadata
Presets.SSS_1  // { enablePermanentDelegate: false, enableTransferHook: false }

// SSS-2: Compliant — + permanent delegate + transfer hook + blacklist
Presets.SSS_2  // { enablePermanentDelegate: true, enableTransferHook: true }
```

## Create a Stablecoin

```typescript
import { SolanaStablecoin } from "@stbr/sss-token";

// With preset
const { stablecoin, mint, signature } = await SolanaStablecoin.create(provider, {
  preset: "SSS_2",
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
  authority: adminKeypair,
});

// With custom config
const { stablecoin } = await SolanaStablecoin.create(provider, {
  name: "Custom Token",
  symbol: "CUST",
  extensions: { permanentDelegate: true, transferHook: false },
  authority: adminKeypair,
});
```

## Load Existing

```typescript
const stablecoin = await SolanaStablecoin.load(provider, mintAddress);
```

## Core Operations

```typescript
// Mint (requires minter role + quota)
await stablecoin.mint({ recipient: pubkey, amount: 1_000_000n, minter: minterKeypair });

// Burn
await stablecoin.burn({ amount: 500_000n, burner: burnerKeypair });

// Freeze / Thaw
await stablecoin.freeze(tokenAccount, authority);
await stablecoin.thaw(tokenAccount, authority);

// Pause / Unpause
await stablecoin.pause(authority);
await stablecoin.unpause(authority);
```

## Role Management

```typescript
// Add minter with 1M token quota
await stablecoin.addMinter(minterPubkey, 1_000_000_000_000n, authority);

// Remove minter
await stablecoin.removeMinter(minterPubkey, authority);

// Transfer master authority
await stablecoin.transferAuthority(newAuthority, currentAuthority);
```

## Compliance (SSS-2)

```typescript
// Blacklist
await stablecoin.compliance.blacklistAdd(address, "OFAC match", authority);
await stablecoin.compliance.blacklistRemove(address, authority);
const isBlacklisted = await stablecoin.compliance.isBlacklisted(address);

// Seize tokens via permanent delegate
await stablecoin.compliance.seize(fromAccount, treasury, amount, authority);
```

## Read Operations

```typescript
const supply = await stablecoin.getTotalSupply();
const config = await stablecoin.getConfig();
const paused = await stablecoin.isPaused();
const quota = await stablecoin.getMinterQuota(minterPubkey);
```

## PDA Accounts

```typescript
const accounts = stablecoin.accounts;
const [configPda] = accounts.getConfigPda(mint);
const [rolesPda] = accounts.getRolesPda(mint);
const [minterQuotaPda] = accounts.getMinterQuotaPda(mint, minter);
const [blacklistPda] = accounts.getBlacklistPda(mint, address);
const [pausePda] = accounts.getPausePda(mint);
```
