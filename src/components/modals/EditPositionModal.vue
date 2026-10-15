<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import DataTable from '@/components/custom/DataTable.vue'
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
const isVisible = ref(false)
const isEdit = ref(false)
const showAllocationDetails = ref(true)
const originalMetaFields = ref(null)

// Default position template
const defaultPosition = {
  symbol: '',
  shares: 100,
  costBasis: 0,
  currentPrice: 0,
  assignedWeek: null,
  soldWeek: null,
  sellAmount: null,
  offsettingProfits: 0,
  startWeek: null,
  profitAllocation: 100
}

// Use a local reactive position for editing
const position = reactive({ ...defaultPosition })

// Watch for assignedWeek changes and validate soldWeek
watch(() => position.assignedWeek, (newVal) => {
  // Reset soldWeek if it's now invalid (less than assigned week)
  if (position.soldWeek && position.soldWeek < newVal) {
    position.soldWeek = null
  }
})

// Merged group ID for handling position groups
const mergedGroupID = ref(null)

// Set position value when modal is shown
const show = (posObj = null, groupId = null) => {
  if (posObj) {
    isEdit.value = true
    Object.assign(position, posObj)
    store.ensurePositionMetaKey(position)
    originalMetaFields.value = {
      offsettingProfits: Number(posObj.offsettingProfits || 0),
      profitAllocation: Number(posObj.profitAllocation || 100)
    }
    // If profitAllocation is missing (old data), default to 100
    if (typeof position.profitAllocation !== 'number') position.profitAllocation = 100
  } else {
    isEdit.value = false
    Object.assign(position, defaultPosition)
    originalMetaFields.value = null
  }
  mergedGroupID.value = groupId || (posObj && posObj.mergeGroup) || null
  showAllocationDetails.value = true
  isVisible.value = true
  setTimeout(() => { modalInitialized = true }, 0)
}

// Expose the show function to the store for external use
store.showPositionModal = show

// When modal closes, reset modalInitialized
const close = () => {
  isVisible.value = false
  modalInitialized = false
  mergedGroupID.value = null
  showAllocationDetails.value = false
  originalMetaFields.value = null
}

const save = () => {
  // If editing a merged group, update all positions in the group
  if (mergedGroupID.value) {
    const groupId = mergedGroupID.value
    const startWeek = position.startWeek
    const currentPrice = position.currentPrice
    store.activeAccount.positions.forEach(pos => {
      if (pos.mergeGroup === groupId) {
        pos.startWeek = startWeek
        pos.currentPrice = currentPrice
      }
    })
    store.recalculateAllOffsettingProfits()
    store.saveBacon()
    close()
    return
  }

  if (!position.symbol.trim()) {
    alert('Symbol is required')
    return
  }

  // Validate costBasis input
  if (isNaN(position.costBasis) || position.costBasis <= 0) {
    alert('Cost Basis must be a positive number')
    return
  }

  // Ensure currentPrice is 0 or positive
  if (isNaN(position.currentPrice) || position.currentPrice < 0) {
    position.currentPrice = 0
  }

  // If soldWeek is set, require sellAmount
  if (position.soldWeek && (position.sellAmount === null || isNaN(position.sellAmount) || position.sellAmount === '')) {
    alert('Sell Amount is required when Sold Week is set')
    return
  }

  // If sellAmount is set, ensure it's a number
  if (position.sellAmount !== null && position.sellAmount !== '' && isNaN(position.sellAmount)) {
    alert('Sell Amount must be a number')
    return
  }

  // If this is a new position, add to array
  if (!isEdit.value) {
    const newPosition = { ...position }
    store.ensurePositionMetaKey(newPosition)
    store.activeAccount.positions.push(newPosition)
    if (newPosition.manual) {
      store.upsertPositionMetaOverride(newPosition, {
        offsettingProfitsOverride: Number(newPosition.offsettingProfits || 0),
        profitAllocationOverride: Number(newPosition.profitAllocation || 100)
      })
    }
    store.activeAccount.positions.sort((a, b) => (a.assignedWeek || 0) - (b.assignedWeek || 0))
  }
  else {
    // Save the object to the store using the positionKey
    const idx = store.activeAccount.positions.findIndex(p => p.positionKey === position.positionKey)
    if (idx !== -1) {
      const updatedPosition = { ...position }
      store.ensurePositionMetaKey(updatedPosition)
      store.activeAccount.positions[idx] = updatedPosition

      const original = originalMetaFields.value || { offsettingProfits: 0, profitAllocation: 100 }
      const offsettingChanged = Number(updatedPosition.offsettingProfits || 0) !== Number(original.offsettingProfits || 0)
      const allocationChanged = Number(updatedPosition.profitAllocation || 100) !== Number(original.profitAllocation || 100)
      if (offsettingChanged || allocationChanged) {
        store.upsertPositionMetaOverride(updatedPosition, {
          offsettingProfitsOverride: Number(updatedPosition.offsettingProfits || 0),
          profitAllocationOverride: Number(updatedPosition.profitAllocation || 100)
        })
      }
    }
  }
  store.saveBacon()
  close()
}

