<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { getOpenShares, getSoldShares, getCurrentValue, getNetPL, getTotalROR } from '@/utils/positionUtils'

const store = useAppStore()
const selectedWeek = ref(null)
const activeTab = ref('summary')

const showModal = computed(() => selectedWeek.value !== null)

const actualWeekEntry = computed(() => {
  if (selectedWeek.value === null) return null
  return store.activeAccount?.actuals?.find(a => Number(a.week) === Number(selectedWeek.value)) || null
})

const weekRows = computed(() => {
  return Array.isArray(actualWeekEntry.value?.data) ? actualWeekEntry.value.data : []
})

const weekGrowth = computed(() => {
  const growth = actualWeekEntry.value?.growth
  return growth === null || growth === undefined ? null : Number(growth)
})

const weekNetCashFlow = computed(() => {
  return weekRows.value.reduce((sum, row) => {
    const amount = Number(row?.amount)
    return Number.isFinite(amount) ? sum + amount : sum
  }, 0)
})

const projectionWeek = computed(() => {
  if (selectedWeek.value === null) return null
  return store.projections.find(p => Number(p.week) === Number(selectedWeek.value)) || null
})

const rowSummary = computed(() => {
  const projection = projectionWeek.value
  if (!projection) return null

  const startCash = Number(projection.startBalance || 0)
  const netTransaction = Number(projection.deposit || 0) - Number(projection.withdrawal || 0)
  const startSharesBalance = Number(projection.startSharesBalance || 0)
  const strategyPL = projection.actualGrowth !== null && projection.actualGrowth !== undefined
    ? Number(projection.actualGrowth)
    : Number(projection.projectedGrowth || 0)
  const endTotal = Number(projection.endBalance || 0)
  const priorWeekSharesNet = Number(projection.sharesSoldPreviousWeek || 0) - Number(projection.sharesBoughtPreviousWeek || 0)

  return {
    startCash,
    netTransaction,
    startSharesBalance,
    strategyPL,
    endTotal,
    priorWeekSharesNet
  }
})

const positionsHeldForWeek = computed(() => {
  if (selectedWeek.value === null) return []
  const week = Number(selectedWeek.value)
  const positions = Array.isArray(store.activeAccount?.positions) ? store.activeAccount.positions : []

  return positions
    .filter((position) => {
      const assignedWeek = Number(position.assignedWeek)
      const soldWeek = position.soldWeek === null || position.soldWeek === undefined
        ? null
        : Number(position.soldWeek)
      if (!Number.isFinite(assignedWeek)) return false
      if (assignedWeek > week) return false
      if (soldWeek !== null && Number.isFinite(soldWeek) && soldWeek < week) return false
      return true
    })
    .sort((a, b) => {
      if ((a.symbol || '') < (b.symbol || '')) return -1
      if ((a.symbol || '') > (b.symbol || '')) return 1
      return Number(a.assignedWeek || 0) - Number(b.assignedWeek || 0)
    })
})

function getAssignedDate(position) {
  if (position?.date) return position.date
  const week = Number(position?.assignedWeek)
  if (!Number.isFinite(week) || week <= 0) return ''
  const rangeText = store.weekRange(week, true)
  return rangeText?.split(' - ')?.[0] || ''
}

const positionsSnapshot = computed(() => {
  const positions = positionsHeldForWeek.value
  const totalCostBasis = positions.reduce((sum, p) => sum + Number(p.costBasis || 0), 0)
  const totalValue = positions.reduce((sum, p) => sum + Number(getCurrentValue(p) || 0), 0)
  return {
    count: positions.length,
    totalCostBasis,
    totalValue
  }
})

const show = (week) => {
  selectedWeek.value = Number(week)
  activeTab.value = 'summary'
}

const close = () => {
  selectedWeek.value = null
}

