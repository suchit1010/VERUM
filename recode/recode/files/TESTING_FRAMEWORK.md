# Testing & Validation Framework
## Resilient Stablecoin Protocol

This document outlines the REQUIRED testing before any mainnet deployment. Skip these and you will get rekt.

---

## 1. UNIT TESTS (Foundry/Hardhat)

### 1.1 Oracle System Tests

```solidity
// test/OracleSystem.t.sol

contract OracleSystemTest is Test {
    
    function test_MultiOracleAggregation() public {
        // Setup 4 oracles with different prices
        oracle1.setPrice(1000e18); // Switchboard: $1000
        oracle2.setPrice(1001e18); // Pyth: $1001
        oracle3.setPrice(1000e18); // Chainlink: $1000
        
        (uint256 price, uint8 confidence) = protocol.getAggregatedPrice();
        
        assertEq(price, 1000.5e18); // Average of layer 1
        assertEq(confidence, 3); // HIGH confidence
    }
    
    function test_OracleDeviation_TriggersWarning() public {
        oracle1.setPrice(1000e18);
        oracle2.setPrice(1015e18); // 1.5% deviation
        
        vm.expectEmit(true, true, true, true);
        emit OracleDeviation("switchboard", "pyth", 1000e18, 1015e18);
        
        (uint256 price, uint8 confidence) = protocol.getAggregatedPrice();
        
        assertEq(confidence, 1); // LOW confidence
    }
    
    function test_SingleOracleFailure_Fallback() public {
        // Simulate Switchboard downtime
        oracle1.setStale(true);
        
        (uint256 price, uint8 confidence) = protocol.getAggregatedPrice();
        
        // Should use Layer 2 (Chainlink)
        assertEq(price, chainlink.getPrice());
        assertEq(confidence, 2); // MEDIUM
    }
    
    function test_AllOracleFailure_PausesProtocol() public {
        oracle1.setStale(true);
        oracle2.setStale(true);
        oracle3.setStale(true);
        oracle4.setStale(true);
        
        (uint256 price, uint8 confidence) = protocol.getAggregatedPrice();
        
        assertEq(confidence, 0); // CRITICAL
        assertTrue(protocol.paused());
    }
    
    function test_OracleManipulation_Detection() public {
        // Oracle says $1000, but DEX TWAP says $900
        oracle1.setPrice(1000e18);
        dexTwap.setPrice(900e18);
        
        // Should detect >3% deviation and halt
        vm.expectRevert("Oracle manipulation detected");
        protocol.getAggregatedPrice();
    }
}
```

### 1.2 Adaptive CR Tests

```solidity
contract AdaptiveCRTest is Test {
    
    function test_CR_IncreasesWithVolatility() public {
        uint256 initialCR = protocol.currentCR();
        
        // Simulate high volatility period
        protocol.updateRiskMetrics(
            0.08e18, // 8% volatility (2x normal)
            0.60e18, // 60% liquidity depth
            0.05e18  // 5% correlation
        );
        
        protocol.updateCollateralRatio();
        
        uint256 newCR = protocol.currentCR();
        assertGt(newCR, initialCR);
        
        // Verify calculation: baseCR + (0.08 * 50) = 120% + 4% = 124%
        assertApproxEqRel(newCR, 1.24e18, 0.01e18); // Within 1%
    }
    
    function test_CR_RateLimited() public {
        protocol.updateRiskMetrics(
            0.20e18, // Extreme 20% volatility
            0.20e18, // Low liquidity
            0.15e18  // High correlation
        );
        
        uint256 initialCR = protocol.currentCR(); // 130%
        protocol.updateCollateralRatio();
        uint256 newCR = protocol.currentCR();
        
        // Should only increase by max 2% per update
        assertLt(newCR - initialCR, 0.03e18); // Less than 3%
    }
    
    function test_CR_DecreasesDuringCalmMarkets() public {
        // Set very favorable conditions
        protocol.updateRiskMetrics(
            0.02e18, // Low 2% volatility
            0.95e18, // Deep liquidity
            0.01e18  // Minimal correlation
        );
        
        protocol.updateCollateralRatio();
        
        // Should be close to base CR
        assertApproxEqRel(protocol.currentCR(), 1.22e18, 0.02e18);
    }
}
```

### 1.3 Liquidation Tests

