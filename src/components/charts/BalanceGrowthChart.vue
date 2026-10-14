<script setup>
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import annotationPlugin from 'chartjs-plugin-annotation'
import { computed, ref, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()

// Register the plugins
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, zoomPlugin, annotationPlugin)

const props = defineProps({}) // empty props
const showProjectedFuture = ref(false)

const currentWeek = computed(() => {
  const computedWeek = Number(store.getCurrentWeek() || 1)
  return Math.max(1, Math.min(computedWeek, store.projections?.length || 1))
})

const visibleProjections = computed(() => {
  if (!store.projections) return []
  if (showProjectedFuture.value) return store.projections
  return store.projections.filter(p => Number(p.week) <= currentWeek.value)
})

const balanceData = computed(() => {
  if (!store.activeAccount?.settings || !visibleProjections.value) return []
  const startDate = new Date(store.activeAccount.settings.startDate)
  return visibleProjections.value.map(p => ({
    week: `Week ${p.week}`,
    date: new Date(startDate.getTime() + (p.week - 1) * 7 * 24 * 60 * 60 * 1000),
    balance: p.endBalance,
    isActual: p.actualGrowth !== null
  }))
})

const transactionPoints = computed(() => {
  const weeklyTransactions = new Map()
  
  if (!store.activeAccount?.transactions) return { data: [], transactions: [] }
  
  store.activeAccount.transactions.forEach(t => {
    const startWeek = t.startWeek
    const endWeek = t.endWeek || store.activeAccount.projections?.length

    for (let week = startWeek; week <= endWeek; week++) {
      const weekKey = `Week ${week}`
      if (!weeklyTransactions.has(weekKey)) {
        weeklyTransactions.set(weekKey, {
          week: weekKey,
          deposits: [],
          withdrawals: [],
          style: null,
          rotation: 0,
          backgroundColor: null
        })
      }
      const weekData = weeklyTransactions.get(weekKey)
      if (t.type === 'deposit') {
        weekData.deposits.push({ amount: Number(t.amount), ongoing: !t.endWeek })
      } else {
        weekData.withdrawals.push({ amount: Number(t.amount), ongoing: !t.endWeek })
      }

      // Calculate all point styles at once
      const hasDeposits = weekData.deposits.length > 0
      const hasWithdrawals = weekData.withdrawals.length > 0
      const hasOngoing = weekData.deposits.some(d => d.ongoing) || 
                        weekData.withdrawals.some(w => w.ongoing)

      // Set style and rotation
      if (hasDeposits && hasWithdrawals) {
        weekData.style = 'circle'
        weekData.rotation = 0
        weekData.backgroundColor = hasOngoing ? 'rgba(128, 0, 128, 0.7)' : 'rgb(128, 0, 128)'
      } else if (hasDeposits) {
        weekData.style = 'triangle'
        weekData.rotation = 0
        weekData.backgroundColor = hasOngoing ? 'rgba(75, 192, 75, 0.7)' : 'rgb(75, 192, 75)'
      } else if (hasWithdrawals) {
        weekData.style = 'triangle'
        weekData.rotation = 180
        weekData.backgroundColor = hasOngoing ? 'rgba(255, 99, 132, 0.7)' : 'rgb(255, 99, 132)'
      }
    }
  })

  return {
    data: balanceData.value.map(d => {
      const weekData = weeklyTransactions.get(d.week)
      return weekData ? d.balance : null
    }),
    transactions: Array.from(weeklyTransactions.values())
  }
})

const chartData = computed(() => {
  if (!store.activeAccount?.settings) return null
  const datasets = [
    {
      label: 'Actual Balance',
      data: balanceData.value.map(d => d.isActual ? d.balance : null),
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.1,
      pointRadius: 3,
      pointHoverRadius: 5
    }
  ]

  if (showProjectedFuture.value) {
    datasets.push({
      label: 'Projected Balance',
      data: balanceData.value.map(d => !d.isActual ? d.balance : null),
      borderColor: 'rgb(153, 102, 255)',
      borderDash: [5, 5],
      tension: 0.1,
      pointRadius: 3,
      pointHoverRadius: 5
    })
  }

  datasets.push({
    label: 'Transactions',
    data: transactionPoints.value.data,
    pointStyle: (context) => {
      const weekLabel = context.chart.data.labels[context.dataIndex]
      const weekData = transactionPoints.value.transactions.find(t => t.week === weekLabel)
      if (!weekData || !transactionPoints.value.data[context.dataIndex]) return null

      return weekData.style
    },
    rotation: (context) => {
      const weekLabel = context.chart.data.labels[context.dataIndex]
      const weekData = transactionPoints.value.transactions.find(t => t.week === weekLabel)
      if (!weekData) return 0

      return weekData.rotation
    },
    pointRadius: 8,
    pointHoverRadius: 10,
    showLine: false,
    pointBackgroundColor: function(context) {
      const weekLabel = context.chart.data.labels[context.dataIndex]
      const weekData = transactionPoints.value.transactions.find(t => t.week === weekLabel)
      if (!weekData) return 'rgba(0,0,0,0)'

      return weekData.backgroundColor
    },
    order: 1
  })

  return {
    labels: balanceData.value.map(d => d.week),
    datasets
  }
})

