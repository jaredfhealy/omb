function toActionLower(row) {
  return String(row?.action || row?.type || '').trim().toLowerCase()
}

function toAmount(row) {
  if (row?.amount !== undefined && row?.amount !== null) return Number(row.amount || 0)
  if (row?.premium !== undefined && row?.premium !== null) return Number(row.premium || 0)
  return 0
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function isOptionSymbol(symbol) {
  return /\d{2}\/\d{2}\/\d{4}/.test(String(symbol || ''))
}

export function isIncomeAction(action) {
  const normalized = String(action || '').toLowerCase().trim()
  return [
    'bank interest',
    'credit interest',
    'qualified dividend',
    'cash dividend',
    'dividend',
    'reinvest dividend',
    'substitute inc pmt'
  ].includes(normalized)
}

export function sortRowsByDateExecution(rows, { descending = true } = {}) {
  const direction = descending ? -1 : 1
  return rows.slice().sort((a, b) => {
    const aDate = String(a?.date || '')
    const bDate = String(b?.date || '')
    if (aDate < bDate) return -1 * direction
    if (aDate > bDate) return 1 * direction

    const aOrder = Number(a?.executionOrder || 0)
    const bOrder = Number(b?.executionOrder || 0)
    return (aOrder - bOrder) * direction
  })
}

/**
 * Groups weekly transaction rows for display.
 *
 * - Matches same-context sell-to-open option rows with expired rows by symbol+quantity.
 * - Groups interest/dividend-style income rows into a single summary row per context.
 * - Keeps unmatched rows unchanged.
 */
export function groupWeekTransactions(rows, {
  groupIncome = true,
  groupSameWeekExpirations = true,
  sortDescending = true,
  contextKey = () => ''
} = {}) {
  const source = Array.isArray(rows) ? rows : []
  if (!source.length) return []

  const ascending = sortRowsByDateExecution(source, { descending: false })
    .map((row, index) => ({ ...row, _idx: index }))

  const used = new Set()
  const grouped = []
  const incomeByContext = new Map()
  const openLotsByKey = new Map()

  ascending.forEach((row) => {
    const action = toActionLower(row)
    const ctx = String(contextKey(row) || '')

    if (groupIncome && isIncomeAction(action)) {
      if (!incomeByContext.has(ctx)) incomeByContext.set(ctx, [])
      incomeByContext.get(ctx).push(row)
      used.add(row._idx)
      return
    }

    if (groupSameWeekExpirations && action === 'sell to open' && isOptionSymbol(row?.symbol)) {
      const quantity = Math.abs(Number(row?.quantity || 0))
      const key = `${ctx}|${String(row?.symbol || '').toUpperCase()}|${quantity}`
      if (!openLotsByKey.has(key)) openLotsByKey.set(key, [])
      openLotsByKey.get(key).push(row)
      return
    }

    if (groupSameWeekExpirations && action === 'expired' && isOptionSymbol(row?.symbol)) {
      const quantity = Math.abs(Number(row?.quantity || 0))
      const key = `${ctx}|${String(row?.symbol || '').toUpperCase()}|${quantity}`
      const queue = openLotsByKey.get(key) || []
      const openLeg = queue.length ? queue.shift() : null
      if (!openLeg) return

      used.add(openLeg._idx)
      used.add(row._idx)

      const openAmount = toAmount(openLeg)
      const expiredAmount = toAmount(row)
      const combinedAmount = round2(openAmount + expiredAmount)
      const netPerQty = quantity > 0 ? round2(combinedAmount / quantity) : 0

      const merged = {
        ...openLeg,
        date: row?.date || openLeg?.date || '',
        executionOrder: Number(row?.executionOrder || openLeg?.executionOrder || 0),
        action: 'weekly expiration',
        type: 'Weekly Expiration',
        description: 'Opened and expired in the same week (premium fully retained)',
        quantity: quantity || '',
        price: quantity > 0 ? netPerQty : null,
        amount: combinedAmount,
        premium: combinedAmount
      }
      grouped.push(merged)
    }
  })

  if (groupIncome) {
    Array.from(incomeByContext.entries()).forEach(([ctx, rowsInContext]) => {
      if (!rowsInContext.length) return
      const latest = rowsInContext[rowsInContext.length - 1]
      const total = round2(rowsInContext.reduce((sum, row) => sum + toAmount(row), 0))
      grouped.push({
        ...latest,
        action: 'income summary',
        type: 'Income Summary',
        symbol: '',
        description: `Interest/Dividend income (${rowsInContext.length} entries grouped)`,
        quantity: '',
        price: null,
        amount: total,
        premium: total,
        _context: ctx
      })
    })
  }

  ascending.forEach((row) => {
    if (used.has(row._idx)) return
    grouped.push({ ...row })
  })

  const sanitized = grouped.map((row) => {
    const next = { ...row }
    delete next._idx
    delete next._context
    return next
  })

  return sortRowsByDateExecution(sanitized, { descending: sortDescending })
}

function getExpirationFromSymbol(symbol, fallbackDate = '') {
  if (!symbol) return fallbackDate
  const dateMatch = String(symbol).match(/\d{2}\/\d{2}\/\d{4}/)
  return dateMatch ? dateMatch[0] : fallbackDate
}

function actionEquals(row, action) {
  return toActionLower(row) === String(action || '').toLowerCase()
}

function getNumericStrike(row) {
  if (!row || row.strike === '-' || row.strike === '' || row.strike === null || row.strike === undefined) return null
  const parsed = Number(row.strike)
  return Number.isFinite(parsed) ? parsed : null
}

function formatStrikeDisplay(strike) {
  const numeric = Number(strike)
  if (!Number.isFinite(numeric)) return String(strike || '-')
  return `$${numeric.toFixed(2)}`
}

function getRollDirectionIconClass(fromDate, toDate, fromStrike, toStrike) {
  const fromStrikeNum = Number(fromStrike)
  const toStrikeNum = Number(toStrike)
  const hasNumericStrikes = Number.isFinite(fromStrikeNum) && Number.isFinite(toStrikeNum)
  const sameExpiry = String(fromDate || '') === String(toDate || '')
  const sameStrike = hasNumericStrikes && Math.abs(fromStrikeNum - toStrikeNum) <= 1e-9

  if (sameStrike) return 'bi-arrow-right-circle-fill'
  if (!hasNumericStrikes) return 'bi-arrow-right-circle-fill'

  if (sameExpiry) {
    return toStrikeNum > fromStrikeNum ? 'bi-arrow-up-circle-fill' : 'bi-arrow-down-circle-fill'
  }

  return toStrikeNum > fromStrikeNum ? 'bi-arrow-up-right-circle-fill' : 'bi-arrow-down-right-circle-fill'
}

function getOptionCapitalRequirement(strike, quantity) {
  const strikeValue = Number(strike)
  const qtyValue = Math.abs(Number(quantity || 0))
  if (!Number.isFinite(strikeValue) || strikeValue <= 0 || !Number.isFinite(qtyValue) || qtyValue <= 0) return null
  return qtyValue * 100 * strikeValue
}

function gcd(a, b) {
  let x = Math.abs(Number(a || 0))
  let y = Math.abs(Number(b || 0))
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x || 1
}

/**
 * Applies advanced option grouping (rolls and spread closes) to rows that are already
 * normalized and optionally pre-grouped by `groupWeekTransactions`.
 */
export function groupOptionLifecycle(rows, { sortDescending = false } = {}) {
  const source = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : []
  if (!source.length) return []

  const ordered = sortRowsByDateExecution(source, { descending: false })
  const groupedRows = []
  const usedIndexes = new Set()

  const isOpenAction = (row) => actionEquals(row, 'sell to open') || actionEquals(row, 'buy to open')
  const isCloseAction = (row) => actionEquals(row, 'sell to close') || actionEquals(row, 'buy to close')

  const isCloseSpreadPair = (curr, next) => {
    const currExpiry = getExpirationFromSymbol(curr.symbol, curr.date)
    const nextExpiry = getExpirationFromSymbol(next.symbol, next.date)
    const currStrike = getNumericStrike(curr)
    const nextStrike = getNumericStrike(next)

    return (
      ((actionEquals(curr, 'sell to close') && actionEquals(next, 'buy to close')) ||
        (actionEquals(curr, 'buy to close') && actionEquals(next, 'sell to close'))) &&
      curr.account === next.account &&
      curr.date === next.date &&
      curr.ticker === next.ticker &&
      Math.abs(Number(curr.quantity || 0)) === Math.abs(Number(next.quantity || 0)) &&
      curr.contractType === next.contractType &&
      currExpiry === nextExpiry &&
      currStrike !== null &&
      nextStrike !== null &&
      currStrike !== nextStrike
    )
  }

  const isRatioSpreadPair = (curr, next) => {
    const currExpiry = getExpirationFromSymbol(curr.symbol, curr.date)
    const nextExpiry = getExpirationFromSymbol(next.symbol, next.date)
    const currStrike = getNumericStrike(curr)
    const nextStrike = getNumericStrike(next)
    const currQty = Math.abs(Number(curr.quantity || 0))
    const nextQty = Math.abs(Number(next.quantity || 0))
    const oppositeSides =
      ((actionEquals(curr, 'sell to open') && actionEquals(next, 'buy to open')) ||
      (actionEquals(curr, 'buy to open') && actionEquals(next, 'sell to open')) ||
      (actionEquals(curr, 'sell to close') && actionEquals(next, 'buy to close')) ||
      (actionEquals(curr, 'buy to close') && actionEquals(next, 'sell to close')))

    return (
      oppositeSides &&
      curr.account === next.account &&
      curr.date === next.date &&
      curr.ticker === next.ticker &&
      curr.contractType === next.contractType &&
      currExpiry === nextExpiry &&
      currStrike !== null &&
      nextStrike !== null &&
      currStrike !== nextStrike &&
      currQty > 0 &&
      nextQty > 0 &&
      currQty !== nextQty &&
      ((isOpenAction(curr) && isOpenAction(next)) || (isCloseAction(curr) && isCloseAction(next)))
    )
  }

  const hasSameDayRollPartner = (leg, legIndex, expectedPartnerType, skipIndexes = new Set()) => {
    for (let k = 0; k < ordered.length; k += 1) {
      if (k === legIndex) continue
      if (usedIndexes.has(k)) continue
      if (skipIndexes.has(k)) continue
      const candidate = ordered[k]
      const candidateIsOpen = isOpenAction(candidate)
      const candidateIsClose = isCloseAction(candidate)
      const matchesExpectedType =
        expectedPartnerType === 'open' ? candidateIsOpen
          : expectedPartnerType === 'close' ? candidateIsClose
            : false
      if (!matchesExpectedType) continue
      if (String(leg?.date || '') !== String(candidate?.date || '')) continue
      if ((leg?.account || '') !== (candidate?.account || '')) continue
      if ((leg?.ticker || '') !== (candidate?.ticker || '')) continue
      if ((leg?.contractType || '') !== (candidate?.contractType || '')) continue
      if (Math.abs(Number(leg?.quantity || 0)) !== Math.abs(Number(candidate?.quantity || 0))) continue
      return true
    }
    return false
  }

  for (let i = 0; i < ordered.length; i += 1) {
    if (usedIndexes.has(i)) continue
    const curr = ordered[i]
    let foundPair = false
    let bestRollCandidate = null
    let bestSingleWeekCandidate = null

    for (let j = i + 1; j < ordered.length; j += 1) {
      if (usedIndexes.has(j)) continue
      const next = ordered[j]

      if (isCloseSpreadPair(curr, next)) {
        const currStrike = getNumericStrike(curr)
        const nextStrike = getNumericStrike(next)
        const lowerStrike = Math.min(currStrike, nextStrike)
        const upperStrike = Math.max(currStrike, nextStrike)
        const spreadWidth = upperStrike - lowerStrike
        const netPremium = Number(curr.premium || 0) + Number(next.premium || 0)
        const expiry = getExpirationFromSymbol(curr.symbol, curr.date)
        const primaryRow = actionEquals(curr, 'sell to close') ? curr : next
        const contractCount = Math.abs(Number(curr.quantity || 0))
        const netPerQty = contractCount > 0 ? netPremium / contractCount : 0

        let ror = '-'
        if (spreadWidth > 0 && contractCount > 0) {
          const capitalAtRisk = contractCount * spreadWidth * 100
          if (capitalAtRisk > 0) {
            ror = ((netPremium / capitalAtRisk) * 100).toFixed(2)
          }
        }

        groupedRows.push({
          ...primaryRow,
          description: `Closed ${String(primaryRow.contractType || '').toLowerCase()} spread expiring ${expiry}`,
          strike: `${lowerStrike.toFixed(2)} / ${upperStrike.toFixed(2)}`,
          price: contractCount > 0 ? Number(netPerQty.toFixed(2)) : null,
          premium: netPremium.toFixed(2),
          amount: netPremium.toFixed(2),
          ror,
          capitalRequirement: spreadWidth > 0 && contractCount > 0 ? contractCount * spreadWidth * 100 : null
        })
        usedIndexes.add(i)
        usedIndexes.add(j)
        foundPair = true
        break
      }

      if (isRatioSpreadPair(curr, next)) {
        const currStrike = getNumericStrike(curr)
        const nextStrike = getNumericStrike(next)
        const lowerStrike = Math.min(currStrike, nextStrike)
        const upperStrike = Math.max(currStrike, nextStrike)
        const spreadWidth = upperStrike - lowerStrike
        const netPremium = Number(curr.premium || 0) + Number(next.premium || 0)
        const expiry = getExpirationFromSymbol(curr.symbol, curr.date)
        const currQty = Math.abs(Number(curr.quantity || 0))
        const nextQty = Math.abs(Number(next.quantity || 0))
        const dominantQty = Math.max(currQty, nextQty)
        const ratioDivisor = gcd(currQty, nextQty)
        const ratioLabel = `${Math.min(currQty, nextQty) / ratioDivisor}x${Math.max(currQty, nextQty) / ratioDivisor}`
        const primaryRow = actionEquals(curr, 'sell to open') || actionEquals(curr, 'sell to close') ? curr : next
        const netPerQty = dominantQty > 0 ? netPremium / dominantQty : 0
        const capitalRequirement = spreadWidth > 0 && dominantQty > 0 ? spreadWidth * dominantQty * 100 : null
        const ror = capitalRequirement && capitalRequirement > 0
          ? ((netPremium / capitalRequirement) * 100).toFixed(2)
          : '-'
        let ratioAction = 'ratio spread'
        let ratioType = 'Ratio Spread'
        if (isOpenAction(curr) && isOpenAction(next)) {
          ratioAction = 'ratio opened'
          ratioType = 'Ratio Opened'
        } else if (isCloseAction(curr) && isCloseAction(next)) {
          ratioAction = 'ratio closed'
          ratioType = 'Ratio Closed'
        } else {
          ratioAction = 'ratio rolled'
          ratioType = 'Ratio Rolled'
        }

        groupedRows.push({
          ...primaryRow,
          action: ratioAction,
          type: ratioType,
          description: `${ratioLabel} ${String(primaryRow.contractType || '').toLowerCase()} ratio expiring ${expiry}: ${formatStrikeDisplay(lowerStrike)} ↔ ${formatStrikeDisplay(upperStrike)}`,
          strike: `${lowerStrike.toFixed(2)} / ${upperStrike.toFixed(2)}`,
          quantity: dominantQty,
          price: dominantQty > 0 ? Number(netPerQty.toFixed(2)) : null,
          premium: netPremium.toFixed(2),
          amount: netPremium.toFixed(2),
          ratio: ratioLabel,
          ror,
          capitalRequirement
        })
        usedIndexes.add(i)
        usedIndexes.add(j)
        foundPair = true
        break
      }

      const currIsClose = isCloseAction(curr)
      const nextIsClose = isCloseAction(next)
      const currIsOpen = isOpenAction(curr)
      const nextIsOpen = isOpenAction(next)

      const isRollPair =
        ((currIsOpen && nextIsClose) || (currIsClose && nextIsOpen)) &&
        curr.account === next.account &&
        curr.date === next.date &&
        curr.ticker === next.ticker &&
        Math.abs(Number(curr.quantity || 0)) === Math.abs(Number(next.quantity || 0)) &&
        curr.contractType === next.contractType

      if (isRollPair) {
        const closeLeg = currIsClose ? curr : next
        const openLeg = currIsOpen ? curr : next
        const fromDate = getExpirationFromSymbol(closeLeg.symbol, closeLeg.date)
        const toDate = getExpirationFromSymbol(openLeg.symbol, openLeg.date)
        const sameExpiry = fromDate && toDate && fromDate === toDate
        const candidate = { j, closeLeg, openLeg, fromDate, toDate, sameExpiry, next }
        if (!bestRollCandidate || (sameExpiry && !bestRollCandidate.sameExpiry)) {
          bestRollCandidate = candidate
        }
      }

      const isSingleWeekPair =
        ((currIsOpen && nextIsClose) || (currIsClose && nextIsOpen)) &&
        curr.account === next.account &&
        curr.ticker === next.ticker &&
        curr.contractType === next.contractType &&
        Math.abs(Number(curr.quantity || 0)) === Math.abs(Number(next.quantity || 0)) &&
        String(curr.date || '') !== String(next.date || '')

      if (isSingleWeekPair) {
        const currWeek = Number(curr.week)
        const nextWeek = Number(next.week)
        const sameWeek = Number.isFinite(currWeek) && Number.isFinite(nextWeek) && currWeek > 0 && currWeek === nextWeek
        const currExpiry = getExpirationFromSymbol(curr.symbol, curr.date)
        const nextExpiry = getExpirationFromSymbol(next.symbol, next.date)
        const currStrike = getNumericStrike(curr)
        const nextStrike = getNumericStrike(next)
        const sameExpiry = currExpiry && nextExpiry && currExpiry === nextExpiry
        const sameStrike = currStrike !== null && nextStrike !== null && Math.abs(currStrike - nextStrike) <= 1e-9

        if (sameWeek && sameExpiry && sameStrike) {
          const closeLeg = currIsClose ? curr : next
          const openLeg = currIsOpen ? curr : next
          const closeLegIndex = currIsClose ? i : j
          const openLegIndex = currIsOpen ? i : j
          const skipIndexes = new Set([i, j])
          const closeHasSameDayOpen = hasSameDayRollPartner(closeLeg, closeLegIndex, 'open', skipIndexes)
          const openHasSameDayClose = hasSameDayRollPartner(openLeg, openLegIndex, 'close', skipIndexes)
          if (closeHasSameDayOpen || openHasSameDayClose) {
            continue
          }
          if (!bestSingleWeekCandidate) {
            bestSingleWeekCandidate = { j, closeLeg, openLeg, next }
          }
        }
      }
    }

    if (!foundPair && bestRollCandidate) {
      const { j, closeLeg, openLeg, fromDate, toDate, next } = bestRollCandidate

      let rollStrike = openLeg.strike
      if (curr.strike !== next.strike && curr.strike !== '-' && next.strike !== '-') {
        rollStrike = `${curr.strike} to ${next.strike}`
      }

      const fromStrike = closeLeg.strike
      const toStrike = openLeg.strike
      const rollDirectionIcon = getRollDirectionIconClass(fromDate, toDate, fromStrike, toStrike)
      const rollFromText = `${fromDate} ${formatStrikeDisplay(fromStrike)}`
      const rollToText = `${toDate} ${formatStrikeDisplay(toStrike)}`
      const rollDescription = `${rollFromText} -> ${rollToText}`

      let ror = '-'
      const openStrike = openLeg.strike !== '-' ? Number(openLeg.strike) : NaN
      const closeStrike = closeLeg.strike !== '-' ? Number(closeLeg.strike) : NaN
      const strikeForROR = Number.isFinite(openStrike) ? openStrike : (Number.isFinite(closeStrike) ? closeStrike : null)
      const sellToOpenLeg = actionEquals(curr, 'sell to open') ? curr : (actionEquals(next, 'sell to open') ? next : null)
      const sellToOpenStrike = Number(sellToOpenLeg?.strike)
      const rollCollateralStrike = Number.isFinite(sellToOpenStrike) ? sellToOpenStrike : strikeForROR
      if (strikeForROR && Number(curr.quantity || 0)) {
        const cost = Math.abs(Number(curr.quantity || 0) * strikeForROR * 100)
        if (cost > 0) {
          const premium = Number(curr.premium || 0) + Number(next.premium || 0)
          ror = ((premium / cost) * 100).toFixed(2)
        }
      }

      const premium = Number(curr.premium || 0) + Number(next.premium || 0)
      const quantityAbs = Math.abs(Number(openLeg.quantity || curr.quantity || 0))
      const netPerQty = quantityAbs > 0 ? premium / quantityAbs : 0
      groupedRows.push({
        ...openLeg,
        action: 'roll',
        type: 'Roll',
        description: rollDescription,
        price: Number(netPerQty.toFixed(2)),
        premium: premium.toFixed(2),
        amount: premium.toFixed(2),
        rollFrom: fromDate,
        rollTo: toDate,
        rollFromText,
        rollToText,
        rollDirectionIcon,
        strike: rollStrike,
        ror,
        capitalRequirement: getOptionCapitalRequirement(rollCollateralStrike, openLeg.quantity || curr.quantity || 0)
      })
      usedIndexes.add(i)
      usedIndexes.add(j)
      foundPair = true
    }

    if (!foundPair && !bestRollCandidate && bestSingleWeekCandidate) {
      const { j, closeLeg, openLeg, next } = bestSingleWeekCandidate
      const premium = Number(curr.premium || 0) + Number(next.premium || 0)
      const singleWeekQty = Math.abs(Number(openLeg.quantity || curr.quantity || 0))
      const singleWeekNetPerQty = singleWeekQty > 0 ? premium / singleWeekQty : 0
      let ror = '-'
      const strike = openLeg.strike !== '-' ? Number(openLeg.strike) : NaN
      const sellToOpenLeg = actionEquals(curr, 'sell to open') ? curr : (actionEquals(next, 'sell to open') ? next : null)
      const sellToOpenStrike = Number(sellToOpenLeg?.strike)
      const singleWeekCollateralStrike = Number.isFinite(sellToOpenStrike) ? sellToOpenStrike : strike
      if (Number.isFinite(strike) && Number(curr.quantity || 0)) {
        const cost = Math.abs(Number(curr.quantity || 0) * strike * 100)
        if (cost > 0) {
          ror = ((premium / cost) * 100).toFixed(2)
        }
      }
      groupedRows.push({
        ...openLeg,
        date: closeLeg.date || openLeg.date || '',
        action: 'single week trade',
        type: 'Single Week Trade',
        description: `Opened ${openLeg.date || ''}, closed ${closeLeg.date || ''}`,
        price: singleWeekQty > 0 ? Number(singleWeekNetPerQty.toFixed(2)) : null,
        premium: premium.toFixed(2),
        amount: premium.toFixed(2),
        ror,
        capitalRequirement: getOptionCapitalRequirement(singleWeekCollateralStrike, openLeg.quantity || curr.quantity || 0)
      })
      usedIndexes.add(i)
      usedIndexes.add(j)
      foundPair = true
    }

    if (!foundPair) {
      const nextRow = { ...curr }
      if (actionEquals(nextRow, 'buy to close')) {
        const dateMatch = String(nextRow.symbol || '').match(/\d{2}\/\d{2}\/\d{4}/)
        nextRow.description = dateMatch ? `Closed position expiring ${dateMatch[0]}` : `Bought to close on ${nextRow.date}`
      }
      if (actionEquals(nextRow, 'sell to open')) {
        const dateMatch = String(nextRow.symbol || '').match(/\d{2}\/\d{2}\/\d{4}/)
        nextRow.description = dateMatch ? `New position expiring ${dateMatch[0]}` : `Sold to open on ${nextRow.date}`
        const optionType = String(nextRow.contractType || '').toUpperCase()
        if (optionType === 'PUT' || optionType === 'CALL') {
          nextRow.action = `new short ${optionType.toLowerCase()}`
          nextRow.type = nextRow.action
        }
      }
      if (actionEquals(nextRow, 'buy to open')) {
        const dateMatch = String(nextRow.symbol || '').match(/\d{2}\/\d{2}\/\d{4}/)
        nextRow.description = dateMatch ? `New position expiring ${dateMatch[0]}` : `Bought to open on ${nextRow.date}`
        const optionType = String(nextRow.contractType || '').toUpperCase()
        if (optionType === 'PUT' || optionType === 'CALL') {
          nextRow.action = `new long ${optionType.toLowerCase()}`
          nextRow.type = nextRow.action
        }
      }

      let ror = '-'
      const strike = nextRow.strike !== '-' ? Number(nextRow.strike) : NaN
      if (Number.isFinite(strike) && Number(nextRow.quantity || 0)) {
        const cost = Math.abs(Number(nextRow.quantity || 0) * strike * 100)
        if (cost > 0) {
          ror = ((Number(nextRow.premium || 0) / cost) * 100).toFixed(2)
        }
      }

      groupedRows.push({
        ...nextRow,
        ror,
        capitalRequirement: getOptionCapitalRequirement(nextRow.strike, nextRow.quantity)
      })
    }
  }

  const sortedByAccountDate = groupedRows.sort((a, b) => {
    if ((a.account || '') < (b.account || '')) return -1
    if ((a.account || '') > (b.account || '')) return 1
    if ((a.date || '') < (b.date || '')) return -1
    if ((a.date || '') > (b.date || '')) return 1
    return Number(a.executionOrder || 0) - Number(b.executionOrder || 0)
  })

  return sortRowsByDateExecution(sortedByAccountDate, { descending: sortDescending })
}
