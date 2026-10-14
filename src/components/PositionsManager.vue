<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import DataTable from '@/components/custom/DataTable.vue'
import ConfirmModal from '@/components/modals/ConfirmModal.vue'
import {
  getPerSharePL,
  getWeeksHeld,
  getTotalROR,
  getWeeklyROR,
  getNetPLPerShare,
  getRawPL,
  getNetPL,
  getCurrentValue,
  getOpenShares,
  getSoldShares
} from '@/utils/positionUtils'

const store = useAppStore()
const confirmModalRef = ref(null)

// --- Merge Functionality ---
// Handles migration to ensure all positions have profitAllocation set
function migrateProfitAllocation() {
  let migrated = false
  if (!store.activeAccount || !Array.isArray(store.activeAccount.positions)) return
  store.activeAccount.positions.forEach(pos => {
    if (typeof pos.profitAllocation !== 'number') {
      pos.profitAllocation = 100
      migrated = true
    }
  })
  if (migrated) {
    store.saveBacon()
  }
}

// Run migration on mount and whenever positions are loaded/refreshed
onMounted(() => {
  migrateProfitAllocation()
})

// --- DataTable Columns Definition ---
// Defines columns for the positions table, including merge summary columns
const columns = [
  {
    key: 'symbol',
    header: {
      text: 'Symbol /<br/>Shares',
      tooltip: 'Underlying symbol & shares held'
    },
    value: (position) => position.symbol
  },
  {
    key: 'weeks',
    header: {
      text: 'Assigned /<br/> Sold Weeks',
      tooltip: 'Assigned week & sold week (if sold)'
    }
  },
  {
    key: 'costBasisProfits',
    header: {
      text: 'Cost Basis /<br/> Profits',
      tooltip: 'Original cost basis & offsetting profits'
    }
    // value handled by slot below
  },
  {
    key: 'currentValuePrice',
    header: {
      text: 'Current Value /<br/> Price per Share',
      tooltip: 'Current total value & value per share'
    }
    // value handled by slot below
  },
  {
    key: 'perSharePL',
    header: {
      text: 'PL Total /<br/>Per Share',
      tooltip: 'Total profit/loss excluding offsetting profits & per share'
    },
    // value handled by slot below
  },
  {
    key: 'netPL',
    header: {
      text: 'PL Net /<br/>Per Share',
      tooltip: 'Net profit/loss including offsetting profits & per share'
    }
    // value handled by slot below
  },
  {
    key: 'ror',
    header: {
      text: 'ROR % /<br/>Weekly %',
      tooltip: 'Return on Risk percentage based on net P/L total & per week'
    },
    // Remove getTooltip and tooltipHtml here, handle tooltip in slot below
    // value handled by slot below
  },
  {
    key: 'actions',
    header: {
      text: 'Actions'
    },
    class: 'col-6 col-xl-1'
  }
]

// --- Filtering and Selection State ---
// Handles filtering positions by open/closed/all and selection for merging
const filter = ref('open')
const symbolFilterInput = ref('')
const selectedSymbols = ref([])
const isFilterAccordionOpen = ref(true)

const positionsByStatusFilter = computed(() => {
  const positions = Array.isArray(store.activeAccount?.positions) ? store.activeAccount.positions : []
  if (filter.value === 'open') {
    return positions.filter(position => !position.soldWeek)
  }
  if (filter.value === 'closed') {
    return positions.filter(position => position.soldWeek)
  }
  return positions
})

const availableSymbols = computed(() => {
  return [...new Set(
    positionsByStatusFilter.value
      .map(position => (position.symbol || '').trim().toUpperCase())
      .filter(Boolean)
  )].sort()
})

const symbolSuggestions = computed(() => {
  const query = symbolFilterInput.value.trim().toUpperCase()
  if (!query) return []
  const selected = new Set(selectedSymbols.value)
  return availableSymbols.value
    .filter(symbol => !selected.has(symbol) && symbol.includes(query))
    .slice(0, 12)
})

