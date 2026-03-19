# BASKET — Setup Guide (Zero to Running)

Follow these steps in order. Every command is tested.

---

## Step 1 — Prerequisites

```bash
# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Anchor CLI 0.30
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --tag v0.30.0 --locked

# Node 18+ (use nvm)
nvm install 18 && nvm use 18

# Verify
solana --version     # 1.18+
anchor --version     # 0.30+
node --version       # 18+
```

---

## Step 2 — Clone dependencies

```bash
# From inside basket-protocol/ directory:
mkdir deps && cd deps

# SSS — stablecoin mint/burn engine (Layer 1)
git clone https://github.com/suchit1010/solana-stablecoin-standard \
  --branch submission/final-hardening-20260314 sss

# SVS — ERC-4626 vault standard (Layer 1)
git clone https://github.com/solanabr/solana-vault-standard svs

cd ..
```

---

## Step 3 — Build dependencies

```bash
# Build SSS
cd deps/sss
npm install
anchor build
# Note the SSS program ID from output
cd ../..

# Build SVS-1
cd deps/svs
npm install
anchor build
# Note the SVS-1 program ID from output
cd ../..
```

---

## Step 4 — Configure devnet wallet

```bash
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/id.json   # skip if exists
solana airdrop 5
solana balance
```

---

## Step 5 — Create devnet test token mints

```bash
# Create BASKET mint (controlled by SSS — or create directly for testing)
spl-token create-token --decimals 6
# → Save as BASKET_MINT

# Create collateral test mints
spl-token create-token --decimals 8   # PAXG
spl-token create-token --decimals 6   # tOIL
spl-token create-token --decimals 8   # WBTC
spl-token create-token --decimals 8   # XAG
spl-token create-token --decimals 6   # DXY
spl-token create-token --decimals 6   # RWA
```

---

## Step 6 — Deploy SSS + SVS-1 to devnet

```bash
# Deploy SSS
cd deps/sss
anchor deploy --provider.cluster devnet
# → Note: Program Id: SSS_PROGRAM_ID_HERE
cd ../..

# Deploy SVS-1
cd deps/svs
anchor deploy --provider.cluster devnet
# → Note: Program Id: SVS1_PROGRAM_ID_HERE
cd ../..
```

---

## Step 7 — Update program IDs in this project

Open `app/src/utils/constants.ts` and replace:
```typescript
export const BASKET_VAULT_PROGRAM_ID = new PublicKey("BASKETvau1t...")
export const SSS_PROGRAM_ID          = new PublicKey("SSSxxxx...")
export const SVS1_PROGRAM_ID         = new PublicKey("SVS1VauLt...")
export const BASKET_MINT             = new PublicKey("BASKETmint...")
export const ASSET_MINTS = {
  PAXG: new PublicKey("YOUR_PAXG_MINT"),
  // ... etc
```

Open `scripts/deploy.ts` and update the same constants at the top.

---

## Step 8 — Build and deploy BasketVault

```bash
npm install
anchor build

# After build, copy program ID from target/deploy/basket_vault-keypair.json:
anchor keys list
# → Update declare_id! in programs/basket-vault/src/lib.rs
# → Update Anchor.toml
# → Update constants.ts

anchor deploy --provider.cluster devnet
```

---

## Step 9 — Initialize protocol

```bash
# Initialize BasketVault global config + transfer mint authority
npx ts-node scripts/deploy.ts

# Create SVS-1 vaults for each collateral asset
npx ts-node scripts/init-vaults.ts
# → Copy vault addresses printed to console into constants.ts SVS_VAULTS
```

---

## Step 10 — Run tests

```bash
anchor test
# Expected: 6 passing
```

---

## Step 11 — Start frontend

```bash
cd app
npm install
npm run dev
# → http://localhost:5173
```

Connect Phantom (devnet mode), deposit test collateral, mint BASKET.

---

## Airdrop test collateral to your wallet

```bash
# Mint test PAXG to your wallet
spl-token mint YOUR_PAXG_MINT 10 YOUR_WALLET_ADDRESS
spl-token mint YOUR_WBTC_MINT 1 YOUR_WALLET_ADDRESS
# etc.
```

---

## What to update before submitting

1. `constants.ts` — all program IDs and vault addresses
2. `lib.rs` `declare_id!` — real deployed program ID
3. `Anchor.toml` — real program ID
4. `svs_interface.rs` — verify discriminators match SVS-1 IDL
5. `sss_interface.rs` — verify discriminators match SSS IDL
6. Frontend: swap mock `doDeposit/doMint/doRedeem` with real SDK calls from `basket-sdk.ts`

---

## Discriminator verification (critical)

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

This is the most important step before running on devnet.

---

## Demo video checklist

1. Show wallet connect (Phantom)
2. Show live CR gauge updating with Pyth prices
3. Deposit PAXG → show SVS-1 vault balance update
4. Switch to Mint tab → enter amount → show CR calculation
5. Click Mint → show transaction confirm on Solscan
6. Switch to Redeem → burn BASKET → show collateral returned
7. Show the adaptive CR badge change (send high-vol BTC price to trigger elevated)

Total: 2 minutes max.