const chartOptions = computed(() => {
  // Find the indices where years change
  const yearChanges = balanceData.value.reduce((changes, data, index) => {
    const currentDate = new Date(data.date)
    const previousDate = index > 0 ? new Date(balanceData.value[index - 1].date) : null
    
    if (previousDate && currentDate.getFullYear() !== previousDate.getFullYear()) {
      changes.push({
        index,
        year: currentDate.getFullYear()
      })
    }
    return changes
  }, [])

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top'
      },
      title: {
        display: false
      },
      tooltip: {
        callbacks: {
          title: (context) => {
            const weekLabel = context[0].label
            const weekNum = parseInt(weekLabel.split(' ')[1])
            return `${weekLabel} (${store.weekRange(weekNum, true)})`
          },
          label: (context) => {
            const weekLabel = context.chart.data.labels[context.dataIndex]
            const weekData = transactionPoints.value.transactions.find(t => t.week === weekLabel)
            
            if (context.dataset.label === 'Transactions' && weekData) {
              const labels = []
              weekData.deposits.forEach(d => {
                labels.push(`Deposit: $${d.amount.toFixed(2)}${d.ongoing ? ' (Ongoing)' : ''}`)
              })
              weekData.withdrawals.forEach(w => {
                labels.push(`Withdrawal: $${w.amount.toFixed(2)}${w.ongoing ? ' (Ongoing)' : ''}`)
              })
              return labels
            }
            return `Balance: $${context.raw.toFixed(2)}`
          }
        }
      },
      zoom: {
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true
          },
          mode: 'x',
          drag: {
            enabled: true,
            backgroundColor: 'rgba(0,0,0,0.1)'
          }
        },
        pan: {
          enabled: true,
          mode: 'x'
        }
      },
      annotation: {
        common: {
          drawTime: 'beforeDatasetsDraw'
        },
        annotations: {
          ...yearChanges.reduce((acc, change) => ({
            ...acc,
            [`yearLine-${change.year}`]: {
              type: 'line',
              xMin: change.index,
              xMax: change.index,
              yMin: '0%',
              yMax: '100%',
              borderColor: 'rgba(0, 0, 0, 0.2)',
              borderWidth: 2,
              label: {
                display: true,
                content: change.year.toString(),
                position: 'end',
                yAdjust: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: 'rgba(255, 255, 255, 0.8)',
                font: {
                  weight: 'bold'
                },
                padding: 4
              }
            }
          }), {}),
          
          // Option 2: Background zones
          ...yearChanges.reduce((acc, change, i, arr) => {
            const nextChange = arr[i + 1]
            return {
              ...acc,
              [`yearZone-${change.year}`]: {
                type: 'box',
                xMin: change.index,
                xMax: nextChange ? nextChange.index : balanceData.value.length,
                backgroundColor: i % 2 === 0 ? 'rgba(128, 128, 128, 0.05)' : 'rgba(128, 128, 128, 0)',
                borderWidth: 0,
              }
            }
          }, {})
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Balance ($)'
        },
        ticks: {
          padding: 20 // Add padding for year labels
        }
      },
      x: {
        title: {
          display: true,
          text: 'Week'
        }
      }
    }
  }
})

const resetZoom = () => {
  if (chartRef.value) {
    // Access the underlying Chart.js instance
    const chart = chartRef.value.chart
    if (chart) {
      chart.resetZoom()
    }
  }
}

const chartRef = ref(null)

defineExpose({ resetZoom })

const switchAccount = async (accountId) => {
  store.db.selectedAccountId = Number(accountId) // Ensure it's a number
  store.calculateProjections()
}
</script>

<template>
  <div v-if="store.activeAccount?.settings && store.projections?.length">
    <div class="mb-3 d-flex justify-content-between align-items-center">
      <div class="form-check">
        <input
          id="showProjectedFuture"
          v-model="showProjectedFuture"
          class="form-check-input"
          type="checkbox"
        >
        <label class="form-check-label" for="showProjectedFuture">
          Show projected future weeks
        </label>
      </div>
      <button class="btn btn-secondary" @click="resetZoom">
        Reset Zoom
      </button>
    </div>
    <div style="height: 400px;">
      <Line 
        ref="chartRef"
        :data="chartData" 
        :options="chartOptions" 
      />
    </div>
  </div>
  <div v-else class="text-center p-4">
    Loading chart data...
  </div>
</template>
