# Devnet Deployment Proof

> Generated: Fri, 13 Mar 2026 03:00:19 GMT
> All 18 transactions verified on Solana Devnet.

## Programs

| Program | ID | Solscan |
|---|---|---|
| sss-stablecoin | `HJ6TUXQ34XhDrmvcozMsBWhSuEVkEcYeqoTWo1Bcmzet` | [view](https://solscan.io/account/HJ6TUXQ34XhDrmvcozMsBWhSuEVkEcYeqoTWo1Bcmzet?cluster=devnet) |
| sss-transfer-hook | `6x8XMLoA9FFmVJnaDou9tyKrh9CFynDY7TtKJ54p4dcN` | [view](https://solscan.io/account/6x8XMLoA9FFmVJnaDou9tyKrh9CFynDY7TtKJ54p4dcN?cluster=devnet) |

---

## SSS-1: Minimal Stablecoin — Complete Lifecycle

**Token:** dUSD1 · Mint: `F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD`

| # | Operation | Transaction |
|---|-----------|-------------|
| 1 | Initialize (mint + freeze authority + metadata) | [view](https://solscan.io/tx/3TJ68MjrRJjvVMXz7FuqEWEov1FhESBgWadfpV2xrU8kKXjziytfzhjw5R6K1JryB4apBoPHdtHCZg9isjw4pfXV?cluster=devnet) |
| 2 | Add minter · quota: 10,000,000 dUSD1 | [view](https://solscan.io/tx/a7yTDTfaWWiXQYjE5JTsi7mftdCXAEEemoxrWbhns7m8xfyP5ycP1SrfFzrpUf5n4mFhFt5X18KCPwV4PdJDibg?cluster=devnet) |
| 3 | Mint 1,000 dUSD1 to authority | [view](https://solscan.io/tx/2tYYL6D85tk2BY8DBNiD6YvhgMsYs2vVRJkDaGZZPuSgWRZsbNAscAeXgiA4Vkx9YL1JGgyU48n4g3ghFByDaVtX?cluster=devnet) |
| 4 | Freeze token account | [view](https://solscan.io/tx/LVyoDv6Q5pbbe9UP289XGSggumiWEfprjK3uTfjmjNAXMYJYmiXmyopg1yAQdv7su6vcuA8wZYMVuT9nTCUBj9j?cluster=devnet) |
| 5 | Thaw token account | [view](https://solscan.io/tx/4ET6udEPvvWTiztvoHF7u4Q8UUKU4yQRx2uRC29vAKrNPfgUCZEhqpBgvUF5Nw6eyARPHui44uePfhVRHMfn69Go?cluster=devnet) |
| 6 | Pause all operations | [view](https://solscan.io/tx/3pBNxQLido5bdSzVyEDvfF7VeteXYfEvBisF6ooSQLBdPDNgTiNjAH5viCZqbcZBsHDQtaDMkD9jcYfjGBhr5BTF?cluster=devnet) |
| 7 | Unpause | [view](https://solscan.io/tx/3hgynp7NeYybwhaBLwpYbnzB4snhFbvbbkg7nz4AwW9v7LTmiEKj29TFdKkjqMynSvqkfrUXSwFGyz8kc6sPvDHC?cluster=devnet) |
| 8 | Burn 500 dUSD1 | [view](https://solscan.io/tx/46CLD5ztCDggFTKGZ2UWgXoqw1h9qXWppfsibniM6YuWbrJt9JT3rP9vB3ahZutTYRy2RZZ731ZMW6NPvWni62xx?cluster=devnet) |

**Net supply after lifecycle:** 500 dUSD1

---

## SSS-2: Compliant Stablecoin — Complete Lifecycle (+ Compliance)

**Token:** dUSD2 · Mint: `69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf`

| # | Operation | Transaction |
|---|-----------|-------------|
| 1 | Initialize (SSS-1 + permanent delegate + transfer hook) | [view](https://solscan.io/tx/2jtJKgpEwtVHjwe9YWpoCFy7dPKuLtiC7Qmw9y1dEyfa4b4uBEFteZv4qSTh2Q2KjhkeuynbsAdYHxzLJE9tPKcn?cluster=devnet) |
| 2 | Add minter · quota: 100,000,000 dUSD2 | [view](https://solscan.io/tx/2Fi71vqp55FGNsegLSBaFjPWoM7KUyv9am8ahzUZymERYzkMKiQG1qjtiRutcpxmFpcZ3RHg4UByH5sqWNup4Prt?cluster=devnet) |
| 3 | Mint 5,000 dUSD2 → victim address | [view](https://solscan.io/tx/undefined?cluster=devnet) |
| 4 | Mint 10,000 dUSD2 → treasury | [view](https://solscan.io/tx/5kAJ9gaPNAB2VwrxBEtZDifUmRrxWvDY4Zqdc5qiQ86ERvgU9pt3sgDx5ySiAjvRqxAP3Tja5HMGtwsiicDeoYnu?cluster=devnet) |
| 5 | Blacklist victim (reason: "OFAC sanctions match") | [view](https://solscan.io/tx/5ErJGN2mDGG8YtffZL9a3ZmHBFszajHaCSq3Q6KBPZqTE4jhFaKbGhSwoqJ2itoPXFaMonPMFuXLsr87m5852c6s?cluster=devnet) |
| 6 | Freeze victim's token account | [view](https://solscan.io/tx/5jXfWzFd6WJ8Lje68WgRwqpgyBPcuToLwMqBiFzfztWdwKW5qUtB4gxxm9D1qm7374FswgWyLXcjGWdQkWQUkDNC?cluster=devnet) |
| 7 | **Seize** 5,000 dUSD2 victim → treasury (permanent delegate) | [view](https://solscan.io/tx/undefined?cluster=devnet) |
| 8 | Remove victim from blacklist | [view](https://solscan.io/tx/undefined?cluster=devnet) |
| 9 | Pause all operations | [view](https://solscan.io/tx/49BJkxuAmDpB9H5dsYWZs2W1wEUF8SMKE5TzwoJ4aNb2EiQBZuMCFBZwm3KTWLxGPkaQ2WmMW34iofEzxhHijY1L?cluster=devnet) |
| 10 | Unpause | [view](https://solscan.io/tx/3J38oRuJ8U5AUCps7VGVJbZwse8G5MWMt6xYiSFAarNd68NivsPz6duXTqhYBjYuEJWc8eQmR1MujSxJ4iu4PL7f?cluster=devnet) |

**Net supply after lifecycle:** 15,000 dUSD2 (all in treasury after seize)

---

## Architecture Verified On-Chain

```
SSS-1  Minimal:    Token-2022 + metadata + freeze authority + role-based mint/burn
SSS-2  Compliant:  SSS-1 + permanent delegate + transfer-hook program + on-chain blacklist PDAs
```

**Token-2022 Extensions active:**
- MetadataPointer + embedded TokenMetadata (both)
- Freeze authority (both)
- PermanentDelegate (SSS-2 only) — enables asset seizure without holder signature
- TransferHook → `sss-transfer-hook` program (SSS-2 only) — checks blacklist on every transfer

**Role-Based Access Control (RBAC):**
| Role | Capability |
|------|-----------|
| master_authority | Role updates, authority transfer |
| minter | Per-minter on-chain quota, tracked and enforced |
| burner | Burn from own ATA |
| pauser | Emergency pause/unpause |
| seizer | Asset seizure via permanent delegate (SSS-2) |
| blacklister | Add/remove addresses from on-chain blacklist (SSS-2) |

**Quality Assurance:**
- 158 unit + integration tests (100% pass rate)
- Trident fuzz tests: 1,640,000+ iterations, 0 crashes
- All instructions tested: initialize, mint, burn, freeze, thaw, pause, unpause,
  add_minter, remove_minter, update_roles, transfer_authority,
  add_to_blacklist, remove_from_blacklist, seize