```solidity
contract LiquidationTest is Test {
    
    function test_Liquidation_RedZone_FullAmount() public {
        uint256 vaultId = _createVault(1000e18, 800e18); // HF = 1.25
        
        // Crash collateral price
        oracle.setPrice(600e18); // Now HF = 0.93 (red zone)
        
        uint256 debtBefore = protocol.vaults(vaultId).debtAmount;
        
        vm.prank(liquidator);
        protocol.liquidate(vaultId);
        
        // Full liquidation should be allowed
        uint256 debtAfter = protocol.vaults(vaultId).debtAmount;
        assertLt(debtAfter, debtBefore * 0.1e18 / 1e18); // >90% liquidated
    }
    
    function test_Liquidation_OrangeZone_PartialOnly() public {
        uint256 vaultId = _createVault(1000e18, 900e18); // HF = 1.11 (orange)
        
        uint256 debtBefore = protocol.vaults(vaultId).debtAmount;
        
        vm.prank(liquidator);
        protocol.liquidate(vaultId);
        
        uint256 debtAfter = protocol.vaults(vaultId).debtAmount;
        
        // Should liquidate max 25%
        assertGt(debtAfter, debtBefore * 0.70e18 / 1e18); // At least 70% remains
        assertLt(debtAfter, debtBefore * 0.80e18 / 1e18); // At most 80% remains
    }
    
    function test_Liquidation_CircuitBreaker() public {
        // Create 150 liquidatable vaults
        for (uint i = 0; i < 150; i++) {
            _createVault(1000e18, 900e18);
        }
        
        // Crash price
        oracle.setPrice(600e18);
        
        // Liquidate 100 vaults (at limit)
        for (uint i = 0; i < 100; i++) {
            protocol.liquidate(i);
        }
        
        // 101st should fail
        vm.expectRevert("Circuit breaker: too many liquidations");
        protocol.liquidate(100);
        
        // After 1 hour, should work again
        vm.warp(block.timestamp + 1 hours);
        protocol.liquidate(100); // Success
    }
    
    function test_Liquidation_PenaltyDistribution() public {
        uint256 vaultId = _createVault(1000e18, 800e18);
        oracle.setPrice(600e18); // Red zone
        
        uint256 insuranceBefore = protocol.insuranceFund();
        uint256 liquidatorBalBefore = collateral.balanceOf(liquidator);
        
        vm.prank(liquidator);
        protocol.liquidate(vaultId);
        
        uint256 insuranceAfter = protocol.insuranceFund();
        uint256 liquidatorBalAfter = collateral.balanceOf(liquidator);
        
        // Verify 30% went to insurance, 50% to liquidator, 20% burned
        uint256 penalty = 100e18; // Example penalty
        assertApproxEqRel(insuranceAfter - insuranceBefore, penalty * 30 / 100, 0.01e18);
        assertApproxEqRel(liquidatorBalAfter - liquidatorBalBefore, penalty * 50 / 100, 0.01e18);
    }
}
```

---

## 2. INTEGRATION TESTS (Real Oracle Data)

### 2.1 Historical Crisis Replay

