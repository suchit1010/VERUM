# 🤖 VERUM Keeper Bot — Operations Guide

The **Keeper Bot** is a production-grade, off-chain service that monitors user CDP positions and executes liquidations when collateral ratios fall below safe thresholds. It's the enforcement mechanism that keeps the protocol solvent.

## Architecture Overview

```
├── Keeper Bot (Node.js service)
│   ├── Logger (JSON + file output)
│   ├── Health Monitor (SOL balance checks)
│   ├── Position Scanner (30s interval)
│   ├── Zone Detector (Red/Orange/Yellow)
│   ├── Liquidation Engine (with retry+circuit breaker)
│   └── Stats Tracker (uptime, success rate)
└── Environment Config (.env.keeper)
```

## Core Concepts

### Liquidation Zones

| Zone | CR Range | Penalty | Max Liquidation | Use Case |
|------|----------|---------|-----------------|----------|
| **Red** | ≤ 100% | 8% | 100% of position | Insolvent positions, emergency |
| **Orange** | 100-105% | 5% | 25% per tx | Risky, throttled |
| **Yellow** | 105-115% | 2% | 10% per tx | Warning zone, minimal force |
| **Green** | > 115% | 0% | None | Healthy, no action |

### Penalty Distribution

When a liquidation occurs, the penalty is split:
- **50%**: Keeper reward (incentive for running the bot)
- **30%**: Insurance fund (protocol safety net)
- **20%**: Burned (deflationary for remaining holders)

### Circuit Breaker

To prevent liquidation cascades during market crashes:
- Max 10 liquidations per 30-second scan
- If exceeded, pause for 5 minutes
- Prevents feedback loops that would crash the price further

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn
- Solana CLI (for keypair generation)
- Access to a Solana RPC endpoint (Devnet/Mainnet)

### Setup

1. **Install dependencies:**
```bash
cd backend
npm install
```

2. **Generate keeper keypair (Devnet):**
```bash
solana-keygen new -o keeper-keypair.json
solana airdrop 2 $(solana-keygen pubkey keeper-keypair.json) -u devnet
```

3. **Configure environment** (edit `.env.keeper`):
```bash
RPC_URL=https://api.devnet.solana.com
BASKET_VAULT_PROGRAM_ID=<YOUR_PROGRAM_ID>
KEEPER_KEY_PATH=./keeper-keypair.json
ENABLE_LIQUIDATION=false  # Start in dry-run mode
MIN_SOL_BALANCE=1.0
LOG_LEVEL=INFO
```

4. **Verify setup:**
```bash
npm run keeper:dry-run
# Should log positions and what would be liquidated (no actual txs)
```

## Running the Keeper

### Dry-Run Mode (Safe for Testing)
```bash
npm run keeper:dry-run
```
- Scans positions and logs liquidation candidates
- Does NOT execute actual transactions
- Safe to test against live chain
- **Output:** `keeper-bot.log` file with structured logs

### Production Mode (Real Liquidations)
```bash
ENABLE_LIQUIDATION=true npm run keeper:bot
```
- Executes real liquidation transactions
- Requires sufficient SOL for gas fees
- Can earn BASKET tokens as keeper rewards
- **WARNING:** Ensure you understand the risks before enabling

### Custom Interval
```bash
SCAN_INTERVAL_MS=60000 npm run keeper:bot  # Scan every 60 seconds
```

## Monitoring

### Log Levels

The keeper bot outputs structured logs with 5 levels:

```
CRITICAL: System failures (exit likely)
ERROR:    Operation failures (retry or skip)
WARN:     Degraded conditions (monitor)
INFO:     Normal operations (liquidations, scans)
DEBUG:    Detailed diagnostic info
```

