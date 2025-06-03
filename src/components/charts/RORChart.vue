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

// Chart options with percentage formatting
const chartOptions = getChartOptions('Weekly Rate of Return (ROR)', 'Rate of Return (%)', true)

// Compute ROR data for weeks with actual growth
const chartData = computed(() => {
  const { projections, labels } = filteredProjectionData.value
  
  // Use the pre-calculated ROR values directly from the data
  const rorData = projections.map(p => p.actualROR || 0)
  
  // Use pre-calculated trailing values
  const fourWeekAvg = projections.map(p => parseFloat(p.trailing4WeekRORAvg) || 0)
  const eightWeekAvg = projections.map(p => parseFloat(p.trailing8WeekRORAvg) || 0)
  
  return {
    labels,
    datasets: [
      {
        label: 'Weekly ROR (%)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 2,
        tension: 0.1,
        pointRadius: 3,
        pointBackgroundColor: 'rgba(54, 162, 235, 1)',
        data: rorData,
      },
      {
        label: '4-Week Rolling Average',
        backgroundColor: 'rgba(255, 206, 86, 0.2)',
        borderColor: 'rgba(255, 206, 86, 1)',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 3,
        pointBackgroundColor: 'rgba(255, 206, 86, 1)',
        data: fourWeekAvg
      },
      {
        label: '8-Week Rolling Average',
        backgroundColor: 'rgba(153, 102, 255, 0.2)',
        borderColor: 'rgba(153, 102, 255, 1)',
        borderWidth: 2,
        borderDash: [10, 5],
        pointRadius: 3,
        pointBackgroundColor: 'rgba(153, 102, 255, 1)',
        data: eightWeekAvg
      }
    ]
  }
})

// Compute average ROR to date
const averageROR = computed(() => {
  const { projections } = filteredProjectionData.value
  // Get all non-null ROR values
  const rorValues = projections
    .filter(p => p.actualROR !== null && p.actualROR !== undefined)
    .map(p => Number(p.actualROR || 0))
  
  // Calculate the average
  const avg = rorValues.length > 0 
    ? rorValues.reduce((total, ror) => total + ror, 0) / rorValues.length
    : 0
  
  return avg
})
</script>

<template>
  <div class="chart-container">
    <div class="total-ror-tile">
      <div class="tile-label">Average Weekly ROR to Date</div>
      <div class="tile-value">{{ averageROR.toFixed(2) }}%</div>
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

.total-ror-tile {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  padding: 10px 15px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 10;
  border: 1px solid rgba(54, 162, 235, 0.5);
}

.tile-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 2px;
}

.tile-value {
  font-size: 18px;
  font-weight: 600;
  color: rgba(54, 162, 235, 1);
}
</style>
