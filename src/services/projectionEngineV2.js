/**
 * Projection Engine v2 - Helper Functions
 * 
 * PURPOSE:
 * Compute weekly balance and growth metrics for an account by iterating through weeks,
 * aggregating actual (imported) vs. projected growth, tracking cash balances and position
 * collateral requirements, and calculating metrics (ROR, trailing averages, etc.).
 * 
 * This module provides the three core map-builders and main projection calculation loop.
 * See docs/spec/projection-engine-v2-detailed.md for full specification.
 * 
 * @module projectionEngineV2
 */

/**
 * Build a map of actual growth (premiums, fees, dividends) by week from imported transactions.
 * 
 * PURPOSE:
 * Query importedTransactions collection and sum amounts by week, filtering to only actions
 * that contribute to trading income (sell, dividend, etc.). This represents actual realized
 * growth (not projected).
 * 
 * ALGORITHM:
 * 1. Filter importedTransactions to only those with actions in brokerageFormat.weeklyTotalTypes
 * 2. Group by week number
 * 3. Sum amounts per week (can be positive or negative)
 * 4. Return as Map<week: Number, amount: Number>
 * 
 * CRITICAL NOTES:
 * - Only includes weeks with at least one matching transaction
 * - Amounts can be positive (credits) or negative (debits); sum directly
 * - Uses brokerageFormat config to determine which actions count toward growth
 * - Returns empty Map if no importedTransactions or no matching actions
 * 
 * SPEC REF: docs/spec/projection-engine-v2-detailed.md § 3.1
 * 
 * @param {Object} account - The account object (from store)
 * @param {string} brokerageFormat - The brokerage format configuration to use for action filtering
 * @returns {Map<number, number>} Map of week -> totalActualGrowth
 */
export function buildActualGrowthMap(account, brokerageFormat) {
  const growthByWeek = new Map()
  
  // Validate inputs
  if (!account || !Array.isArray(account.importedTransactions)) {
    return growthByWeek
  }
  
  if (!brokerageFormat || !Array.isArray(brokerageFormat.weeklyTotalTypes)) {
    return growthByWeek
  }

  // Build set of allowed actions (normalized to lowercase)
  const allowedActions = new Set(
    brokerageFormat.weeklyTotalTypes.map(action => String(action || '').trim().toLowerCase())
  )

  // Aggregate amounts by week
  account.importedTransactions.forEach(transaction => {
    // Validate week number
    const week = Number(transaction?.week)
    if (!Number.isFinite(week) || week <= 0) return

    // Check if action is allowed
    const action = String(transaction?.action || '').trim().toLowerCase()
    if (!allowedActions.has(action)) return

    // Validate amount
    const amount = Number(transaction?.amount)
    if (!Number.isFinite(amount)) return

    // Accumulate to week's total
    const current = growthByWeek.get(week) || 0
    growthByWeek.set(week, Math.round((current + amount) * 100) / 100)
  })

  return growthByWeek
}

/**
 * Build a map of position collateral requirements by week.
 * 
 * PURPOSE:
 * Query positions collection and calculate the cash (collateral) locked in each position
 * per week. This tracks position lifecycle: opened in assignedWeek, held until soldWeek.
 * 
 * ALGORITHM:
 * 1. For each position:
 *    a. Mark position as "opened" in map[assignedWeek] with collateral = position.costBasis
 *    b. If position was sold (soldWeek exists), mark as "closed" in map[soldWeek]
 * 2. For all weeks, calculate running total:
 *    startPositionCollateral[week] = sum of all open positions at week start
 *    endPositionCollateral[week] = startPositionCollateral + opened - closed for that week
 * 
 * CRITICAL NOTES:
 * - collateral = position.costBasis (includes sign: negative for shorts, positive for longs)
 * - Position occupies collateral from assignedWeek to (soldWeek - 1), inclusive
 * - Negative collateral (shorts) decreases capital requirements (increases available capital)
 * - Returns Map<week, { opened: Number, closed: Number }> for week-by-week movement
 * - Post-calculation computes cumulative startPositionCollateral per week
 * 
 * SPEC REF: docs/spec/projection-engine-v2-detailed.md § 3.2
 * 
 * @param {Object} account - The account object with positions array
 * @returns {Object} { movementByWeek: Map<number, {opened, closed}>, startByWeek: Map<number, number> }
 */
