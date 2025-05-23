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
  const fourWeekAvg = projections.map(p => parseFloat(p.trailing4WeekGrowth) || 0)
  const eightWeekAvg = projections.map(p => parseFloat(p.trailing8WeekGrowth) || 0)
  
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
        pointRadius: 0,
        data: fourWeekAvg
      },
      {
        label: '8-Week Rolling Average',
        backgroundColor: 'rgba(255, 159, 64, 0.2)',
        borderColor: 'rgba(255, 159, 64, 1)',
        borderWidth: 2,
        borderDash: [10, 5],
        fill: false,
        pointRadius: 0,
        data: eightWeekAvg
      }
    ]
  }
})
</script>

<template>
  <div class="chart-container" style="position: relative; height: 400px;">
    <Line 
      :data="chartData" 
      :options="chartOptions" 
    />
  </div>
</template>
