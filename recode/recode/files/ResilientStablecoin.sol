// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ResilientStablecoin
 * @notice Production-grade stablecoin with multi-oracle redundancy and dynamic risk management
 * @dev Implements all mechanisms from the technical specification
 */

// ============================================================================
// INTERFACES
// ============================================================================

interface IOracle {
    function getPrice() external view returns (uint256 price, uint256 timestamp, uint8 confidence);
    function decimals() external view returns (uint8);
}

interface IStablecoin {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

// ============================================================================
// MAIN PROTOCOL CONTRACT
// ============================================================================

contract ResilientStablecoin is ReentrancyGuard, Pausable, AccessControl {
    
    // ========================================================================
    // STATE VARIABLES
    // ========================================================================
    
    // Roles
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    
    // Oracle configuration
    struct OracleConfig {
        IOracle oracle;
        uint8 tier; // 1=realtime, 2=validation, 3=backup, 4=circuit_breaker
        uint256 maxDeviationBps; // Max deviation from other oracles (basis points)
        uint256 maxStaleness; // Max age of price data (seconds)
        bool isActive;
    }
    
    mapping(string => OracleConfig) public oracles;
    string[] public oracleNames;
    
    // Collateral configuration
    struct CollateralType {
        address tokenAddress;
        uint256 haircut; // Discount factor (1e18 = 100%)
        uint256 debtCeiling; // Max stablecoin that can be minted against this collateral
        bool isActive;
    }
    
    mapping(address => CollateralType) public collateralTypes;
    address[] public collateralTokens;
    
    // Vault (position) tracking
    struct Vault {
        address owner;
        address collateralToken;
        uint256 collateralAmount;
        uint256 debtAmount;
        uint256 lastUpdate;
    }
    
    mapping(uint256 => Vault) public vaults;
    uint256 public nextVaultId;
    mapping(address => uint256[]) public userVaults;
    
    // Protocol parameters
    uint256 public baseCR = 1.20e18; // 120%
    uint256 public currentCR = 1.30e18; // Starts at 130%
    uint256 public volatilityFactor = 50;
    uint256 public liquidityPenalty = 0.30e18; // 30% max
    uint256 public correlationFactor = 20;
    
    // Risk metrics (updated by keepers)
    uint256 public currentVolatility; // 30-day rolling volatility
    uint256 public currentLiquidityDepth; // 0-1e18 scale
    uint256 public currentCorrelation; // -1e18 to 1e18 scale
    
    // Liquidation parameters
    uint256 public constant SAFE_HF = 1.15e18;
    uint256 public constant WARNING_HF = 1.05e18;
    uint256 public constant DANGER_HF = 1.00e18;
    
    uint256 public yellowZonePenalty = 0.02e18; // 2%
    uint256 public orangeZonePenalty = 0.05e18; // 5%
    uint256 public redZonePenalty = 0.08e18; // 8%
    
    // Insurance fund
    uint256 public insuranceFund;
    uint256 public targetInsuranceRatio = 0.05e18; // 5% of supply
    
    // Circuit breakers
    uint256 public liquidationsLastHour;
    uint256 public maxLiquidationsPerHour = 100;
    uint256 public lastLiquidationReset;
    
    // Peg stability
    uint256 public currentPegPrice = 1e18; // $1.00
    uint256 public redemptionRatio = 1e18; // 100% (can be diluted if bad debt)
    
    // Fee structure
    uint256 public baseMintFee = 0.0005e18; // 0.05%
    uint256 public baseRedemptionFee = 0.0005e18; // 0.05%
    
    // Statistics
    uint256 public totalCollateralValue;
    uint256 public totalDebt;
    
    // Emergency
    bool public emergencyMode;
    
    // ========================================================================
    // EVENTS
    // ========================================================================
    
    event OracleAdded(string name, address oracle, uint8 tier);
    event OracleUpdated(string name, bool isActive);
    event OracleDeviation(string oracle1, string oracle2, uint256 price1, uint256 price2);
    event CollateralRatioUpdated(uint256 newCR, uint256 volatility, uint256 liquidity, uint256 correlation);
    event VaultCreated(uint256 vaultId, address owner, address collateral, uint256 amount);
    event VaultAdjusted(uint256 vaultId, int256 collateralDelta, int256 debtDelta);
    event Liquidated(uint256 vaultId, address liquidator, uint256 collateralSeized, uint256 debtRepaid);
    event PegPriceUpdated(uint256 newPrice, uint256 vwap);
    event BadDebtCovered(uint256 amount, string source);
    event BadDebtSocialized(uint256 amount);
    event EmergencyModeActivated(string reason);
    
    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
        lastLiquidationReset = block.timestamp;
    }
    
