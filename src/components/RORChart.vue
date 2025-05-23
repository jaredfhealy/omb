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
  const fourWeekAvg = projections.map(p => parseFloat(p.trailing4WeekROR) || 0)
  const eightWeekAvg = projections.map(p => parseFloat(p.trailing8WeekROR) || 0)
  
  return {
    labels,
    datasets: [
      {
        label: 'Weekly ROR (%)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 2,
        data: rorData,
        tension: 0.1
      },
      {
        label: '4-Week Rolling Average',
        backgroundColor: 'rgba(255, 206, 86, 0.2)',
        borderColor: 'rgba(255, 206, 86, 1)',
        borderWidth: 2,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
        data: fourWeekAvg
      },
      {
        label: '8-Week Rolling Average',
        backgroundColor: 'rgba(153, 102, 255, 0.2)',
        borderColor: 'rgba(153, 102, 255, 1)',
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
