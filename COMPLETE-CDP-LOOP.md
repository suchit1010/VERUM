# VERUM Protocol: Complete CDP Loop

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        User Lifecycle                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. MINT (Create CDP)                                                      │
│     ├─ User deposits collateral → SVS-1 vaults                            │
│     ├─ Call mint_basket(desired_amount)                                   │
│     ├─ Keeper wires read oracle prices (Pyth + Switchboard)             │
│     ├─ Calculate adaptive CR based on BTC volatility                      │
│     ├─ Check: basket_value >= desired × CR / 100                         │
│     ├─ Create UserPosition account (if first mint)                        │
│     ├─ Store: debt = desired_amount, collateral = basket_value, CR        │
│     └─ Emit BASKET tokens to user                                         │
│                                                                             │
│  2. NORMAL OPERATIONS (Optional)                                           │
│     ├─ User can deposit more collateral to improve CR                     │
│     ├─ User monitors CR through frontend dashboard                        │
│     ├─ Oracle prices update continuously via Pyth pushes                  │
│     ├─ Adaptive CR adjusts: low vol=150%, elevated=200%, crisis=300%      │
│     └─ Keeper bot monitors CR every 30 seconds                             │
│                                                                             │
│  3. LIQUIDATION (If CR falls)                                              │
│     ├─ Keeper bot detects Red Zone (CR <= 100%)                           │
│     ├─ Liquidator calls liquidate(repay_amount)                           │
│     ├─ Position's collateral seized (up to 100%)                          │
│     ├─ Penalty charged (8%, split: 50% keeper / 30% insurance / 20% burn) │
│     ├─ UserPosition updated: debt reduced, CR recalculated                 │
│     └─ Keeper earns BASKET reward instantly                                │
│                                                                             │
│  4. REDEMPTION (Exit)                                                      │
│     ├─ User calls redeem_basket(basket_amount)                            │
│     ├─ BASKET tokens burned (cannot be recalled)                          │
│     ├─ Pro-rata collateral returned from each SVS-1 vault                 │
│     ├─ UserPosition debt reduced                                          │
│     ├─ If debt = 0, position closed out                                   │
│     └─ User gets back real assets, no lock-in                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Example: Normal → Risk → Liquidation → Recovery

### Setup
- **Assets in basket:** PAXG (gold), tOIL (crude oil), WBTC, XAG, DXY, RWA
- **Initial weights:** 20%, 25%, 15%, 15%, 15%, 10%
- **BTC volatility:** 0.15% (normal regime) → CR = 150%

---

### Scenario: Alice's Position

#### Step 1: MINT (Healthy Start)

```
Alice deposits:
├─ PAXG:  10 units @ $2000 = $20,000
├─ tOIL:  100 units @ $100 = $10,000
├─ WBTC:  0.5 units @ $70,000 = $35,000
├─ XAG:   500 units @ $30 = $15,000
├─ DXY:   1000 units @ $108 = $108,000 (bonds/FX)
└─ RWA:   50 units @ $1000 = $50,000
           ────────────────────
           Total collateral: $238,000 (in micro-USD terms)

Basket weights applied:
├─ Gold:   $20,000 × 20% = $4,000
├─ Oil:    $10,000 × 25% = $2,500
├─ BTC:    $35,000 × 15% = $5,250
├─ Silver: $15,000 × 15% = $2,250
├─ DXY:    $108,000 × 15% = $16,200
└─ RWA:    $50,000 × 10% = $5,000
           ────────────────────
           Basket value: $35,200

Alice mints BASKET:
├─ Payment fee (0.1%): 10 BASKET (goes to insurance fund)
├─ Net issued: 9,990 BASKET
└─ User position created:
   ├─ debt:              9,990 BASKET
   ├─ collateral_value:  $35,200
   ├─ cr_bps:            352.5 × 100 = 35,250 bps (352.5%) ✅ HEALTHY
   └─ bump:              252

Alice's ratio: 35,250 bps / 100 = 352.5% → VERY SAFE (need only 150%)
```

---

#### Step 2: MARKET STRESS (Black Swan Incoming)

