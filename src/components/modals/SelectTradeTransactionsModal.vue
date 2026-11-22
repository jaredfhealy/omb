<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import DataTable from '@/components/custom/DataTable.vue'
import { extractUnderlyingSymbol, getTradeTransactionAttributes } from '@/services/transactionTableDisplay'

const store = useAppStore()
const isVisible = ref(false)
const mode = ref('create')
const tradeId = ref(null)
const scopeSymbol = ref('')
const selectedSourceIds = ref([])
const selectionError = ref('')
const onConfirmSelection = ref(null)

const symbolFilter = ref('')
const quantityFilter = ref('')
const strikeFilter = ref('')
const optionTypeFilter = ref('all')
const relativeDateFilter = ref('last30')

const columns = [
  { key: 'selected', header: { text: 'Select' }, class: 'col-2 col-xl-1' },
  { key: 'date', header: { text: 'Date' }, class: 'col-6 col-xl-2 text-nowrap' },
  { key: 'symbol', header: { text: 'Symbol' }, class: 'col-4 col-xl-1' },
  { key: 'side', header: { text: 'Side' }, class: 'col-4 col-xl-1' },
  { key: 'optionType', header: { text: 'Type' }, class: 'col-4 col-xl-1' },
  { key: 'exp', header: { text: 'Exp' }, class: 'col-4 col-xl-1 text-nowrap' },
  { key: 'strike', header: { text: 'Strike' }, class: 'col-4 col-xl-1 text-xl-end' },
  { key: 'qty', header: { text: 'Qty' }, class: 'col-4 col-xl-1 text-xl-end text-nowrap' },
  { key: 'amount', header: { text: 'Amount' }, class: 'col-8 col-xl-2 text-xl-end text-nowrap' }
]

function normalizeScopeSymbol(value) {
  return extractUnderlyingSymbol(value)
}

const currentTradeLinkedSourceContext = computed(() => {
  if (mode.value !== 'link' || !tradeId.value) {
    return { linkedIds: new Set(), linkedFingerprints: new Set() }
  }

  const timelineEntries = store.getTradeTimeline(tradeId.value)
  const linkedIds = new Set()
  const linkedFingerprints = new Set()

  timelineEntries.forEach((entry) => {
    const sourceId = String(entry?.sourceTransactionId || '').trim()
    if (sourceId) linkedIds.add(sourceId)

    const sourceFingerprint = String(entry?.source?.sourceFingerprint || '').trim()
    if (sourceFingerprint) linkedFingerprints.add(sourceFingerprint)
  })

  return { linkedIds, linkedFingerprints }
})

const sourceRows = computed(() => {
  const rawRows = store.unallocatedSourceTransactionsBySymbol('')
  const { linkedIds, linkedFingerprints } = currentTradeLinkedSourceContext.value

  return rawRows
    .filter((row) => {
      if (mode.value !== 'link') return true
      const sourceId = String(row?.id || '').trim()
      if (sourceId && linkedIds.has(sourceId)) return false
      const sourceFingerprint = String(row?.sourceFingerprint || '').trim()
      if (sourceFingerprint && linkedFingerprints.has(sourceFingerprint)) return false
      return true
    })
    .map((row) => {
    const attributes = getTradeTransactionAttributes(row)
    return {
      id: String(row?.id || ''),
      date: row?.date || '',
      symbol: attributes.symbol,
      description: row?.description || '',
      amount: Number(row?.amount || 0),
      ...attributes,
      _raw: row
    }
  })
})

const filteredRows = computed(() => {
  const symbolQuery = symbolFilter.value.trim().toUpperCase()
  const scopedSymbol = (mode.value === 'link' || mode.value === 'create')
    ? normalizeScopeSymbol(scopeSymbol.value)
    : ''
  const quantity = quantityFilter.value === '' ? null : Number(quantityFilter.value)
  const strike = strikeFilter.value === '' ? null : Number(strikeFilter.value)
  const relativeDateCutoffDays = relativeDateFilter.value === 'last30'
    ? 30
    : (relativeDateFilter.value === 'last60' ? 60 : null)
  const now = new Date()

  return sourceRows.value.filter((row) => {
    if (scopedSymbol && row.symbol !== scopedSymbol) return false
    if (symbolQuery && !row.symbol.includes(symbolQuery)) return false
    if (optionTypeFilter.value !== 'all' && row.optionType !== optionTypeFilter.value) return false
    if (quantity !== null && Number.isFinite(quantity) && row.qty !== quantity) return false
    if (strike !== null && Number.isFinite(strike)) {
      if (row.strike === null) return false
      if (Math.abs(Number(row.strike) - strike) > 0.0001) return false
    }
    if (relativeDateCutoffDays !== null) {
      const rowDate = new Date(`${row.date}T00:00:00`)
      if (Number.isNaN(rowDate.getTime())) return false
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - relativeDateCutoffDays)
      cutoff.setHours(0, 0, 0, 0)
      if (rowDate < cutoff) return false
    }
    return true
  })
})

