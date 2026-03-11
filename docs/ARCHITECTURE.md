# Architecture

## Three-Layer Model

The SSS architecture follows a composable three-layer design:

### Layer 1 — Base SDK
Token creation with mint authority, freeze authority, and metadata. Issuers choose which Token-2022 extensions to enable. Includes role-based access control and pause mechanism.

### Layer 2 — Modules
Composable pieces that add capabilities:
- **Compliance Module** — Transfer hook, blacklist PDAs, permanent delegate
- **Privacy Module** — Confidential transfers, allowlists (future SSS-3)

Each module is independently testable and optional.

### Layer 3 — Standard Presets
Opinionated combinations of Layer 1 + Layer 2:
- **SSS-1**: Minimal Stablecoin (Layer 1 only)
- **SSS-2**: Compliant Stablecoin (Layer 1 + Compliance Module)

## On-Chain Programs

### sss-stablecoin (Main Program)
Single configurable program supporting both presets via `StablecoinConfig` flags.

**PDA Accounts:**
| PDA | Seeds | Purpose |
|-----|-------|---------|
| StablecoinConfig | `["config", mint]` | Feature flags, metadata |
| RoleConfig | `["roles", mint]` | RBAC assignments |
| MinterQuota | `["minter", mint, minter]` | Per-minter quota tracking |
| PauseState | `["pause", mint]` | Global pause toggle |
| BlacklistEntry | `["blacklist", mint, address]` | O(1) blacklist lookup |

### sss-transfer-hook (Hook Program)
Separate program implementing Token-2022 Transfer Hook interface. Called by Solana runtime on every transfer. Checks sender + receiver against blacklist PDAs.

## Scalability Design

| Design | Why It Scales |
|--------|--------------|
| PDA-based blacklist | O(1) lookup — no iteration over lists |
| Per-minter quota PDAs | Independent state — no shared locks |
| Transfer hook as separate program | Runtime-enforced — no CPI overhead |
| Event-driven backend | Stateless workers — horizontally scalable |
| Token-2022 native extensions | Protocol-level enforcement — zero cost |

## Security Model

- **Role-based access control** with master authority fallback
- **Feature gating** — SSS-2 instructions fail gracefully on SSS-1 tokens
- **Checked arithmetic** throughout — no overflow vulnerabilities
- **PDA bumps stored** — not recalculated
- **Emergency pause** mechanism for all operations
