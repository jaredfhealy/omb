<script setup>
import { useAppStore } from '@/stores/app'
import { computed } from 'vue'
import DataTable from '@/components/custom/DataTable.vue'

const store = useAppStore()

// Group projections by project year (52 weeks per year)
const yearlyData = computed(() => {
  const years = []
  
  // Get the total number of years to process
  const totalYears = Math.ceil(store.projections.length / 52)
  
  for (let yearIndex = 0; yearIndex < totalYears; yearIndex++) {
    // Calculate start and end weeks for this year
    const startWeekIndex = yearIndex * 52
    const endWeekIndex = Math.min((yearIndex + 1) * 52 - 1, store.projections.length - 1)
    
    // Get the actual projections for this year
    const yearWeeks = store.projections.slice(startWeekIndex, endWeekIndex + 1)
    
    if (yearWeeks.length > 0) {
      // Create year data object
      const firstWeekOfYear = yearWeeks[0]
      const lastWeekOfYear = yearWeeks[yearWeeks.length - 1]
      
      // Get week range strings for display
      const yearStartRange = store.weekRange(firstWeekOfYear.week, true)
      const yearEndRange = store.weekRange(lastWeekOfYear.week, true)
      
      // Calculate year totals
      const deposits = yearWeeks.reduce((sum, p) => sum + p.deposit, 0)
      const withdrawals = yearWeeks.reduce((sum, p) => sum + p.withdrawal, 0)
      const growth = yearWeeks.reduce((sum, p) => {
        return sum + ((p.actualGrowth !== null) ? p.actualGrowth : p.projectedGrowth)
      }, 0)
      
      years.push({
        yearNumber: yearIndex + 1,
        description: `${yearStartRange} to ${yearEndRange}`,
        startBalance: firstWeekOfYear.startBalance,
        endBalance: lastWeekOfYear.endBalance,
        growth,
        deposits,
        withdrawals,
        weekStart: firstWeekOfYear.week,
        weekEnd: lastWeekOfYear.week,
        weeks: yearWeeks
      })
    }
  }
  
  return years
})

// Define columns for DataTable
const columns = [
  {
    key: 'year',
    header: {
      text: 'Year'
    },
    class: 'col-12 col-xl-2'
  },
  {
    key: 'startBalance',
    header: {
      text: 'Start Balance'
    },
    value: (item) => store.currency(item.startBalance)
  },
  {
    key: 'deposits',
    header: {
      text: 'Deposits'
    },
    value: (item) => store.currency(item.deposits)
  },
  {
    key: 'withdrawals',
    header: {
      text: 'Withdrawals'
    },
    value: (item) => store.currency(item.withdrawals)
  },
  {
    key: 'growth',
    header: {
      text: 'Growth',
      tooltip: 'Total growth for the year'
    },
    class: 'col-6 col-xl',
    value: (item) => store.currency(item.growth)
  },
  {
    key: 'endBalance',
    header: {
      text: 'End Balance'
    },
    value: (item) => store.currency(item.endBalance)
  },
  {
    key: 'change',
    header: {
      text: '% Change'
    },
    value: (item) => `${((item.endBalance - item.startBalance) / item.startBalance * 100).toFixed(2)}%`
  }
]
</script>

<template>
  <DataTable :items="yearlyData" :columns="columns">
    <template #year="{ item }">
      <div class="year-combined">
        <span class="year-number">Year {{ item.yearNumber }}</span>
        <span class="week-count">({{ item.weeks.length }} weeks)</span>
      </div>
      <div class="year-range">
        Weeks #{{ item.weekStart }}-{{ item.weekEnd }}
      </div>
    </template>
  </DataTable>
</template>

<style>
/* Year display styling */
.year-combined {
  display: flex;
  align-items: center;
  gap: 10px;
}

.year-number {
  font-weight: bold;
  font-size: 1.1rem;
}

.week-count {
  color: #6c757d;
  font-size: 0.85rem;
}

.year-range {
  font-size: 0.85rem;
  color: #6c757d;
  margin-top: 4px;
}
</style>