const hasVisibleRows = computed(() => filteredRows.value.length > 0)
const allVisibleSelected = computed(() => {
  if (!filteredRows.value.length) return false
  const selectedSet = new Set(selectedSourceIds.value.map(value => String(value)))
  return filteredRows.value.every(row => selectedSet.has(String(row.id)))
})

function resetFilters() {
  symbolFilter.value = ''
  quantityFilter.value = ''
  strikeFilter.value = ''
  optionTypeFilter.value = 'all'
  relativeDateFilter.value = 'last30'
}

function close() {
  isVisible.value = false
  mode.value = 'create'
  tradeId.value = null
  scopeSymbol.value = ''
  selectedSourceIds.value = []
  selectionError.value = ''
  onConfirmSelection.value = null
  resetFilters()
}

function show(options = {}, onConfirm = null) {
  mode.value = options?.mode === 'link' ? 'link' : 'create'
  tradeId.value = options?.tradeId || null
  scopeSymbol.value = String(options?.symbol || '').trim().toUpperCase()
  selectedSourceIds.value = Array.isArray(options?.preselectedSourceIds)
    ? options.preselectedSourceIds.map(value => String(value || '')).filter(Boolean)
    : []
  selectionError.value = ''
  onConfirmSelection.value = typeof onConfirm === 'function' ? onConfirm : null
  resetFilters()
  symbolFilter.value = normalizeScopeSymbol(scopeSymbol.value)
  isVisible.value = true
}

store.showSelectTradeTransactionsModal = show

function toggleSelection(sourceId, checked) {
  const sourceIdValue = String(sourceId || '')
  if (!sourceIdValue) return
  const selected = new Set(selectedSourceIds.value.map(value => String(value)))
  if (checked) selected.add(sourceIdValue)
  else selected.delete(sourceIdValue)
  selectedSourceIds.value = Array.from(selected)
}

function toggleSelectAllVisible(checked) {
  if (!checked) {
    selectedSourceIds.value = []
    return
  }
  selectedSourceIds.value = filteredRows.value.map(row => String(row.id))
}

async function applySelection() {
  selectionError.value = ''
  if (!selectedSourceIds.value.length) {
    selectionError.value = 'Select at least one transaction.'
    return
  }

  try {
    if (onConfirmSelection.value) {
      const selectedRows = sourceRows.value
        .filter(row => selectedSourceIds.value.includes(row.id))
        .map(row => row._raw)
      await onConfirmSelection.value({
        selectedSourceIds: selectedSourceIds.value.slice(),
        selectedRows
      })
      close()
      return
    }

    if (mode.value === 'link') {
      if (!tradeId.value) {
        selectionError.value = 'No trade selected for linking.'
        return
      }
      store.linkSourceTransactionsToTrade(tradeId.value, selectedSourceIds.value)
      close()
      return
    }
  } catch (error) {
    selectionError.value = String(error?.message || error)
  }
}
</script>

