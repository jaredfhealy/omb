// src/utils/positionUtils.js

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
  const currentValue = getCurrentValue(position)
  const costBasis = position.costBasis
  return currentValue - costBasis
}

export function getNetPL(position) {
  const currentValue = _getCurrentValue(position)
  const costBasis = position.costBasis
  const totalProfits = position.offsettingProfits || 0
  return currentValue - costBasis + totalProfits
}

export function getNetPLPerShare(position) {
  if (!position.shares || position.shares === 0) return 0
  return getNetPL(position) / position.shares
}

export function getTotalROR(position) {
  if (!position.costBasis || position.costBasis === 0) return 0
  const netPL = getNetPL(position)
  return (netPL / position.costBasis) * 100
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