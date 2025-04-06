<script setup>
import { useAppStore } from '@/stores/app'
import { computed } from 'vue'

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
</script>

<template>
  <div class="yearly-summary-container">
    <div class="scrollable-container">
      <div class="container-fluid pb-4">
        <!-- Header Row -->
        <div class="row sticky-top header-row bg-white py-2 mb-2">
          <div class="col-12 col-xl-3">Year</div>
          <div class="col-12 col-xl-9 d-none d-xl-flex">
            <div class="col">Start Balance</div>
            <div class="col">Deposits</div>
            <div class="col">Withdrawals</div>
            <div class="col">Growth</div>
            <div class="col">End Balance</div>
            <div class="col">% Change</div>
          </div>
        </div>

        <!-- Year Cards -->
        <div v-for="(year, index) in yearlyData" :key="index" class="row mb-2">
          <div class="col-12">
            <div class="card h-100">
              <div class="card-body py-2">
                <div class="row">
                  <!-- Year Info -->
                  <div class="col-12 col-xl-3 mb-2 mb-xl-0">
                    <div class="year-combined">
                      <span class="year-number">Year {{ year.yearNumber }}</span>
                      <span class="week-count">({{ year.weeks.length }} weeks)</span>
                    </div>
                    <div class="year-range">
                      Weeks #{{ year.weekStart }}-{{ year.weekEnd }}
                    </div>
                  </div>
                  
                  <!-- Year Details - flex layout on desktop, stacked on mobile -->
                  <div class="col-12 col-xl-9">
                    <div class="row">
                      <!-- Start Balance -->
                      <div class="col-6 col-xl">
                        <div class="data-label d-xl-none">Start Balance</div>
                        <div>{{ store.currency(year.startBalance) }}</div>
                      </div>
                      
                      <!-- Deposits -->
                      <div class="col-6 col-xl">
                        <div class="data-label d-xl-none">Deposits</div>
                        <div>{{ store.currency(year.deposits) }}</div>
                      </div>
                      
                      <!-- Withdrawals -->
                      <div class="col-6 col-xl">
                        <div class="data-label d-xl-none">Withdrawals</div>
                        <div>{{ store.currency(year.withdrawals) }}</div>
                      </div>
                      
                      <!-- Growth -->
                      <div class="col-6 col-xl">
                        <div class="data-label d-xl-none">Growth</div>
                        <div>{{ store.currency(year.growth) }}</div>
                      </div>
                      
                      <!-- End Balance -->
                      <div class="col-6 col-xl">
                        <div class="data-label d-xl-none">End Balance</div>
                        <div>{{ store.currency(year.endBalance) }}</div>
                      </div>
                      
                      <!-- % Change -->
                      <div class="col-6 col-xl">
                        <div class="data-label d-xl-none">% Change</div>
                        <div>
                          {{ ((year.endBalance - year.startBalance) / year.startBalance * 100).toFixed(2) }}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.yearly-summary-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
}

.scrollable-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  height: 100%;
}

/* Alternating background colors for cards */
.yearly-summary-container .row.mb-2:nth-child(odd) .card {
  background-color: rgba(0, 0, 0, 0.05);
}

/* Subtle hover effect */
.yearly-summary-container .card:hover {
  background-color: rgba(244, 236, 192, 0.7);
}

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

/* Mobile-specific styles */
@media (max-width: 1199.98px) {
  .data-label {
    font-weight: bold;
    font-size: 0.8rem;
    margin-bottom: 0.1rem;
    color: #6c757d;
  }
  
  .card {
    margin-bottom: 0.75rem;
  }
  
  .row > [class*="col-"] {
    margin-bottom: 0.5rem;
  }
}
</style>