store.showWeeklyRawDataModal = (week) => show(week)
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': showModal }" v-if="showModal">
    <div class="modal-dialog modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h5 class="modal-title mb-1">Week {{ selectedWeek }} Snapshot</h5>
            <div class="small text-muted">
              {{ store.weekRange(selectedWeek, true) }}
              <span class="mx-1">|</span>
              Strategy P/L:
              <span :class="weekGrowth !== null && weekGrowth < 0 ? 'text-danger' : ''">
                {{ weekGrowth !== null ? store.currency(weekGrowth) : 'N/A' }}
              </span>
              <span class="mx-1">|</span>
              Net Cash Flow:
              <span :class="weekNetCashFlow < 0 ? 'text-danger' : ''">
                {{ store.currency(weekNetCashFlow) }}
              </span>
            </div>
          </div>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <ul class="nav nav-tabs mb-3" role="tablist">
            <li class="nav-item" role="presentation">
              <button
                type="button"
                class="nav-link"
                :class="{ active: activeTab === 'summary' }"
                role="tab"
                :aria-selected="activeTab === 'summary'"
                @click="activeTab = 'summary'"
              >
                Summary & Positions
                <span class="badge text-bg-secondary ms-1">{{ positionsSnapshot.count }}</span>
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button
                type="button"
                class="nav-link"
                :class="{ active: activeTab === 'transactions' }"
                role="tab"
                :aria-selected="activeTab === 'transactions'"
                @click="activeTab = 'transactions'"
              >
                Transactions
                <span class="badge text-bg-secondary ms-1">{{ weekRows.length }}</span>
              </button>
            </li>
          </ul>

          <div class="tab-content">
          <div class="tab-pane fade" :class="{ 'show active': activeTab === 'summary' }" role="tabpanel">
            <div v-if="rowSummary" class="calculation-summary card border-0 bg-body-tertiary mb-3">
              <div class="card-body py-2">
                <div class="small text-muted fw-semibold mb-2">Weekly row calculation summary</div>
                <div class="small mb-2">
                  Starting Cash already includes prior week shares net:
                  <span :class="rowSummary.priorWeekSharesNet < 0 ? 'text-danger' : 'text-success'">
                    {{ store.currency(rowSummary.priorWeekSharesNet) }}
                  </span>
                </div>
                <div class="calc-line">
                  <span>Starting Cash</span>
                  <span>{{ store.currency(rowSummary.startCash) }}</span>
                </div>
                <div class="calc-line">
                  <span>+ Net Transactions</span>
                  <span :class="rowSummary.netTransaction < 0 ? 'text-danger' : ''">{{ store.currency(rowSummary.netTransaction) }}</span>
                </div>
                <div class="calc-line">
                  <span>+ Start Shares Balance</span>
                  <span>{{ store.currency(rowSummary.startSharesBalance) }}</span>
                </div>
                <div class="calc-line">
                  <span>+ Strategy P/L</span>
                  <span :class="rowSummary.strategyPL < 0 ? 'text-danger' : ''">{{ store.currency(rowSummary.strategyPL) }}</span>
                </div>
                <div class="calc-line calc-total">
                  <span>= End Total</span>
                  <span>{{ store.currency(rowSummary.endTotal) }}</span>
                </div>
              </div>
            </div>

            <div class="positions-summary small text-muted mb-2">
              Positions held this week: <strong>{{ positionsSnapshot.count }}</strong>
              <span class="mx-2">|</span>
              Total Cost Basis: <strong>{{ store.currency(positionsSnapshot.totalCostBasis) }}</strong>
              <span class="mx-2">|</span>
              Current Value: <strong>{{ store.currency(positionsSnapshot.totalValue) }}</strong>
            </div>
            <div v-if="!positionsHeldForWeek.length" class="alert alert-secondary mb-0">
              No positions were held during this week.
            </div>
            <div v-else class="table-responsive">
              <table class="table table-sm table-striped align-middle">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Assigned Date</th>
                    <th>Sold</th>
                    <th class="text-end">Open Shares</th>
                    <th class="text-end">Sold Shares</th>
                    <th class="text-end">Cost Basis</th>
                    <th class="text-end">Current Value</th>
                    <th class="text-end">Net P/L</th>
                    <th class="text-end">ROR %</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="position in positionsHeldForWeek" :key="position.positionKey">
                    <td>{{ position.symbol || '' }}</td>
                    <td>{{ getAssignedDate(position) }}</td>
                    <td>{{ position.soldWeek ? `Week ${position.soldWeek}` : 'Open' }}</td>
                    <td class="text-end">{{ getOpenShares(position) }}</td>
                    <td class="text-end">{{ getSoldShares(position) }}</td>
                    <td class="text-end">{{ store.currency(Number(position.costBasis || 0)) }}</td>
                    <td class="text-end">{{ store.currency(Number(getCurrentValue(position) || 0)) }}</td>
                    <td class="text-end" :class="getNetPL(position) < 0 ? 'text-danger' : 'text-success'">
                      {{ store.currency(Number(getNetPL(position) || 0)) }}
                    </td>
                    <td class="text-end" :class="getTotalROR(position) < 0 ? 'text-danger' : 'text-success'">
                      {{ Number(getTotalROR(position) || 0).toFixed(2) }}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="tab-pane fade" :class="{ 'show active': activeTab === 'transactions' }" role="tabpanel">
            <div v-if="!weekRows.length" class="alert alert-secondary mb-0">
              No raw transaction rows found for this week.
            </div>
            <div v-else class="table-responsive">
              <table class="table table-sm table-striped align-middle">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Symbol</th>
                    <th>Description</th>
                    <th class="text-end">Quantity</th>
                    <th class="text-end">Price</th>
                    <th class="text-end">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in weekRows" :key="`${row.date}-${row.action}-${row.symbol}-${idx}`">
                    <td>{{ row.date || '' }}</td>
                    <td>{{ row.action || '' }}</td>
                    <td>{{ row.symbol || '' }}</td>
                    <td>{{ row.description || '' }}</td>
                    <td class="text-end">{{ row.quantity ?? '' }}</td>
                    <td class="text-end">{{ row.price !== undefined && row.price !== null ? store.currency(Number(row.price)) : '' }}</td>
                    <td class="text-end" :class="Number(row.amount || 0) < 0 ? 'text-danger' : ''">
                      {{ row.amount !== undefined && row.amount !== null ? store.currency(Number(row.amount)) : '' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="close">Close</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>

<style scoped>
.calc-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0;
}

.calc-total {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--bs-border-color);
  font-weight: 600;
}

</style>