// Add watcher for startWeek to recalculate offsettingProfits
let modalInitialized = false

watch(() => position.startWeek, (newStartWeek, oldStartWeek) => {
  if (!modalInitialized) return
  if (!newStartWeek || newStartWeek === oldStartWeek) return
  store.recalculateOffsettingProfits(position)
})

watch(() => position.profitAllocation, (newProfitAllocation, oldProfitAllocation) => {
  if (!modalInitialized) return
  if (!position.startWeek || newProfitAllocation === oldProfitAllocation) return
  store.recalculateOffsettingProfits(position)
})

const allocatedSellRows = computed(() => {
  if (!position.positionKey || !store.activeAccount?.sells) return []

  const baseCostPerShare = position.shares > 0 ? position.costBasis / position.shares : 0
  const isShortPosition = position.positionType === 'short' || Number(position.costBasis || 0) < 0
  const totalCoveredShares = Number(position.soldShares || 0)
  const totalCoverCost = Number(position.sellAmount || 0)
  const assignedWeek = Number(position.assignedWeek || 0)
  const rows = []

  store.activeAccount.sells.forEach(sell => {
    if (!Array.isArray(sell.allocated) || !sell.shares || !sell.amount) return
    const sellAction = (sell.action || '').toString().toLowerCase()
    if (Number(sell.week || 0) < assignedWeek) return

    sell.allocated.forEach(allocation => {
      if (allocation.positionKey !== position.positionKey) return
      const allocatedShares = Number(allocation.shares || 0)
      if (allocatedShares <= 0) return
      const proceeds = (Number(sell.amount) * allocatedShares) / Number(sell.shares)
      let allocatedCostBasis = baseCostPerShare * allocatedShares
      let realizedPL = proceeds - allocatedCostBasis

      if (isShortPosition && sellAction.includes('short')) {
        allocatedCostBasis = totalCoveredShares > 0 ? (totalCoverCost * allocatedShares) / totalCoveredShares : 0
        realizedPL = proceeds - allocatedCostBasis
      }

      rows.push({
        sellWeek: Number(sell.week),
        sellDate: sell.date || '',
        shares: allocatedShares,
        proceeds,
        avgSellPrice: proceeds / allocatedShares,
        allocatedCostBasis,
        realizedPL
      })
    })
  })

  rows.sort((a, b) => a.sellWeek - b.sellWeek)
  return rows
})

const allocatedSalesColumns = [
  {
    key: 'sellWeek',
    header: { text: 'Week' },
    class: 'col-6 col-xl-1'
  },
  {
    key: 'sellDate',
    header: { text: 'Date' },
    class: 'col-6 col-xl-2'
  },
  {
    key: 'shares',
    header: { text: 'Shares' },
    class: 'col-6 col-xl-1'
  },
  {
    key: 'proceeds',
    header: { text: 'Proceeds' },
    class: 'col-6 col-xl-2',
    value: (sale) => store.currency(sale.proceeds)
  },
  {
    key: 'avgSellPrice',
    header: { text: 'Avg Sell' },
    class: 'col-6 col-xl-2',
    value: (sale) => store.currency(sale.avgSellPrice)
  },
  {
    key: 'allocatedCostBasis',
    header: { text: 'Cost Basis' },
    class: 'col-6 col-xl-2',
    value: (sale) => store.currency(sale.allocatedCostBasis)
  },
  {
    key: 'realizedPL',
    header: { text: 'Realized P/L' },
    class: 'col-6 col-xl-2'
  }
]
</script>