```
Black Swan Event:
├─ Geopolitical crisis triggers oil embargo
├─ WTI crude spikes +40% to $140/barrel
├─ BTC confidence interval widens (vol regime shift)
├─ ... but also Gold rallies +8% to $2,160

Updated basket calculation:
├─ PAXG:  10 @ $2,160 = $21,600 × 20% = $4,320
├─ tOIL:  100 @ $140 = $14,000 × 25% = $3,500 ← OIL UP!
├─ WBTC:  0.5 @ $68,000 = $34,000 × 15% = $5,100 ← down slightly
├─ XAG:   500 @ $30.50 = $15,250 × 15% = $2,287.50
├─ DXY:   1000 @ $108 = $108,000 × 15% = $16,200
└─ RWA:   50 @ $1000 = $50,000 × 10% = $5,000
          ────────────────────
          NEW basket value: $36,407.50

Alice's NEW ratio: 36,407.50 / 9,990 = 3.647 = 364.7% ✅ STILL HEALTHY
Price movements offset! Basket design working.

BUT: BTC confidence interval is NOW:
├─ btc_conf / btc_price = 2.8% (was 0.15%)
├─ This triggers CRISIS mode
└─ Adaptive CR escalates to 300% (was 150%)

Alice now needs: 9,990 × 300% / 100 = $29,970 in collateral (she has $36,407)
Still healthy but margin compressed!
```

---

#### Step 3: SECONDARY SHOCK (Alice Gets Rekt)

```
48 hours later...
├─ Oil embargo intensifies, WTI goes to $160 (actual crisis)
├─ BUT: Fed raises rates unexpectedly, RWA vault has credit event
├─ RWA collateral HALVES to $25,000 (price went from $1000 → $500)

Updated basket AGAIN:
├─ PAXG:  10 @ $2,160 = $21,600 × 20% = $4,320
├─ tOIL:  100 @ $160 = $16,000 × 25% = $4,000 ← stayed high
├─ WBTC:  0.5 @ $68,000 = $34,000 × 15% = $5,100
├─ XAG:   500 @ $30.50 = $15,250 × 15% = $2,287.50
├─ DXY:   1000 @ $108 = $108,000 × 15% = $16,200
└─ RWA:   50 @ $500 = $25,000 × 10% = $2,500 ← CRISIS HIT
          ────────────────────
          NEW basket value: $34,407.50

Alice's NEW ratio: 34,407.50 / 9,990 = 3.446 = 344.6% 
Still above 300% threshold... but TIGHT.

Keeper bot logs: 
  "Alice [5DHM...] CR=34,460 bps (344.6%) — Yellow Zone (monitor)"
```

---

#### Step 4: LIQUIDATION (The Bad Timeline)

```
Suddenly, RWA vault suffers REDEMPTION RUN (panic):
├─ Major LPs withdraw, vault share price crashes another 50%
├─ RWA collateral is NOW: 50 @ $250 = $12,500

Updated basket (CRISIS #3):
├─ PAXG:  10 @ $2,160 = $21,600 × 20% = $4,320
├─ tOIL:  100 @ $160 = $16,000 × 25% = $4,000
├─ WBTC:  0.5 @ $68,000 = $34,000 × 15% = $5,100
├─ XAG:   500 @ $30.50 = $15,250 × 15% = $2,287.50
├─ DXY:   1000 @ $108 = $108,000 × 15% = $16,200
└─ RWA:   50 @ $250 = $12,500 × 10% = $1,250 ← CRASHED
          ────────────────────
          NEW basket value: $32,157.50

Alice's ACTUAL ratio: 32,157.50 / 9,990 = 3.218 = 321.8%
Still above 300%... but what's the spread?

Keeper scans and finds:
├─ Alice CR = 321.8% > 300% ✅ (technically healthy)
├─ BUT: rapid volatility spike = risky
├─ AND: one more 2% market move = RED ZONE

[5 minutes pass...]

Another shock hits:
├─ Oil inventory data releases: much larger than expected
├─ WTI drops to $145/barrel (overshooting)
├─ New basket value drops to $28,000

Alice's NEW ratio: 28,000 / 9,990 = 2.803 = 280.3%

🔴 ORANGE ZONE ALERT (280.3% < 300% but > 250%)
Keeper bot adds Alice to liquidation queue...

Actually wait - the scenario says CR should be:
Min required = 9,990 × 300% / 100 = $29,970
Actual = $28,000

🔴 RED ZONE! CR = 28,000 / 9,990 = 2.803 = 280.3% RED ZONE 🔴

Keeper executes:
├─ User: Alice
├─ Position CR: 28,000 bps (280%)
├─ Zone: RED ZONE
├─ Penalty: 8%
├─ Max liquidation: 100% of position
├─ Repay amount: 9,990 BASKET (100% of debt)

Collateral seized: 9,990 + (9,990 × 8% / 100) = 10,789.2 BASKET value
Penalty split:
├─ Keeper reward (50%): 5,395 BASKET value ← EARNED!
├─ Insurance fund (30%): 3,237 BASKET value
└─ Burned (20%): 1,159 BASKET value

Alice's position after liquidation:
├─ debt: 0 (fully liquidated)
├─ collateral_value: $28,000 - $10,789 = $17,211 (what's left)
├─ cr_bps: MAX (position closed)

Alice suffered:
├─ Lost: $9,990 BASKET (all debt)
├─ Kept: $17,211 of original $238,000 collateral (7.2% remains)
└─ Total loss: ~91% ($220,789)

Keeper earned:
├─ $5,395 value from rewards
├─ ~54 basis points of yield on this liquidation
```

