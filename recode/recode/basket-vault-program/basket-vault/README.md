# BasketVault — Anchor Program

Multi-asset basket stablecoin vault on Solana.
Built on top of the SSS stablecoin SDK (Layer 1 — untouched).

## Architecture

```
Layer 4: CCIP bridge (post-MVP)
Layer 3: Chainlink Functions (quarterly rebalance jobs only)
Layer 2: BasketVault (this repo) + Pyth + Switchboard
Layer 1: SSS SDK (mint/burn/freeze — unchanged)
```

## File Structure

```
programs/basket-vault/src/
  lib.rs                          ← program entry point, all instructions wired
  state.rs                        ← account structs, seeds, Pyth feed IDs
  oracle.rs                       ← Pyth normalization, adaptive_cr, basket math
  oracle_aggregator.rs            ← multi-source median + spread check
  cpi_interface.rs                ← manual CPI interface to SSS mint_tokens
  errors.rs                       ← all VaultError codes
  instructions/
    initialize.rs                 ← one-time setup, transfers mint authority
    init_collateral_vault.rs      ← create vault token account per asset
    deposit_collateral.rs         ← user deposits SPL collateral
    withdraw_collateral.rs        ← user withdraws SPL collateral (PDA signs)
    mint_basket.rs                ← oracle fetch → CR check → SSS CPI mint
    rebalance_weights.rs          ← quarterly weight update from Chainlink Functions
    emergency.rs                  ← pause/unpause mints and deposits

chainlink-functions/
  rebalance-job.js                ← off-chain compute job (EIA, FAO, WTO data)
```

## Setup

### 1. Dependencies (Cargo.toml)

```toml
[dependencies]
anchor-lang = "0.30"
anchor-spl = "0.30"
pyth-solana-receiver-sdk = "0.3"
switchboard-solana = "0.28"
```

### 2. Update constants before deploying

In `state.rs`:
- Replace `FEED_*` hex strings with mainnet Pyth feed IDs
- Verify feed IDs at: https://pyth.network/developers/price-feed-ids#solana-mainnet

In `cpi_interface.rs`:
- Replace `MINT_TOKENS_DISCRIMINATOR` with actual value from your SSS IDL:
  ```
  anchor idl fetch <SSS_PROGRAM_ID> | jq '.instructions[] | select(.name=="mint_tokens")'
  ```

In `lib.rs`:
- Replace `declare_id!` with your deployed program ID after `anchor build`

### 3. Deploy sequence

```bash
anchor build
anchor deploy --provider.cluster devnet

# Initialize protocol
anchor run initialize

# Initialize vault accounts for each asset (6 calls)
anchor run init-collateral-gold
anchor run init-collateral-oil
# ... etc
```

### 4. Oracle accounts (remaining_accounts in mint_basket)

Pass Pyth PriceUpdateV2 accounts in `remaining_accounts` in exact registry order:
- Index 0: XAU/USD
- Index 1: WTI/USD
- Index 2: BTC/USD  ← used as vol proxy for adaptive_cr
- Index 3: XAG/USD (silver+farm proxy)
- Index 4: DXY
- Index 5: RWA proxy

## Adaptive CR Logic

BTC confidence interval / price (basis points):
- < 30 bps  (< 0.30%) → CR = 150% (normal market)
- 30-200 bps           → CR = 200% (elevated vol)
- ≥ 200 bps (≥ 2.00%) → CR = 300% (crisis / black swan)

## Basket Weights (initial)

| Asset          | Weight |
|----------------|--------|
| Gold (XAU)     | 20%    |
| Crude Oil (WTI)| 25%    |
| BTC            | 15%    |
| Silver + Farm  | 15%    |
| DXY/Bond proxy | 15%    |
| Tokenized RWAs | 10%    |

Rebalanced quarterly via Chainlink Functions job (`chainlink-functions/rebalance-job.js`).
Max 5% shift per asset per quarter. Hard cap 35% per asset, floor 5%.

## Security Notes

- Smart contracts are **unaudited**. Use only on devnet until Hacken review.
- All `checked_*` arithmetic — no overflow panics.
- Staleness checks: Pyth 60s, Switchboard 120s.
- Spread check: reject if oracle sources disagree by >1.5%.
- Emergency mode: multisig can pause mints/deposits instantly.
- Withdrawals always remain open (user funds never locked).
