#!/bin/bash

# VERUM Token Mint Script
# Mints dUSD1 and dUSD2 to your wallets

WALLET1="3qWVExJqsN3y8f4C5EjGFKnMEx8Pwt4zG1swZ5PvY5n9"
WALLET2="3rqrdZaNqMtczK5LHeDNLTEx84xUyCpGtKvFYE5b9SvQ"
DUSD1="F5r2ep6exHgcLX1cFmShzE5PjzZM4ZL51ZZMyShUzwBD"
DUSD2="69cvuJ9477KfwzKFfmnRFMwd8rmaS4k6Zhz8jpbcbzVf"

echo "🔍 VERUM Token Minting Script"
echo "============================"
echo ""
echo "Wallet 1: $WALLET1"
echo "Wallet 2: $WALLET2"
echo ""

# Get default keypair for fee payer
export SOLANA_CONFIG_DIR="$HOME/.config/solana"
export SOLANA_CONFIG="$SOLANA_CONFIG_DIR/cli/config.yml"

# Create ATAs for Wallet 1
echo "📦 Creating token accounts for Wallet 1..."
spl-token create-account "$DUSD1" --owner "$WALLET1" --url devnet 2>/dev/null || true
ATA1_DUSD1=$(spl-token accounts --owner "$WALLET1" --url devnet | grep "$DUSD1" | awk '{print $1}')
echo "✓ dUSD1 ATA: $ATA1_DUSD1"

spl-token create-account "$DUSD2" --owner "$WALLET1" --url devnet 2>/dev/null || true
ATA1_DUSD2=$(spl-token accounts --owner "$WALLET1" --url devnet | grep "$DUSD2" | awk '{print $1}')
echo "✓ dUSD2 ATA: $ATA1_DUSD2"

# Create ATAs for Wallet 2
echo ""
echo "📦 Creating token accounts for Wallet 2..."
spl-token create-account "$DUSD1" --owner "$WALLET2" --url devnet 2>/dev/null || true
ATA2_DUSD1=$(spl-token accounts --owner "$WALLET2" --url devnet | grep "$DUSD1" | awk '{print $1}')
echo "✓ dUSD1 ATA: $ATA2_DUSD1"

spl-token create-account "$DUSD2" --owner "$WALLET2" --url devnet 2>/dev/null || true
ATA2_DUSD2=$(spl-token accounts --owner "$WALLET2" --url devnet | grep "$DUSD2" | awk '{print $1}')
echo "✓ dUSD2 ATA: $ATA2_DUSD2"

echo ""
echo "🪙 Minting tokens (requires mint authority)..."
echo ""
echo "Run these commands if you have mint authority:"
echo ""
echo "# For Wallet 1:"
echo "spl-token mint $DUSD1 1000 $ATA1_DUSD1 --url devnet"
echo "spl-token mint $DUSD2 1000 $ATA1_DUSD2 --url devnet"
echo ""
echo "# For Wallet 2:"
echo "spl-token mint $DUSD1 1000 $ATA2_DUSD1 --url devnet"
echo "spl-token mint $DUSD2 1000 $ATA2_DUSD2 --url devnet"
echo ""
echo "After minting, verify with:"
echo "spl-token balance $DUSD1 --url devnet"
echo "spl-token balance $DUSD2 --url devnet"
