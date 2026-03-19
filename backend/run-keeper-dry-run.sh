#!/bin/bash

# Start Keeper Bot in Dry-Run Mode
# This monitors positions without executing liquidations

echo "🚀 Starting Basket Vault Keeper Bot (Dry-Run Mode)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Configuration:"
echo "  RPC URL: ${RPC_URL:-https://api.devnet.solana.com}"
echo "  Program ID: ${BASKET_VAULT_PROGRAM_ID}"
echo "  Keeper: ${KEEPER_KEY_PATH:-./keeper-keypair.json}"
echo "  Liquidations: DISABLED (dry-run mode)"
echo ""
echo "Scanning interval: Every 30 seconds"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run with ENABLE_LIQUIDATION=false to prevent actual liquidation
ENABLE_LIQUIDATION=false npm run keeper:bot

# Note: To run in LIVE mode with actual liquidations:
# ENABLE_LIQUIDATION=true npm run keeper:bot