<template>
  <div class="modal" id="edit-position-modal" tabindex="-1" :class="{ 'd-block': isVisible }" v-show="isVisible">
    <div class="modal-dialog modal-xl modal-dialog-scrollable edit-position-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ isEdit ? 'Edit' : 'Add' }} Position</h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <div class="row">
            <div class="col-md-4 mb-4 mb-md-0">
              <div class="position-summary h-100 d-flex flex-column">
                <h5 class="border-bottom pb-2 mb-4">Position Summary</h5>
                
                <!-- Cost Basis | Offsetting Profits -->
                <div class="row mb-4">
                  <div class="col-6 summary-item">
                    <label class="fw-bold">Cost Basis</label>
                    <div class="value">{{ store.currency(position.costBasis) }}</div>
                  </div>
                  <div class="col-6 summary-item">
                    <label class="fw-bold">Offsetting Profits</label>
                    <div class="value text-success">{{ store.currency(position.offsettingProfits || 0) }}</div>
                  </div>
                </div>
                <!-- Current Value | Price per Share -->
                <div class="row mb-4">
                  <div class="col-6 summary-item">
                    <label class="fw-bold">Current Value</label>
                    <div class="value">
                      {{ store.currency(getCurrentValue(position)) }}
                    </div>
                  </div>
                  <div class="col-6 summary-item">
                    <label class="fw-bold">Price per Share</label>
                    <div class="value">
                      {{ store.currency(position.currentPrice) }}
                    </div>
                  </div>
                </div>
                <!-- PL Total | PL per Share -->
                <div class="row mb-4">
                  <div class="col-6 summary-item">
                    <label class="fw-bold">P/L Total</label>
                    <div class="value" :class="getRawPL(position) >= 0 ? 'text-success' : 'text-danger'">
                      {{ store.currency(getRawPL(position)) }}
                    </div>
                  </div>
                  <div class="col-6 summary-item">
                    <label class="fw-bold">P/L per Share</label>
                    <div class="value" :class="getPerSharePL(position) >= 0 ? 'text-success' : 'text-danger'">
                      {{ store.currency(getPerSharePL(position)) }}
                    </div>
                  </div>
                </div>
                <!-- PL Net | Net per Share -->
                <div class="row mb-4">
                  <div class="col-6 summary-item">
                    <label class="fw-bold">P/L Net</label>
                    <div class="value highlight" :class="getNetPL(position) >= 0 ? 'text-success' : 'text-danger'">
                      {{ store.currency(getNetPL(position)) }}
                    </div>
                  </div>
                  <div class="col-6 summary-item">
                    <label class="fw-bold">Net per Share</label>
                    <div class="value" :class="getNetPLPerShare(position) >= 0 ? 'text-success' : 'text-danger'">
                      {{ store.currency(getNetPLPerShare(position)) }}
                    </div>
                  </div>
                </div>
                <!-- Return on Risk | Weekly ROR -->
                <div class="row mb-4">
                  <div class="col-6 summary-item">
                    <label class="fw-bold">Return on Risk</label>
                    <div class="value highlight" :class="getTotalROR(position) >= 0 ? 'text-success' : 'text-danger'">
                      {{ getTotalROR(position).toFixed(2) }}%
                    </div>
                  </div>
                  <div class="col-6 summary-item">
                    <label class="fw-bold">Weekly ROR</label>
                    <div class="value" :class="getWeeklyROR(position, store) >= 0 ? 'text-success' : 'text-danger'">
                      {{ getWeeklyROR(position, store).toFixed(2) }}%
                    </div>
                  </div>
                </div>
                <!-- Open Shares | Sold Shares -->
                <div class="row mb-4">
                  <div class="col-6 summary-item">
                    <label class="fw-bold">Open Shares</label>
                    <div class="value">{{ getOpenShares(position) }}</div>
                  </div>
                  <div class="col-6 summary-item">
                    <label class="fw-bold">Sold Shares</label>
                    <div class="value">{{ getSoldShares(position) }}</div>
                  </div>
                </div>
                <!-- Weeks Held (full width) -->
                <div class="summary-item mb-4">
                  <label class="fw-bold">Weeks Held</label>
                  <div class="value">
                    {{ getWeeksHeld(position, store) }} {{ getWeeksHeld(position, store) === 1 ? 'week' : 'weeks' }}
                  </div>
                </div>
              </div>
            </div>

            <div class="col-md-8">
              <div class="position-details-panel h-100">
              <form class="position-details-form" @submit.prevent="save">
                <h5 class="border-bottom pb-2 mb-4">Position Details</h5>
                <!-- Manual entry info block -->
                <div v-if="position.manual" class="alert alert-info mb-4">
                  All stock positions after the start date specified for the account will be created during import. Manual entry is intended to record open positions and their cost basis that were acquired before starting LSO.
                </div>
                <!-- Symbol and Transaction Date (50/50 split) -->
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label for="position-symbol" class="form-label">Symbol</label>
                    <input type="text" class="form-control" id="position-symbol" v-model="position.symbol" :disabled="!position.manual" @input="position.symbol = position.symbol.toUpperCase()">
                  </div>
                  <div class="col-md-6 mb-3">
                    <label for="position-date" class="form-label">Transaction Date</label>
                    <input type="text" class="form-control" id="position-date" :value="position.date || ''" disabled>
                  </div>
                </div>
                <!-- Assigned Week | Sold Week (50/50 split, always disabled) -->
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label for="position-assignedWeek" class="form-label">Assigned Week</label>
                    <input type="text" class="form-control" id="position-assignedWeek" :value="position.assignedWeek ? store.weekRange(position.assignedWeek, true) : ''" disabled>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label for="position-soldWeek" class="form-label">Sold Week <small class="text-muted">(if sold)</small></label>
                    <input type="text" class="form-control" id="position-soldWeek" :value="position.soldWeek ? store.weekRange(position.soldWeek, true) : ''" disabled>
                  </div>
                </div>
                <!-- Shares | Cost Basis (50/50 split, editable for manual) -->
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label for="position-shares" class="form-label">Shares</label>
                    <input type="number" class="form-control" id="position-shares" v-model.number="position.shares" min="1" :disabled="!position.manual">
                  </div>
                  <div class="col-md-6 mb-3">
                    <label for="position-costBasis" class="form-label">Cost Basis <small class="text-muted">(Including Fees)</small></label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" class="form-control" id="position-costBasis" v-model.number="position.costBasis" min="0.01" step="0.01" :disabled="!position.manual">
                    </div>
                  </div>
                </div>
                <!-- Start Week | Profit Allocation (%) (50/50 split, editable) -->
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label for="position-startWeek" class="form-label">Start Week</label>
                    <select class="form-select" id="position-startWeek" v-model="position.startWeek" :disabled="false">
                      <option :value="null">Select Week</option>
                      <option v-for="p in store.projections" :key="p.week" :value="p.week">
                        Week {{ p.week }} ({{ store.weekRange(p.week, true) }})
                      </option>
                    </select>
                    <div class="form-text">
                      The first week premiums were collected (Offsetting Profits is automatically calculated on Start Week change).<br/>
                      NOTE: You can use Transaction Summarizer to find the week you want to calculate from.
                    </div>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label for="position-profitAllocation" class="form-label">Profit Allocation (%)</label>
                    <input type="number" class="form-control" id="position-profitAllocation"
                           v-model.number="position.profitAllocation" min="0" max="100" step="0.01"
                           :disabled="mergedGroupID">
                    <div class="form-text">
                      Percentage of Offsetting Profits to allocate. When recalculating, only this percentage of the total will be used.
                    </div>
                  </div>
                </div>
                <!-- Offsetting Profits | Current Price (50/50 split, editable) -->
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label for="position-offsettingProfits" class="form-label">Offsetting Profits</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" class="form-control" id="position-offsettingProfits" 
                             v-model.number="position.offsettingProfits" step="0.01"
                             :disabled="!!mergedGroupID">
                    </div>
                    <div class="form-text">
                      Net options contribution for this lot (positive credit or negative debit).
                    </div>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label for="position-currentPrice" class="form-label">Current Price <small class="text-muted">(if still held)</small></label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" class="form-control" id="position-currentPrice" v-model.number="position.currentPrice" min="0" step="0.001" :disabled="!!position.soldWeek">
                    </div>
                  </div>
                </div>
                <!-- Sell Amount input, only show if soldWeek is set (disabled) -->
                <div class="mb-3" v-if="position.soldWeek">
                  <label for="position-sellAmount" class="form-label">Sell Amount <span class="text-danger">*</span></label>
                  <div class="input-group">
                    <span class="input-group-text">$</span>
                    <input type="number" class="form-control" id="position-sellAmount" v-model.number="position.sellAmount" min="0" step="0.01" disabled>
                  </div>
                  <div class="form-text">
                    Enter the total proceeds from the sale (after fees/commissions). Required when Sold Week is set.
                  </div>
                </div>
                <div class="d-flex justify-content-end mt-4">
                  <button type="button" class="btn btn-secondary me-2" @click="close">Cancel</button>
                  <button type="submit" class="btn btn-primary">Save</button>
                </div>
              </form>
              </div>
            </div>
          </div>
          <div v-if="allocatedSellRows.length" class="row mt-4">
            <div class="col-12">
              <div class="allocated-sales-panel">
                <button
                  class="allocated-sales-toggle"
                  type="button"
                  @click="showAllocationDetails = !showAllocationDetails"
                  :aria-expanded="showAllocationDetails"
                >
                  <span class="allocated-sales-title">Associatd Closing Transactions ({{ allocatedSellRows.length }})</span>
                  <i class="bi bi-chevron-down allocated-sales-chevron" :class="{ expanded: showAllocationDetails }"></i>
                </button>
                <div v-if="showAllocationDetails" class="mt-3">
                  <DataTable :items="allocatedSellRows" :columns="allocatedSalesColumns" :striped="false">
                    <template #realizedPL="{ item }">
                      <span :class="item.realizedPL >= 0 ? 'text-success' : 'text-danger'">
                        {{ store.currency(item.realizedPL) }}
                      </span>
                    </template>
                  </DataTable>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>

