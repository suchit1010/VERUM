use anchor_lang::prelude::*;

use crate::errors::BasketVaultError;

pub const SEED_BASKET_CONFIG: &[u8] = b"basket-config";
pub const MAX_ASSETS: usize = 16;
pub const TOTAL_WEIGHT_BPS: u16 = 10_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, InitSpace)]
pub struct AssetConfig {
    pub mint: Pubkey,
    pub oracle_feed: Pubkey,
    pub decimals: u8,
    pub weight_bps: u16,
    pub min_cr_bps: u16,
    pub price_micro_usd: u64,
    pub price_updated_at: i64,
    pub price_max_age_secs: i64,
    pub enabled: bool,
}

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub basket_mint: Pubkey,
    pub sss_program: Pubkey,

    pub base_cr_bps: u16,
    pub crisis_cr_bps: u16,
    pub max_weight_step_bps: u16,
    pub default_price_max_age_secs: i64,
    pub max_oracle_confidence_bps: u16,
    pub max_mint_per_tx: u64,
    pub minting_paused: bool,

    pub rebalance_cooldown_slots: u64,
    pub last_rebalance_slot: u64,
    pub emergency_mode: bool,

    #[max_len(MAX_ASSETS)]
    pub assets: Vec<AssetConfig>,

    pub bump: u8,
}

impl GlobalConfig {
    pub const LEN: usize = 8 + Self::INIT_SPACE;

    pub fn active_cr_bps(&self) -> u16 {
        if self.emergency_mode {
            self.crisis_cr_bps
        } else {
            self.base_cr_bps
        }
    }

    pub fn effective_required_cr_bps(&self) -> u16 {
        let asset_floor = self
            .assets
            .iter()
            .filter(|asset| asset.enabled)
            .map(|asset| asset.min_cr_bps)
            .max()
            .unwrap_or(self.base_cr_bps);

        self.active_cr_bps().max(asset_floor)
    }

    pub fn total_weight_bps(&self) -> Result<u16> {
        self.assets
            .iter()
            .try_fold(0u16, |acc, asset| {
                acc.checked_add(asset.weight_bps)
                    .ok_or_else(|| error!(BasketVaultError::MathOverflow))
            })
    }

    pub fn assert_full_weight(&self) -> Result<()> {
        require_eq!(
            self.total_weight_bps()?,
            TOTAL_WEIGHT_BPS,
            BasketVaultError::InvalidWeightTotal
        );
        Ok(())
    }

    pub fn weighted_collateral_micro_usd(&self, collateral_amounts: &[u64], now: i64) -> Result<u128> {
        require_eq!(
            collateral_amounts.len(),
            self.assets.len(),
            BasketVaultError::InvalidCollateralVector
        );

        self.assets
            .iter()
            .zip(collateral_amounts.iter())
            .try_fold(0u128, |acc, (asset, amount)| {
                if !asset.enabled {
                    return Ok(acc);
                }

                require!(asset.price_micro_usd > 0, BasketVaultError::InvalidOraclePrice);
                let age = now.saturating_sub(asset.price_updated_at);
                require!(age <= asset.price_max_age_secs, BasketVaultError::StaleOraclePrice);

                let scale = pow10_u128(asset.decimals)?;
                let value_micro_usd = (*amount as u128)
                    .checked_mul(asset.price_micro_usd as u128)
                    .ok_or_else(|| error!(BasketVaultError::MathOverflow))?
                    .checked_div(scale)
                    .ok_or_else(|| error!(BasketVaultError::MathOverflow))?;

                let weighted = value_micro_usd
                    .checked_mul(asset.weight_bps as u128)
                    .ok_or_else(|| error!(BasketVaultError::MathOverflow))?
                    .checked_div(TOTAL_WEIGHT_BPS as u128)
                    .ok_or_else(|| error!(BasketVaultError::MathOverflow))?;

                acc.checked_add(weighted)
                    .ok_or_else(|| error!(BasketVaultError::MathOverflow))
            })
    }
}

pub fn pow10_u128(decimals: u8) -> Result<u128> {
    if decimals > 38 {
        return Err(error!(BasketVaultError::MathOverflow));
    }
    Ok(10u128.pow(decimals as u32))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_config() -> GlobalConfig {
        GlobalConfig {
            authority: Pubkey::new_unique(),
            basket_mint: Pubkey::new_unique(),
            sss_program: Pubkey::new_unique(),
            base_cr_bps: 15_000,
            crisis_cr_bps: 30_000,
            max_weight_step_bps: 500,
            default_price_max_age_secs: 60,
            max_oracle_confidence_bps: 500,
            max_mint_per_tx: 1_000_000,
            minting_paused: false,
            rebalance_cooldown_slots: 100,
            last_rebalance_slot: 0,
            emergency_mode: false,
            assets: vec![
                AssetConfig {
                    mint: Pubkey::new_unique(),
                    oracle_feed: Pubkey::new_unique(),
                    decimals: 6,
                    weight_bps: 6_000,
                    min_cr_bps: 10_000,
                    price_micro_usd: 1_000_000,
                    price_updated_at: 1_000,
                    price_max_age_secs: 60,
                    enabled: true,
                },
                AssetConfig {
                    mint: Pubkey::new_unique(),
                    oracle_feed: Pubkey::new_unique(),
                    decimals: 6,
                    weight_bps: 4_000,
                    min_cr_bps: 10_000,
                    price_micro_usd: 2_000_000,
                    price_updated_at: 1_000,
                    price_max_age_secs: 60,
                    enabled: true,
                },
            ],
            bump: 255,
        }
    }

    #[test]
    fn weighted_collateral_value_is_computed_correctly() {
        let cfg = sample_config();

        // amounts are token base units (6 decimals): 10 and 5 tokens
        let collateral_amounts = vec![10_000_000u64, 5_000_000u64];
        let value = cfg
            .weighted_collateral_micro_usd(&collateral_amounts, 1_010)
            .unwrap();

        // Asset 1: 10 * $1.00 = $10, weighted 60% => $6.00
        // Asset 2:  5 * $2.00 = $10, weighted 40% => $4.00
        // Total = $10.00 => 10_000_000 micro-USD
        assert_eq!(value, 10_000_000u128);
    }

    #[test]
    fn stale_oracle_price_is_rejected() {
        let cfg = sample_config();
        let collateral_amounts = vec![1_000_000u64, 1_000_000u64];

        let result = cfg.weighted_collateral_micro_usd(&collateral_amounts, 1_100);
        assert!(result.is_err());
    }

    #[test]
    fn effective_required_cr_uses_highest_enabled_asset_floor() {
        let mut cfg = sample_config();
        cfg.base_cr_bps = 12_000;
        cfg.crisis_cr_bps = 14_000;
        cfg.emergency_mode = false;
        cfg.assets[0].min_cr_bps = 13_000;
        cfg.assets[1].min_cr_bps = 16_000;

        assert_eq!(cfg.effective_required_cr_bps(), 16_000);
    }

    #[test]
    fn active_cr_switches_in_emergency_mode() {
        let mut cfg = sample_config();
        cfg.base_cr_bps = 15_000;
        cfg.crisis_cr_bps = 30_000;
        cfg.emergency_mode = false;
        assert_eq!(cfg.active_cr_bps(), 15_000);

        cfg.emergency_mode = true;
        assert_eq!(cfg.active_cr_bps(), 30_000);
    }
}