const filteredPositions = computed(() => {
  if (!store.activeAccount.positions) return []
  const selectedSymbolSet = new Set(selectedSymbols.value)
  return positionsByStatusFilter.value.filter((position) => {
    if (selectedSymbolSet.size > 0) {
      const symbol = (position.symbol || '').trim().toUpperCase()
      if (!selectedSymbolSet.has(symbol)) return false
    }
    return true
  })
})

const selectedPositionKeys = ref([])

const toggleSelect = (index) => {
  const pos = filteredPositions.value[index]
  if (!pos) return
  const key = pos.positionKey
  const i = selectedPositionKeys.value.indexOf(key)
  if (i === -1) {
    selectedPositionKeys.value.push(key)
  } else {
    selectedPositionKeys.value.splice(i, 1)
  }
}

const clearSelection = () => {
  selectedPositionKeys.value = []
}

function addSymbolFilter(symbol) {
  const normalized = (symbol || '').trim().toUpperCase()
  if (!normalized) return
  if (!availableSymbols.value.includes(normalized)) return
  if (selectedSymbols.value.includes(normalized)) {
    symbolFilterInput.value = ''
    return
  }
  selectedSymbols.value.push(normalized)
  symbolFilterInput.value = ''
  clearSelection()
}

function addFirstMatchingSymbol() {
  const normalized = symbolFilterInput.value.trim().toUpperCase()
  if (!normalized) return
  if (availableSymbols.value.includes(normalized)) {
    addSymbolFilter(normalized)
    return
  }
  if (symbolSuggestions.value.length > 0) {
    addSymbolFilter(symbolSuggestions.value[0])
  }
}

function removeSymbolFilter(symbol) {
  selectedSymbols.value = selectedSymbols.value.filter(item => item !== symbol)
  clearSelection()
}

function clearSymbolFilters() {
  if (selectedSymbols.value.length === 0) return
  selectedSymbols.value = []
  clearSelection()
}

function handleSymbolFilterKeydown(event) {
  if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
    addFirstMatchingSymbol()
    if (event.key !== 'Tab' || symbolFilterInput.value.trim()) {
      event.preventDefault()
    }
  } else if (event.key === 'Backspace' && !symbolFilterInput.value && selectedSymbols.value.length > 0) {
    selectedSymbols.value.pop()
    clearSelection()
  }
}

const canMerge = computed(() => selectedPositionKeys.value.length >= 2)

const firstSelectedSymbol = computed(() => {
  if (selectedPositionKeys.value.length === 0) return null
  const firstKey = selectedPositionKeys.value[0]
  const first = filteredPositions.value.find(p => p.positionKey === firstKey)
  return first ? first.symbol : null
})

watch(availableSymbols, () => {
  const available = new Set(availableSymbols.value)
  const filteredSelected = selectedSymbols.value.filter(symbol => available.has(symbol))
  if (filteredSelected.length !== selectedSymbols.value.length) {
    selectedSymbols.value = filteredSelected
    clearSelection()
  }
})

const mobileFilterSummary = computed(() => {
  const statusLabel = filter.value.charAt(0).toUpperCase() + filter.value.slice(1)
  const symbolCount = selectedSymbols.value.length
  const symbolLabel = symbolCount === 0
    ? 'All symbols'
    : `${symbolCount} symbol${symbolCount === 1 ? '' : 's'} selected`
  return `${statusLabel} • ${symbolLabel}`
})

