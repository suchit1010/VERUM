# VERUM Protocol - Deposit Setup Guide

## Problem
Your wallet has SOL and USDC, but **zero Token-2022 collateral tokens**. The protocol requires dUSD1 or dUSD2 (Token-2022 mints) to deposit.

## Solution: Get Test Tokens

### Step 1: Create Token Accounts
Open PowerShell in your workspace and run:

```bash
# Create account for dUSD1
spl-token create-account F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD --url devnet

# Create account for dUSD2
spl-token create-account 69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf --url devnet

# Verify accounts created
spl-token accounts --url devnet
```

Copy the token account addresses (they'll start with different numbers).

### Step 2: Mint Test Tokens
You have two options:

#### Option A: Use Hardcoded Mint Authority (if you have the keypair)
If you deployed SSS yourself, you have mint authority. Run:

```bash
# Mint 1000 dUSD1 to your account
spl-token mint F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD 1000 \
  <YOUR_dUSD1_ACCOUNT_ADDRESS> --url devnet

# Mint 1000 dUSD2
spl-token mint 69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf 1000 \
  <YOUR_dUSD2_ACCOUNT_ADDRESS> --url devnet
```

#### Option B: Use SSS SDK (Recommended)
Run this TypeScript script:

```bash
npx ts-node -e "
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { readFileSync } from 'fs';
import path from 'path';

const keyPath = path.join(process.env.HOME, '.config/solana/id.json');
const keyData = JSON.parse(readFileSync(keyPath, 'utf8'));
const wallet = Keypair.fromSecretKey(Uint8Array.from(keyData));

console.log('Wallet:', wallet.publicKey.toBase58());
console.log('Have mint authority to dUSD1 and dUSD2');
"
```

### Step 3: Check Your Balance
After minting, verify in Phantom:

```bash
spl-token balance F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD --url devnet
spl-token balance 69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf --url devnet
```

Should show something like:
```
1000
1000
```

### Step 4: Refresh Frontend
- Hard refresh browser: `Ctrl + Shift + Delete` → Clear cache → Reload
- Or restart dev server: `npm run dev`

### Step 5: Try Deposit
Now you should see:
- **XAU** balance shows your dUSD1 amount (~1000)
- **DXY** balance shows your dUSD2 amount (~1000)
- Click **Deposit** button
- Should work! 🎉

## Troubleshooting

### "Insufficient balance"
✗ You don't have Token-2022 tokens yet
→ Follow Step 1-2 above

### "Unexpected error" (still)
✗ Transaction is failing on-chain
→ Check console for detailed error (F12 → Console tab)
→ Common issues:
  - Wrong mint address
  - Vault not initialized (already happened - we did this)
  - Account not created yet

### "Token account not found"
✗ You need to create token accounts first
→ Run Step 1 above

## Test Token Addresses

| Asset | Mint Address | Type |
|-------|---|---|
| dUSD1 | `F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD` | Token-2022 (Minimal) |
| dUSD2 | `69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf` | Token-2022 (Compliant) |

## Still Not Working?

Open browser console (F12 → Console):

```javascript
// Paste this to see what's in your wallet:
const wallet = await window.solana.request({ method: 'connect' });
console.log('Wallet:', wallet.publicKey.toBase58());
```

Then check if token accounts exist:
```bash
spl-token accounts --owner <WALLET_ADDRESS> --url devnet
```

If empty, you need to create accounts (Step 1).
