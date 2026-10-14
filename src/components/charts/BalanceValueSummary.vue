<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { getOpenShares } from '@/utils/positionUtils'

const store = useAppStore()

const currentWeek = computed(() => store.getCurrentWeek())

const projectionsToDate = computed(() => {
  return (store.projections || []).filter(p => Number(p.week) <= currentWeek.value)
})

const netContributionsToDate = computed(() => {
  return projectionsToDate.value.reduce((total, p) => {
    return total + Number(p.deposit || 0) - Number(p.withdrawal || 0)
  }, 0)
})

const latestProjection = computed(() => {
  if (!projectionsToDate.value.length) return null
  return projectionsToDate.value[projectionsToDate.value.length - 1]
})

const openPositionMarketAdjustment = computed(() => {
  const positions = store.activeAccount?.positions || []
  return positions.reduce((total, position) => {
    const shares = Number(position.shares || 0)
    if (shares <= 0) return total

    const openShares = getOpenShares(position)
    if (openShares <= 0) return total

    const currentPrice = Number(position.currentPrice || 0)
    const marketValue = openShares * currentPrice
    const costBasis = Number(position.costBasis || 0) * (openShares / shares)
    return total + (marketValue - costBasis)
  }, 0)
})

const unrealizedLossTotal = computed(() => {
  const positions = store.activeAccount?.positions || []
  return positions.reduce((total, position) => {
    const shares = Number(position.shares || 0)
    if (shares <= 0) return total

    const openShares = getOpenShares(position)
    if (openShares <= 0) return total

    const currentPrice = Number(position.currentPrice || 0)
    const marketValue = openShares * currentPrice
    const costBasis = Number(position.costBasis || 0) * (openShares / shares)
    const unrealizedPL = marketValue - costBasis
    return unrealizedPL < 0 ? total + unrealizedPL : total
  }, 0)
})

const estimatedAccountValue = computed(() => {
  const snapshotTotal = Number(store.activeAccount?.brokerageSnapshot?.totals?.positionsTotal)
  if (!Number.isNaN(snapshotTotal) && snapshotTotal > 0) return snapshotTotal

  if (!latestProjection.value) return 0
  return Number(latestProjection.value.endBalance || 0) + openPositionMarketAdjustment.value
})

const estimatedValueVsContributions = computed(() => {
  const startingBalance = Number(store.activeAccount?.settings?.startingBalance || 0)
  return estimatedAccountValue.value - (startingBalance + netContributionsToDate.value)
})

const recoveredValueVsContributions = computed(() => {
  return estimatedValueVsContributions.value - unrealizedLossTotal.value
})
</script>

<template>
  <div class="value-summary-card">
    <div class="summary-grid">
      <div class="summary-row value-loss-row">
        <div class="summary-key">Value w/ Unrealized Losses</div>
        <div class="summary-value">{{ store.currency(estimatedValueVsContributions) }}</div>
      </div>
      <div class="summary-row value-recovered-row">
        <div class="summary-key">Value if Recovered</div>
        <div class="summary-value">{{ store.currency(recoveredValueVsContributions) }}</div>
      </div>
      <div class="summary-row">
        <div class="summary-key">Unrealized Loss Total</div>
        <div class="summary-aux-value">{{ store.currency(unrealizedLossTotal) }}</div>
      </div>
      <div class="summary-row">
        <div class="summary-key">Estimated Account Value</div>
        <div class="summary-aux-value">{{ store.currency(estimatedAccountValue) }}</div>
      </div>
      <div class="summary-row">
        <div class="summary-key">Net Contributions</div>
        <div class="summary-aux-value">{{ store.currency(netContributionsToDate) }}</div>
      </div>
    </div>
    <div v-if="store.activeAccount?.brokerageSnapshot?.totals?.positionsTotal" class="summary-footnote">
      Using brokerage positions snapshot as account value anchor.
    </div>
  </div>
</template>

<style scoped>
.value-summary-card {
  background-color: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 12px 16px;
  border: 1px solid rgba(153, 102, 255, 0.4);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}

.summary-grid {
  display: grid;
  gap: 6px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: baseline;
}

.summary-key {
  font-size: 12px;
  color: #666;
}

.summary-value {
  font-size: 16px;
  font-weight: 600;
}

.summary-aux-value {
  font-size: 13px;
  font-weight: 500;
  color: #495057;
}

.value-loss-row .summary-value {
  color: rgb(153, 102, 255);
}

.value-recovered-row .summary-value {
  color: rgb(25, 135, 84);
}

.summary-footnote {
  margin-top: 8px;
  font-size: 11px;
  color: #666;
  font-style: italic;
}
</style>