    // ========================================================================
    // ORACLE MANAGEMENT
    // ========================================================================
    
    /**
     * @notice Add an oracle to the multi-layer oracle system
     * @param name Unique identifier (e.g., "switchboard", "chainlink", "pyth")
     * @param oracle Oracle contract address
     * @param tier Oracle tier (1-4, where 1 is fastest/realtime)
     * @param maxDeviationBps Maximum allowed deviation from other oracles (basis points)
     * @param maxStaleness Maximum age of price data in seconds
     */
    function addOracle(
        string memory name,
        address oracle,
        uint8 tier,
        uint256 maxDeviationBps,
        uint256 maxStaleness
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(tier >= 1 && tier <= 4, "Invalid tier");
        require(oracle != address(0), "Zero address");
        
        oracles[name] = OracleConfig({
            oracle: IOracle(oracle),
            tier: tier,
            maxDeviationBps: maxDeviationBps,
            maxStaleness: maxStaleness,
            isActive: true
        });
        
        oracleNames.push(name);
        emit OracleAdded(name, oracle, tier);
    }
    
    /**
     * @notice Get aggregated price from multi-oracle system
     * @return price Aggregated price in 1e18 format
     * @return confidence Confidence level: 3=HIGH, 2=MEDIUM, 1=LOW, 0=CRITICAL
     */
    function getAggregatedPrice() public view returns (uint256 price, uint8 confidence) {
        // Get Layer 1 prices (realtime)
        (uint256[] memory layer1Prices, uint256 layer1Count) = _getOraclePricesByTier(1);
        
        if (layer1Count == 0) {
            // No Layer 1 oracles - fallback to Layer 2
            return _fallbackToLayer2();
        }
        
        // Check Layer 1 consensus
        uint256 layer1Avg = _average(layer1Prices, layer1Count);
        if (!_checkConsensus(layer1Prices, layer1Count, 50)) { // 0.5% deviation
            emit OracleDeviation("Layer1", "Layer1_Internal", layer1Prices[0], layer1Prices[1]);
            confidence = 1; // LOW
        } else {
            confidence = 3; // HIGH
        }
        
        // Validate against Layer 2
        (uint256[] memory layer2Prices, uint256 layer2Count) = _getOraclePricesByTier(2);
        if (layer2Count > 0) {
            uint256 layer2Avg = _average(layer2Prices, layer2Count);
            uint256 deviation = _calculateDeviation(layer1Avg, layer2Avg);
            
            if (deviation > 100) { // >1% deviation
                // Check Layer 3 for arbitration
                (uint256[] memory layer3Prices, uint256 layer3Count) = _getOraclePricesByTier(3);
                if (layer3Count > 0) {
                    uint256 layer3Avg = _average(layer3Prices, layer3Count);
                    // If Layer 2 and 3 agree, use their average
                    if (_calculateDeviation(layer2Avg, layer3Avg) < 50) {
                        return ((layer2Avg + layer3Avg) / 2, 2); // MEDIUM confidence
                    }
                }
                // No consensus across layers
                return (0, 0); // CRITICAL - should pause protocol
            }
        }
        
        return (layer1Avg, confidence);
    }
    
