# Basket Vault Keeper Bot

## Overview

The Keeper Bot is an off-chain service that continuously monitors all user Collateralized Debt Positions (CDPs) and executes liquidations when positions fall below the required collateral ratio.

**Key Features:**
- Real-time position monitoring
- Graduated liquidation zones (Red/Orange/Yellow)
- Automatic penalty distribution (50% keeper / 30% insurance / 20% burn)
- Circuit breaker to prevent liquidation cascades
- Dry-run mode for monitoring without execution

---

## Liquidation Zones

| Zone | CR Range | Penalty | Max Liquidation |
|------|----------|---------|-----------------|
| **Red** | CR ≤ 100% | 8% | 100% of position |
| **Orange** | 100% < CR ≤ 105% | 5% | 25% per transaction |
| **Yellow** | 105% < CR ≤ 115% | 2% | 10% per transaction |
| **Healthy** | CR > 115% | None | Not liquidatable |

---

## Setup

### 1. Generate Keeper Keypair

```bash
solana-keygen new -o keeper-keypair.json
```

Fund the keeper account on devnet:
```bash
solana airdrop 10 $(solana-keygen pubkey keeper-keypair.json) --url devnet
```

### 2. Configure Environment

Copy the template and update values:
```bash
cp .env.keeper.template .env.keeper
```

Update `.env.keeper`:
```env
RPC_URL=https://api.devnet.solana.com
BASKET_VAULT_PROGRAM_ID=<your-program-id-after-deployment>
KEEPER_KEY_PATH=./keeper-keypair.json
ENABLE_LIQUIDATION=false    # Start with false for dry-run
SCAN_INTERVAL_MS=30000
```

### 3. Install Dependencies

```bash
cd backend
npm install
```

### 4. Build

```bash
npm run build
```

---

## Running

### Dry Run (Monitoring Only)

Before executing liquidations, run in monitoring mode to observe positions:

```bash
ENABLE_LIQUIDATION=false npm run keeper:bot
```

Output will show:
- All positions in Red/Orange/Yellow zones
- Keeper rewards that would be earned
- Any errors (for debugging)

### Live Mode (Liquidations Enabled)

Once confident, enable actual liquidation execution:

```bash
ENABLE_LIQUIDATION=true npm run keeper:bot
```

**⚠️ WARNING:** Live mode will execute real transactions and transfer collateral. Ensure:
- Keeper account has enough SOL for gas
- You understand the liquidation mechanics
- You've backed up the keeper keypair

---

## Logs & Monitoring

The keeper bot logs all liquidations to `keeper.log`:

```bash
# Watch logs in real-time
tail -f keeper.log

# Filter for liquidations
grep "LIQUIDATING" keeper.log

# Track earnings
grep "Keeper reward" keeper.log
```

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ Keeper Bot                                           │
├──────────────────────────────────────────────────────┤
│                                                      │
│  1. Scan Step (every 30s)                            │
│     ├─ Fetch all UserPosition accounts               │
│     ├─ Parse owner, debt, collateralValue, CR        │
│     └─ Identify positions in liquidation zones       │
│                                                      │
│  2. Zone Assignment                                  │
│     ├─ CR ≤ 100% → Red Zone (liquidate up to 100%)   │
│     ├─ 100% < CR ≤ 105% → Orange (up to 25%)         │
│     └─ 105% < CR ≤ 115% → Yellow (up to 10%)         │
│                                                      │
│  3. Liquidation Execution                            │
│     ├─ Build transaction with liquidation data       │
│     ├─ Keeper signs and submits                      │
│     ├─ Calculate repay amount ≤ max per zone         │
│     └─ Distribute penalties: liquidator/insurance/burn
│                                                      │
│  4. Circuit Breaker                                  │
│     ├─ Track liquidations per block                  │
│     ├─ Pause if > MAX_LIQUIDATIONS_PER_BLOCK         │
│     └─ Prevent cascading liquidations                │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Economics & Incentives

### Keeper Earning Example

**Scenario:** User in Red Zone, debt = 1,000 BASKET, liquidated 100%

```
Debt repaid:        1,000 BASKET
Penalty rate (8%):  80 BASKET

Distribution:
├─ Keeper (50%):    540 BASKET  ← your earning
├─ Insurance (30%): 24 BASKET
└─ Burn (20%):      16 BASKET
```

**Annual Earnings (Estimate):**
- Assuming $50M TVL at 180 average CR
- ~2% bad debt per year from liquidations + defaults
- Keeper captures ~50% of penalties
- **Expected APY: 5-10% for active keepers**

---

## Troubleshooting

### Issue: Out of SOL

**Error:** `Error: Insufficient funds for transaction`

**Fix:** Airdrop more SOL or fund from a wallet:
```bash
solana transfer <keeper-pubkey> 5 --url devnet
```

### Issue: Program Account Not Found

**Error:** `Invalid account discriminator`

**Fix:** Verify BASKET_VAULT_PROGRAM_ID is correct. Check on-chain:
```bash
solana program show <program-id> --url devnet
```

### Issue: Zero Positions Found

**Normal in early state.** Positions only exist after users mint BASKET. Monitor the frontend or run a test mint:
```bash
npm run mint:test
```

### Issue: Liquidations Not Executing

**Check:**
1. Is `ENABLE_LIQUIDATION=true` in `.env.keeper`?
2. Is keeper funded with enough SOL?
3. Are positions actually below CR threshold? (Check logs)

---

## Advanced: Custom Liquidation Logic

To modify keeper behavior (e.g., liquidate aggressively to protect protocol):

1. Edit `keeper-bot.ts`
2. Modify `LIQUIDATION_ZONES` for different thresholds
3. Adjust `calculateMaxRepay()` to be more/less aggressive
4. Rebuild: `npm run build`

---

## Production Deployment

Before mainnet:

1. **Audit:** Have the keeper bot reviewed by a security firm
2. **Insurance Fund:** Ensure >= $1M for every $100M TVL
3. **Rate Limits:** Set `MAX_LIQUIDATIONS_PER_BLOCK` to prevent cascades
4. **Monitoring:** Set up Prometheus + Grafana for real-time oversight
5. **Failover:** Run multiple independent keepers for redundancy
6. **Kill Switch:** Have a way to pause liquidations in emergencies

---

## Support

For issues or questions:
1. Check logs: `tail -f keeper.log`
2. Run in dry-run mode to debug
3. File an issue on GitHub with:
   - Keeper version
   - Error message
   - Recent logs
   - Transaction signature (if applicable)
