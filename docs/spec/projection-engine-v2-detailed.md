# Projection Engine v2 - Detailed Specification

**Status**: Draft for review
**Last updated**: 2026-10-28
**Author**: Copilot + Jared

## Executive Summary

This document specifies the v2 projection engine refactor, addressing margin handling bugs and providing precise calculation steps. The engine computes weekly balance and growth metrics by:

1. Iterating 1–N weeks from account `settings.startDate`
2. Aggregating actual (imported) vs. projected growth per week
3. Tracking cash balances and position collateral requirements
4. Calculating metrics: ROR, trailing averages, end-of-week asset positioning
5. Ensuring lowest projected income is $0 (no negative returns)

---

## Section 1: Terminology & Scope

### Time Model
- **Week 1**: Starts on `settings.startDate`
- **Week N**: Ends on date `startDate + (N-1)*7 + 6 days`
- **Current week**: Contains today's date
- **Past/current weeks** use actual data; **future weeks** use projections

### Account Scope
- Each account has independent projection timeline
- Settings define: `startDate`, `startingBalance`, `weeklyReturn`, `years`
- Total weeks = `years * 52` (rounding applied to handle partial years)

### Data Sources (v2 Collections)

| Collection | Purpose | Query Filter |
|---|---|---|
| `importedTransactions` | Actual trading outcomes, fees, premiums | filtered by `week` + `action` (weeklyTotalTypes) |
| `cashFlows` | Recurring deposits/withdrawals (both actual & projected) | filtered by `startWeek`/`endWeek` range + `accountId` |
| `positions` | Open position collateral requirements | filtered by `assignedWeek`/`soldWeek` range |
| `relPositionTransactions` | Position lifecycle events (open/close/adjust) | filtered by `eventWeek` + `eventKind` |

### Output: Weekly Projection Row

```javascript
{
  week: Number,                              // 1-based week index
  
  // Cash balance tracking
  startCashBalance: Number,                  // Cash available at week start (before txns)
  deposit: Number,                           // Inbound cash this week (positive)
  withdrawal: Number,                        // Outbound cash this week (positive amount)
  withdrawalsByCategory: {                   // Breakdown of withdrawals
    income: Number,
    taxes: Number,
    other: Number
  },
  
  // Growth & Income
  actualGrowth: Number | null,               // Actual premium/fees earned this week (imported)
  projectedGrowth: Number,                   // Modeled return if no actual data
  growth: Number,                            // Selected: actual (if available) or projected
  
  // Position collateral tracking (CRITICAL FOR MARGIN FIX)
  startPositionCollateral: Number,           // Cash locked in open positions (week start)
  positionCollateralAdded: Number,           // New positions opened this week
  positionCollateralRemoved: Number,         // Positions closed this week
  endPositionCollateral: Number,             // Cash locked in open positions (week end)
  
  // Actual position data (for display)
  positionsOpened: Array,                    // New positions this week (debugging)
  positionsClosed: Array,                    // Closed positions this week (debugging)
  
  // End-of-week balances
  endBalance: Number,                        // Total liquid cash (after all txns & adjustments)
  availableBalance: Number,                  // endBalance minus endPositionCollateral (available for next positions)
  
  // ROR calculations
  actualROR: Number | null,                  // (growth / (startCashBalance + startPositionCollateral)) * 100
  projectedROR: Number,                      // (projectedGrowth / (startCashBalance + startPositionCollateral)) * 100
  ror: Number,                               // Selected: actual or projected ROR
  
  // Trailing averages (only from weeks with actual data)
  trailing4WeekGrowthTotal: Number | null,
  trailing4WeekGrowthAvg: Number | null,
  trailing8WeekGrowthAvg: Number | null,
  trailingTotalGrowthAvg: Number | null,
  
  trailing4WeekRORAvg: Number | null,
  trailing8WeekRORAvg: Number | null,
  trailingTotalRORAvg: Number | null,
  
  // Legacy fields (deprecated but kept for backward compatibility)
  averageGrowth: Number | null,              // All-time average growth (computed at end)
  averageROR: Number | null,                 // All-time average ROR (computed at end)
}
```