```python
# scripts/test_crisis_scenarios.py

import json
from datetime import datetime, timedelta

class CrisisSimulator:
    """Replay historical crises with actual price data"""
    
    def test_covid_crash_march_2020(self):
        """
        March 12-13, 2020: ETH dropped from $190 to $90 in 48 hours
        Test if protocol maintains peg during 50% collateral crash
        """
        print("=== COVID CRASH SIMULATION ===")
        
        # Load actual ETH price data from March 2020
        eth_prices = self.load_historical_prices("ETH", "2020-03-12", "2020-03-14")
        
        # Setup initial state
        protocol = self.deploy_protocol()
        vault_id = protocol.create_vault(
            collateral_amount=10000,  # 10,000 ETH
            mint_amount=1_000_000     # $1M stablecoin
        )
        
        initial_hf = protocol.calculate_health_factor(vault_id)
        print(f"Initial Health Factor: {initial_hf:.2f}")
        
        # Replay hour by hour
        liquidation_events = []
        peg_deviations = []
        
        for hour, price in enumerate(eth_prices):
            protocol.oracle.set_price(price)
            protocol.update_collateral_ratio()
            
            hf = protocol.calculate_health_factor(vault_id)
            peg_price = protocol.get_peg_price()
            
            print(f"Hour {hour}: ETH=${price:.2f}, HF={hf:.3f}, Peg=${peg_price:.4f}")
            
            if hf < 1.05:
                protocol.liquidate(vault_id)
                liquidation_events.append((hour, hf, price))
            
            if abs(peg_price - 1.0) > 0.02:
                peg_deviations.append((hour, peg_price))
        
        # Verify success criteria
        assert len(peg_deviations) < len(eth_prices) * 0.1, "Peg deviated >2% for >10% of time"
        assert protocol.insurance_fund > 0, "Insurance fund depleted"
        print(f"✓ COVID Crash Test PASSED")
        print(f"  - Liquidations: {len(liquidation_events)}")
        print(f"  - Max peg deviation: {max(abs(p-1.0) for _, p in peg_deviations):.4f}")
    
    def test_ftx_collapse_nov_2022(self):
        """
        Nov 8-9, 2022: BTC dropped from $20,000 to $16,000 in 24h
        Multiple cascading failures (FTX, Alameda, BlockFi)
        """
        print("\n=== FTX COLLAPSE SIMULATION ===")
        
        btc_prices = self.load_historical_prices("BTC", "2022-11-08", "2022-11-10")
        
        protocol = self.deploy_protocol()
        
        # Create multiple vaults with different health factors
        vaults = []
        for i in range(100):
            vault_id = protocol.create_vault(
                collateral_amount=100,  # 100 BTC each
                mint_amount=1_000_000 * random.uniform(0.7, 0.9)  # Varying leverage
            )
            vaults.append(vault_id)
        
        total_liquidations = 0
        cascade_detected = False
        
        for hour, price in enumerate(btc_prices):
            protocol.oracle.set_price(price)
            
            liquidations_this_hour = 0
            for vault_id in vaults:
                hf = protocol.calculate_health_factor(vault_id)
                if hf < 1.05:
                    try:
                        protocol.liquidate(vault_id)
                        liquidations_this_hour += 1
                    except Exception as e:
                        if "Circuit breaker" in str(e):
                            print(f"Hour {hour}: Circuit breaker triggered!")
                            cascade_detected = True
                            break
            
            total_liquidations += liquidations_this_hour
            print(f"Hour {hour}: Price=${price:.0f}, Liquidations={liquidations_this_hour}")
        
        assert cascade_detected, "Circuit breaker should have triggered"
        assert protocol.get_peg_price() > 0.98, "Peg dropped below $0.98"
        print(f"✓ FTX Collapse Test PASSED")
        print(f"  - Total liquidations: {total_liquidations}")
        print(f"  - Circuit breaker activated: {cascade_detected}")
```

### 2.2 Oracle Failure Scenarios

```python
def test_oracle_manipulation_attempt(self):
    """
    Simulate attacker trying to manipulate a single oracle
    """
    print("\n=== ORACLE MANIPULATION TEST ===")
    
    protocol = self.deploy_protocol()
    
    # Normal state: all oracles agree on $1000
    protocol.switchboard.set_price(1000)
    protocol.pyth.set_price(1000)
    protocol.chainlink.set_price(1000)
    
    # Attacker compromises Switchboard oracle
    protocol.switchboard.set_price(1500)  # +50% fake pump
    
    # Protocol should detect deviation and ignore manipulated oracle
    aggregated_price, confidence = protocol.get_aggregated_price()
    
    assert abs(aggregated_price - 1000) < 10, f"Price should be ~$1000, got ${aggregated_price}"
    assert confidence <= 2, "Confidence should be reduced"
    
    print(f"✓ Oracle Manipulation Test PASSED")
    print(f"  - Aggregated price: ${aggregated_price:.2f} (ignored fake $1500)")
    print(f"  - Confidence: {confidence}/3")

def test_chainlink_extended_downtime(self):
    """
    Chainlink nodes go offline for 30 minutes (actual incident: April 2023)
    """
    print("\n=== CHAINLINK DOWNTIME TEST ===")
    
    protocol = self.deploy_protocol()
    
    # Switchboard and Pyth still working
    for minute in range(30):
        protocol.switchboard.set_price(1000 + minute)  # Slight price movement
        protocol.pyth.set_price(1000 + minute)
        protocol.chainlink.set_stale(True)  # No updates
        
        price, confidence = protocol.get_aggregated_price()
        
        # Should fall back to Layer 1 only
        assert price > 0, f"Price should still be available at minute {minute}"
        assert confidence >= 1, "Should have at least LOW confidence"
    
    print(f"✓ Chainlink Downtime Test PASSED")
    print(f"  - Protocol operated for 30 minutes on Layer 1 only")
```

---

## 3. STRESS TESTS (Extreme Scenarios)

