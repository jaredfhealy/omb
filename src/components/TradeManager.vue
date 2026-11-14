<script setup>
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import DataTable from '@/components/custom/DataTable.vue'

const store = useAppStore()
const statusFilter = ref('open')
const symbolFilter = ref('')
const selectedTradeId = ref('')

const tradesColumns = [
  { key: 'symbol', header: { text: 'Symbol' }, class: 'col-4 col-xl-1' },
  { key: 'name', header: { text: 'Name' }, class: 'col-8 col-xl-3' },
  { key: 'status', header: { text: 'Status' }, class: 'col-4 col-xl-1' },
  { key: 'dates', header: { text: 'Lifecycle' }, class: 'col-8 col-xl-2' },
  { key: 'duration', header: { text: 'Weeks' }, class: 'col-4 col-xl-1 text-xl-end' },
  { key: 'capital', header: { text: 'Capital at Risk' }, class: 'col-6 col-xl-2 text-xl-end' },
  { key: 'netPL', header: { text: 'Net P/L' }, class: 'col-6 col-xl-1 text-xl-end' },
  { key: 'weeklyROR', header: { text: 'Weekly ROR' }, class: 'col-6 col-xl-1 text-xl-end' }
]

const filteredTrades = computed(() => {
  const symbolQuery = symbolFilter.value.trim().toUpperCase()
  return store.currentTrades.filter((trade) => {
    if (statusFilter.value !== 'all' && String(trade?.status || 'open') !== statusFilter.value) return false
    const tradeSymbol = String(trade?.displaySymbol || trade?.symbol || '').toUpperCase()
    if (symbolQuery && !tradeSymbol.includes(symbolQuery)) return false
    return true
  })
})

watch(filteredTrades, (rows) => {
  if (!rows.length) {
    selectedTradeId.value = ''
    return
  }
  const hasSelected = rows.some(row => String(row?.id || '') === String(selectedTradeId.value))
  if (!hasSelected) selectedTradeId.value = String(rows[0].id)
}, { immediate: true })

function getTradeListDisplayMetrics(trade) {
  const metrics = trade?.metrics || {}
  const netPremiums = Number(metrics?.netPremiums)
  const fullRecoveryNetPL = Number(metrics?.plScenarios?.fullRecoveryNetPL)
  const baselineNetPL = Number(metrics?.netPL)
  const hasOpenStockExposure = Boolean(metrics?.plScenarios?.hasOpenStockExposure)
  const needsPositionResolution = Boolean(metrics?.plScenarios?.needsPositionResolution)
  const isOpenTrade = String(trade?.status || 'open') === 'open'
  const netPL = (!hasOpenStockExposure && !needsPositionResolution && isOpenTrade && Number.isFinite(netPremiums))
    ? netPremiums
    : (Number.isFinite(fullRecoveryNetPL)
    ? fullRecoveryNetPL
    : (Number.isFinite(baselineNetPL) ? baselineNetPL : 0))

  const capitalAtRisk = Number(metrics?.capitalAtRisk || 0)
  const durationWeeks = Number(metrics?.durationWeeks || 0)
  const weeklyROR = capitalAtRisk > 0 && durationWeeks > 0
    ? (netPL / capitalAtRisk / durationWeeks) * 100
    : null

  return { netPL, weeklyROR }
}

function getTradeListNetPL(trade) {
  return getTradeListDisplayMetrics(trade).netPL
}

function getTradeListWeeklyROR(trade) {
  return getTradeListDisplayMetrics(trade).weeklyROR
}

function showCreateTradeModal() {
  if (!store.showTradePanel) return
  store.showTradePanel()
}

function openTradeModal(trade) {
  if (!trade) return
  selectedTradeId.value = String(trade.id)
  if (!store.showTradePanel) return
  store.showTradePanel(trade)
}

function getTradeRowAttributes() {
  return {
    style: 'cursor: pointer;'
  }
}
</script>

<template>
  <div class="trade-manager-container d-flex flex-column">
    <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-2">
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <button class="btn btn-primary btn-sm" @click="showCreateTradeModal">
          <i class="bi bi-plus-circle me-1"></i> New Trade
        </button>
      </div>
      <div class="d-flex gap-1">
        <select class="form-select form-select-sm" v-model="statusFilter">
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </select>
        <input class="form-control form-control-sm" placeholder="Symbol..." v-model.trim="symbolFilter" />
      </div>
    </div>

    <DataTable
      :items="filteredTrades"
      :columns="tradesColumns"
      :striped="true"
      :get-row-attributes="getTradeRowAttributes"
      @row-click="openTradeModal"
    >
      <template #row="{ item }">
        <div class="row align-items-center">
          <div class="col-4 col-xl-1 fw-semibold" :class="{ 'text-primary': String(item.id) === String(selectedTradeId) }">{{ item.displaySymbol || item.symbol }}</div>
          <div class="col-8 col-xl-3">{{ item.name || '—' }}</div>
          <div class="col-4 col-xl-1">
            <span class="badge" :class="item.status === 'closed' ? 'text-bg-secondary' : 'text-bg-success'">
              {{ item.status === 'closed' ? 'Closed' : 'Open' }}
            </span>
          </div>
          <div class="col-8 col-xl-2 small">{{ item.metrics.startDate }} → {{ item.metrics.endDate }}</div>
          <div class="col-4 col-xl-1 text-xl-end">{{ item.metrics.durationWeeks }}</div>
          <div class="col-6 col-xl-2 text-xl-end">{{ item.metrics.capitalAtRisk > 0 ? store.currency(item.metrics.capitalAtRisk) : 'N/A' }}</div>
          <div class="col-6 col-xl-1 text-xl-end">{{ store.currency(getTradeListNetPL(item)) }}</div>
          <div class="col-6 col-xl-1 text-xl-end">
            <span v-if="getTradeListWeeklyROR(item) !== null">{{ Number(getTradeListWeeklyROR(item)).toFixed(2) }}%</span>
            <span v-else class="text-warning">N/A</span>
          </div>
        </div>
      </template>
      <template #empty>
        <div class="text-center text-muted py-4">No trades match the current filters.</div>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.trade-manager-container {
  min-height: 0;
  flex: 1;
}

.min-h-0 {
  min-height: 0;
}
</style>