---

## Section 2: Core Calculation Algorithm

### 2.1 Initialization

```
for each week (1 to totalWeeks):
  actualGrowthByWeek = _buildActualGrowthMap(account)
  positionCollateralByWeek = _buildPositionCollateralMap(account)
  cashFlowsByWeek = _buildCashFlowsMap(account)
```

### 2.2 Per-Week Iteration

```
startCashBalance = startingBalance        // Week 1 only; subsequent weeks use previous endBalance

for week = 1 to totalWeeks:
  
  // Step 1: Get all impacts for this week
  weekDeposits = cashFlowsByWeek[week].deposits
  weekWithdrawals = cashFlowsByWeek[week].withdrawals (breakdown by category)
  positionCollateralAdded = positionCollateralByWeek[week].opened
  positionCollateralRemoved = positionCollateralByWeek[week].closed
  
  // Step 2: Calculate position collateral (CRITICAL: must come before balance calc)
  startPositionCollateral = sum of all positions where (assignedWeek <= week AND (soldWeek = null OR soldWeek > week))
  endPositionCollateral = startPositionCollateral + positionCollateralAdded - positionCollateralRemoved
  
  // Step 3: Validate collateral doesn't exceed balance (liquidity check)
  // NOTE: This is where margin issues surface. If endPositionCollateral > endBalance, 
  // we had a margin situation.
  
  // Step 4: Calculate growth for this week
  weekActualGrowth = actualGrowthByWeek[week] ?? null
  
  // Step 4a: Calculate projected growth based on AVAILABLE capital
  // Available = startCashBalance - startPositionCollateral (cash not tied up in positions)
  availableCapital = startCashBalance - startPositionCollateral
  weekProjectedGrowth = Math.max(0, availableCapital * (weeklyReturn / 100))  // Floor at 0
  
  // Step 4b: Choose growth
  // Use actual for past/current week; projected for future
  if (week is past or current):
    growth = weekActualGrowth ?? weekProjectedGrowth
  else:
    growth = weekProjectedGrowth  // Never use actual for future weeks
  
  // Step 5: Calculate end-of-week cash balance
  endBalance = startCashBalance 
             + weekDeposits 
             - weekWithdrawals 
             + growth
  
  // Step 6: Calculate available balance (cash not committed to positions)
  availableBalance = endBalance - endPositionCollateral
  
  // Step 7: Calculate ROR
  baseAmount = startCashBalance + startPositionCollateral  // Total capital at risk
  actualROR = (weekActualGrowth / baseAmount * 100) if weekActualGrowth exists, else null
  projectedROR = (weekProjectedGrowth / baseAmount * 100)
  ror = selected growth rate / baseAmount
  
  // Step 8: Track averages (only from weeks with actual data)
  if weekActualGrowth exists:
    add to actualGrowths array
    add to actualRORs array
  
  // Step 9: Calculate trailing windows
  last4 = actualGrowths[-4:]
  last8 = actualGrowths[-8:]
  trailing4WeekGrowthTotal = sum(last4)
  trailing4WeekGrowthAvg = avg(last4)
  trailing8WeekGrowthAvg = avg(last8)
  trailingTotalGrowthAvg = avg(actualGrowths)
  
  trailing4WeekRORAvg = avg(actualRORs[-4:])
  trailing8WeekRORAvg = avg(actualRORs[-8:])
  trailingTotalRORAvg = avg(actualRORs)
  
  // Step 10: Append to projections[]
  projections.push({ week, startCashBalance, endBalance, growth, ror, ... })
  
  // Step 11: Next week's starting balance
  startCashBalance = endBalance
```

---

## Section 3: Helper Functions

### 3.1 _buildActualGrowthMap(account)

Query `account.importedTransactions`, sum by week, filter by allowed actions:

```
Output: Map<week: Number, actualGrowth: Number>

for each importedTransaction in account.importedTransactions:
  if (transaction.action NOT in brokerageFormat.weeklyTotalTypes):
    skip
  if (week = transaction.week):
    actualGrowth[week] = (actualGrowth[week] ?? 0) + transaction.amount
    
return actualGrowth
```

**Notes:**
- Only includes actions in `getBrokerageFormat(account.formatKey).weeklyTotalTypes`
- For Schwab, this typically includes: sell, sell short, buy to cover, dividend, stock split, etc.
- Amounts can be positive (credit) or negative (debit); sum directly
- Result includes only weeks with at least one matching transaction

---

### 3.2 _buildPositionCollateralMap(account)

Query `account.positions`, calculate collateral per week:

```
Output: Map<week: Number, { opened: Number, closed: Number }>

for each position in account.positions:
  assignedWeek = position.assignedWeek
  soldWeek = position.soldWeek ?? null
  collateral = position.costBasis  // Dollar amount locked in this position
  
  // Mark this position as opened
  if assignedWeek not in positionCollateralMap:
    positionCollateralMap[assignedWeek] = { opened: 0, closed: 0 }
  positionCollateralMap[assignedWeek].opened += collateral
  
  // Mark this position as closed (if sold)
  if soldWeek is not null:
    if soldWeek not in positionCollateralMap:
      positionCollateralMap[soldWeek] = { opened: 0, closed: 0 }
    positionCollateralMap[soldWeek].closed += collateral

return positionCollateralMap
```

**Critical notes:**
- `collateral` is the `position.costBasis` (not the current value or proceeds)
- For short positions, `costBasis` is typically negative; include it in sums as-is
- A position occupies collateral from `assignedWeek` to `soldWeek - 1` (inclusive)
- Margin issues occur when `endPositionCollateral > endBalance` in any week

---

### 3.3 _buildCashFlowsMap(account)

Query `account.cashFlows`, aggregate by type and category:

```
Output: Map<week: Number, { deposits: Number, withdrawals: { [category]: Number } }>

for each cashFlow in account.cashFlows:
  if (week < cashFlow.startWeek):
    skip
  if (cashFlow.endWeek is not null && week > cashFlow.endWeek):
    skip
  
  amount = cashFlow.amount
  
  if (cashFlow.type === 'deposit'):
    cashFlowsMap[week].deposits += amount
  else if (cashFlow.type === 'withdrawal'):
    if cashFlowsMap[week].withdrawals[cashFlow.category] undefined:
      cashFlowsMap[week].withdrawals[cashFlow.category] = 0
    cashFlowsMap[week].withdrawals[cashFlow.category] += amount

return cashFlowsMap
```

**Notes:**
- `startWeek` and `endWeek` are inclusive on both ends
- Recurring cash flows (e.g., weekly deposits) accumulate the same `amount` for each week in range
- Categories: `income`, `taxes`, `transfer`, `adjustment`, `realized_PL`
- All amounts should be positive; type/category determines sign interpretation

---

## Section 4: Margin Bug Root Cause & Fix

### 4.1 The Bug (Current Implementation)

In the existing code, **position collateral is not subtracted from the cash balance**. This causes:

1. **Week N**: Position is assigned (e.g., CSP selling $10K collateral)
   - Current code: `endBalance = startBalance + growth + deposits - withdrawals`
   - **Bug**: $10K collateral is never reserved from `endBalance`
   - `endBalance` is overstated by $10K

2. **Week N+1**: Same overstated balance is used as `startBalance`
   - Subsequent projections cascade the error
   - If multiple margin positions are tracked, errors compound
   - Eventually, negative balances are possible if growth is negative

3. **Margin cover periods**: When a short is covered or position is closed
   - Current code tries to back out the sale amount via `positionCloseCashByWeek`
   - But this doesn't account for the original collateral requirement
   - Logic is tangled and incomplete

### 4.2 The Fix (v2 Algorithm)

The new algorithm uses explicit **collateral tracking**:

