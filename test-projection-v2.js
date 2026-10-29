/**
 * Quick test to verify calculateProjectionsV2 logic
 * Run with: node test-projection-v2.js
 */

// Test data - simulate an account with v2 data model
const testAccount = {
  settings: {
    startDate: '2024-01-01',
    startingBalance: 10000,
    weeklyReturn: 2, // 2% per week
    years: 1
  },
  importedTransactions: [
    { week: 1, action: 'SELL', amount: 200 },
    { week: 2, action: 'DIV', amount: 50 },
    { week: 3, action: 'SELL', amount: 100 }
  ],
  cashFlows: [
    { week: 1, type: 'deposit', amount: 500 },
    { week: 2, type: 'withdrawal', amount: 100 }
  ],
  positions: [
    {
      id: 'pos1',
      symbol: 'TEST',
      shares: 100,
      costBasis: 5000, // $50/share * 100 shares
      assignedWeek: 1,
      soldWeek: 3
    }
  ]
}

// Mock brokerage format
const brokerageFormat = {
  weeklyTotalTypes: ['SELL', 'DIV', 'FEE']
}

// Import helpers
const {
  buildActualGrowthMap,
  buildPositionCollateralMap,
  buildCashFlowsMap,
  sumWithdrawals,
  getWeekDateRange,
  getWeekStatus
} = require('./src/services/projectionEngineV2')

console.log('Testing projection engine v2...\n')

// Test buildActualGrowthMap
console.log('1. Testing buildActualGrowthMap:')
const actualGrowthMap = buildActualGrowthMap(testAccount, brokerageFormat)
console.log('   Result:', Array.from(actualGrowthMap.entries()))
console.log('   Expected: [[1, 200], [2, 50], [3, 100]]')

// Test buildCashFlowsMap
console.log('\n2. Testing buildCashFlowsMap:')
const cashFlowsMap = buildCashFlowsMap(testAccount, 52)
console.log('   Week 1:', cashFlowsMap.get(1))
console.log('   Week 2:', cashFlowsMap.get(2))

// Test buildPositionCollateralMap
console.log('\n3. Testing buildPositionCollateralMap:')
const { movementByWeek } = buildPositionCollateralMap(testAccount)
console.log('   Result:', Array.from(movementByWeek.entries()))
console.log('   Expected: position opened at week 1 (5000), closed at week 3 (-5000)')

console.log('\n✓ Helper function tests complete')
