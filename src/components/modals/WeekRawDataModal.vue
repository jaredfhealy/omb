<script setup>
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRoute, useRouter } from 'vue-router'
import { groupOptionLifecycle, groupWeekTransactions, sortRowsByDateExecution } from '@/services/weeklyTransactionGrouping'
import { createTransactionTableColumns, toTransactionDisplayRow } from '@/services/transactionTableDisplay'
import TransactionRowsTable from '@/components/custom/TransactionRowsTable.vue'

const store = useAppStore()
const route = useRoute()
const router = useRouter()
const selectedWeek = ref(null)
const activeTab = ref('summary')
const transactionViewMode = ref('grouped')

const showModal = computed(() => selectedWeek.value !== null)
const snapshotTabParam = 'wsTab'
const snapshotWeekParam = 'wsWeek'
const validSnapshotTabs = new Set(['summary', 'transactions'])

function normalizeSnapshotTab(value) {
  const tab = String(value || '').toLowerCase()
  return validSnapshotTabs.has(tab) ? tab : 'summary'
}

function normalizeWeek(value) {
  const parsed = Number(value)
  const maxWeek = Number(store.weeks || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  if (!Number.isFinite(maxWeek) || maxWeek <= 0) return Math.trunc(parsed)
  return Math.min(Math.max(Math.trunc(parsed), 1), maxWeek)
}

const maxNavigableWeek = computed(() => {
  const totalWeeks = Number(store.weeks || 0)
  return Number.isFinite(totalWeeks) && totalWeeks > 0 ? totalWeeks : 1
})

const canGoPreviousWeek = computed(() => Number(selectedWeek.value) > 1)
const canGoNextWeek = computed(() => Number(selectedWeek.value) < Number(maxNavigableWeek.value))

function updateSnapshotRouteState() {
  const nextQuery = { ...route.query }
  if (showModal.value && selectedWeek.value !== null) {
    nextQuery[snapshotWeekParam] = String(selectedWeek.value)
    nextQuery[snapshotTabParam] = activeTab.value
  } else {
    delete nextQuery[snapshotWeekParam]
    delete nextQuery[snapshotTabParam]
  }
  router.replace({ query: nextQuery })
}

function goToWeek(delta) {
  const normalizedCurrent = normalizeWeek(selectedWeek.value)
  if (normalizedCurrent === null) return
  const target = normalizeWeek(normalizedCurrent + delta)
  if (target === null) return
  selectedWeek.value = target
}

watch([selectedWeek, activeTab], () => {
  if (!showModal.value) return
  updateSnapshotRouteState()
})

watch(
  () => route.query,
  (query) => {
    const tabFromRoute = query?.[snapshotTabParam]
    if (tabFromRoute !== undefined) {
      activeTab.value = normalizeSnapshotTab(tabFromRoute)
    }

    const weekFromRoute = query?.[snapshotWeekParam]
    if (weekFromRoute !== undefined) {
      const normalized = normalizeWeek(weekFromRoute)
      if (normalized !== null && normalized !== selectedWeek.value) {
        selectedWeek.value = normalized
      }
    }
  },
  { immediate: true }
)

const weeklyAllowedActions = computed(() => {
  try {
    const brokerMap = store.getBrokerageMap(store.activeAccount?.formatKey || 'schwab')
    const weeklyTypes = Array.isArray(brokerMap?.weeklyTotalTypes) ? brokerMap.weeklyTotalTypes : []
    return new Set(weeklyTypes.map(action => String(action || '').toLowerCase().trim()))
  } catch (error) {
    return new Set()
  }
})

const rawWeekRows = computed(() => {
  if (!Array.isArray(store.activeAccount?.importedTransactions)) return []
  const weekRows = store.activeAccount.importedTransactions.filter(row => Number(row?.week) === Number(selectedWeek.value))
  const filteredRows = weekRows.filter((row) => {
    const action = String(row?.action || '').toLowerCase().trim()
    return weeklyAllowedActions.value.has(action)
  })
  return sortRowsByDateExecution(filteredRows, { descending: true })
})

function toSummaryLikeRow(row) {
  const symbol = String(row?.symbol || '')
  const optionMatch = symbol.match(/^([\w.-]+) (\d{2}\/\d{2}\/\d{4}) ([\d.]+) ([CP])$/)
  const strike = optionMatch ? optionMatch[3] : '-'
  const strikeNumber = Number(strike)
  const contractType = optionMatch ? (optionMatch[4] === 'C' ? 'Call' : 'Put') : '-'
  const ticker = optionMatch ? optionMatch[1] : symbol
  const quantity = Number(row?.quantity || 0)
  const amount = Number(row?.amount || 0)
  const capitalRequirement = Number.isFinite(strikeNumber) && Number.isFinite(quantity) && Math.abs(quantity) > 0
    ? Math.abs(quantity) * 100 * strikeNumber
    : null
  return {
    ...row,
    account: store.activeAccount?.name || '',
    week: Number(selectedWeek.value || 0),
    ticker,
    contractType,
    strike,
    type: row?.action || row?.type || '',
    premium: amount,
    amount,
    capitalRequirement
  }
}

function fromSummaryLikeRow(row) {
  return toTransactionDisplayRow({
    ...row,
    type: row?.type || row?.action || row?.contractType || ''
  })
}

const groupedWeekRows = computed(() => {
  const grouped = groupWeekTransactions(rawWeekRows.value.map(toSummaryLikeRow), {
    groupIncome: true,
    groupSameWeekExpirations: true,
    sortDescending: true,
    contextKey: () => String(selectedWeek.value || '')
  })
  return groupOptionLifecycle(grouped, { sortDescending: true }).map(fromSummaryLikeRow)
})

const weekRows = computed(() => (
  transactionViewMode.value === 'raw'
    ? rawWeekRows.value.map(toSummaryLikeRow).map(fromSummaryLikeRow)
    : groupedWeekRows.value
))

const transactionColumns = createTransactionTableColumns((value) => store.currency(value))

const transactionRowKey = (row, idx) => row.rowKey || `${row.date}-${row.action}-${row.symbol}-${idx}`

const weekTotalPremium = computed(() => {
  return weekRows.value.reduce((total, item) => total + Number(item?.amount || 0), 0)
})

const weekTotalRor = computed(() => {
  const totals = weekRows.value.reduce((acc, item) => {
    const premium = Number(item?.amount || 0)
    const capitalRequirement = Number(item?.capitalRequirement)
    if (!Number.isFinite(capitalRequirement) || capitalRequirement <= 0) return acc
    acc.totalPremium += premium
    acc.totalCapitalRequirement += capitalRequirement
    return acc
  }, { totalPremium: 0, totalCapitalRequirement: 0 })

  if (!totals.totalCapitalRequirement) return '-'
  return `${((totals.totalPremium / totals.totalCapitalRequirement) * 100).toFixed(2)}%`
})

const projectionWeek = computed(() => {
  if (selectedWeek.value === null) return null
  return store.projections.find(p => Number(p.week) === Number(selectedWeek.value)) || null
})

const weekGrowth = computed(() => {
  const growth = projectionWeek.value?.actualGrowth
  return growth === null || growth === undefined ? null : Number(growth)
})

const weekNetCashFlow = computed(() => {
  return rawWeekRows.value.reduce((sum, row) => {
    const amount = Number(row?.amount)
    return Number.isFinite(amount) ? sum + amount : sum
  }, 0)
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

function getPositionSoldWeek(position) {
  const soldWeek = position?.soldWeek
  if (soldWeek === null || soldWeek === undefined || soldWeek === '') return null
  const parsed = Number(soldWeek)
  return Number.isFinite(parsed) ? parsed : null
}

function getPositionSoldSharesAsOfWeek(position, week) {
  const shares = Number(position?.shares || 0)
  if (!Number.isFinite(shares) || shares <= 0) return 0
  const soldWeek = getPositionSoldWeek(position)
  if (!soldWeek || soldWeek > week) return 0

  const soldShares = Number(position?.soldShares || 0)
  if (Number.isFinite(soldShares) && soldShares > 0) {
    return Math.min(Math.max(soldShares, 0), shares)
  }
  return shares
}

function getPositionOpenSharesAsOfWeek(position, week) {
  const shares = Number(position?.shares || 0)
  if (!Number.isFinite(shares) || shares <= 0) return 0
  const openShares = shares - getPositionSoldSharesAsOfWeek(position, week)
  return openShares > 0 ? openShares : 0
}

function getPositionStatusAsOfWeek(position, week) {
  const soldWeek = getPositionSoldWeek(position)
  if (!soldWeek || soldWeek > week) return 'Open'
  return `Closed Week ${soldWeek}`
}

function getPositionCurrentValueAsOfWeek(position, week) {
  const soldWeek = getPositionSoldWeek(position)
  const openShares = getPositionOpenSharesAsOfWeek(position, week)
  const sellAmount = soldWeek && soldWeek <= week ? Number(position?.sellAmount || 0) : 0
  const currentPrice = Number(position?.currentPrice || 0)
  const hasPrice = Number.isFinite(currentPrice)
  const openValue = hasPrice ? currentPrice * openShares : 0
  return Number(sellAmount || 0) + openValue
}

function openPositionEditor(position) {
  if (typeof store.showPositionModal !== 'function') return
  store.showPositionModal(position, position?.mergeGroup || null)
}

function getAssignedDate(position) {
  if (position?.date) return position.date
  const week = Number(position?.assignedWeek)
  if (!Number.isFinite(week) || week <= 0) return ''
  const rangeText = store.weekRange(week, true)
  return rangeText?.split(' - ')?.[0] || ''
}

const positionsSnapshot = computed(() => {
  const week = Number(selectedWeek.value || 0)
  const positions = positionsHeldForWeek.value
  const totalCostBasis = positions.reduce((sum, p) => sum + Number(p.costBasis || 0), 0)
  const totalValue = positions.reduce((sum, p) => sum + Number(getPositionCurrentValueAsOfWeek(p, week) || 0), 0)
  return {
    count: positions.length,
    totalCostBasis,
    totalValue
  }
})

const show = (week) => {
  const normalized = normalizeWeek(week)
  selectedWeek.value = normalized === null ? Number(week) : normalized
  if (route.query?.[snapshotTabParam] === undefined) {
    activeTab.value = 'summary'
  }
  transactionViewMode.value = 'grouped'
  updateSnapshotRouteState()
}

const close = () => {
  selectedWeek.value = null
  updateSnapshotRouteState()
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
          <div class="snapshot-header-controls d-flex align-items-center gap-2">
            <div class="btn-group btn-group-sm" role="group" aria-label="Week navigation">
              <button
                type="button"
                class="btn btn-outline-secondary"
                :disabled="!canGoPreviousWeek"
                @click="goToWeek(-1)"
              >
                <i class="bi bi-chevron-left"></i>
              </button>
              <button
                type="button"
                class="btn btn-outline-secondary"
                :disabled="!canGoNextWeek"
                @click="goToWeek(1)"
              >
                <i class="bi bi-chevron-right"></i>
              </button>
            </div>
            <button type="button" class="btn-close" @click="close"></button>
          </div>
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
                  <span>+ Net Cash Flow</span>
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
                    <th>Date</th>
                    <th>Status</th>
                    <th class="text-end">Open Shares</th>
                    <th class="text-end">Sold Shares</th>
                    <th class="text-end">Cost Basis</th>
                    <th class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="position in positionsHeldForWeek" :key="position.positionKey">
                    <td>{{ position.symbol || '' }}</td>
                    <td>{{ getAssignedDate(position) }}</td>
                    <td>{{ getPositionStatusAsOfWeek(position, Number(selectedWeek || 0)) }}</td>
                    <td class="text-end">{{ getPositionOpenSharesAsOfWeek(position, Number(selectedWeek || 0)) }}</td>
                    <td class="text-end">{{ getPositionSoldSharesAsOfWeek(position, Number(selectedWeek || 0)) }}</td>
                    <td class="text-end">{{ store.currency(Number(position.costBasis || 0)) }}</td>
                    <td class="text-end">
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-primary"
                        @click="openPositionEditor(position)"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="table-light">
                    <td colspan="5" class="text-end"><b>Totals</b></td>
                    <td class="text-end"><b>{{ store.currency(positionsSnapshot.totalCostBasis) }}</b></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div class="tab-pane fade" :class="{ 'show active': activeTab === 'transactions' }" role="tabpanel">
            <div class="d-flex align-items-center gap-2 mb-3">
              <span class="small text-muted">View:</span>
              <div class="btn-group btn-group-sm" role="group" aria-label="Transaction view mode">
                <button
                  type="button"
                  class="btn"
                  :class="transactionViewMode === 'grouped' ? 'btn-primary' : 'btn-outline-primary'"
                  @click="transactionViewMode = 'grouped'"
                >
                  Grouped
                </button>
                <button
                  type="button"
                  class="btn"
                  :class="transactionViewMode === 'raw' ? 'btn-primary' : 'btn-outline-primary'"
                  @click="transactionViewMode = 'raw'"
                >
                  Raw
                </button>
              </div>
            </div>
              <div v-if="!weekRows.length" class="alert alert-secondary mb-0">
                No raw transaction rows found for this week.
              </div>
              <TransactionRowsTable
                v-else
                :columns="transactionColumns"
                :rows="weekRows"
                :row-key="transactionRowKey"
                table-class="table table-sm table-striped align-middle"
              >
                <template #footer>
                  <tr class="table-light">
                    <td colspan="6" class="text-end"><b>Totals</b></td>
                    <td class="text-end"><b>{{ store.currency(weekTotalPremium) }}</b></td>
                    <td class="text-end"><b>{{ weekTotalRor }}</b></td>
                  </tr>
                </template>
              </TransactionRowsTable>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <div class="me-auto">
            <div class="btn-group btn-group-sm" role="group" aria-label="Week navigation footer">
              <button
                type="button"
                class="btn btn-outline-secondary"
                :disabled="!canGoPreviousWeek"
                @click="goToWeek(-1)"
              >
                Previous Week
              </button>
              <button
                type="button"
                class="btn btn-outline-secondary"
                :disabled="!canGoNextWeek"
                @click="goToWeek(1)"
              >
                Next Week
              </button>
            </div>
          </div>
          <button type="button" class="btn btn-secondary" @click="close">Close</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>

<style scoped>
.snapshot-header-controls {
  margin-left: auto;
}

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
