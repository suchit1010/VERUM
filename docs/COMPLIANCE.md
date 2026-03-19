# Compliance Guide

## Regulatory Context

The SSS-2 standard is designed to meet requirements from:
- **GENIUS Act** (Guiding and Establishing National Innovation for US Stablecoins)
- **OFAC Sanctions** (Office of Foreign Assets Control)
- **MiCA** (Markets in Crypto-Assets, EU)

## Capabilities

### On-Chain Blacklist
- O(1) lookup via PDA existence checks
- Reason tracking for audit trail
- Real-time enforcement via transfer hook
- No gaps — every transfer is checked

### Transfer-Hook Hardening (Mar 2026)
- Blacklist PDAs are derived from **wallet owners**, not token-account addresses.
- Source and destination token accounts are decoded with Token-2022 extension-aware parsing.
- Hook validates stablecoin program identity, mint consistency, PDA correctness, and blacklist account ownership.
- This prevents bypasses via fresh token-account creation (including non-ATA paths).

### Token Seizure
- Permanent delegate allows transferring from any account
- Required by regulators for sanctions enforcement
- Requires seizer role authorization

### Audit Trail
All operations emit Anchor events:
- `AddressBlacklisted` — Who, what, when, why
- `AddressUnblacklisted` — Removal tracking
- `TokensSeized` — From, to, amount, who, when
- Full event history queryable via backend indexer

## Audit Trail Format (Export)

```json
{
  "entries": [
    {
      "timestamp": "2025-01-15T10:30:00Z",
      "action": "blacklist_add",
      "actor": "7xK...",
      "target": "3bF...",
      "reason": "OFAC SDN List match",
      "signature": "5uR..."
    }
  ]
}
```

## Integration Points

### Sanctions Screening
The compliance service provides integration points for:
- **OFAC SDN List** — US sanctions
- **Chainalysis** — Blockchain analytics
- **Elliptic** — Crypto compliance
- **TRM Labs** — Risk assessment

### Monitoring
- Real-time event monitoring via WebSocket
- Webhook notifications for compliance events
- Configurable alerts with retry logic

## Expected Enforcement Outcomes

- Transfer from blacklisted wallet → `SourceBlacklisted`
- Transfer to blacklisted wallet → `DestinationBlacklisted`
- Invalid hook wiring / bad account assumptions → explicit hook validation errors

These outcomes are covered by integration tests in `tests/sss-2.ts` and lifecycle tests in `tests/sss-lifecycle.ts`.
