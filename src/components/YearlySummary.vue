<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()
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
          <tr v-for="summary in store.yearlyTotals" :key="summary.year">
            <td>{{ summary.year }}</td>
            <td>{{ store.currency(summary.startBalance) }}</td>
            <td>{{ store.currency(summary.totalDeposits) }}</td>
            <td>{{ store.currency(summary.totalTaxWithdrawals) }}</td>
            <td>{{ store.currency(summary.totalIncomeWithdrawals) }}</td>
            <td>{{ store.currency(summary.totalGrowth) }}</td>
            <td>{{ store.currency(summary.endBalance) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>