export function buildPositionCollateralMap(account) {
  const movementByWeek = new Map()
  const startByWeek = new Map()
  
  // Validate input
  if (!account || !Array.isArray(account.positions)) {
    return { movementByWeek, startByWeek }
  }

  // Step 1: Build movement map (weekly changes)
  account.positions.forEach(position => {
    const assignedWeek = Number(position?.assignedWeek)
    const soldWeek = position?.soldWeek ? Number(position.soldWeek) : null
    const collateral = Number(position?.costBasis || 0)

    if (!Number.isFinite(assignedWeek) || assignedWeek <= 0) return
    if (!Number.isFinite(collateral)) return

    // Mark position as opened
    if (!movementByWeek.has(assignedWeek)) {
      movementByWeek.set(assignedWeek, { opened: 0, closed: 0 })
    }
    const movement = movementByWeek.get(assignedWeek)
    movement.opened = Math.round((movement.opened + collateral) * 100) / 100

    // Mark position as closed (if sold)
    if (soldWeek && Number.isFinite(soldWeek) && soldWeek > assignedWeek) {
      if (!movementByWeek.has(soldWeek)) {
        movementByWeek.set(soldWeek, { opened: 0, closed: 0 })
      }
      const closeMovement = movementByWeek.get(soldWeek)
      closeMovement.closed = Math.round((closeMovement.closed + collateral) * 100) / 100
    }
  })

  // Step 2: Compute cumulative startPositionCollateral per week
  // (This is done during main iteration, so return movement map here)
  
  return { movementByWeek, startByWeek }
}

/**
 * Build a map of cash flows (deposits/withdrawals) by week.
 * 
 * PURPOSE:
 * Query cashFlows collection and aggregate deposits and withdrawals per week.
 * Handles recurring cash flows (e.g., weekly deposits) by checking startWeek/endWeek ranges.
 * 
 * ALGORITHM:
 * 1. For each cashFlow:
 *    a. Check if week is within [startWeek, endWeek] range (inclusive, endWeek nullable)
 *    b. If cashFlow.type === 'deposit', add to deposits for that week
 *    c. If cashFlow.type === 'withdrawal', add to withdrawals[category] for that week
 * 2. Return Map<week, { deposits: Number, withdrawals: { [category]: Number } }>
 * 
 * CRITICAL NOTES:
 * - startWeek and endWeek are inclusive on both ends
 * - Recurring cash flows (endWeek = null) apply to all weeks >= startWeek
 * - Withdrawal categories: 'income', 'taxes', 'transfer', 'adjustment', 'realized_PL'
 * - All amounts should be positive; type/category determines sign interpretation
 * - Returns all weeks from min(startWeek) to max week in account
 * 
 * SPEC REF: docs/spec/projection-engine-v2-detailed.md § 3.3
 * 
 * @param {Object} account - The account object with cashFlows array
 * @param {number} totalWeeks - Total number of weeks in projection (to size the result map)
 * @returns {Map<number, {deposits: number, withdrawals: object}>} Aggregated cash flows per week
 */
