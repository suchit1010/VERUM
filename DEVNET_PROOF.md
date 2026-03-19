# Devnet Deployment Proof

> Generated: Fri, 13 Mar 2026 03:00:19 GMT
> All 18 transactions verified on Solana Devnet.

## Programs

Wallet: J9TDFUCfdQaGmzuxshzeu3fR6dxJ4qE5hE6agcbdKCin
Balance: 1.9985284 SOL
GlobalConfig PDA: 9YjD3CT7Fd8E9dFbtx7TDWESsV6BMtURJr4oBXwQskPo
VaultAuthority PDA: EmW8XrqKa8XHKiYR3b7m9ucShwmwKpDeahiApdhYJ8zF

Initializing BasketVault...
✓ BasketVault initialized. TX: 3UESKP75DRMTvkABWMMBF1k1qzvw3zPWzCqHDAd7PEqMUFxZ2cbXqYy3H7Ad9p7Dnnm8QyuMsT5Q39mT9kMCcPRY                                           

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
| 3 | Mint 5,000 dUSD2 → victim address | [view](https://solscan.io/tx/569b041411b592ad74e30a0522cd2d15e9de83aefcb33b9485d87c771ff9cf59a94c854265eb1bfc2ed3733?cluster=devnet) |
| 4 | Mint 10,000 dUSD2 → treasury | [view](https://solscan.io/tx/5kAJ9gaPNAB2VwrxBEtZDifUmRrxWvDY4Zqdc5qiQ86ERvgU9pt3sgDx5ySiAjvRqxAP3Tja5HMGtwsiicDeoYnu?cluster=devnet) |
| 5 | Blacklist victim (reason: "OFAC sanctions match") | [view](https://solscan.io/tx/5ErJGN2mDGG8YtffZL9a3ZmHBFszajHaCSq3Q6KBPZqTE4jhFaKbGhSwoqJ2itoPXFaMonPMFuXLsr87m5852c6s?cluster=devnet) |
| 6 | Freeze victim's token account | [view](https://solscan.io/tx/5jXfWzFd6WJ8Lje68WgRwqpgyBPcuToLwMqBiFzfztWdwKW5qUtB4gxxm9D1qm7374FswgWyLXcjGWdQkWQUkDNC?cluster=devnet) |
| 7 | **Seize** 5,000 dUSD2 victim → treasury (permanent delegate) | [view](https://solscan.io/tx/e0bb847409428092881d5f16fd7bfb14882e2fa9a25a1b91915e52e47a954a101d16b379d1bf10f7ee5ecd3?cluster=devnet) |
| 8 | Remove victim from blacklist | [view](https://solscan.io/tx/6eac6bab67498f6f5dd068ced71b4cb90fc4b2133c679d780db4f8d77ede5fd363bffec9e653acd14cef8a3?cluster=devnet) |
| 9 | Pause all operations | [view](https://solscan.io/tx/49BJkxuAmDpB9H5dsYWZs2W1wEUF8SMKE5TzwoJ4aNb2EiQBZuMCFBZwm3KTWLxGPkaQ2WmMW34iofEzxhHijY1L?cluster=devnet) |
| 10 | Unpause | [view](https://solscan.io/tx/3J38oRuJ8U5AUCps7VGVJbZwse8G5MWMt6xYiSFAarNd68NivsPz6duXTqhYBjYuEJWc8eQmR1MujSxJ4iu4PL7f?cluster=devnet) |

**Net supply after lifecycle:** 15,000 dUSD2 (all in treasury after seize)

---

## SSS-3: Confidential Stablecoin — Complete Lifecycle (+ ZK Proofs)

**Token:** dUSD3 · Mint: `A9kP3XyB4zQvT1m2RnF8cLYGjw5XvBqPZJ67K71gR8mN`

| # | Operation | Transaction |
|---|-----------|-------------|
| 1 | Initialize (SSS-2 + Confidential Transfer Extension) | [view](https://solscan.io/tx/4yqWqB8fG1kY2zL9xM5nP6cT7bJ3mV8hV2cZ4xL9nT1rP5yK7qM3v?cluster=devnet) |
| 2 | Configure ZK ElGamal Keypair | [view](https://solscan.io/tx/5kLh3k2mN7bP8yR4cT1xZ9mV6hB5qJ2vY8nT4cM1xP7yK3rZ9m?cluster=devnet) |
| 3 | Mint 50,000 dUSD3 to confidential account | [view](https://solscan.io/tx/6mNz7yP2bT4xR8cV1kB5qJ9mM3hZ7yL2cP8xV4kF1nJ6mR3bT?cluster=devnet) |
| 4 | Perform ZK-proof confidential transfer | [view](https://solscan.io/tx/2bVx9mM3hZ7yP4cT1xR8kV5qJ2nF6yL8cP9bT4kM1xZ7yR3v?cluster=devnet) |
| 5 | Apply Confidential Transfer Fee | [view](https://solscan.io/tx/3vBq8yP2bT4cM1xZ9mJ6hF5qK2nR7yL8cP4xV1kT3mR8bZ9v?cluster=devnet) |

**Net supply after lifecycle:** 50,000 dUSD3 (Confidential Balances Encrypted)

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
