// src/utils/positionUtils.js

function isShortPosition(position) {
  return position?.positionType === 'short' || Number(position?.costBasis || 0) < 0
}

export function getSoldShares(position) {
  if (!position) return 0
  if (typeof position.soldShares === 'number' && position.soldShares > 0) {
    return Math.min(position.soldShares, position.shares || 0)
  }
  if (position.soldWeek) {
    return position.shares || 0
  }
  return 0
}

export function getOpenShares(position) {
  const shares = Number(position?.shares || 0)
  const soldShares = getSoldShares(position)
  return Math.max(shares - soldShares, 0)
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