```
startPositionCollateral = sum of costBasis for all open positions at week start
endPositionCollateral = startPositionCollateral + opened - closed

endBalance = startCashBalance + deposits - withdrawals + growth
             (Note: endBalance can go negative if growth is negative and collateral is high)

availableBalance = endBalance - endPositionCollateral
                   (If this is negative, margin is required / account is over-leveraged)
```

**Key insight**: The position `costBasis` represents the capital requirement (collateral).
- For long positions: `costBasis = entry_price * shares` (cost to acquire)
- For short positions: `costBasis` is typically negative; represents short proceeds as liability
- The projection must track this commitment through the position lifecycle

### 4.3 Validation & Safety

After each week's calculation:

```
if (endPositionCollateral > 0 && endBalance < endPositionCollateral):
  // Margin situation detected
  // Log warning or flag for UI
  // availableBalance will be negative
  console.warn(`Week ${week}: Margin required. Balance: ${endBalance}, Collateral: ${endPositionCollateral}`)
```

---

## Section 5: Concrete Example

### Setup
- `startDate`: 2026-01-01 (Wednesday, week 1 starts)
- `startingBalance`: $50,000
- `weeklyReturn`: 1.0% (1% per week)
- Account has:
  - No recurring cash flows
  - One position: short 100 shares @ $1000 = $100K collateral (negative costBasis)
  - Position assigned week 2, sold week 4
  - No actual imported transactions

### Week-by-Week Calculation

#### Week 1
```
startCashBalance = 50,000
positionCollateralMap[2].opened = -100,000 (not yet active)

deposits = 0
withdrawals = 0
positionCollateral = 0 (position not yet assigned)

growth = 50,000 * 0.01 = 500
endBalance = 50,000 + 0 - 0 + 500 = 50,500
endPositionCollateral = 0

ror = 500 / 50,000 * 100 = 1.0%
```

#### Week 2 (Position Opens)
```
startCashBalance = 50,500
positionCollateral map: [2].opened = -100,000

deposits = 0
withdrawals = 0
startPositionCollateral = 0 (position opens THIS week)
positionCollateralAdded = -100,000
endPositionCollateral = 0 + (-100,000) = -100,000

// Available capital is reduced by the short liability
availableCapital = 50,500 - (-100,000) = 150,500  // Margin available
growth = 150,500 * 0.01 = 1,505

endBalance = 50,500 + 0 - 0 + 1,505 = 52,005
availableBalance = 52,005 - (-100,000) = 152,005

ror = 1,505 / (50,500 + (-100,000)) * 100 = 1,505 / (-49,500) * 100 = -3.04%
      ^^^ Negative because short position increases risk
```

#### Week 3 (Position Held)
```
startCashBalance = 52,005
startPositionCollateral = -100,000

deposits = 0
withdrawals = 0
positionCollateralAdded = 0
endPositionCollateral = -100,000

availableCapital = 52,005 - (-100,000) = 152,005
growth = 1,520.05

endBalance = 52,005 + 0 - 0 + 1,520 = 53,525
ror = 1,520.05 / (52,005 + (-100,000)) * 100 ≈ -3.07%
```

#### Week 4 (Position Closes)
```
startCashBalance = 53,525
startPositionCollateral = -100,000

positionCollateralRemoved = -100,000  (short position closes, removes $100K liability)
endPositionCollateral = -100,000 - (-100,000) = 0

availableCapital = 53,525 - 0 = 53,525
growth = 535.25

endBalance = 53,525 + 0 - 0 + 535.25 = 54,060.25
ror = 535.25 / (53,525 + (-100,000)) * 100 ≈ -1.08%
```

#### Key Observations
1. **Week 2**: Short position creates negative collateral (liability)
2. **Weeks 2–3**: Available capital is artificially high due to short proceeds (typical margin situation)
3. **ROR is negative** weeks 2–4 because the denominator includes the short liability as a capital requirement
4. **Week 4**: Once short closes, collateral goes back to 0, normal projections resume

---

## Section 6: Edge Cases & Validation

