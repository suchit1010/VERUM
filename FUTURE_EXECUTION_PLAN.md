# VERUM Future Execution Plan (No Simulation)

This plan starts from the current repository state and drives to a fully real devnet flow.

## Current Status (as of 2026-03-18)

- Frontend actions are wired to real transaction builders:
  - `deposit` -> SVS-1 deposit transaction
  - `mint` -> BasketVault mint transaction
  - `redeem` -> BasketVault redeem transaction
- Frontend build passes (`npm --prefix app run build`).
- Root TypeScript checks pass (`npx tsc --noEmit`).
- Remaining blocker is environment runtime tooling for on-chain deployment (`anchor`, `solana`, SBF toolchain) in active shell.

---

## Phase 1 — Environment Hardening (Blocking)

### Objective
Make this machine able to compile, deploy, and test Anchor programs end-to-end.

### Commands (WSL preferred)

```bash
# 1) Verify toolchain
anchor --version
solana --version
rustup show

# 2) If missing, install Solana + Anchor CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# 3) Verify SBF toolchain
cargo build-sbf --version || true
```

### Done Criteria
- `anchor --version` returns `0.30.x`.
- `solana --version` returns `1.18.x`.
- `anchor build` starts without command-not-found/linker errors.

---

## Phase 2 — On-chain Build and IDL Generation

### Objective
Produce real IDL and deployable artifacts for `basket-vault`.

### Commands

```bash
cd /mnt/c/Users/sonis/earn/VERUM
anchor build
```

### Outputs
- `target/idl/basket_vault.json`
- `target/deploy/basket_vault.so`
- `target/deploy/basket_vault-keypair.json`

### Done Criteria
- Build exits with code `0`.
- IDL file exists and includes instructions: `initialize`, `mint_basket`, `redeem_basket`, `rebalance_weights`, `set_emergency_mode`.

---

## Phase 3 — Deploy Dependencies and Core Program

### Objective
Deploy Layer 1 dependencies and Layer 2 program on devnet with real addresses.

### Commands

```bash
# Configure devnet
solana config set --url devnet
solana airdrop 5

# Deploy SSS + SVS (from deps)
cd deps/sss && anchor build && anchor deploy && cd ../..
cd deps/svs && anchor build && anchor deploy && cd ../..

# Deploy BasketVault
anchor deploy
```

### Required Address Capture
Record all deployed addresses and write them into:
- root `.env`
- `app/.env`

Fields:
- `BASKET_VAULT_ID`
- `SSS_PROGRAM_ID`
- `SVS1_PROGRAM_ID`
- `BASKET_MINT`
- `ASSET_MINT_*`
- `VITE_*` equivalents in app env

### Done Criteria
- All three deployments return successful tx signatures.
- Env files contain real public keys (no placeholders).

---

## Phase 4 — Protocol Initialization (Real)

### Objective
Initialize global config and all collateral vaults with real addresses.

### Commands

```bash
# From repo root
npx ts-node scripts/deploy.ts
npx ts-node scripts/init-vaults.ts
```

### Validation
- `deploy.ts` prints `GlobalConfig PDA` and `VaultAuthority PDA`.
- `init-vaults.ts` prints one vault PDA per asset and no failing transaction.
- Update `VITE_SVS_VAULT_*` fields from script output if needed.

### Done Criteria
- `global_config` account exists and is fetchable.
- All target SVS-1 vault PDAs are initialized.

---

## Phase 5 — Test Execution (Real, Non-Simulated)

### Objective
Run protocol tests against deployed/localnet setup.

### Commands

```bash
# TypeScript tests configured in Anchor.toml
anchor test
```

### Done Criteria
- Existing integration suite runs end-to-end.
- No mocked success messages are used for pass criteria; only transaction confirmations and assertions count.

---

## Phase 6 — Frontend End-to-End Validation

### Objective
Confirm wallet -> deposit/mint/redeem succeeds with actual chain transactions.

### Commands

```bash
npm --prefix app install
npm --prefix app run dev
```

### User Journey Checks
1. Connect wallet on devnet.
2. Deposit collateral (`deposit` tab) and confirm tx signature.
3. Mint BASKET (`mint` tab) and confirm tx signature.
4. Redeem BASKET (`redeem` tab) and confirm tx signature.

### Done Criteria
- Every action returns a real signature and reaches `confirmed`.
- Explorer links resolve to successful transactions.

---

## Phase 7 — Next Engineering Work (After Real E2E is Green)

1. Replace IDL stub usage in frontend with generated `target/idl/basket_vault.json` integration step.
2. Add strict runtime guards for missing env vars and show actionable error cards in UI.
3. Add protocol telemetry panel (global config, emergency mode, total minted, insurance fund).
4. Add deterministic CI script for:
   - `npx tsc --noEmit`
   - `npm --prefix app run build`
   - `anchor build` (when CI image has Solana toolchain)

---

## Risk Register

- **Missing Anchor/Solana in shell**: blocks all on-chain steps.
- **Incorrect env public keys**: causes runtime tx failures.
- **IDL drift after program changes**: frontend method/account mismatches.
- **Wallet adapter/provider mismatch**: transaction send path fails in browser.

Mitigation: enforce Phase 1-4 gates before any demo attempt.