---

#### Step 5: RECOVERY (Alice Learns & Comes Back)

```
A month later, market calms:
├─ Oil stabilizes at $110/barrel
├─ RWA recovers to 80% of original value
├─ BTC confidence interval normalizes (0.18%)
├─ Adaptive CR back to 150%

Alice deposits NEW collateral:
├─ She liquidates remaining $17,211 position → BASKET
├─ Uses proceeds to buy more PAXG (perceived safer asset)
├─ Deposits more collateral, MORE CAUTIOUS

New mint:
├─ Collateral: $18,500
├─ Requested BASKET: 8,000
├─ Min CR needed: 8,000 × 150% / 100 = $12,000
├─ Collateral ratio: 18,500 / 8,000 = 231.25% ← healthier!

Success: Alice minted again, but with 2.3x safety buffer instead of 3.5x.
She learned: **Over-collateralization is insurance against volatility.**
```

---

## Key Mechanics

### ✅ Why This Survives Crises

1. **Multi-asset basket** — Single asset crash doesn't kill it. Oil ↓ but Gold ↑
2. **Adaptive CR** — Auto-scales from 150% → 300% during stress. No governance delay.
3. **Graduated liquidations** — Red/Orange/Yellow zones prevent cascades. Can only liquidate 25% in Orange, not 100%.
4. **Pro-rata redemption** — Users can always exit. Returns aligned with real collateral, not magic "reserve ratio."
5. **Insurance fund** — Bad debt paid by accumulated fees (0.1% per mint/burn + liquidation penalties).

### ❌ What Could Still Break It

- **All oracles go down** → Fall back to last known price (stale but safe)
- **Correlated asset collapse** → If oil + gold BOTH crash 50%, basket value halves (this is why basket has 6 uncorrelated assets)
- **Liquidity death spiral** → If only 1 liquidator exists and they get slashed, no one liquidates → protocol deteriorates
- **Governance attack** → If rebalance authority is compromised, weights could be shifted to favor certain assets

**Mitigations:**
- Multiple independent keepers (redundancy)
- Max weight shift of ±5% per quarter (hard limit)
- Insurance fund TVL target: 5-10% of total TVL
- Quarterly audit cycles

---

## Keeper Bot Economics

If you run a keeper bot earning liquidation rewards:

```
Scenario: 100M TVL, 200% average CR, 1-2% liquidation rate per year

Annual liquidations:  $1-2M of BASKET debt repaid
Average penalty:      6% (weighted avg)
Penalty pool:         $60-120k

Keeper share (50%):   $30-60k
Insurance fund (30%): $18-36k
Burned (20%):         $6-12k

Keeper APY:           30-60k / (keeper_collateral) = depends on your stake

Example: If YOU put up $500k collateral to earn:
APY = $45k / $500k = 9% per year in BASKET rewards
```

**Not passive income, but ACTIVE work:**
- Must monitor 24/7
- Pay gas on liquidations (~0.5 SOL = $0.10, cheap on Solana)
- Must maintain keeper health (don't get liquidated yourself!)
- Competition: multiple keepers bid on liquidations

---

## Testing This Locally

```bash
# Terminal 1: Start keeper in dry-run mode
cd backend
npm run keeper:dry-run

# Terminal 2: Simulate market stress (change prices in oracle)
npm run test:oracle-shock

# Terminal 3: Monitor liquidations
tail -f keeper.log | grep "LIQUIDATING"

# You'll see: positions identified, zones assigned, rewards calculated
```

---

This is VERUM's core innovation: **algorithmic stability without algorithmic volatility.**