// --- Merge Action ---
// When merge is triggered, assigns a mergeGroup id to selected positions
const mergePositions = () => {
  // Get the selected positions (by positionKey)
  const selected = store.activeAccount.positions.filter(p => selectedPositionKeys.value.includes(p.positionKey))
  if (selected.length < 2) return
  // Generate a unique group id
  const groupId = 'group_' + Date.now() + '_' + Math.floor(Math.random() * 10000)
  // Assign the group id to all selected positions
  selected.forEach(sel => {
    const idx = store.activeAccount.positions.findIndex(p => p.positionKey === sel.positionKey)
    if (idx !== -1) {
      store.activeAccount.positions[idx].mergeGroup = groupId
    }
  })
  // Auto-calculate allocation percentage for each member based on quantity
  const totalQty = selected.reduce((sum, pos) => sum + (pos.shares || 0), 0)
  if (totalQty > 0) {
    selected.forEach(sel => {
      const idx = store.activeAccount.positions.findIndex(p => p.positionKey === sel.positionKey)
      if (idx !== -1) {
        store.activeAccount.positions[idx].profitAllocation = Math.round((sel.shares / totalQty) * 10000) / 100 // 2 decimals
      }
    })
  }
  store.saveBacon()
  clearSelection()
}

// --- Manual Position Add/Remove ---
// Handles adding and removing manual positions
const addManualPosition = () => {
  // Only allow adding a manual position for stocks owned prior to the account start date
  const startWeek = 1 // Always week 1 for account start
  store.showPositionModal({
    symbol: '',
    shares: 0,
    costBasis: 0,
    assignedWeek: startWeek, // Default to account start week
    assignedDate: null, // No date selection
    offsettingProfits: 0,
    startWeek: startWeek, // Default to account start week
    manual: true
  }, null, { manual: true })
}

const removePosition = (index) => {
  const item = filteredPositions.value[index]
  if (!item || !item.manual) return
  confirmModalRef.value.show(
    `Are you sure you want to remove manual position for ${item.symbol}?`,
    () => {
      // Find the actual index in the positions array
      const actualIndex = store.activeAccount.positions.findIndex(p => p === item)
      if (actualIndex !== -1) {
        store.activeAccount.positions.splice(actualIndex, 1)
        store.saveBacon()
      }
    }
  )
}

// --- Merge Group Expand/Collapse State ---
// Handles expanding/collapsing merged group summary rows
const expandedGroups = ref([])

const toggleExpandGroup = (groupId) => {
  const i = expandedGroups.value.indexOf(groupId)
  if (i === -1) {
    expandedGroups.value.push(groupId)
  } else {
    expandedGroups.value.splice(i, 1)
  }
}

// --- Display Positions Computed ---
// Computes the list of positions to display in the table, replacing merged positions with a summary row
const displayPositions = computed(() => {
  // Group positions by mergeGroup
  const groups = {}
  filteredPositions.value.forEach((pos, i) => {
    if (pos.mergeGroup) {
      if (!groups[pos.mergeGroup]) groups[pos.mergeGroup] = []
      groups[pos.mergeGroup].push({ pos, i })
    }
  })
  const result = []
  const usedGroups = new Set()
  filteredPositions.value.forEach((pos, i) => {
    if (pos.mergeGroup && groups[pos.mergeGroup] && !usedGroups.has(pos.mergeGroup)) {
      if (expandedGroups.value.includes(pos.mergeGroup)) {
        // Expanded: show all group members
        groups[pos.mergeGroup].forEach(({ pos }) => result.push(pos))
      } else {
        // Collapsed: show summary row for the merged group
        const group = groups[pos.mergeGroup]
        // Create a merged summary object
        const merged = { ...group[0].pos, isMergedSummary: true }
        merged.shares = group.reduce((sum, { pos }) => sum + (pos.shares || 0), 0)
        merged.soldShares = group.reduce((sum, { pos }) => sum + getSoldShares(pos), 0)
        merged.costBasis = group.reduce((sum, { pos }) => sum + (pos.costBasis || 0), 0)
        merged.offsettingProfits = group.reduce((sum, { pos }) => sum + (pos.offsettingProfits || 0), 0)
        merged.assignedWeek = Math.min(...group.map(({ pos }) => pos.assignedWeek || 0))
        merged.startWeek = Math.min(...group.map(({ pos }) => pos.startWeek || 0))
        const mergedOpenShares = merged.shares - merged.soldShares
        merged.soldWeek = mergedOpenShares === 0 ? Math.max(...group.map(({ pos }) => pos.soldWeek || 0)) : null
        merged.manual = group.some(({ pos }) => pos.manual)
        const totalOpenShares = group.reduce((sum, { pos }) => sum + getOpenShares(pos), 0)
        const totalUnrealizedValue = group.reduce((sum, { pos }) => sum + ((pos.currentPrice || 0) * getOpenShares(pos)), 0)
        merged.currentPrice = totalOpenShares > 0 ? totalUnrealizedValue / totalOpenShares : 0
        merged.sellAmount = group.reduce((sum, { pos }) => sum + (pos.sellAmount || 0), 0)
        merged.mergeGroup = pos.mergeGroup
        merged.profitAllocation = 100 // Always 100% for merged summary
        result.push(merged)
      }
      usedGroups.add(pos.mergeGroup)
    } else if (!pos.mergeGroup) {
      result.push(pos)
    }
  })

  return result
})