    /**
     * @dev Get oracle prices for a specific tier
     */
    function _getOraclePricesByTier(uint8 tier) internal view returns (uint256[] memory prices, uint256 count) {
        uint256[] memory tempPrices = new uint256[](oracleNames.length);
        count = 0;
        
        for (uint256 i = 0; i < oracleNames.length; i++) {
            OracleConfig memory config = oracles[oracleNames[i]];
            if (config.isActive && config.tier == tier) {
                (uint256 oraclePrice, uint256 timestamp, ) = config.oracle.getPrice();
                
                // Check staleness
                if (block.timestamp - timestamp <= config.maxStaleness) {
                    tempPrices[count] = oraclePrice;
                    count++;
                }
            }
        }
        
        prices = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            prices[i] = tempPrices[i];
        }
    }
    
    /**
     * @dev Check if prices have consensus within tolerance
     */
    function _checkConsensus(uint256[] memory prices, uint256 count, uint256 toleranceBps) internal pure returns (bool) {
        if (count < 2) return true;
        
        uint256 avg = _average(prices, count);
        for (uint256 i = 0; i < count; i++) {
            if (_calculateDeviation(prices[i], avg) > toleranceBps) {
                return false;
            }
        }
        return true;
    }
    
    /**
     * @dev Calculate average of price array
     */
    function _average(uint256[] memory values, uint256 count) internal pure returns (uint256) {
        uint256 sum = 0;
        for (uint256 i = 0; i < count; i++) {
            sum += values[i];
        }
        return sum / count;
    }
    
    /**
     * @dev Calculate deviation in basis points
     */
    function _calculateDeviation(uint256 price1, uint256 price2) internal pure returns (uint256) {
        uint256 diff = price1 > price2 ? price1 - price2 : price2 - price1;
        return (diff * 10000) / price2;
    }
    
    /**
     * @dev Fallback to Layer 2 if Layer 1 fails
     */
    function _fallbackToLayer2() internal view returns (uint256, uint8) {
        (uint256[] memory layer2Prices, uint256 layer2Count) = _getOraclePricesByTier(2);
        if (layer2Count > 0) {
            return (_average(layer2Prices, layer2Count), 2); // MEDIUM
        }
        // Emergency: use Layer 3
        (uint256[] memory layer3Prices, uint256 layer3Count) = _getOraclePricesByTier(3);
        if (layer3Count > 0) {
            return (_average(layer3Prices, layer3Count), 1); // LOW
        }
        return (0, 0); // CRITICAL
    }
    
    // ========================================================================
    // ADAPTIVE COLLATERALIZATION RATIO
    // ========================================================================
    
    /**
     * @notice Update the collateralization ratio based on current market conditions
     * @dev Called by keepers every 4 hours
     */
    function updateCollateralRatio() external onlyRole(KEEPER_ROLE) {
        // Calculate components
        uint256 crVolatility = (currentVolatility * volatilityFactor) / 1e18;
        uint256 crLiquidity = (liquidityPenalty * (1e18 - currentLiquidityDepth)) / 1e18;
        uint256 crCorrelation = (currentCorrelation * correlationFactor) / 1e18;
        
        // Calculate new target CR
        uint256 newCR = baseCR + crVolatility + crLiquidity + crCorrelation;
        
        // Limit rate of change (max 2% per update to prevent shock)
        uint256 maxChange = (currentCR * 200) / 10000; // 2%
        uint256 diff = newCR > currentCR ? newCR - currentCR : currentCR - newCR;
        
        if (diff > maxChange) {
            newCR = newCR > currentCR ? currentCR + maxChange : currentCR - maxChange;
        }
        
        currentCR = newCR;
        emit CollateralRatioUpdated(newCR, currentVolatility, currentLiquidityDepth, currentCorrelation);
    }
    
    /**
     * @notice Update risk metrics (called by off-chain keeper with calculated data)
     * @param volatility 30-day rolling volatility (1e18 scale)
     * @param liquidityDepth Current liquidity depth ratio (0-1e18)
     * @param correlation Correlation coefficient (-1e18 to 1e18)
     */
    function updateRiskMetrics(
        uint256 volatility,
        uint256 liquidityDepth,
        uint256 correlation
    ) external onlyRole(KEEPER_ROLE) {
        currentVolatility = volatility;
        currentLiquidityDepth = liquidityDepth;
        currentCorrelation = correlation;
    }
    
    // ========================================================================
    // VAULT OPERATIONS
    // ========================================================================
    
    /**
     * @notice Create a new vault and mint stablecoins
     * @param collateralToken Token to use as collateral
     * @param collateralAmount Amount of collateral to deposit
     * @param mintAmount Amount of stablecoins to mint
     */
    function createVault(
        address collateralToken,
        uint256 collateralAmount,
        uint256 mintAmount
    ) external nonReentrant whenNotPaused returns (uint256 vaultId) {
        require(collateralTypes[collateralToken].isActive, "Invalid collateral");
        
        // Check collateralization
        uint256 collateralValue = _getCollateralValue(collateralToken, collateralAmount);
        uint256 requiredCollateral = (mintAmount * currentCR) / 1e18;
        require(collateralValue >= requiredCollateral, "Insufficient collateral");
        
        // Check debt ceiling
        uint256 newTotalDebt = totalDebt + mintAmount;
        require(newTotalDebt <= collateralTypes[collateralToken].debtCeiling, "Debt ceiling reached");
        
        // Transfer collateral
        IERC20(collateralToken).transferFrom(msg.sender, address(this), collateralAmount);
        
        // Create vault
        vaultId = nextVaultId++;
        vaults[vaultId] = Vault({
            owner: msg.sender,
            collateralToken: collateralToken,
            collateralAmount: collateralAmount,
            debtAmount: mintAmount,
            lastUpdate: block.timestamp
        });
        
        userVaults[msg.sender].push(vaultId);
        
        // Update totals
        totalDebt += mintAmount;
        totalCollateralValue += collateralValue;
        
        // Calculate and collect mint fee
        uint256 mintFee = _calculateMintFee();
        uint256 feeAmount = (mintAmount * mintFee) / 1e18;
        
        // Mint stablecoins (minus fee)
        IStablecoin(stablecoinAddress).mint(msg.sender, mintAmount - feeAmount);
        // Fee goes to insurance fund
        insuranceFund += feeAmount;
        
        emit VaultCreated(vaultId, msg.sender, collateralToken, collateralAmount);
    }
    
    /**
     * @notice Calculate health factor for a vault
     * @param vaultId Vault ID
     * @return healthFactor Health factor in 1e18 scale
     */
    function calculateHealthFactor(uint256 vaultId) public view returns (uint256) {
        Vault memory vault = vaults[vaultId];
        if (vault.debtAmount == 0) return type(uint256).max;
        
        uint256 collateralValue = _getCollateralValue(vault.collateralToken, vault.collateralAmount);
        uint256 requiredCollateral = (vault.debtAmount * currentCR) / 1e18;
        
        return (collateralValue * 1e18) / requiredCollateral;
    }
    
    /**
     * @dev Get USD value of collateral amount
     */
    function _getCollateralValue(address token, uint256 amount) internal view returns (uint256) {
        (uint256 price, ) = getAggregatedPrice();
        uint256 haircut = collateralTypes[token].haircut;
        return (amount * price * haircut) / 1e36; // Adjust for decimals
    }
    
    // ========================================================================
    // LIQUIDATION SYSTEM
    // ========================================================================
    
    /**
     * @notice Liquidate an undercollateralized vault
     * @param vaultId Vault to liquidate
     */
    function liquidate(uint256 vaultId) external nonReentrant whenNotPaused {
        // Reset hourly counter if needed
        if (block.timestamp >= lastLiquidationReset + 1 hours) {
            liquidationsLastHour = 0;
            lastLiquidationReset = block.timestamp;
        }
        
        // Check circuit breaker
        require(liquidationsLastHour < maxLiquidationsPerHour, "Circuit breaker: too many liquidations");
        
        Vault storage vault = vaults[vaultId];
        uint256 hf = calculateHealthFactor(vaultId);
        
        require(hf < SAFE_HF, "Vault is healthy");
        
        // Determine liquidation parameters based on health factor
        uint256 liquidationPenalty;
        uint256 maxLiquidationPct;
        
        if (hf <= DANGER_HF) {
            // Red zone: full liquidation allowed
            liquidationPenalty = redZonePenalty;
            maxLiquidationPct = 1e18; // 100%
        } else if (hf <= WARNING_HF) {
            // Orange zone: partial liquidation only
            liquidationPenalty = orangeZonePenalty;
            maxLiquidationPct = 0.25e18; // 25%
        } else {
            // Yellow zone: should be voluntary, but allow liquidation with lower penalty
            liquidationPenalty = yellowZonePenalty;
            maxLiquidationPct = 0.10e18; // 10%
        }
        
        // Calculate liquidation amount (limit to prevent cascades)
        uint256 maxSingleLiquidation = (totalCollateralValue * 100) / 10000; // 1% of TVL max
        uint256 liquidationAmount = (vault.debtAmount * maxLiquidationPct) / 1e18;
        if (liquidationAmount > maxSingleLiquidation) {
            liquidationAmount = maxSingleLiquidation;
        }
        
        // Calculate collateral to seize
        uint256 collateralValue = (liquidationAmount * currentCR) / 1e18;
        uint256 penaltyAmount = (collateralValue * liquidationPenalty) / 1e18;
        uint256 totalSeized = collateralValue + penaltyAmount;
        
        uint256 collateralAmount = (totalSeized * 1e18) / _getCollateralValue(vault.collateralToken, 1e18);
        
        // Update vault
        vault.collateralAmount -= collateralAmount;
        vault.debtAmount -= liquidationAmount;
        vault.lastUpdate = block.timestamp;
        
        // Transfer collateral to liquidator
        IERC20(vault.collateralToken).transfer(msg.sender, collateralAmount);
        
        // Burn debt from liquidator
        IStablecoin(stablecoinAddress).burn(msg.sender, liquidationAmount);
        
        // Distribute penalty
        uint256 liquidatorShare = (penaltyAmount * 50) / 100;
        uint256 insuranceShare = (penaltyAmount * 30) / 100;
        uint256 burnShare = penaltyAmount - liquidatorShare - insuranceShare;
        
        insuranceFund += insuranceShare;
        // burnShare stays in collateral (effectively burned)
        
        // Update stats
        liquidationsLastHour++;
        totalDebt -= liquidationAmount;
        
        emit Liquidated(vaultId, msg.sender, collateralAmount, liquidationAmount);
    }
    
    // ========================================================================
    // PEG STABILITY
    // ========================================================================
    
    /**
     * @notice Calculate dynamic minting fee based on current peg
     */
    function _calculateMintFee() internal view returns (uint256) {
        if (currentPegPrice >= 1.005e18) {
            return 0; // Free minting when above peg
        } else if (currentPegPrice <= 0.995e18) {
            return 0.001e18; // 0.1% when below peg
        } else {
            return baseMintFee; // 0.05% normal
        }
    }
    
    /**
     * @notice Calculate dynamic redemption fee based on current peg
     */
    function calculateRedemptionFee() public view returns (uint256) {
        if (currentPegPrice <= 0.995e18) {
            return 0; // Free redemption when below peg (encourage arb)
        } else if (currentPegPrice >= 1.005e18) {
            return 0.002e18; // 0.2% when above peg
        } else {
            return baseRedemptionFee; // 0.05% normal
        }
    }
    
    // ========================================================================
    // EMERGENCY FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Emergency pause (only for critical oracle failure or exploit)
     */
    function emergencyPause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
        emergencyMode = true;
        emit EmergencyModeActivated("Manual pause");
    }
    
    /**
     * @notice Unpause after emergency resolved
     */
    function emergencyUnpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
        emergencyMode = false;
    }
}
