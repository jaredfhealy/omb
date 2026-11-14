<script setup>
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import DataTable from '@/components/custom/DataTable.vue'

const store = useAppStore()
const statusFilter = ref('open')
const symbolFilter = ref('')
const selectedTradeId = ref('')

const tradesColumns = [
  {
    key: 'symbol',
    header: { text: 'Symbol' },
    value: (item) => item.displaySymbol || item.symbol || '—'
  },
  {
    key: 'name',
    header: { text: 'Name' },
    value: (item) => item.name || '—'
  },
  { key: 'status', header: { text: 'Status' } },
  {
    key: 'dates',
    header: { text: 'Lifecycle' },
    value: (item) => `${item?.metrics?.startDate || '—'} → ${item?.metrics?.endDate || '—'}`
  },
  {
    key: 'duration',
    header: { text: 'Weeks' },
    value: (item) => Number(item?.metrics?.durationWeeks || 0)
  },
  {
    key: 'capital',
    header: { text: 'Capital at Risk' },
    value: (item) => Number(item?.metrics?.capitalAtRisk || 0) > 0 ? store.currency(item.metrics.capitalAtRisk) : 'N/A'
  },
  {
    key: 'netPL',
    header: { text: 'Net P/L' },
    value: (item) => store.currency(getTradeListNetPL(item))
  },
  { key: 'weeklyROR', header: { text: 'Weekly ROR' } }
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

function getLifecycleRangeHtml(trade) {
  const startDate = String(trade?.metrics?.startDate || '').trim()
  const endDate = String(trade?.metrics?.endDate || '').trim()
  if (!startDate || !endDate || typeof store.formatDateRangeWithYearBadges !== 'function') {
    return `${startDate || '—'} → ${endDate || '—'}`
  }
  return store.formatDateRangeWithYearBadges(startDate, endDate)
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
    <DataTable
      :items="filteredTrades"
      :columns="tradesColumns"
      :striped="true"
      :get-row-attributes="getTradeRowAttributes"
      @row-click="openTradeModal"
    >
      <template #table-controls>
        <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between w-100">
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
      </template>
      <template #symbol="{ item }">
        <span class="fw-semibold" :class="{ 'text-primary': String(item.id) === String(selectedTradeId) }">
          {{ item.displaySymbol || item.symbol || '—' }}
        </span>
      </template>
      <template #status="{ item }">
        <span class="badge" :class="item.status === 'closed' ? 'text-bg-secondary' : 'text-bg-success'">
          {{ item.status === 'closed' ? 'Closed' : 'Open' }}
        </span>
      </template>
      <template #dates="{ item }">
        <span class="small" v-html="getLifecycleRangeHtml(item)"></span>
      </template>
      <template #weeklyROR="{ item }">
        <span v-if="getTradeListWeeklyROR(item) !== null">{{ Number(getTradeListWeeklyROR(item)).toFixed(2) }}%</span>
        <span v-else class="text-warning">N/A</span>
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