function getLatestSellWeek(position) {
  if (!store.activeAccount?.sells || !position?.positionKey) return null
  const weeks = store.activeAccount.sells
    .filter(sell => Array.isArray(sell.allocated) && sell.allocated.some(a => a.positionKey === position.positionKey))
    .map(sell => Number(sell.week))
    .filter(week => !Number.isNaN(week))
  if (!weeks.length) return null
  return Math.max(...weeks)
}

function getSharesLabel(position) {
  const openShares = getOpenShares(position)
  const soldShares = getSoldShares(position)
  if (soldShares <= 0) {
    return `${position.shares} shares`
  }
  return `${openShares} shares`
}

function getSoldSharesSuffix(position) {
  const soldShares = getSoldShares(position)
  if (soldShares <= 0) return null
  return `(${soldShares} sold)`
}

// State for merged group modal
const mergedGroupEdit = ref({
  visible: false,
  group: null,
  startWeek: null,
  currentPrice: null
})

// Open modal for merged group editing
function openMergedGroupEditModal(mergedItem) {
  mergedGroupEdit.value.group = mergedItem.mergeGroup
  mergedGroupEdit.value.startWeek = mergedItem.startWeek
  mergedGroupEdit.value.currentPrice = mergedItem.currentPrice
  mergedGroupEdit.value.visible = true
}

// Save handler for merged group modal
function saveMergedGroupEdit() {
  const groupId = mergedGroupEdit.value.group
  const startWeek = mergedGroupEdit.value.startWeek
  const currentPrice = mergedGroupEdit.value.currentPrice
  if (!groupId) return
  // Update all positions in this merge group
  store.activeAccount.positions.forEach(pos => {
    if (pos.mergeGroup === groupId) {
      pos.startWeek = startWeek
      pos.currentPrice = currentPrice
    }
  })
  store.saveBacon()
  mergedGroupEdit.value.visible = false
}

// Remove a position from a merge group
function removeFromMergeGroup(groupId, positionKey) {
  // Otherwise, just remove from the selected position
  const pos = store.activeAccount.positions.find(p => p.positionKey === positionKey)
  if (pos && pos.mergeGroup === groupId) {
    delete pos.mergeGroup
  }
  // Find all positions in the group
  const groupPositions = store.activeAccount.positions.filter(p => p.mergeGroup === groupId)
  if (groupPositions.length === 1) {
    // Remove mergeGroup from all positions in the group
    groupPositions.forEach(p => { delete p.mergeGroup })
    store.saveBacon()
  }
  else {
    store.saveBacon()
  }
}
</script>

