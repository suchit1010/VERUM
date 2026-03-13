# Solana Stablecoin Standard - Operator Dashboard

This is the production-ready Next.js Web3 Frontend for managing Stablecoins created using the Solana Stablecoin Standard (SSS) SDK. 

Built with **Next.js 15**, **Tailwind CSS v4**, and the **Solana Wallet Adapter**, this dashboard allows authorized operators to intuitively manage Token-2022 lifecycle events.

## Features

- **Dynamic Mint Connection:** Connect to any initialized SSS-1 or SSS-2 Mint Address directly from the blockchain.
- **Pre-flight Introspection:** Interrogates target wallets and PDAs (Program Derived Addresses) securely *before* prompting wallet signatures to prevent invalid transactions.
- **Lifecycle Operations:** Mint new supply (Admin), Burn existing supply (Admin), and securely Transfer tokens using Token-2022 checked instructions.
- **Visual Block Explorer:** Seamlessly generates Solscan hyperlinks for real-time tracking of Devnet instructions.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18.17.0 or higher.
- **Wallet**: Phantom Wallet extension installed in your browser, switched to **Devnet**.
- **Devnet SOL**: You need SOL for gas fees. Use the [Solana Faucet](https://faucet.solana.com/) to airdrop Devnet SOL to your wallet.

### 2. Environment Setup
*(Note: If utilizing WSL, ensure you execute standard `npm` commands via PowerShell to avoid cross-OS file locking bugs).*

```bash
cd frontend
npm install
npm run dev
```

The application will spin up strictly at [http://localhost:3000](http://localhost:3000)

### 3. System Architecture & Operation

#### A. Where do I get a Mint Address?
This UI acts as an **Operator Dashboard** for *already customized* stablecoins. 
To generate a Token, initialize it via the Admin CLI first:
```bash
npx ts-node cli/src/index.ts init --preset sss-1
```
This command burns the Metadata (Token Name, Symbol, Decimals) into the blockchain and establishes the Master/Minter Authorities securely. You will retrieve your **Stablecoin Mint Address** from the CLI output.

#### B. Connecting the Dashboard
1. Open the UI, and connect your Phantom Wallet.
2. In the "Stablecoin Mint Address" field, paste the Mint Address generated from your CLI.
3. Click "Connect Mint" to perform a blockchain lookup.

#### C. Operations
* **Minting & Errors:** If you enter an amount and attempt to mint, but your connected wallet is *not* recorded within the `minter_quota` PDA as an authorized Minter, the UI will safely reject the attempt and warn you.
* **Burning:** Submits a token burn instruction to mathematically remove supply from the circulation. You cannot burn more than you hold.
* **Transfers:** Inputs undergo local Base58 string validation before building a Token-2022 `createTransferCheckedInstruction`.

## Tech Stack
- Framework: Next.js (App Router, Turbopack)
- Styling: Tailwind CSS
- Smart Contract Hooks: Anchor Provider (`@coral-xyz/anchor`)
- Wallet Providers: `@solana/wallet-adapter-react` & `@solana/wallet-adapter-react-ui`

## Troubleshooting

### Transfer fails on SSS-2 but mint/burn works
SSS-2 uses **Transfer Hook** enforcement. Transfers require extra hook metadata accounts.

- If you see errors around `TransferChecked`, load the mint and try transfer once.
- The frontend auto-initializes `extra-account-metas` for SSS-2 (one-time operation).
- Retry transfer after wallet approval.

### `SourceBlacklisted` or `DestinationBlacklisted`
- The transfer hook blocked the transfer based on compliance policy.
- Use CLI compliance commands to remove blacklisting for the relevant wallet.

### `AccountFrozen`
- Source or destination token account is frozen.
- Use authority workflow to thaw the account before transfer.

### `insufficient funds`
- Ensure wallet has Devnet SOL for fees.
- If recipient ATA must be created, additional fee is required.

### Runtime error: `data.writeBigUInt64LE is not a function`
- This is a browser/runtime incompatibility in helper encoding paths.
- Fixed in frontend by using manual hook-aware transfer instruction assembly.

## Frontend Release Notes

### 2026-03-13
- Fixed SSS-2 transfer path (manual hook-aware transfer instruction + extra accounts).
- Added one-time automatic initialization for missing SSS-2 `extra-account-metas` PDA.
- Added transfer diagnostics for blacklist/freeze/compliance failures.
- Added operation locks: Mint/Burn/Transfer buttons now disable while tx is in-flight.

