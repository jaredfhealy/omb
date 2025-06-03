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
const chartOptions = getChartOptions('Weekly Actual Growth', 'Growth Amount ($)')

// Process data for actual growth per week
const chartData = computed(() => {
  const { projections, labels } = filteredProjectionData.value
  
  // Extract data points
  const actualGrowthData = projections.map(p => p.actualGrowth)
  
  // Use pre-calculated trailing growth values
  const fourWeekAvg = projections.map(p => parseFloat(p.trailing4WeekGrowthAvg) || 0)
  const eightWeekAvg = projections.map(p => parseFloat(p.trailing8WeekGrowthAvg) || 0)
  
  return {
    labels,
    datasets: [
      {
        label: 'Actual Growth ($)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(75, 192, 192, 1)',
        data: actualGrowthData,
        tension: 0.1
      },
      {
        label: '4-Week Rolling Average',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 2,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 3,
        pointBackgroundColor: 'rgba(255, 99, 132, 1)',
        data: fourWeekAvg
      },
      {
        label: '8-Week Rolling Average',
        backgroundColor: 'rgba(255, 159, 64, 0.2)',
        borderColor: 'rgba(255, 159, 64, 1)',
        borderWidth: 2,
        borderDash: [10, 5],
        fill: false,
        pointRadius: 3,
        pointBackgroundColor: 'rgba(255, 159, 64, 1)',
        data: eightWeekAvg
      }
    ]
  }
})

// Compute average weekly growth to date
const averageWeeklyGrowth = computed(() => {
  const { projections } = filteredProjectionData.value
  // Get all non-null growth values
  const growthValues = projections
    .filter(p => p.actualGrowth !== null && p.actualGrowth !== undefined)
    .map(p => Number(p.actualGrowth || 0))
  
  // Calculate the average
  const avg = growthValues.length > 0 
    ? growthValues.reduce((total, growth) => total + growth, 0) / growthValues.length
    : 0
  
  return avg
})
</script>

<template>
  <div class="chart-container">
    <div class="avg-growth-tile">
      <div class="tile-label">Average Weekly Growth to Date</div>
      <div class="tile-value">{{ store.currency(averageWeeklyGrowth) }}</div>
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

.avg-growth-tile {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  padding: 10px 15px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 10;
  border: 1px solid rgba(75, 192, 192, 0.5);
}

.tile-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 2px;
}

.tile-value {
  font-size: 18px;
  font-weight: 600;
  color: rgba(75, 192, 192, 1);
}
</style>