<template>
  <div class="positions-container positions-manager-layout">
    <div class="accordion mb-3 positions-filter-accordion">
      <div class="accordion-item shadow-sm">
        <h2 class="accordion-header">
          <button
            class="accordion-button py-2"
            type="button"
            :class="{ collapsed: !isFilterAccordionOpen }"
            @click="isFilterAccordionOpen = !isFilterAccordionOpen"
          >
            <span class="small text-muted fw-semibold">Position filters</span>
            <span v-if="!isFilterAccordionOpen" class="small text-muted ms-2">
              {{ mobileFilterSummary }}
            </span>
          </button>
        </h2>
        <div class="accordion-collapse collapse" :class="{ show: isFilterAccordionOpen }">
          <div class="accordion-body py-2">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
              <div class="d-flex flex-wrap align-items-center gap-2">
                <div class="btn-group" role="group" aria-label="Position status filter">
                  <button type="button" class="btn btn-outline-primary" :class="{ active: filter === 'open' }" @click="filter = 'open'">Open</button>
                  <button type="button" class="btn btn-outline-primary" :class="{ active: filter === 'closed' }" @click="filter = 'closed'">Closed</button>
                  <button type="button" class="btn btn-outline-primary" :class="{ active: filter === 'all' }" @click="filter = 'all'">All</button>
                </div>
              </div>
              <div class="d-flex align-items-center gap-2">
                <button type="button" class="btn btn-primary btn-sm" @click="addManualPosition">
                  <i class="bi bi-plus-lg"></i> Add
                </button>
                <button v-if="canMerge" type="button" class="btn btn-warning btn-sm" @click="mergePositions">
                  <i class="bi bi-arrow-merge"></i> Merge
                </button>
              </div>
            </div>

            <div class="d-flex flex-wrap gap-2 mb-2" v-if="selectedSymbols.length > 0">
              <span v-for="symbol in selectedSymbols" :key="symbol" class="badge text-bg-primary symbol-chip">
                {{ symbol }}
                <button
                  type="button"
                  class="btn-close btn-close-white ms-2"
                  aria-label="Remove symbol filter"
                  @click="removeSymbolFilter(symbol)"
                ></button>
              </span>
            </div>
            <div class="position-relative">
              <input
                v-model="symbolFilterInput"
                type="text"
                class="form-control"
                placeholder="Type a symbol and press Enter (e.g., AAPL)"
                @keydown="handleSymbolFilterKeydown"
              >
              <div v-if="symbolFilterInput.trim()" class="list-group position-absolute w-100 symbol-suggestions">
                <button
                  v-for="symbol in symbolSuggestions"
                  :key="symbol"
                  type="button"
                  class="list-group-item list-group-item-action"
                  @mousedown.prevent="addSymbolFilter(symbol)"
                >
                  {{ symbol }}
                </button>
                <div v-if="symbolSuggestions.length === 0" class="list-group-item text-muted">
                  No matching symbols for the current {{ filter }} filter.
                </div>
              </div>
            </div>
            <div class="d-flex flex-wrap justify-content-between align-items-center mt-2 gap-2">
              <div class="form-text mb-0">
                Multiple symbols supported. Press Enter to add, Backspace to remove the last chip.
              </div>
              <button
                v-if="selectedSymbols.length > 0"
                type="button"
                class="btn btn-sm btn-outline-secondary"
                @click="clearSymbolFilters"
              >
                Clear symbols
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="positions-table-region">
      <DataTable 
        :columns="columns"
        :items="displayPositions"
        :striped="true"
      >
    <!-- Symbol column -->
    <template #symbol="{ item, index }">
      <div class="d-flex align-items-center">
        <!-- Show remove-from-group icon for expanded group members -->
        <div v-if="item.mergeGroup && !item.isMergedSummary && expandedGroups.includes(item.mergeGroup)">
          <button
            class="btn btn-sm btn-outline-danger me-2"
            title="Remove from merged group"
            @click.stop="removeFromMergeGroup(item.mergeGroup, item.positionKey)"
          >
            <i class="bi bi-box-arrow-left"></i>
          </button>
        </div>
        <div v-else-if="(selectedPositionKeys.length === 0 || (firstSelectedSymbol && item.symbol === firstSelectedSymbol)) && !item.isMergedSummary && !item.mergeGroup">
          <input
            type="checkbox"
            class="form-check-input me-2"
            :checked="selectedPositionKeys.includes(item.positionKey)"
            @change="toggleSelect(index)"
            v-if="!item.mergeGroup"
          >
        </div>
        <div v-else-if="item.isMergedSummary">
          <i class="bi bi-arrow-merge text-warning position-symbol"></i>
        </div>
        <!-- Always render the symbol and shares labels -->
        <div class="position-symbol d-none d-xl-flex">
          <span class="symbol-text">{{ item.symbol }}</span>
          <span class="shares-count">{{ getSharesLabel(item) }}</span>
          <span v-if="getSoldSharesSuffix(item)" class="shares-count text-muted">{{ getSoldSharesSuffix(item) }}</span>
        </div>
        <div class="d-xl-none">
          <span class="symbol-text">{{ item.symbol }}</span>
          <div class="shares-count">{{ getSharesLabel(item) }}</div>
          <div v-if="getSoldSharesSuffix(item)" class="shares-count text-muted">{{ getSoldSharesSuffix(item) }}</div>
        </div>
      </div>
    </template>
    
    <!-- Weeks column -->
    <template #weeks="{ item }">
      <div>
        <div v-html="store.weekRange(item.assignedWeek)"></div>
        <div v-if="item.soldWeek" v-html="store.weekRange(item.soldWeek)"></div>
        <div v-else-if="getSoldShares(item) > 0" class="text-warning">
          <div v-if="getLatestSellWeek(item)" v-html="store.weekRange(getLatestSellWeek(item))"></div>
          <div>Partial Sale</div>
        </div>
        <div v-else class="text-muted">Not Yet Sold</div>
      </div>
    </template>
    
    <!-- Add slots for each value that needs conditional styling -->
    <template #perSharePL="{ item }">
      <div class="d-flex flex-column">
        <span :class="getPerSharePL(item) > 0 ? 'text-success' : 'text-danger'">{{ store.currency(getRawPL(item)) }}</span>
        <span :class="getPerSharePL(item) > 0 ? 'text-success' : 'text-danger'">{{ store.currency(getPerSharePL(item)) }}  / share</span>
      </div>
    </template>
    <template #netPL="{ item }">
      <div class="d-flex flex-column" :class="getNetPL(item) > 0 ? 'text-success' : 'text-danger'">
        <span>{{ store.currency(getNetPL(item)) }}</span>
        <span>{{ store.currency(getNetPLPerShare(item)) }} / share</span>
      </div>
    </template>
    <template #ror="{ item }">
      <div
        class="d-flex flex-column"
        :class="getTotalROR(item) > 0 ? 'text-success' : 'text-danger'"
        :title="`Held for ${getWeeksHeld(item, store)} week${getWeeksHeld(item, store) > 1 ? 's' : ''}`"
      >
        <span>{{ getTotalROR(item).toFixed(2) }}%</span>
        <span>{{ getWeeklyROR(item, store).toFixed(2) }}% / week <i class="bi bi-info-circle ms-1"></i></span>
      </div>
    </template>
    
    <!-- Cost Basis & Profits column slot -->
    <template #costBasisProfits="{ item }">
      <div class="d-flex flex-column">
        <span>{{ store.currency(item.costBasis) }}</span>
        <span class="text-success small">{{ store.currency(item.offsettingProfits || 0) }}</span>
      </div>
    </template>

    <!-- Current Value / Price per Share column slot -->
    <template #currentValuePrice="{ item }">
      <div class="d-flex flex-column">
        <span>
          {{ store.currency(getCurrentValue(item)) }}
        </span>
        <span class="small text-muted">
          {{ store.currency(item.currentPrice) }} / share
        </span>
      </div>
    </template>
    
    <!-- Actions column -->
    <template #actions="{ item, index }">
      <div class="d-flex gap-2">
        <template v-if="item.isMergedSummary">
          <button class="btn btn-sm btn-outline-primary flex-grow-0" 
                  title="Edit merged group"
                  @click="store.showPositionModal(item, item.mergeGroup)">
            <i class="bi bi-stickies"></i>
          </button>
          <button class="btn btn-sm btn-outline-secondary flex-grow-0" @click="toggleExpandGroup(item.mergeGroup)">
            <i :class="expandedGroups.includes(item.mergeGroup) ? 'bi bi-chevron-up' : 'bi bi-chevron-down'"></i>
          </button>
        </template>
        <template v-else>
          <button class="btn btn-sm btn-outline-primary flex-grow-0" 
                  @click="store.showPositionModal(item)">
            <i class="bi bi-pencil-square"></i>
          </button>
          <!-- Collapse button for expanded group members (only show on first member, after edit button) -->
          <button v-if="item.mergeGroup && expandedGroups.includes(item.mergeGroup) && displayPositions.findIndex(p => p === item) === displayPositions.findIndex(p => p.mergeGroup === item.mergeGroup && !p.isMergedSummary)" class="btn btn-sm btn-outline-secondary flex-grow-0" @click="toggleExpandGroup(item.mergeGroup)">
            <i class="bi bi-chevron-up"></i>
          </button>
          <button v-if="item.manual" class="btn btn-sm btn-outline-danger flex-grow-0" 
                  @click="removePosition(index)" title="Remove manual position">
            <i class="bi bi-trash"></i>
          </button>
        </template>
      </div>
    </template>
    
    <!-- Empty state message -->
    <template v-if="filteredPositions.length === 0" #empty>
      <div class="text-center py-5">
        <p class="text-muted">No positions found</p>
      </div>
      </template>
    </DataTable>
    </div>
  <ConfirmModal ref="confirmModalRef" />

  <!-- Add modal for merged group editing -->
  <template v-if="mergedGroupEdit.visible">
    <div class="modal d-block" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Edit Merged Group</h5>
            <button type="button" class="btn-close" @click="mergedGroupEdit.visible = false"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Start Week</label>
              <select class="form-select" v-model="mergedGroupEdit.startWeek">
                <option v-for="p in store.projections" :key="p.week" :value="p.week">
                  Week {{ p.week }} ({{ store.weekRange(p.week, true) }})
                </option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label">Current Price</label>
              <input type="number" class="form-control" v-model.number="mergedGroupEdit.currentPrice" min="0" step="0.001">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="mergedGroupEdit.visible = false">Cancel</button>
            <button type="button" class="btn btn-primary" @click="saveMergedGroupEdit">Save</button>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show"></div>
    </div>
  </template>
  </div>
</template>

<style>
/* Position symbol and shares styling */
.position-symbol {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.symbol-text {
  font-weight: 700;
  font-size: 1.1rem;
}

.shares-count {
  font-size: 0.85rem;
  color: #6c757d;
}

.symbol-chip {
  display: inline-flex;
  align-items: center;
}

.symbol-chip .btn-close {
  font-size: 0.55rem;
}

.symbol-suggestions {
  z-index: 10;
  max-height: 240px;
  overflow-y: auto;
}

.positions-manager-layout {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 0.5rem;
  box-sizing: border-box;
}

.positions-table-region {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.positions-table-region .data-table-container {
  flex: 1;
  min-height: 0;
  height: auto !important;
}

.positions-filter-accordion .accordion-item {
  overflow: hidden;
  border-color: var(--bs-border-color);
}

.positions-filter-accordion .accordion-button {
  background-color: var(--bs-tertiary-bg);
}

.positions-filter-accordion .accordion-button:not(.collapsed) {
  color: inherit;
  box-shadow: none;
}

.positions-filter-accordion .accordion-body {
  border-top: 1px solid var(--bs-border-color);
  background-color: var(--bs-body-bg);
}
</style>
