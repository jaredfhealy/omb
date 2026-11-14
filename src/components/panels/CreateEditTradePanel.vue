<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import DataTable from '@/components/custom/DataTable.vue'
import TransactionRowsTable from '@/components/custom/TransactionRowsTable.vue'
import { createTransactionTableColumns, getTradeTransactionAttributes, toTransactionDisplayRow } from '@/services/transactionTableDisplay'
import { groupOptionLifecycle, groupWeekTransactions, sortRowsByDateExecution } from '@/services/weeklyTransactionGrouping'

const store = useAppStore()
const optionSymbolRegex = /^([\w.-]+)\s+(\d{2}\/\d{2}\/\d{2,4})\s+([\d.]+)\s+([CP])$/i
const isVisible = ref(false)
const isEdit = ref(false)
const tradeId = ref(null)
const formError = ref('')

const form = reactive({
  sourceTransactionId: '',
  symbol: '',
  name: '',
  status: 'open',
  closedAt: ''
})

const selectedRows = ref([])
const detailTab = ref('performance')
const transactionViewMode = ref('grouped')
const noteDraft = ref('')
const editingNoteId = ref('')
const editingNoteDraft = ref('')
const scenarioClosePrices = reactive({
  worst: null,
  recovery: null,
  plus10: null
})

const linkedSummaryColumns = computed(() => {
  const columns = createTransactionTableColumns((value) => store.currency(value))
  const symbolIndex = columns.findIndex(column => column.key === 'symbol')
  const rorIndex = columns.findIndex(column => column.key === 'ror')
  const typeColumn = {
    key: 'optionType',
    label: 'Type',
    value: (row) => row.optionTypeLabel || '-'
  }

  if (symbolIndex >= 0) {
    columns.splice(symbolIndex + 1, 0, typeColumn)
  } else {
    columns.push(typeColumn)
  }

  if (isEdit.value && transactionViewMode.value === 'raw') {
    if (rorIndex >= 0) columns.splice(rorIndex, 1)
    columns.push({
      key: 'actions',
      label: '',
      class: 'text-end',
      actionTitle: 'Remove linked activity',
      iconClass: 'bi bi-dash-circle',
      onClick: (row) => removeLinkedActivity(row)
    })
  }

  return columns
})

const plOutlookColumns = [
  { key: 'label', header: { text: 'Scenario' }, class: 'col-12 col-xl-4 fw-semibold' },
  { key: 'closePrice', header: { text: 'Close Price' }, class: 'col-6 col-xl-1 text-xl-end' },
  { key: 'projectedExitValue', header: { text: 'Exit Value' }, class: 'col-6 col-xl-2 text-xl-end', value: (row) => store.currency(row.projectedExitValue) },
  { key: 'projectedPL', header: { text: 'Projected P/L' }, class: 'col-6 col-xl-2 text-xl-end text-nowrap', value: (row) => store.currency(row.projectedPL) },
  { key: 'plPercent', header: { text: 'P/L %' }, class: 'col-6 col-xl-1 text-xl-end', value: (row) => (row.plPercent === null ? 'N/A' : `${row.plPercent.toFixed(2)}%`) },
  { key: 'weeklyROR', header: { text: 'Weekly ROR' }, class: 'col-6 col-xl-2 text-xl-end', value: (row) => (row.weeklyROR === null ? 'N/A' : `${row.weeklyROR.toFixed(2)}%`) }
]

const showPerformanceTab = computed(() => isEdit.value || selectedRows.value.length > 0)
const showDetailTabs = computed(() => isEdit.value ? Boolean(editingTrade.value) : true)