export function buildCashFlowsMap(account, totalWeeks) {
  const flowsByWeek = new Map()
  
  // Initialize all weeks with empty structure
  for (let week = 1; week <= totalWeeks; week++) {
    flowsByWeek.set(week, { deposits: 0, withdrawals: {} })
  }
  
  // Validate input
  // Note: In app-state, v2 cashFlows collection is normalized to 'transactions' array
  const cashFlows = Array.isArray(account?.cashFlows) ? account.cashFlows : Array.isArray(account?.transactions) ? account.transactions : []
  if (!account || cashFlows.length === 0) {
    return flowsByWeek
  }

  // Aggregate cash flows per week
  cashFlows.forEach(cashFlow => {
    const startWeek = Number(cashFlow?.startWeek)
    const endWeek = cashFlow?.endWeek ? Number(cashFlow.endWeek) : null
    const amount = Number(cashFlow?.amount || 0)
    const type = String(cashFlow?.type || '').toLowerCase()
    const category = String(cashFlow?.category || '').trim()

    if (!Number.isFinite(startWeek) || startWeek <= 0) return
    if (!Number.isFinite(amount)) return

    // Iterate through applicable weeks
    for (let week = startWeek; week <= totalWeeks; week++) {
      // Stop if we've passed the endWeek
      if (endWeek && week > endWeek) break

      const weekFlow = flowsByWeek.get(week) || { deposits: 0, withdrawals: {} }

      if (type === 'deposit') {
        weekFlow.deposits = Math.round((weekFlow.deposits + amount) * 100) / 100
      } else if (type === 'withdrawal') {
        if (!weekFlow.withdrawals[category]) {
          weekFlow.withdrawals[category] = 0
        }
        weekFlow.withdrawals[category] = Math.round((weekFlow.withdrawals[category] + amount) * 100) / 100
      }

      flowsByWeek.set(week, weekFlow)
    }
  })

  return flowsByWeek
}

/**
 * Calculate total withdrawals and category breakdown for a week.
 * 
 * PURPOSE:
 * Helper to sum all withdrawal categories into a single total amount,
 * while preserving the breakdown by category.
 * 
 * @param {Object} withdrawals - Object with category -> amount mapping
 * @returns {number} Total withdrawal amount
 */
export function sumWithdrawals(withdrawals) {
  if (!withdrawals || typeof withdrawals !== 'object') return 0
  return Object.values(withdrawals).reduce((sum, amt) => sum + (Number(amt) || 0), 0)
}

/**
 * Get the current week number based on account startDate and today's date.
 * 
 * PURPOSE:
 * Determine which week contains today's date for determining whether to use
 * actual or projected growth in the projection.
 * 
 * @param {string} startDate - Account startDate in YYYY-MM-DD format
 * @returns {number} 1-based week number (1 = week containing startDate)
 */
export function getCurrentWeek(startDate) {
  const start = new Date(startDate)
  const today = new Date()
  
  // Calculate days elapsed since startDate
  const diffTime = today - start
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  // Convert days to weeks (1-based: week 1 is days 0-6)
  const week = Math.floor(diffDays / 7) + 1
  
  return Math.max(1, week)
}

/**
 * Get the date range (start, end) for a given week number.
 * 
 * PURPOSE:
 * Calculate actual calendar dates for a week to determine if a week is in past/current/future.
 * 
 * @param {string} startDate - Account startDate in YYYY-MM-DD format
 * @param {number} weekNumber - 1-based week number
 * @returns {Object} { start: Date, end: Date }
 */
export function getWeekDateRange(startDate, weekNumber) {
  const start = new Date(startDate)
  start.setDate(start.getDate() + (weekNumber - 1) * 7)
  
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  
  return { start, end }
}

/**
 * Determine if a week is in the past, current, or future.
 * 
 * PURPOSE:
 * Decide whether to use actual or projected growth for a week:
 * - Past/current: use actual data if available, else 0
 * - Future: use projected data
 * 
 * @param {Date} weekEnd - End date of the week
 * @returns {string} 'past' | 'current' | 'future'
 */
export function getWeekStatus(weekEnd) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  weekEnd.setHours(0, 0, 0, 0)
  
  if (weekEnd < today) return 'past'
  if (weekEnd >= today) {
    const weekStart = new Date(weekEnd)
    weekStart.setDate(weekStart.getDate() - 6)
    if (today >= weekStart && today <= weekEnd) return 'current'
  }
  return 'future'
}
