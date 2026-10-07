<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { Chart, registerables } from 'chart.js'
import { Line } from 'vue-chartjs'
import { useChartData } from '@/composables/useChartData'
import { getOpenShares } from '@/utils/positionUtils'

// Register Chart.js components
Chart.register(...registerables)

const store = useAppStore()
const { filteredProjectionData, getChartOptions } = useChartData(store)

// Chart options
const chartOptions = getChartOptions('4-Week Trailing Total Income', 'Income ($)')

// Process data for 4-week trailing income
const chartData = computed(() => {
  const { projections, labels } = filteredProjectionData.value
  
  // Extract income data and ensure all values are numbers - using parseFloat for consistency with other charts
  const trailingIncomeData = projections.map(p => parseFloat(p.trailing4WeekGrowthTotal || 0))
  
  return {
    labels,
    datasets: [
      {
        label: '4-Week Trailing Income ($)',
        backgroundColor: 'rgba(46, 204, 113, 0.2)',
        borderColor: 'rgba(46, 204, 113, 1)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: 'rgba(46, 204, 113, 1)',
        data: trailingIncomeData,
        tension: 0.1
      }
    ]
  }
})

const currentWeek = computed(() => {
  return store.getCurrentWeek()
})

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
  if (!Number.isNaN(snapshotTotal) && snapshotTotal > 0) {
    return snapshotTotal
  }
  if (!latestProjection.value) return 0
  return Number(latestProjection.value.endBalance || 0) + openPositionMarketAdjustment.value
})

const estimatedValueVsContributions = computed(() => {
  const startingBalance = Number(store.activeAccount?.settings?.startingBalance || 0)
  return estimatedAccountValue.value - (startingBalance + netContributionsToDate.value)
})

const recoveredValueVsContributions = computed(() => {
  // unrealizedLossTotal is negative, so subtracting it adds back the loss.
  return estimatedValueVsContributions.value - unrealizedLossTotal.value
})
</script>

<template>
  <div class="chart-container">
    <div class="total-income-tile">
      <div class="tile-label">Estimated Value vs Net Contributions</div>
      <div class="tile-value">{{ store.currency(estimatedValueVsContributions) }}</div>
      <div class="tile-subtext">
        Est. Account Value: {{ store.currency(estimatedAccountValue) }}
        <span class="mx-1">|</span>
        Net Contributions: {{ store.currency(netContributionsToDate) }}
      </div>
      <div v-if="store.activeAccount?.brokerageSnapshot?.totals?.positionsTotal" class="tile-subtext">
        Using brokerage positions snapshot as account value anchor.
      </div>
      <div class="tile-subtext">
        If Shares Recovered: {{ store.currency(recoveredValueVsContributions) }}
        <span class="mx-1">|</span>
        Unrealized Loss Total: {{ store.currency(unrealizedLossTotal) }}
      </div>
    </div>
    <Line 
      :data="chartData" 
      :options="chartOptions" 
      style="position: relative; height: 400px;"
    />
  </div>
</template>

<style scoped>
.chart-container {
  position: relative;
  height: 400px;
}

.total-income-tile {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  padding: 10px 15px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 10;
  border: 1px solid rgba(46, 204, 113, 0.5);
}

.tile-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 2px;
}

.tile-value {
  font-size: 18px;
  font-weight: 600;
  color: rgba(46, 204, 113, 1);
}

.tile-subtext {
  margin-top: 2px;
  font-size: 11px;
  color: #666;
}
</style>