### 3.1 Black Swan Event Simulation

```python
def test_90_percent_crash_1_hour(self):
    """
    Extreme scenario: 90% collateral crash in 1 hour
    (Worse than any historical event)
    """
    print("\n=== 90% CRASH STRESS TEST ===")
    
    protocol = self.deploy_protocol()
    
    # Start with healthy positions
    vault_id = protocol.create_vault(
        collateral_amount=10000,
        mint_amount=1_000_000,
        initial_price=1000
    )
    
    initial_hf = protocol.calculate_health_factor(vault_id)
    print(f"Initial HF: {initial_hf:.2f}")
    
    # Simulate crash minute by minute
    for minute in range(60):
        price = 1000 * (1 - 0.015 * minute)  # -1.5% per minute
        protocol.oracle.set_price(price)
        
        hf = protocol.calculate_health_factor(vault_id)
        peg = protocol.get_peg_price()
        
        if hf < 1.0:
            # Position should be liquidated
            protocol.liquidate(vault_id)
            print(f"Minute {minute}: Liquidated at price=${price:.2f}")
            break
    
    # Check final state
    final_peg = protocol.get_peg_price()
    bad_debt = protocol.get_bad_debt()
    insurance = protocol.insurance_fund()
    
    print(f"\nFinal State:")
    print(f"  - Peg price: ${final_peg:.4f}")
    print(f"  - Bad debt: ${bad_debt:,.2f}")
    print(f"  - Insurance fund: ${insurance:,.2f}")
    
    # Success criteria
    assert final_peg > 0.95, "Peg should stay above $0.95 even in 90% crash"
    assert bad_debt < insurance * 1.5, "Bad debt should not exceed 150% of insurance"
    
    print(f"✓ 90% Crash Test PASSED")

def test_multiple_consecutive_black_swans(self):
    """
    Multiple crisis events in sequence:
    1. 50% crash (like COVID)
    2. Partial recovery
    3. 40% crash again (like FTX)
    4. Oracle failure during crash
    """
    print("\n=== CONSECUTIVE BLACK SWANS TEST ===")
    
    protocol = self.deploy_protocol()
    vault_id = protocol.create_vault(10000, 1_000_000)
    
    # Event 1: COVID-style crash
    print("Event 1: 50% crash...")
    for i in range(48):
        price = 1000 - (500 * i / 48)
        protocol.oracle.set_price(price)
        time.sleep(0.1)  # Simulate real-time
    
    assert protocol.get_peg_price() > 0.98
    print("  ✓ Survived Event 1")
    
    # Brief recovery
    protocol.oracle.set_price(700)
    time.sleep(5)
    
    # Event 2: FTX-style crash during recovery
    print("Event 2: 40% crash from recovery...")
    for i in range(24):
        price = 700 - (280 * i / 24)
        protocol.oracle.set_price(price)
    
    assert protocol.get_peg_price() > 0.96
    print("  ✓ Survived Event 2")
    
    # Event 3: Oracle failure during Event 2
    print("Event 3: Oracle failure during crash...")
    protocol.chainlink.set_stale(True)
    protocol.oracle.set_price(300)  # Continue crash
    
    # Should still function on backup oracles
    price, confidence = protocol.get_aggregated_price()
    assert price > 0
    assert confidence >= 1
    
    print(f"✓ Consecutive Black Swans Test PASSED")
```

---

## 4. PERFORMANCE BENCHMARKS

### 4.1 Gas Optimization Tests

```solidity
function test_GasUsage_CreateVault() public {
    uint256 gasBefore = gasleft();
    protocol.createVault(1000e18, 800e18);
    uint256 gasUsed = gasBefore - gasleft();
    
    // Should be under 200k gas
    assertLt(gasUsed, 200_000);
    console.log("createVault gas:", gasUsed);
}

function test_GasUsage_Liquidation() public {
    uint256 vaultId = _createVault(1000e18, 900e18);
    oracle.setPrice(600e18);
    
    uint256 gasBefore = gasleft();
    protocol.liquidate(vaultId);
    uint256 gasUsed = gasBefore - gasleft();
    
    // Should be under 300k gas
    assertLt(gasUsed, 300_000);
    console.log("liquidate gas:", gasUsed);
}
```

### 4.2 Oracle Response Time