### 6.1 Negative Projected Growth
- **Rule**: `weekProjectedGrowth` must be floored at 0
- **Reasoning**: For projection purposes, assume worst case is break-even (0%), not negative
- **Code**: `projectedGrowth = Math.max(0, availableCapital * weeklyReturn / 100)`

### 6.2 Negative End-of-Week Balance
- **Scenario**: Position closes and proceeds are less than starting balance + accumulated losses
- **Handling**: Allow negative `endBalance` (it indicates a debit/margin call scenario)
- **Warning**: Flag to UI if `endBalance < 0` for any week (data integrity alert)

### 6.3 Position Collateral Calculation for Long vs. Short
- **Long position**: `costBasis = entry_price * shares` (positive; cash outflow to buy)
- **Short position**: `costBasis = -proceeds` (negative; cash inflow from short sale, liability to repay)
- **Sum naturally**: When you add collateral for a long and short, they offset correctly

### 6.4 Rounding & Precision
- All currency values: round to 2 decimal places after each operation
- ROR percentages: round to 2 decimal places for display
- Avoid cumulative floating-point errors by rounding at boundaries

---

## Section 7: Data Validation

### 7.1 Pre-Calculation Checks

Before iterating weeks, validate:

```
1. account.settings.startDate is valid YYYY-MM-DD
2. account.settings.startingBalance >= 0
3. account.settings.weeklyReturn >= 0 (or allow negative for projections?)
4. account.settings.years > 0
5. All importedTransactions have valid week numbers
6. All positions have valid assignedWeek and optional soldWeek
7. All cashFlows have valid startWeek and optional endWeek
```

### 7.2 Post-Calculation Checks

After all weeks, validate:

```
1. projections.length === totalWeeks
2. Each projection has all required fields
3. No NaN, Infinity, or undefined values escape to output
4. trailing averages are null if insufficient data
```

---

## Section 8: Implementation Checklist

- [ ] Extract existing `_getWeeklyActualGrowthMap()`, adapt to v2 `importedTransactions` collection
- [ ] Create new `_buildPositionCollateralMap()` from v2 `positions` collection
- [ ] Create new `_buildCashFlowsMap()` from v2 `cashFlows` collection
- [ ] Refactor `calculateProjections()` main loop per Section 2.2
- [ ] Validate output row shape (Section 1, Output)
- [ ] Test with margin position example (Section 5)
- [ ] Test edge cases (Section 6)
- [ ] Run against sample account data, compare to current output (where current is correct)
- [ ] Document any output field renames or removals
- [ ] Update UI components to handle new projection row shape (if any changes)

---

## Section 9: Future Refinements

### Suggested (but out of scope for this PR)

1. **Tax lot tracking**: Currently, we use generic collateral sums. Could track individual lots for more detailed P&L per lot.

2. **Margin interest simulation**: If short positions incur margin interest, add a synthetic `cashFlows` entry for estimated interest.

3. **Multi-currency support**: Currently assumes all positions/cash flows in a single currency.

4. **Assignment event modeling**: Currently uses `assignedWeek` as a static timestamp. Could refine to explicit "open" event within a week.

5. **Dividend/corporate action modeling**: Could pull from `importedTransactions` and allocate to specific positions.

---

## Appendix: Questions for Review

1. **Negative ROR for margin positions**: Is calculating ROR with the short liability in the denominator the correct behavior? Or should we exclude negative collateral from the base amount?

2. **Zero-floor for projected growth**: Is `Math.max(0, projectedGrowth)` the right conservative assumption, or should projections allow negative growth for pessimistic scenarios?

3. **Margin detection UI**: Should the projection UI highlight or flag weeks where `endPositionCollateral > endBalance`? Or is that already handled elsewhere?

4. **Historical margin data**: If the user had margin positions in past weeks (actual data from imports), but the import doesn't explicitly mark it as margin, how should we handle collateral for those past weeks?

---

## Sign-Off

This spec is ready for review and feedback before implementation begins.
