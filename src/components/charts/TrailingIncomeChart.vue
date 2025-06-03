<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { Chart, registerables } from 'chart.js'
import { Line } from 'vue-chartjs'
import { useChartData } from '@/composables/useChartData'

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

// Compute total income to date
const totalIncome = computed(() => {
  const { projections } = filteredProjectionData.value
  // Calculate the sum of all actual growth values (where not null)
  const sum = projections
    .filter(p => p.actualGrowth !== null)
    .reduce((total, p) => total + Number(p.actualGrowth || 0), 0)
  
  return sum
})
</script>

<template>
  <div class="chart-container">
    <div class="total-income-tile">
      <div class="tile-label">Total Income to Date</div>
      <div class="tile-value">{{ store.currency(totalIncome) }}</div>
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
</style>