<style scoped>
/* Position Summary Panel */
.position-summary {
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  height: 100%;
}

.position-details-panel {
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  height: 100%;
}

/* Summary item styling */
.summary-item {
  display: flex;
  flex-direction: column;
}

.summary-item .value {
  font-size: 1.25rem;
  font-weight: 500;
}

.summary-item .highlight {
  font-size: 1.5rem;
  font-weight: 600;
}

.allocated-sales-panel {
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 16px 20px;
}

.allocated-sales-toggle {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 1.1rem;
  font-weight: 600;
  text-align: left;
}

.allocated-sales-chevron {
  transition: transform 0.2s ease-in-out;
}

.allocated-sales-chevron.expanded {
  transform: rotate(180deg);
}

/* Responsive adjustments */
@media (max-width: 767.98px) {
  .position-summary {
    margin-bottom: 1rem;
    padding: 0.75rem;
  }

  .position-details-panel {
    padding: 0.75rem;
  }
  
  .allocated-sales-panel {
    padding: 1rem;
  }

  .position-summary h5,
  .position-details-panel h5 {
    font-size: 1rem;
    margin-bottom: 0.85rem !important;
    padding-bottom: 0.4rem !important;
  }

  .position-summary .row.mb-4 {
    margin-bottom: 0.65rem !important;
  }
  
  .summary-item {
    margin-bottom: 0.5rem !important;
  }

  .summary-item label {
    font-size: 0.8rem;
    margin-bottom: 0.15rem;
  }
  
  .summary-item .value {
    font-size: 0.98rem;
  }
  
  .summary-item .highlight {
    font-size: 1.08rem;
  }

  .position-details-form .row {
    --bs-gutter-x: 0.75rem;
  }

  .position-details-form .mb-3 {
    margin-bottom: 0.65rem !important;
  }

  .position-details-form .form-label {
    font-size: 0.85rem;
    margin-bottom: 0.2rem;
  }

  .position-details-form .form-control,
  .position-details-form .form-select,
  .position-details-form .input-group-text {
    font-size: 0.9rem;
    padding: 0.25rem 0.5rem;
  }

  .position-details-form .form-text {
    font-size: 0.75rem;
    margin-top: 0.2rem;
  }
}

/* Text colors */
.text-success {
  color: #198754 !important;
}

.text-danger {
  color: #dc3545 !important;
}

/* Modal styles for Pick Start Week */
.table th, .table td {
  vertical-align: middle;
}

.table th {
  background-color: #f1f1f1;
  font-weight: 500;
}

.table td {
  font-size: 0.9rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
}

/* Pick Start Modal styles */
.modal[tabindex="-1"].d-block {
  display: block;
  background: rgba(0,0,0,0.2);
  z-index: 2000;
}

.modal .modal-dialog {
  z-index: 2100;
}

.edit-position-dialog {
  max-height: calc(100vh - 2rem);
}

.edit-position-dialog .modal-content {
  max-height: calc(100vh - 2rem);
}

.edit-position-dialog .modal-body {
  overflow-y: auto;
}
</style>
