// src/utils/positionUtils.js

export function getPerSharePL(position) {
  if (!position.shares || position.shares === 0) return 0
  const currentPrice = position.currentPrice
  const perShareCost = position.costBasis / position.shares
  return currentPrice - perShareCost
}

export function getRawPL(position) {
  const currentValue = position.currentPrice ? position.currentPrice * position.shares : position.costBasis
  const costBasis = position.costBasis
  return currentValue - costBasis
}

export function getNetPL(position) {
  const currentValue = position.currentPrice ? position.currentPrice * position.shares : position.costBasis
  const costBasis = position.costBasis
  const totalProfits = position.offsettingProfits || 0
  return currentValue - costBasis + totalProfits
}

export function getNetPLPerShare(position) {
  return getNetPL(position) / position.shares
}

export function getTotalROR(position) {
  const netPL = getNetPL(position)
  return (netPL / position.costBasis) * 100
}

export function getWeeklyROR(position, store) {
  const totalROR = getTotalROR(position)
  const weeksHeld = getWeeksHeld(position, store)
  
  return totalROR / weeksHeld
}

export function getWeeksHeld(position, store) {
  const currentWeek = store.getCurrentWeek()
  
  if (position.soldWeek) {
    return position.soldWeek - position.assignedWeek + 1
  }
  
  return currentWeek - position.assignedWeek + 1
}