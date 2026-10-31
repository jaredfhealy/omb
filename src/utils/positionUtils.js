// src/utils/positionUtils.js

function isShortPosition(position) {
  return position?.positionType === 'short' || Number(position?.costBasis || 0) < 0
}

const POSITION_SHARE_EPSILON = 1e-6

function normalizeShareCount(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) return 0
  const rounded = Math.round(parsed * 1_000_000) / 1_000_000
  return Math.abs(rounded) <= POSITION_SHARE_EPSILON ? 0 : rounded
}

export function getSoldShares(position) {
  if (!position) return 0
  const totalShares = normalizeShareCount(position.shares || 0)
  const soldSharesRaw = normalizeShareCount(position.soldShares || 0)
  if (soldSharesRaw > 0) {
    if (Math.abs(totalShares - soldSharesRaw) <= POSITION_SHARE_EPSILON || soldSharesRaw > totalShares) {
      return totalShares
    }
    return Math.min(soldSharesRaw, totalShares)
  }
  if (position.soldWeek) {
    return totalShares
  }
  return 0
}

export function getOpenShares(position) {
  const shares = normalizeShareCount(position?.shares || 0)
  const soldShares = getSoldShares(position)
  const openShares = shares - soldShares
  return openShares <= POSITION_SHARE_EPSILON ? 0 : normalizeShareCount(openShares)
}

export function getCurrentValue(position) {
  const openShares = getOpenShares(position)
  const realizedProceeds = Number(position?.sellAmount || 0)
  const unrealizedValue = Number(position?.currentPrice || 0) * openShares
  return realizedProceeds + unrealizedValue
}

export function getPerSharePL(position) {
  if (!position.shares || position.shares === 0) return 0
  return getRawPL(position) / position.shares
}

export function _getCurrentValue(position) {
  return getCurrentValue(position)
}

export function getRawPL(position) {
  if (isShortPosition(position)) {
    const entryProceeds = Math.abs(Number(position?.costBasis || 0))
    const soldShares = getSoldShares(position)
    const totalShares = Number(position?.shares || 0)
    const openShares = Math.max(totalShares - soldShares, 0)
    const coverCost = Number(position?.sellAmount || 0)
    const openLiability = Number(position?.currentPrice || 0) * openShares
    return entryProceeds - (coverCost + openLiability)
  }

  const currentValue = getCurrentValue(position)
  const costBasis = Number(position?.costBasis || 0)
  return currentValue - costBasis
}

export function getNetPL(position) {
  const totalProfits = Number(position?.offsettingProfits || 0)
  return getRawPL(position) + totalProfits
}

export function getNetPLPerShare(position) {
  if (!position.shares || position.shares === 0) return 0
  return getNetPL(position) / position.shares
}

export function getTotalROR(position) {
  const basis = Math.abs(Number(position?.costBasis || 0))
  if (!basis) return 0
  const netPL = getNetPL(position)
  return (netPL / basis) * 100
}

export function getWeeklyROR(position, store) {
  const totalROR = getTotalROR(position)
  const weeksHeld = getWeeksHeld(position, store)
  if (!weeksHeld || weeksHeld <= 0) return 0
  return totalROR / weeksHeld
}

export function getWeeksHeld(position, store) {
  const currentWeek = store.getCurrentWeek()
  
  if (position.soldWeek) {
    return position.soldWeek - position.assignedWeek + 1
  }
  
  return currentWeek - position.assignedWeek + 1
}