function roundAmount(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function parseOptionExpirationToIso(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const parts = raw.split('/')
  if (parts.length !== 3) return ''

  const month = Number(parts[0])
  const day = Number(parts[1])
  let year = Number(parts[2])
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return ''
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  if (year < 100) year += 2000
  if (year < 1900 || year > 9999) return ''

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return ''
  if (parsed.toISOString().slice(0, 10) !== iso) return ''
  return iso
}

function getLatestOptionExpirationIso(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  let latestIso = ''

  rows.forEach((row) => {
    const symbol = String(row?.symbol || '').trim().toUpperCase()
    const description = String(row?.description || '').trim()
    const optionMatch = optionSymbolRegex.exec(symbol) || optionSymbolRegex.exec(description)
    if (!optionMatch) return
    const expirationIso = parseOptionExpirationToIso(optionMatch[2])
    if (!expirationIso) return
    if (!latestIso || expirationIso > latestIso) latestIso = expirationIso
  })

  return latestIso
}

function getNetOpenPutCollateral(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0

  const openShortPutsByContract = new Map()

  rows.forEach((row) => {
    const symbol = String(row?.symbol || '').trim().toUpperCase()
    const description = String(row?.description || '').trim()
    const optionMatch = optionSymbolRegex.exec(symbol) || optionSymbolRegex.exec(description)
    if (!optionMatch) return
    const right = String(optionMatch[4] || '').toUpperCase()
    if (right !== 'P') return

    const strike = Number(optionMatch[3])
    const quantity = Math.abs(Number(row?.quantity || 0))
    if (!Number.isFinite(strike) || strike <= 0 || quantity <= 0) return

    const action = String(row?.action || '').toLowerCase()
    const contractKey = `${String(optionMatch[1] || '').toUpperCase()}|${optionMatch[2]}|${strike.toFixed(4)}`
    let delta = 0

    if (action.includes('sell to open')) {
      delta = quantity
    } else if (action.includes('buy to close')) {
      delta = -quantity
    } else if (action.includes('expired') || action.includes('assigned')) {
      delta = -quantity
    } else if (action.includes('sell') && !action.includes('sell to close')) {
      delta = quantity
    } else if (action.includes('buy') && !action.includes('buy to open')) {
      delta = -quantity
    }
    if (delta === 0) return

    const existing = openShortPutsByContract.get(contractKey)
    const existingQuantity = Number(existing?.quantity || 0)
    const nextQuantity = Math.max(0, existingQuantity + delta)
    openShortPutsByContract.set(contractKey, { strike, quantity: nextQuantity })
  })

  let collateral = 0
  openShortPutsByContract.forEach((entry) => {
    const strike = Number(entry?.strike)
    const quantity = Number(entry?.quantity)
    if (!Number.isFinite(strike) || strike <= 0 || !Number.isFinite(quantity) || quantity <= 0) return
    collateral += strike * quantity * 100
  })

  return roundAmount(collateral)
}

function resetForm() {
  form.sourceTransactionId = ''
  form.symbol = ''
  form.name = ''
  form.status = 'open'
  form.closedAt = ''
  selectedRows.value = []
  detailTab.value = 'activity'
  transactionViewMode.value = 'grouped'
  noteDraft.value = ''
}

function toDisplayRow(row, extra = {}) {
  const attrs = getTradeTransactionAttributes(row)
  return {
    id: String(row?.id || ''),
    date: row?.date || '',
    symbol: attrs.symbol,
    side: attrs.side,
    type: attrs.optionType,
    exp: attrs.exp,
    strike: attrs.strike,
    qty: attrs.qty,
    amount: Number(row?.amount || 0),
    description: row?.description || '',
    eventDateTime: extra.eventDateTime || null,
    relId: extra.relId || null,
    isOrigin: Boolean(extra.isOrigin),
    _raw: row
  }
}

function sortRowsOldestFirst(rows) {
  return sortRowsByDateExecution(rows, { descending: false })
}

const editingTrade = computed(() => {
  if (!isEdit.value || !tradeId.value) return null
  return store.currentTrades.find(trade => String(trade?.id || '') === String(tradeId.value)) || null
})

const sourceTransactionLabel = computed(() => {
  if (!isEdit.value || !editingTrade.value) return ''
  const sourceId = String(form.sourceTransactionId || editingTrade.value?.sourceTransactionId || '').trim()
  if (!sourceId) return ''

  const importedRows = Array.isArray(store.activeAccount?.importedTransactions)
    ? store.activeAccount.importedTransactions
    : []
  const sourceRow = importedRows.find(row => String(row?.id || '').trim() === sourceId)
  if (!sourceRow) return String(editingTrade.value?.displaySymbol || editingTrade.value?.symbol || '').trim()

  return String(sourceRow?.symbol || '').trim() || String(editingTrade.value?.displaySymbol || editingTrade.value?.symbol || '').trim()
})

const linkedTimelineRows = computed(() => {
  if (!editingTrade.value) return []

  return store.getTradeTimeline(editingTrade.value.id).map((entry) => {
    const source = entry?.source || {}
    const attrs = getTradeTransactionAttributes(source)
    const quantity = Math.abs(Number(source?.quantity || entry?.quantity || 0))
    const strikeValue = Number(attrs.strike)
    const capitalRequirement = Number.isFinite(strikeValue) && strikeValue > 0 && quantity > 0
      ? strikeValue * quantity * 100
      : null

    return {
      id: String(entry?.relId || entry?.id || source?.id || ''),
      date: source?.date || entry?.eventDate || '',
      week: Number(source?.week || entry?.eventWeek || 0),
      account: store.activeAccount?.name || '',
      action: String(source?.action || entry?.eventKind || ''),
      symbol: String(source?.symbol || ''),
      ticker: attrs.symbol,
      contractType: attrs.optionType === 'PUT' ? 'Put' : (attrs.optionType === 'CALL' ? 'Call' : '-'),
      strike: attrs.strike === null ? '-' : String(attrs.strike),
      description: source?.description || '',
      quantity,
      price: source?.price,
      premium: Number(source?.amount || entry?.cashImpact || 0),
      amount: Number(source?.amount || entry?.cashImpact || 0),
      capitalRequirement,
      executionOrder: Number(source?.executionOrder || 0)
    }
  })
})

const createTimelineRows = computed(() => (
  sortRowsByDateExecution(sortRowsOldestFirst(selectedRows.value).map((row) => {
    const source = row?._raw || {}
    const attrs = getTradeTransactionAttributes(source)
    const quantity = Math.abs(Number(source?.quantity ?? row?.qty ?? 0))
    const strikeValue = Number(attrs.strike)
    const capitalRequirement = Number.isFinite(strikeValue) && strikeValue > 0 && quantity > 0
      ? strikeValue * quantity * 100
      : null

    return {
      id: String(row?.id || source?.id || ''),
      date: row?.date || source?.date || '',
      week: Number(source?.week || 0),
      account: store.activeAccount?.name || '',
      action: String(source?.action || ''),
      symbol: String(source?.symbol || row?.symbol || ''),
      ticker: attrs.symbol,
      contractType: attrs.optionType === 'PUT' ? 'Put' : (attrs.optionType === 'CALL' ? 'Call' : 'Stock'),
      strike: attrs.strike === null ? '-' : String(attrs.strike),
      description: source?.description || row?.description || '',
      quantity,
      price: source?.price,
      premium: Number(source?.amount ?? row?.amount ?? 0),
      amount: Number(source?.amount ?? row?.amount ?? 0),
      capitalRequirement,
      executionOrder: Number(source?.executionOrder || 0)
    }
  }), { descending: false })
))

const activityTimelineRows = computed(() => (
  isEdit.value ? linkedTimelineRows.value : createTimelineRows.value
))

const linkedSummaryRows = computed(() => {
  const timelineRows = sortRowsByDateExecution(activityTimelineRows.value, { descending: false })
  if (!timelineRows.length) return []

  const rowsForGrouping = groupWeekTransactions(timelineRows, {
    groupIncome: true,
    groupSameWeekExpirations: true,
    sortDescending: false,
    contextKey: (row) => `${row.week || ''}`
  }).map((row) => ({
    ...row,
    type: row.type || row.action || '',
    premium: row.premium ?? row.amount ?? 0,
    amount: row.amount ?? row.premium ?? 0
  }))

  return groupOptionLifecycle(rowsForGrouping, { sortDescending: true })
    .map((groupedRow) => {
      const displayRow = toTransactionDisplayRow(groupedRow)
      const attrs = getTradeTransactionAttributes(groupedRow)
      const optionTypeLabel = attrs.optionType === 'STOCK'
        ? 'Stock'
        : (attrs.optionType || '-')
      return {
        ...displayRow,
        optionTypeLabel
      }
    })
})

const linkedRawRows = computed(() => {
  return sortRowsByDateExecution(activityTimelineRows.value, { descending: true })
    .map((row) => {
      const displayRow = toTransactionDisplayRow(row)
      const attrs = getTradeTransactionAttributes(row)
      const optionTypeLabel = attrs.optionType === 'STOCK'
        ? 'Stock'
        : (attrs.optionType || '-')
      return {
        ...displayRow,
        optionTypeLabel
      }
    })
})

const activityRows = computed(() => (
  transactionViewMode.value === 'raw'
    ? linkedRawRows.value
    : linkedSummaryRows.value
))

const fallbackNetPremiums = computed(() => (
  activityTimelineRows.value.reduce((sum, row) => {
    const contractType = String(row?.contractType || '').toLowerCase()
    if (contractType !== 'put' && contractType !== 'call') return sum
    return sum + Number(row?.premium ?? row?.amount ?? 0)
  }, 0)
))

const createPreviewMetrics = computed(() => {
  if (isEdit.value) return null
  const rows = activityTimelineRows.value
  if (!rows.length) return null

  const sortedRows = sortRowsByDateExecution(rows, { descending: false })
  const startDate = String(sortedRows[0]?.date || '')
  const latestOptionExpiration = getLatestOptionExpirationIso(sortedRows)
  const endDate = latestOptionExpiration || String(sortedRows[sortedRows.length - 1]?.date || startDate)
  const startMs = new Date(startDate).getTime()
  const endMs = new Date(endDate).getTime()
  const durationWeeks = Number.isFinite(startMs) && Number.isFinite(endMs)
    ? Math.max(1, Math.ceil(((endMs - startMs) / (1000 * 60 * 60 * 24) + 1) / 7))
    : 1

  const netPremiums = roundAmount(rows.reduce((sum, row) => {
    const contractType = String(row?.contractType || '').toLowerCase()
    if (contractType !== 'put' && contractType !== 'call') return sum
    return sum + Number(row?.amount || 0)
  }, 0))

  const netPL = roundAmount(rows.reduce((sum, row) => sum + Number(row?.amount || 0), 0))

  const stockRows = rows.filter((row) => String(row?.contractType || '').toLowerCase() === 'stock')
  const stockBuyRows = stockRows.filter((row) => String(row?.action || '').toLowerCase().includes('buy'))
  const stockSellRows = stockRows.filter((row) => String(row?.action || '').toLowerCase().includes('sell'))
  const costBasis = roundAmount(stockBuyRows.reduce((sum, row) => sum + Math.abs(Number(row?.amount || 0)), 0))
  const openShares = roundAmount(
    stockBuyRows.reduce((sum, row) => sum + Math.abs(Number(row?.quantity || 0)), 0) -
    stockSellRows.reduce((sum, row) => sum + Math.abs(Number(row?.quantity || 0)), 0)
  )

  const putCollateral = getNetOpenPutCollateral(sortedRows)

  const capitalAtRisk = costBasis > 0
    ? costBasis
    : (putCollateral > 0 ? putCollateral : null)
  const denominatorComplete = Number(capitalAtRisk) > 0
  const weeklyROR = denominatorComplete && durationWeeks > 0
    ? roundAmount((netPL / Number(capitalAtRisk) / durationWeeks) * 100)
    : null

  const hasOpenStockExposure = openShares > 0 && costBasis > 0
  const currentValue = hasOpenStockExposure ? costBasis : 0

  return {
    netPremiums,
    netPL,
    durationWeeks,
    capitalAtRisk,
    currentCapitalTiedUp: capitalAtRisk || 0,
    weeklyROR,
    plScenarios: hasOpenStockExposure
      ? {
          hasOpenStockExposure: true,
          needsPositionResolution: false,
          resolutionMessage: '',
          openShares,
          costBasis,
          currentValue,
          worstCaseNetPL: roundAmount(netPremiums - costBasis + currentValue),
          fullRecoveryNetPL: roundAmount(netPremiums),
          plusTenRecoveryNetPL: roundAmount(netPremiums + (costBasis * 0.1))
        }
      : {
          hasOpenStockExposure: false,
          needsPositionResolution: false,
          resolutionMessage: '',
          openShares: 0,
          costBasis: 0,
          currentValue: 0,
          worstCaseNetPL: null,
          fullRecoveryNetPL: null,
          plusTenRecoveryNetPL: null
        },
    denominator: {
      complete: denominatorComplete,
      reasons: denominatorComplete ? [] : ['Capital at risk preview is unavailable until applicable activity is selected.'],
      inferredFrom: capitalAtRisk ? ['selected activity preview'] : []
    },
    startDate,
    endDate
  }
})

const activeMetrics = computed(() => (
  isEdit.value ? (editingTrade.value?.metrics || null) : createPreviewMetrics.value
))

const displayNetPremiums = computed(() => {
  const metrics = activeMetrics.value
  const hasNetPremiums = Boolean(metrics) && Object.prototype.hasOwnProperty.call(metrics, 'netPremiums')
  if (hasNetPremiums) {
    const parsed = Number(metrics?.netPremiums)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallbackNetPremiums.value
})

const displayCostBasis = computed(() => {
  const costBasis = Number(activeMetrics.value?.plScenarios?.costBasis || 0)
  return costBasis > 0 ? costBasis : null
})

const displayNetCostBasis = computed(() => {
  const costBasis = displayCostBasis.value
  if (costBasis === null) return null
  return costBasis - displayNetPremiums.value
})

const displayNetCostPerShare = computed(() => {
  const netCostBasis = displayNetCostBasis.value
  const openShares = Number(activeMetrics.value?.plScenarios?.openShares || 0)
  if (netCostBasis === null || !Number.isFinite(openShares) || openShares <= 0) return null
  return netCostBasis / openShares
})

const lifecycleDateRangeHtml = computed(() => {
  const startDate = String(activeMetrics.value?.startDate || '').trim()
  const endDate = String(activeMetrics.value?.endDate || '').trim()
  if (!startDate || !endDate || typeof store.formatDateRangeWithYearBadges !== 'function') {
    return `${startDate || '—'} → ${endDate || '—'}`
  }
  return store.formatDateRangeWithYearBadges(startDate, endDate)
})

const performanceScenarioContext = computed(() => {
  const metrics = activeMetrics.value
  const plScenarios = metrics?.plScenarios || null
  const openShares = Number(plScenarios?.openShares || 0)
  const costBasis = Number(plScenarios?.costBasis || 0)
  const netPremiums = displayNetPremiums.value
  const durationWeeks = Number(metrics?.durationWeeks || 0)
  const rorCapitalBase = Number(metrics?.capitalAtRisk || 0)
  return {
    openShares,
    costBasis,
    netPremiums,
    durationWeeks,
    rorCapitalBase,
    currentValuePrice: openShares > 0 ? Number(plScenarios?.currentValue || 0) / openShares : null,
    fullRecoveryPrice: openShares > 0 ? Number(plScenarios?.costBasis || 0) / openShares : null,
    plusTenPrice: openShares > 0 ? (Number(plScenarios?.costBasis || 0) * 1.1) / openShares : null,
    hasOpenStockExposure: Boolean(plScenarios?.hasOpenStockExposure) && openShares > 0
  }
})

function normalizeScenarioPrice(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number.isFinite(Number(fallback)) ? Number(fallback) : 0
  }
  return parsed
}

function calculateScenarioRow({ key, label, defaultPrice }) {
  const context = performanceScenarioContext.value
  const closingPrice = normalizeScenarioPrice(scenarioClosePrices[key], defaultPrice)
  const projectedExitValue = context.openShares > 0 ? closingPrice * context.openShares : 0
  const projectedPL = context.netPremiums - context.costBasis + projectedExitValue
  const plPercent = context.costBasis > 0
    ? ((projectedPL / context.costBasis) * 100)
    : null
  const weeklyROR = context.rorCapitalBase > 0 && context.durationWeeks > 0
    ? ((projectedPL / context.rorCapitalBase / context.durationWeeks) * 100)
    : null

  return {
    key,
    label,
    closingPrice,
    projectedExitValue,
    projectedPL,
    plPercent,
    weeklyROR
  }
}

const performanceScenarioRows = computed(() => {
  const context = performanceScenarioContext.value
  if (!context.hasOpenStockExposure) return []

  return [
    calculateScenarioRow({
      key: 'worst',
      label: 'Current value (worst case)',
      defaultPrice: context.currentValuePrice
    }),
    calculateScenarioRow({
      key: 'recovery',
      label: 'Full recovery (original cost basis)',
      defaultPrice: context.fullRecoveryPrice
    }),
    calculateScenarioRow({
      key: 'plus10',
      label: 'Recovery above cost basis (Starts at 10%)',
      defaultPrice: context.plusTenPrice
    })
  ]
})

watch(
  () => [
    String(editingTrade.value?.id || ''),
    performanceScenarioContext.value.currentValuePrice,
    performanceScenarioContext.value.fullRecoveryPrice,
    performanceScenarioContext.value.plusTenPrice
  ],
  () => {
    scenarioClosePrices.worst = performanceScenarioContext.value.currentValuePrice
    scenarioClosePrices.recovery = performanceScenarioContext.value.fullRecoveryPrice
    scenarioClosePrices.plus10 = performanceScenarioContext.value.plusTenPrice
  },
  { immediate: true }
)

watch(showPerformanceTab, (visible) => {
  if (!visible && detailTab.value === 'performance') {
    detailTab.value = 'activity'
  }
})

const tradeNotes = computed(() => {
  if (!editingTrade.value) return []
  const allNotes = Array.isArray(store.activeAccount?.notes) ? store.activeAccount.notes : []
  return allNotes
    .filter(note => String(note?.targetCollection || '') === 'trades' && String(note?.targetId || '') === String(editingTrade.value.id))
    .map(note => ({
      id: String(note?.id || ''),
      noteText: String(note?.noteText || note?.note || ''),
      createdAt: String(note?.createdAt || ''),
      updatedAt: String(note?.updatedAt || '')
    }))
    .sort((a, b) => {
      const left = String(a.updatedAt || a.createdAt || '')
      const right = String(b.updatedAt || b.createdAt || '')
      if (left > right) return -1
      if (left < right) return 1
      return String(a.id).localeCompare(String(b.id))
    })
})

const originRow = computed(() => {
  if (!selectedRows.value.length) return null
  return sortRowsOldestFirst(selectedRows.value)[0] || null
})

const normalizedSelectedRows = computed(() => sortRowsOldestFirst(selectedRows.value))

const derivedSymbol = computed(() => {
  if (isEdit.value) return String(form.symbol || '').trim().toUpperCase()
  const originSymbol = String(originRow.value?._raw?.symbol || originRow.value?.symbol || '').trim().toUpperCase()
  if (originSymbol) return originSymbol
  const firstNonEmpty = normalizedSelectedRows.value.find(row => String(row?.symbol || '').trim())
  if (!firstNonEmpty) return ''
  const fullSymbol = String(firstNonEmpty?._raw?.symbol || '').trim().toUpperCase()
  if (fullSymbol) return fullSymbol
  return String(firstNonEmpty.symbol).trim().toUpperCase()
})

const canSave = computed(() => {
  if (form.status === 'closed' && !form.closedAt) return false
  if (isEdit.value) return Boolean(form.sourceTransactionId)
  return selectedRows.value.length > 0
})

const panelSubtitle = computed(() => {
  if (isEdit.value) return sourceTransactionLabel.value
  return derivedSymbol.value || ''
})

function show(trade = null) {
  formError.value = ''
  resetForm()
  if (trade) {
    isEdit.value = true
    tradeId.value = String(trade.id)
    form.sourceTransactionId = String(trade?.sourceTransactionId || '')
    form.symbol = String(trade?.displaySymbol || trade?.symbol || '').trim().toUpperCase()
    form.name = trade?.name || ''
    form.status = trade?.status || 'open'
    form.closedAt = trade?.closedAt || ''
    detailTab.value = 'performance'
  } else {
    isEdit.value = false
    tradeId.value = null
    detailTab.value = 'activity'
  }
  isVisible.value = true
}

store.showTradePanel = show

function close() {
  isVisible.value = false
  tradeId.value = null
  isEdit.value = false
  formError.value = ''
  resetForm()
}

function formatNoteTimestamp(value) {
  const raw = String(value || '')
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleString()
}

async function addTradeNote() {
  if (!editingTrade.value) return
  const text = noteDraft.value.trim()
  if (!text) return
  if (!Array.isArray(store.activeAccount.notes)) {
    store.activeAccount.notes = []
  }
  const now = new Date().toISOString()
  store.activeAccount.notes.push({
    id: `note_trd_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`,
    targetCollection: 'trades',
    targetId: String(editingTrade.value.id),
    noteText: text,
    note: text,
    createdAt: now,
    updatedAt: now
  })
  noteDraft.value = ''
  await store.saveChanges()
}

function beginEditNote(note) {
  if (!note?.id) return
  editingNoteId.value = String(note.id)
  editingNoteDraft.value = String(note.noteText || '')
}

function cancelEditNote() {
  editingNoteId.value = ''
  editingNoteDraft.value = ''
}

async function saveEditedNote(note) {
  if (!note?.id || !editingTrade.value) return
  const nextText = editingNoteDraft.value.trim()
  if (!nextText) return
  const allNotes = Array.isArray(store.activeAccount?.notes) ? store.activeAccount.notes : []
  const target = allNotes.find(entry =>
    String(entry?.id || '') === String(note.id) &&
    String(entry?.targetCollection || '') === 'trades' &&
    String(entry?.targetId || '') === String(editingTrade.value.id)
  )
  if (!target) return
  target.noteText = nextText
  target.note = nextText
  target.updatedAt = new Date().toISOString()
  await store.saveChanges()
  cancelEditNote()
}

function appendTradeNote(tradeId, text) {
  const normalizedTradeId = String(tradeId || '').trim()
  const normalizedText = String(text || '').trim()
  if (!normalizedTradeId || !normalizedText) return false
  if (!Array.isArray(store.activeAccount?.notes)) {
    store.activeAccount.notes = []
  }
  const now = new Date().toISOString()
  store.activeAccount.notes.push({
    id: `note_trd_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`,
    targetCollection: 'trades',
    targetId: normalizedTradeId,
    noteText: normalizedText,
    note: normalizedText,
    createdAt: now,
    updatedAt: now
  })
  return true
}

function validateCreateSelection() {
  const oldest = originRow.value
  if (!oldest) {
    formError.value = 'Add at least one transaction to create a trade.'
    return false
  }

  if (!derivedSymbol.value) {
    formError.value = 'Unable to determine trade symbol from selected activity.'
    return false
  }

  const mismatched = normalizedSelectedRows.value.find((row) => {
    const rowSymbol = String(row?.symbol || '').trim().toUpperCase()
    return rowSymbol && rowSymbol !== derivedSymbol.value
  })
  if (mismatched) {
    formError.value = `All selected activity must match symbol ${derivedSymbol.value} (blank symbols are allowed).`
    return false
  }
  return true
}

function openLinkActivityModal() {
  if (!editingTrade.value || !store.showSelectTradeTransactionsModal) return
  store.showSelectTradeTransactionsModal(
    {
      mode: 'link',
      tradeId: editingTrade.value.id,
      symbol: editingTrade.value.symbol
    },
    ({ selectedSourceIds }) => {
      if (!Array.isArray(selectedSourceIds) || selectedSourceIds.length === 0) return
      store.linkSourceTransactionsToTrade(editingTrade.value.id, selectedSourceIds)
    }
  )
}

function openCreateActivityModal() {
  if (isEdit.value || !store.showSelectTradeTransactionsModal) return
  store.showSelectTradeTransactionsModal(
    {
      mode: 'create',
      preselectedSourceIds: selectedRows.value.map(row => String(row?.id || ''))
    },
    ({ selectedRows: sourceRows }) => {
      selectedRows.value = sortRowsOldestFirst((Array.isArray(sourceRows) ? sourceRows : []).map(toDisplayRow))
    }
  )
}

function openActivitySelector() {
  if (isEdit.value) {
    openLinkActivityModal()
    return
  }
  openCreateActivityModal()
}

function removeLinkedActivity(row) {
  if (!isEdit.value || !editingTrade.value) return
  const relId = String(row?.relId || row?.id || '').trim()
  if (!relId) return
  const runUnlink = () => {
    try {
      store.unlinkTradeTransactions([relId])
      formError.value = ''
    } catch (error) {
      formError.value = String(error?.message || error)
    }
  }
  if (store.confirm) {
    store.confirm('Remove this linked activity from the trade?', runUnlink)
    return
  }
  if (window.confirm('Remove this linked activity from the trade?')) runUnlink()
}

function deleteTradeFromModal() {
  if (!editingTrade.value) return
  const runDelete = () => {
    store.deleteTrade(editingTrade.value.id)
    close()
  }
  if (store.confirm) {
    store.confirm(
      `Delete trade ${editingTrade.value.symbol}${editingTrade.value.name ? ` (${editingTrade.value.name})` : ''}?`,
      runDelete
    )
    return
  }
  if (window.confirm('Delete selected trade?')) runDelete()
}

async function submit() {
  formError.value = ''
  if (!canSave.value) {
    formError.value = form.status === 'closed'
      ? 'Closed trades require a closed date.'
      : 'Add activity before saving.'
    return
  }

  try {
    if (isEdit.value && tradeId.value) {
      store.updateTrade(tradeId.value, {
        sourceTransactionId: form.sourceTransactionId,
        name: form.name || null,
        status: form.status,
        closedAt: form.status === 'closed' ? form.closedAt : null
      })
      close()
      return
    }

    if (!validateCreateSelection()) return
    const origin = originRow.value
    const trade = store.createTrade({
      sourceTransactionId: origin.id,
      symbol: derivedSymbol.value,
      name: form.name || null,
      status: form.status,
      closedAt: form.status === 'closed' ? form.closedAt : null
    })

    const additionalIds = normalizedSelectedRows.value
      .filter(row => String(row.id) !== String(origin.id))
      .map(row => String(row.id))
    if (additionalIds.length > 0) {
      store.linkSourceTransactionsToTrade(trade.id, additionalIds)
    }
    const noteAdded = appendTradeNote(trade.id, noteDraft.value)
    if (noteAdded) {
      await store.saveChanges()
    }
    close()
  } catch (error) {
    formError.value = String(error?.message || error)
  }
}
</script>

<template>
  <div class="modal d-block trade-panel-overlay" tabindex="-1" v-if="isVisible">
    <div class="modal-dialog trade-panel-dialog">
      <div class="modal-content trade-panel-content">
        <div class="modal-header">
          <div>
            <h5 class="modal-title">{{ isEdit ? 'Trade Details' : 'New Trade' }}</h5>
            <div v-if="panelSubtitle" class="small text-muted mt-1">{{ panelSubtitle }}</div>
          </div>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <div class="row g-2 mb-3">
            <div class="col-12 col-lg-6">
              <label class="form-label">Trade name</label>
              <input class="form-control form-control-sm" v-model.trim="form.name" placeholder="Optional name" />
            </div>
            <div class="col-12 col-lg-3">
              <label class="form-label">Status</label>
              <select class="form-select form-select-sm" v-model="form.status">
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div class="col-12 col-lg-3" v-if="form.status === 'closed'">
              <label class="form-label">Closed date</label>
              <input type="date" class="form-control form-control-sm" v-model="form.closedAt" />
            </div>
          </div>

          <template v-if="showDetailTabs">
            <div class="card mb-2 trade-detail-tabs-card">
              <div class="card-header pt-2 pb-0">
                <ul class="nav nav-tabs card-header-tabs">
                  <li class="nav-item" v-if="showPerformanceTab">
                    <button
                      class="nav-link"
                      :class="{ active: detailTab === 'performance' }"
                      type="button"
                      @click="detailTab = 'performance'"
                    >
                      Performance
                    </button>
                  </li>
                  <li class="nav-item">
                    <button
                      class="nav-link"
                      :class="{ active: detailTab === 'activity' }"
                      type="button"
                      @click="detailTab = 'activity'"
                    >
                      Activity Summary
                    </button>
                  </li>
                  <li class="nav-item">
                    <button
                      class="nav-link"
                      :class="{ active: detailTab === 'notes' }"
                      type="button"
                      @click="detailTab = 'notes'"
                    >
                      Notes
                    </button>
                  </li>
                </ul>
              </div>
              <div class="card-body p-2" v-if="detailTab === 'performance' && showPerformanceTab && activeMetrics">
                <div class="row g-2 mb-2">
                  <div class="col-6 col-xl-2">
                    <div class="metric-tile">
                      <div class="metric-label">Lifecycle</div>
                      <div class="metric-value metric-value-sm">
                        <span v-html="lifecycleDateRangeHtml"></span><br />
                        <span class="small fw-normal text-body-secondary">({{ activeMetrics.durationWeeks }} Weeks)</span>
                      </div>
                    </div>
                  </div>
                  <div class="col-6 col-xl-2">
                    <div class="metric-tile">
                      <div class="metric-label">Capital At Risk</div>
                      <div class="metric-value">
                        {{ activeMetrics.capitalAtRisk > 0 ? store.currency(activeMetrics.capitalAtRisk) : 'N/A' }}
                      </div>
                    </div>
                  </div>
                  <div class="col-6 col-xl-2">
                    <div class="metric-tile">
                      <div class="metric-label">Original Cost Basis</div>
                      <div class="metric-value">
                        {{ displayCostBasis !== null ? store.currency(displayCostBasis) : 'N/A' }}
                      </div>
                    </div>
                  </div>
                  <div class="col-6 col-xl-2">
                    <div class="metric-tile">
                      <div class="metric-label">Net Premiums</div>
                      <div class="metric-value">{{ store.currency(displayNetPremiums) }}</div>
                    </div>
                  </div>
                  <div class="col-6 col-xl-2">
                    <div class="metric-tile">
                      <div class="metric-label">Net Cost Basis</div>
                      <div class="metric-value">
                        {{ displayNetCostBasis !== null ? store.currency(displayNetCostBasis) : 'N/A' }}
                      </div>
                    </div>
                  </div>
                  <div class="col-6 col-xl-2">
                    <div class="metric-tile">
                      <div class="metric-label">Net Cost / Share</div>
                      <div class="metric-value">
                        {{ displayNetCostPerShare !== null ? store.currency(displayNetCostPerShare) : 'N/A' }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="metric-tile">
                  <div class="metric-label">P/L outlook range</div>
                  <DataTable
                    v-if="performanceScenarioRows.length"
                    :items="performanceScenarioRows"
                    :columns="plOutlookColumns"
                    :striped="true"
                  >
                    <template #closePrice="{ item }">
                      <input
                        v-model.number="scenarioClosePrices[item.key]"
                        type="number"
                        min="0"
                        step="0.01"
                        class="form-control form-control-sm text-end"
                      />
                    </template>
                  </DataTable>
                  <div v-else-if="activeMetrics.plScenarios?.needsPositionResolution" class="small text-warning mt-1">
                    {{ activeMetrics.plScenarios.resolutionMessage }}
                  </div>
                  <div v-else class="small text-muted mt-1">
                    No open stock exposure was detected for this trade, so recovery scenarios are not applicable.
                  </div>
                </div>
              </div>
              <div class="card-body p-2" v-else-if="detailTab === 'activity'">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div v-if="isEdit" class="btn-group btn-group-sm" role="group" aria-label="Activity view mode">
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
                  <button class="btn btn-outline-success btn-sm ms-auto" @click="openActivitySelector">
                    <i class="bi bi-link-45deg me-1"></i> {{ isEdit ? 'Link Activity' : 'Select Activity' }}
                  </button>
                </div>
                <TransactionRowsTable
                  v-if="activityRows.length"
                  :columns="linkedSummaryColumns"
                  :rows="activityRows"
                  table-class="table table-sm table-striped align-middle"
                />
                <div v-else class="text-center text-muted py-3">No activity selected.</div>
              </div>
              <div class="card-body p-2" v-else-if="detailTab === 'notes'">
                <template v-if="isEdit">
                  <div class="d-flex justify-content-end align-items-start mb-2">
                    <button
                      class="btn btn-primary btn-sm"
                      :disabled="!noteDraft.trim()"
                      @click="addTradeNote"
                    >
                      Add Note
                    </button>
                  </div>
                  <textarea
                    class="form-control form-control-sm mb-3"
                    rows="2"
                    v-model.trim="noteDraft"
                    placeholder="Write a trade note..."
                  ></textarea>

                  <div v-if="tradeNotes.length === 0" class="text-center text-muted py-3">
                    No notes yet.
                  </div>
                  <div v-else class="d-flex flex-column gap-2">
                    <div v-for="note in tradeNotes" :key="note.id" class="border rounded p-2 trade-note-row">
                      <div class="d-flex justify-content-between align-items-start gap-2">
                        <div class="small text-muted mb-1">{{ formatNoteTimestamp(note.updatedAt || note.createdAt) }}</div>
                        <button
                          v-if="editingNoteId !== note.id"
                          class="btn btn-sm btn-outline-primary trade-note-edit-btn"
                          type="button"
                          title="Edit note"
                          @click="beginEditNote(note)"
                        >
                          <i class="bi bi-pencil-square"></i>
                        </button>
                      </div>
                      <div v-if="editingNoteId === note.id" class="d-flex flex-column gap-2">
                        <textarea
                          class="form-control form-control-sm"
                          rows="3"
                          v-model.trim="editingNoteDraft"
                        ></textarea>
                        <div class="d-flex gap-2 justify-content-end">
                          <button class="btn btn-sm btn-secondary" type="button" @click="cancelEditNote">Cancel</button>
                          <button class="btn btn-sm btn-primary" type="button" :disabled="!editingNoteDraft.trim()" @click="saveEditedNote(note)">Save</button>
                        </div>
                      </div>
                      <div v-else class="small">{{ note.noteText }}</div>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="small text-muted mb-2">
                    This note will be saved after you create the trade.
                  </div>
                  <textarea
                    class="form-control form-control-sm"
                    rows="4"
                    v-model.trim="noteDraft"
                    placeholder="Write a trade note..."
                  ></textarea>
                </template>
              </div>
            </div>
          </template>

          <div v-if="formError" class="alert alert-danger py-2 mt-3 mb-0">
            {{ formError }}
          </div>
        </div>
        <div class="modal-footer">
          <button v-if="isEdit" type="button" class="btn btn-outline-danger me-auto" @click="deleteTradeFromModal">
            <i class="bi bi-trash me-1"></i> Delete Trade
          </button>
          <button type="button" class="btn btn-secondary" @click="close">Close</button>
          <button type="button" class="btn btn-primary" :disabled="!canSave" @click="submit">
            {{ isEdit ? 'Save Changes' : 'Create Trade' }}
          </button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" @click="close"></div>
  </div>
</template>

<style scoped>
.trade-panel-overlay {
  padding-right: 0 !important;
}

.trade-panel-dialog {
  position: fixed;
  top: 0;
  right: 0;
  margin: 0;
  width: min(90vw, calc(100vw - 0.5rem));
  max-width: none;
  height: 100vh;
}

.trade-panel-content {
  height: 100vh;
  border-radius: 0;
  border-right: 0;
  border-top: 0;
  border-bottom: 0;
  animation: trade-details-panel-slide-in 0.38s ease-out;
}

.trade-panel-content .modal-body {
  overflow-y: auto;
}

@keyframes trade-details-panel-slide-in {
  from {
    transform: translateX(48px);
    opacity: 0.6;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.trade-detail-tabs-card .card-header {
  min-height: 43px;
  display: flex;
  align-items: flex-end;
}

.trade-detail-tabs-card .card-header .card-header-tabs {
  margin-bottom: 0;
}

.trade-note-row .trade-note-edit-btn {
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
}

.trade-note-row:hover .trade-note-edit-btn,
.trade-note-row .trade-note-edit-btn:focus {
  opacity: 1;
}

.metric-tile {
  border: 1px solid var(--bs-border-color);
  border-radius: 0.5rem;
  padding: 0.5rem 0.65rem;
  background-color: rgba(var(--bs-body-bg-rgb), 0.35);
  height: 100%;
}

.metric-label {
  font-size: 0.75rem;
  color: var(--bs-secondary-color);
  margin-bottom: 0.15rem;
}

.metric-value {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.2;
}

.metric-value-sm {
  font-size: 0.9rem;
  font-weight: 500;
}

</style>