### Example Log Output

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO",
  "message": "⚠️ Position at risk: Red Zone",
  "component": "KeeperBot",
  "data": {
    "owner": "7x8y9z3...",
    "cr": "98.5%",
    "debt": "10000000000",
    "zone": "Red"
  }
}
```

### Stats Endpoint

The keeper exposes stats via `getStats()`:
```javascript
const stats = keeper.getStats();
console.log({
  positionsScanned: 150,
  positionsLiquidatable: 3,
  liquidationsExecuted: 2,
  totalRewardsEarned: 250000000n,  // In lamports
  totalErrors: 0,
  uptime: 3600000,  // ms
});
```

## Error Handling & Resilience

### Automatic Retry Logic
- **Max Attempts:** 3 with exponential backoff
- **Initial Delay:** 1 second
- **Max Delay:** 10 seconds
- **Backoff:** 2x multiplier per retry

Example flow:
```
Attempt 1 → Error → wait 1s
Attempt 2 → Error → wait 2s
Attempt 3 → Error → wait 4s (capped at 10s)
Gives up → logs error
```

### Health Checks
- **Keeper Balance:** Must have ≥ 1.0 SOL for gas (configurable)
- **RPC Connectivity:** Retries on connection failure
- **Account Validation:** Skips malformed position accounts

## Security Considerations

### Private Key Management

⚠️ **CRITICAL:** Keeper keypairs hold control over liquidation rights.

```bash
# Good: Keep key in secure location
export KEEPER_KEY_PATH=/secure/path/keeper-keypair.json

# BAD: Don't commit keys to repo
echo "keeper-keypair.json" >> .gitignore

# BAD: Don't share keys over email/Slack
```

### Operational Security

1. **Monitor on separate server** from main application
2. **Limit keeper fund** to 5-10 SOL (enough for gas only)
3. **Enable rate limiting** on keeper actions
4. **Audit logs regularly** for unusual liquidations
5. **Set MIN_SOL_BALANCE** high enough to prevent fund depletion

### Cascade Prevention

The circuit breaker prevents malicious/buggy cascades:
```
If positions > 10 in one scan:
  → Pause liquidations for 5 minutes
  → Log warning event
  → Manual intervention required
```

## Advanced Configuration

### Custom Scan Interval
```bash
# Fast monitoring (10 seconds)
SCAN_INTERVAL_MS=10000 npm run keeper:bot

# Slow monitoring (2 minutes)
SCAN_INTERVAL_MS=120000 npm run keeper:bot
```

### Custom Log Levels
```bash
# Debug mode (verbose)
LOG_LEVEL=DEBUG npm run keeper:bot

# Production (errors only)
LOG_LEVEL=WARN npm run keeper:bot
```

### Performance Tuning

For high-volume position accounts:
- Increase `SCAN_INTERVAL_MS` to reduce RPC load
- Reduce `LOG_LEVEL` to minimize I/O
- Use separate RPC endpoint with higher limits

## Troubleshooting

### Issue: "Keeper balance low"
```bash
solana transfer keeper-keypair.json 0.5 --allow-unfunded-recipient -u devnet
```

### Issue: "BASKET_VAULT_PROGRAM_ID not set"
```bash
echo "BASKET_VAULT_PROGRAM_ID=$(solana address -k keeper-keypair.json)" >> .env.keeper
```

### Issue: "Failed to parse UserPosition"
- Position account may be corrupted
- Keeper bot skips and continues
- Check logs for specific accounts

### Issue: "No valid oracles"
- Pyth/Switchboard feeds may be down
- Liquidations paused until prices available
- Normal during market disruptions

## Performance Metrics

Typical performance on Devnet:
- **Scan Time:** 2-5 seconds per 100 positions
- **Liquidation Time:** 5-15 seconds per transaction
- **Gas Cost:** ~0.01 SOL per liquidation
- **Max Throughput:** ~10 liquidations per 30-second interval

## Upgrade Path

To upgrade keeper bot:
1. Stop current instance: `Ctrl+C`
2. Pull new code: `git pull`
3. Reinstall deps: `npm install`
4. Start new version: `npm run keeper:bot`

Zero downtime achieved via:
- Stateless design (state stored on-chain)
- Idempotent liquidation logic
- No in-memory position cache

## Support & Debugging

### Enable Verbose Logging
```bash
LOG_LEVEL=DEBUG npm run keeper:bot 2>&1 | tee debug.log
```

### Monitor in Real-Time
```bash
tail -f keeper-bot.log | grep -i "ERROR\|CRITICAL"
```

### Test Against Live Devnet
```bash
npm run keeper:dry-run
# Verify output matches expected positions
```

---

**Created:** 2024 | **Status:** Production Ready | **Maintainer:** VERUM Protocol Team