```python
def test_oracle_aggregation_speed(self):
    """
    Measure time to aggregate from 4 oracles
    Target: <500ms for Layer 1 aggregation
    """
    protocol = self.deploy_protocol()
    
    times = []
    for _ in range(100):
        start = time.time()
        price, confidence = protocol.get_aggregated_price()
        elapsed = time.time() - start
        times.append(elapsed)
    
    avg_time = sum(times) / len(times)
    p95_time = sorted(times)[95]
    
    assert avg_time < 0.5, f"Average time {avg_time:.3f}s exceeds 500ms"
    assert p95_time < 1.0, f"P95 time {p95_time:.3f}s exceeds 1s"
    
    print(f"Oracle Aggregation Performance:")
    print(f"  - Average: {avg_time*1000:.0f}ms")
    print(f"  - P95: {p95_time*1000:.0f}ms")
```

---

## 5. SECURITY AUDITS

### 5.1 Required Audits Before Mainnet

1. **Smart Contract Security**:
   - Trail of Bits (required)
   - OpenZeppelin or Consensys Diligence (choose one)
   - Internal review by team with MakerDAO experience

2. **Oracle System**:
   - Chainlink security review
   - Independent oracle manipulation testing
   - Economic attack modeling

3. **Game Theory**:
   - Liquidation incentive analysis
   - MEV extraction vulnerability assessment
   - Governance attack vectors

### 5.2 Bug Bounty Program

Launch with $500k+ bounty for:
- Critical: $100k (loss of funds, protocol brick)
- High: $25k (peg break >5%, oracle manipulation)
- Medium: $5k (partial liquidation failures)

---

## 6. TESTNET DEPLOYMENT CHECKLIST

### Goerli/Sepolia Deployment (4 weeks)

**Week 1: Setup**
- [ ] Deploy all contracts
- [ ] Configure 4-layer oracle system
- [ ] Setup keeper bots for CR updates
- [ ] Initialize insurance fund

**Week 2: Controlled Testing**
- [ ] Create 100 test vaults
- [ ] Simulate normal operations
- [ ] Test all liquidation scenarios
- [ ] Verify oracle failovers

**Week 3: Stress Testing**
- [ ] Run all historical crisis simulations
- [ ] Execute black swan scenarios
- [ ] Test circuit breakers
- [ ] Measure gas costs under load

**Week 4: Public Testing**
- [ ] Open to community testers
- [ ] Bug bounty on testnet
- [ ] Monitor for 7 days continuous operation
- [ ] Collect feedback and iterate

---

## 7. MAINNET LAUNCH REQUIREMENTS

### Pre-Launch Checklist

- [ ] All unit tests passing (100% coverage)
- [ ] Historical crisis simulations passed
- [ ] 2+ security audits completed
- [ ] Testnet running 30+ days without critical issues
- [ ] Insurance fund capitalized ($1M+ initial)
- [ ] Governance multisig configured (5-of-9 minimum)
- [ ] Emergency pause procedures tested
- [ ] Off-chain keeper infrastructure monitored
- [ ] Circuit breakers tested in production-like conditions

### Launch Phases

**Phase 1: Limited Launch (Week 1)**
- Max $10M TVL cap
- Whitelist for vault creation
- 24/7 monitoring

**Phase 2: Controlled Growth (Weeks 2-4)**
- Increase cap to $50M
- Open vault creation
- Add more collateral types

**Phase 3: Full Launch (Month 2+)**
- Remove TVL caps
- Activate governance
- Multi-chain expansion

---

## 8. SUCCESS METRICS

### Minimum Viable Metrics (First 90 Days)

1. **Peg Stability**: >99% of time within $0.995-$1.005
2. **Liquidation Efficiency**: 100% of red zone positions liquidated within 1 hour
3. **Oracle Uptime**: >99.9% aggregation success rate
4. **Gas Costs**: <$50 per liquidation at 50 gwei
5. **Bad Debt**: <0.1% of total supply
6. **Insurance Fund**: Maintained above 3% of supply

### Long-term Metrics (1 Year)

1. **TVL Growth**: >$100M without major incidents
2. **Peg Deviation**: Never >5% for >1 hour
3. **Zero Protocol Exploits**: No loss of user funds
4. **Governance Participation**: >20% of token holders voting

---

## CONCLUSION

This is what "mentally backtested" should actually mean:
- 10,000+ automated test cases
- Historical crisis replay with real data
- Extreme stress scenarios beyond any historical event
- Gas optimization proof
- Security audit validation
- Phased mainnet launch with caps

Skip any section and you're launching with your fingers crossed.

Complete all sections and you have a protocol that might actually survive DeFi's next crisis.
