# Plan: VERUM MVP Build Roadmap

Build in phases from protocol core → oracle/risk engine → relayer/keeper → minimal app, with strict verification gates after each phase. This matches the chosen direction: Pyth primary, Switchboard fallback, Chainlink quarterly jobs, adaptive CR tiers, and on-chain + app MVP.

## Steps
1. Phase 0 (blocking): bootstrap build/test environment in WSL/Linux, add missing JS test/app scaffolding, and make `anchor build` + test runner executable.
2. Phase 1 (depends on 1): implement module foundation under `programs/basket-vault/src` and define canonical PDA/state model (`GlobalConfig`, `AssetConfig`, vault accounts, user positions, insurance fund).
3. Phase 2 (depends on 2): ship base protocol instructions for `initialize`, `mint_basket`, `redeem_basket`, `rebalance_weights`, `set_emergency_mode` with invariant and authority checks.
4. Phase 2b (depends on 2): implement oracle aggregation with Pyth primary, Switchboard fallback, median + spread checks, and staleness checks; integrate Chainlink Functions output path for quarterly rebalance updates.
5. Phase 3 (depends on 3+4): implement adaptive collateral ratio engine with regime tiers (150%/200%/300%) based on BTC confidence interval proxy.
6. Phase 3b (depends on 5): implement liquidation path with keeper incentives (5% bonus), bad-debt routing to insurance fund, and crisis controls.
7. Phase 4 (depends on 6): build minimal app flows (wallet, deposit/mint, redeem, health display), then run integration/stress tests and devnet soak test to gate launch readiness for the $200k volume milestone.

## Relevant Files
- `README.md` — product and architecture source of truth.
- `Anchor.toml` — cluster/provider/test workflow.
- `Cargo.toml` — workspace/build profile baseline.
- `programs/basket-vault/Cargo.toml` — protocol dependencies.
- `programs/basket-vault/src/lib.rs` — program entry/module exports.
- `tests/basket-vault.ts` — integration scenarios.
- `app/` — minimal frontend flows.
- `scripts/` — deploy/bootstrap scripts.
- `chainlink-functions/rebalance-job.js` — quarterly rebalance compute job.

## Verification Gates
1. Build gate: `anchor build` succeeds and IDL is stable.
2. Unit gate: CR logic, oracle staleness/spread checks, and liquidation accounting.
3. Integration gate: initialize → mint → redeem + undercollateralized liquidation scenario.
4. Fault gate: stale feed, disagreement across feeds, rapid drawdown behavior.
5. Devnet gate: scripted user journeys and operational readiness under load.

## Decisions Locked
- Oracle architecture: Pyth primary + Switchboard fallback + Chainlink quarterly jobs.
- Adaptive CR model: tiered 150% / 200% / 300%.
- MVP scope includes protocol + minimal app.
- BasketVault lives inside the current implementation boundary for MVP speed.
- Out of scope for MVP: cross-chain CCIP, full DAO governance automation, and RWA custody/legal wrappers.
