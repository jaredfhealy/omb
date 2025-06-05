// src/utils/positionUtils.js

export function perSharePL(position) {
  if (!position.shares || position.shares === 0) return 0
  const currentPrice = position.currentPrice
  const perShareCost = position.costBasis / position.shares
  return currentPrice - perShareCost
}

export function rawPL(position) {
  const currentValue = position.currentPrice ? position.currentPrice * position.shares : position.costBasis
  const costBasis = position.costBasis
  return currentValue - costBasis
}

export function netPL(position) {
  const currentValue = position.currentPrice ? position.currentPrice * position.shares : position.costBasis
  const costBasis = position.costBasis
  const totalProfits = position.offsettingProfits || 0
  return currentValue - costBasis + totalProfits
}