<template>
  <div class="trade-link-panel-overlay" v-if="isVisible">
    <div class="trade-link-panel">
      <div class="trade-link-panel-header">
        <h5 class="modal-title mb-0">
          {{
            mode === 'create'
              ? 'Select Trade Activity'
              : `Link Activity${scopeSymbol ? ` (${scopeSymbol})` : ''}`
          }}
        </h5>
        <button type="button" class="btn-close" @click="close"></button>
      </div>

      <div class="trade-link-panel-body">
        <div class="row g-2 mb-2">
          <div class="col-6 col-lg-3">
            <label class="form-label mb-1">Symbol</label>
            <input type="text" class="form-control form-control-sm" v-model.trim="symbolFilter" placeholder="e.g. TQQQ" />
          </div>
          <div class="col-6 col-lg-2">
            <label class="form-label mb-1">Qty</label>
            <input type="number" class="form-control form-control-sm" v-model="quantityFilter" placeholder="Exact" />
          </div>
          <div class="col-6 col-lg-2">
            <label class="form-label mb-1">Strike</label>
            <input type="number" class="form-control form-control-sm" v-model="strikeFilter" placeholder="Exact" step="0.01" />
          </div>
          <div class="col-6 col-lg-2">
            <label class="form-label mb-1">Type</label>
            <select class="form-select form-select-sm" v-model="optionTypeFilter">
              <option value="all">All</option>
              <option value="PUT">PUT</option>
              <option value="CALL">CALL</option>
              <option value="STOCK">STOCK</option>
            </select>
          </div>
          <div class="col-6 col-lg-2">
            <label class="form-label mb-1">Date Range</label>
            <select class="form-select form-select-sm" v-model="relativeDateFilter">
              <option value="last30">Last 30 Days</option>
              <option value="last60">Last 60 Days</option>
              <option value="all">All</option>
            </select>
          </div>
          <div class="col-6 col-lg-1 d-grid align-items-end">
            <button class="btn btn-outline-secondary btn-sm mt-4" @click="resetFilters">Reset</button>
          </div>
        </div>

        <div class="trade-link-results">
          <DataTable :items="filteredRows" :columns="columns" :striped="true">
            <template #header-selected>
              <input
                class="form-check-input trade-select-checkbox"
                type="checkbox"
                :checked="allVisibleSelected"
                :disabled="!hasVisibleRows"
                @change="toggleSelectAllVisible($event.target.checked)"
                title="Select all visible rows"
              />
            </template>
            <template #selected="{ item }">
              <input
                class="form-check-input trade-select-checkbox"
                type="checkbox"
                :checked="selectedSourceIds.includes(item.id)"
                @change="toggleSelection(item.id, $event.target.checked)"
              />
            </template>
            <template #date="{ item }"><span class="text-nowrap">{{ item.date || '—' }}</span></template>
            <template #exp="{ item }"><span class="text-nowrap">{{ item.exp || '—' }}</span></template>
            <template #strike="{ item }">{{ item.strike === null ? '—' : Number(item.strike).toFixed(2) }}</template>
            <template #qty="{ item }">{{ Number(item.qty || 0).toLocaleString() }}</template>
            <template #amount="{ item }"><span class="text-nowrap">{{ store.currency(item.amount) }}</span></template>
            <template #empty>
              <div class="text-center text-muted py-4">No unallocated source transactions match the filters.</div>
            </template>
          </DataTable>
        </div>

        <div v-if="selectionError" class="alert alert-danger py-2 mt-2 mb-0">
          {{ selectionError }}
        </div>
      </div>

      <div class="trade-link-panel-footer">
        <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
        <button type="button" class="btn btn-primary" @click="applySelection">
          Use Selected
        </button>
      </div>
    </div>
    <div class="trade-link-panel-backdrop" @click="close"></div>
  </div>
</template>

<style scoped>
.trade-select-checkbox.form-check-input {
  border-color: #495057;
}

.trade-select-checkbox.form-check-input:checked {
  background-color: #212529;
  border-color: #212529;
}

.trade-link-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 1085;
  display: flex;
  justify-content: flex-end;
}

.trade-link-panel {
  position: relative;
  width: min(82vw, 1080px);
  max-width: none;
  height: 100vh;
  background: var(--bs-body-bg);
  border-left: 1px solid var(--bs-border-color);
  display: flex;
  flex-direction: column;
  z-index: 1090;
  animation: trade-link-panel-slide-in 0.28s ease-out;
}

.trade-link-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--bs-border-color);
}

.trade-link-panel-body {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  flex: 1;
}

.trade-link-panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--bs-border-color);
}

.trade-link-results {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.trade-link-results :deep(.data-table-container) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.trade-link-results :deep(.scrollable-window) {
  height: 100%;
  min-height: 0;
}

.trade-link-panel-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
  z-index: 1088;
}

@keyframes trade-link-panel-slide-in {
  from {
    transform: translateX(44px);
    opacity: 0.7;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
