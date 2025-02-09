<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
const store = useAppStore()

// Add local computed property
const yearlyTotals = computed(() => {
  const totals = []
  const weeksPerYear = 52
  const today = new Date()

  for (let year = 1; year <= store.activeAccount.settings.years; year++) {
    const startWeek = (year - 1) * weeksPerYear
    const endWeek = year * weeksPerYear
    const yearProjections = store.projections.slice(startWeek, endWeek)

    // Calculate total growth
    const totalGrowth = yearProjections.reduce((sum, p) => {
      // Get start date for this week
      const weekStartDate = new Date(store.activeAccount.settings.startDate)
      weekStartDate.setDate(weekStartDate.getDate() + (p.week - 1) * 7)

      if (p.actualGrowth && p.actualGrowth > 0) {
        // Use actual if it exists and is greater than zero
        return sum + Number(p.actualGrowth)
      } else if (weekStartDate > today && p.projectedGrowth > 0) {
        // Use projected only for future weeks
        return sum + p.projectedGrowth
      }
      return sum
    }, 0)

    const summary = {
      year,
      startBalance: yearProjections[0]?.startBalance || 0,
      totalDeposits: yearProjections.reduce((sum, p) => sum + p.deposit, 0),
      totalTaxWithdrawals: yearProjections.reduce((sum, p) => sum + p.withdrawalsByCategory.taxes, 0),
      totalIncomeWithdrawals: yearProjections.reduce((sum, p) => sum + p.withdrawalsByCategory.income, 0),
      totalGrowth,
      endBalance: yearProjections[yearProjections.length - 1]?.endBalance || 0
    }
    totals.push(summary)
  }
  return totals
})
</script>

<template>
  <div class="flex-grow-1 position-relative">
    <div class="table-responsive mt-3">
      <table class="table table-striped table-hover">
        <thead>
          <tr>
            <th>Year</th>
            <th>Start Balance</th>
            <th>Total Deposits</th>
            <th>Tax Withdrawals</th>
            <th>Income Withdrawals</th>
            <th data-bs-toggle="tooltip" data-bs-title="Estimated taxable income">
              Total Growth
            </th>
            <th>End Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="total in yearlyTotals" :key="total.year">
            <td>{{ total.year }}</td>
            <td>{{ store.currency(total.startBalance) }}</td>
            <td>{{ store.currency(total.totalDeposits) }}</td>
            <td>{{ store.currency(total.totalTaxWithdrawals) }}</td>
            <td>{{ store.currency(total.totalIncomeWithdrawals) }}</td>
            <td>{{ store.currency(total.totalGrowth) }}</td>
            <td>{{ store.currency(total.endBalance) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>