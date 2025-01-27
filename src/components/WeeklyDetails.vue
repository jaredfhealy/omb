<script setup>
import { useAppStore } from '@/stores/app'
import { computed } from 'vue'

const store = useAppStore()

const getAssignmentsTooltip = (projection) => {
  const assignments = store.getAssignmentsForWeek(projection.week)
  return `New Assignments This Week:<br>
    ${assignments.map(p => `${p.symbol}: ${p.shares} shares @ ${store.currency(p.strikePrice)}`).join('<br>')}
    <br>Total: ${store.currency(projection.sharesBalanceAddedThisWeek)}`
}

// Add function to determine current week
const getCurrentWeek = computed(() => {
  const today = new Date()
  const startDate = new Date(store.activeAccount.settings.startDate)
  const diffTime = today - startDate
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.ceil(diffDays / 7)
})
</script>

<template>
  <div class="flex-grow-1 position-relative">
    <div class="table-responsive position-absolute" style="top: 0; bottom: 0; left: 0; right: 0;">
      <div class="pb-4"> <!-- Add padding wrapper -->
        <table class="table table-striped table-hover">
          <thead style="position: sticky; top: 0; z-index: 1020; background-color: white;">
            <tr>
              <th>Week #</th>
              <th>Time Period (Sun - Sat)</th>
              <th data-bs-toggle="tooltip" data-bs-title="Total cash balance and cash investments">
                Start: Cash Balance*
              </th>
              <th v-if="store.activeAccount.positions.length > 0" data-bs-toggle="tooltip"
                data-bs-title="Total cost basis of assigned positions. Weeks with new assignments marked info icon. with an info icon <i class='bi bi-info-circle ms-1'></i>.">
                Start: Shares Balance*
              </th>
              <th data-bs-toggle="tooltip"
                data-bs-title="Rows identified with an asterisk (*) have both deposit and withdrawal values.">
                Net Transaction*
              </th>
              <th>Projected Growth</th>
              <th>Actual Growth</th>
              <th data-bs-toggle="tooltip" data-bs-title="Hover over values to see trailing averages">
                Actual %ROR
              </th>
              <th data-bs-toggle="tooltip" data-bs-html="true"
                data-bs-title="Total of Cash & Cash Investments and the Cost Basis of all Stock Positions.<br><br>This will not match your brokerage balances as they calculate based on current stock price rather than original assigned price.">
                End: Total Balance*
              </th>
              <th data-bs-toggle="tooltip" data-bs-title="Rows identified with an asterisk (*) have notes.">
                Actions*
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(projection, index) in store.projections" :key="index" :class="{ 'current-week': projection.week === getCurrentWeek }">
              <td>{{ projection.week }}</td>
              <td>{{ store.weekRange(projection.week) }}</td>
              <td>{{ store.currency(projection.startBalance) }}</td>
              <td v-if="store.activeAccount.positions.length > 0">
                <span v-if="projection.sharesBalanceAddedThisWeek > 0" 
                      class="position-relative"
                      data-bs-toggle="tooltip"
                      :data-bs-html="true"
                      :data-bs-title="getAssignmentsTooltip(projection)">
                  {{ store.currency(projection.sharesBalance) }}
                  <i class="bi bi-info-circle ms-1"></i>
                </span>
                <span v-else>
                  {{ store.currency(projection.sharesBalance) }}
                </span>
              </td>
              <td>
                <div class="d-flex ">
                  <i class="bi bi-pencil-square cursor-pointer me-3"
                    @click="store.editNetTransactionFromRow(projection.week)"></i>
                  <span data-bs-toggle="tooltip" :data-bs-html="true"
                    :data-bs-title="`Deposit: ${store.currency(projection.deposit)}<br />Withdraw: (${store.currency(projection.withdrawal)})`"
                    :style="store.formatNetTransaction(projection.deposit, projection.withdrawal).style">
                    {{ store.formatNetTransaction(projection.deposit,
                      projection.withdrawal).value }}
                    {{ store.formatNetTransaction(projection.deposit,
                      projection.withdrawal).indicator }}
                  </span>
                </div>
              </td>
              <td>{{ store.currency(projection.projectedGrowth) }}</td>
              <td>
                <span v-if="projection.actualGrowth !== null" data-bs-toggle="tooltip" :data-bs-html="true"
                  :data-bs-title="`
                        Avg All: ${store.currency(projection.averageGrowth)}<br>
                        Avg to Date: ${store.currency(projection.trailingTotalGrowth)}<br>
                        Avg Last 8: ${store.currency(projection.trailing8WeekGrowth)}<br>
                        Avg Last 4: ${store.currency(projection.trailing4WeekGrowth)}
                      `">
                  {{ store.currency(projection.actualGrowth) }}
                </span>
                <span v-else>
                  {{ store.currency(0) }}
                </span>
              </td>
              <td>
                <span v-if="projection.actualROR" data-bs-toggle="tooltip" :data-bs-html="true" :data-bs-title="`
                        Avg All: ${projection.averageROR}%<br>
                        Avg to Date: ${projection.trailingTotalROR}%<br>
                        Avg Last 8: ${projection.trailing8WeekROR}%<br>
                        Avg Last 4: ${projection.trailing4WeekROR}%
                      `">
                  {{ Number(projection.actualROR).toFixed(2) }}%
                </span>
                <span v-else>
                  0%
                </span>
              </td>
              <td>{{ store.currency(projection.endBalance) }}</td>
              <td>
                <button class="btn btn-sm btn-outline-primary" @click="store.editWeekRow(projection.week)">
                  <i class="bi bi-pencil-square"></i>
                </button>
                {{ store.activeAccount.actuals.some(a => Number(a.week) ===
                  projection.week &&
                  a.notes) ? '*' : '' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style>
.current-week > td {
  background-color: rgba(198, 222, 210, 0.85) !important;
}

/* Add hover state to maintain highlighting */
.current-week:hover > td {
  background-color: rgba(198, 222, 210, 0.95) !important;
}
</style>