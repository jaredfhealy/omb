<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const isVisible = ref(false)
const isEdit = ref(false)
const editIndex = ref(null)
let position = reactive({
  symbol: '',
  shares: 100,
  costBasis: 0,
  currentPrice: 0,
  assignedWeek: null,
  soldWeek: null,
  sellAmount: null,
  offsettingProfits: 0,
  startWeek: null
})

// Add state to track whether to show all weeks or just current and future
const showAllWeeks = ref(false)

// Get the current week number
const currentWeek = computed(() => {
  const today = new Date()
  const startDate = new Date(store.activeAccount.settings.startDate)
  
  // Find how many weeks have passed since the start date
  const diffTime = today - startDate
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  const weekNumber = Math.ceil(diffDays / 7)

  return Math.min(weekNumber, store.projections.length)
})

// Add computed property to filter available sold weeks
const availableSoldWeeks = computed(() => {
  if (!position.assignedWeek) return []
  
  let filteredWeeks = store.projections.filter(p => p.week >= position.assignedWeek)
  
  // If not showing all weeks, filter to only show current week and beyond
  if (!showAllWeeks.value) {
    filteredWeeks = filteredWeeks.filter(p => p.week >= currentWeek.value)
  }
  
  return filteredWeeks
})

// Watch for assignedWeek changes to update startWeek and validate soldWeek
watch(() => position.assignedWeek, (newVal) => {
  if (newVal && !position.startWeek) {
    position.startWeek = newVal
  }
  
  // Reset soldWeek if it's now invalid (less than assigned week)
  if (position.soldWeek && position.soldWeek < newVal) {
    position.soldWeek = null
  }
})

// Reset showAllWeeks when modal is opened
const show = (existingPosition = null, index = null) => {
  if (existingPosition) {
    isEdit.value = true
    editIndex.value = index
    Object.assign(position, existingPosition)
  } else {
    isEdit.value = false
    editIndex.value = null
    Object.assign(position, {
      symbol: '',
      shares: 100,
      costBasis: 0,
      currentPrice: 0,
      assignedWeek: null,
      soldWeek: null,
      offsettingProfits: 0,
      startWeek: null,
      sellAmount: null
    })
  }
  
  isVisible.value = true
}

const close = () => {
  isVisible.value = false
}

const save = () => {
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

  // Ensure startWeek is set
  if (!position.startWeek) {
    position.startWeek = position.assignedWeek
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
  const posCopy = { ...position }
  if (!posCopy.positionKey) {
    posCopy.positionKey = store.getPositionKey(posCopy)
  }
  if (isEdit.value && editIndex.value !== null) {
    store.activeAccount.positions[editIndex.value] = { ...posCopy }
  } else {
    store.activeAccount.positions.push({ ...posCopy })

    // Sort positions by assignedWeek after adding
    store.activeAccount.positions.sort((a, b) => (a.assignedWeek || 0) - (b.assignedWeek || 0))
  }
  store.saveBacon()
  close()
}

// Expose the show function to the store
store.showPositionModal = (existingPosition = null, index = null) => show(existingPosition, index)

// Add real-time P/L calculations as computed properties
const perSharePL = computed(() => {
  if (!position.shares || position.shares === 0) return 0
  const currentPrice = position.currentPrice
  const perShareCost = position.costBasis / position.shares
  return currentPrice - perShareCost
})

const rawPL = computed(() => {
  const currentValue = position.currentPrice ? position.currentPrice * position.shares : position.costBasis
  const costBasis = position.costBasis
  return currentValue - costBasis
})

const netPL = computed(() => {
  const currentValue = position.currentPrice ? position.currentPrice * position.shares : position.costBasis
  const costBasis = position.costBasis
  const totalProfits = position.offsettingProfits || 0
  return currentValue - costBasis + totalProfits
})

const totalROR = computed(() => {
  if (!position.costBasis || position.costBasis <= 0) return 0
  const costBasis = position.costBasis
  return (netPL.value / costBasis) * 100
})

// Add weeks held calculation
const weeksHeld = computed(() => {
  if (!position.assignedWeek) return 0
  
  // If position has been sold, calculate weeks from assigned to sold
  if (position.soldWeek) {
    return position.soldWeek - position.assignedWeek + 1
  }
  
  // If position is still held, calculate weeks from assigned to current
  return currentWeek.value - position.assignedWeek + 1
})

// Add weekly ROR calculation
const weeklyROR = computed(() => {
  if (weeksHeld.value <= 0) return 0
  return totalROR.value / weeksHeld.value
})

// Add watcher for startWeek to recalculate offsettingProfits
watch(() => position.startWeek, (newVal) => {
  if (!newVal) return
  // Calculate offsettingProfits: sum all rows for this symbol from startWeek and after, excluding buy/sell
  let total = 0
  const actuals = store.activeAccount.actuals || []
  actuals.forEach(a => {
    if (Array.isArray(a.data) && parseInt(a.week) >= parseInt(newVal)) {
      a.data.forEach(txn => {
        if (
          txn.symbol &&
          txn.symbol.toUpperCase().split(" ")[0].includes(position.symbol.toUpperCase()) &&
          txn.action &&
          !['buy', 'sell'].includes(txn.action.toLowerCase())
        ) {
          total += parseFloat(txn.amount || 0)
        }
      })
    }
  })
  position.offsettingProfits = parseFloat(total.toFixed(2))
})
</script>

<template>
  <div class="modal" id="edit-position-modal" tabindex="-1" :class="{ 'd-block': isVisible }" v-show="isVisible">
    <div class="modal-dialog modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ isEdit ? 'Edit' : 'Add' }} Position</h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <div class="row"> <!-- Main row to create two columns -->
            <!-- Reversed order: Summary first, then form -->
            
            <!-- Summary column - now first -->
            <div class="col-md-4 mb-4 mb-md-0">
              <div class="position-summary h-100 d-flex flex-column">
                <h5 class="border-bottom pb-2 mb-4">Position Summary</h5>
                
                <div class="summary-item mb-4">
                  <label class="fw-bold">Cost Basis</label>
                  <div class="value">{{ store.currency(position.costBasis) }}</div>
                </div>
                
                <!-- P/L per share and P/L Total side by side -->
                <div class="row mb-4">
                  <div class="col-6">
                    <div class="summary-item">
                      <label class="fw-bold">P/L per Share</label>
                      <div class="value" :class="perSharePL >= 0 ? 'text-success' : 'text-danger'">
                        {{ store.currency(perSharePL) }}
                      </div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="summary-item">
                      <label class="fw-bold">P/L Total</label>
                      <div class="value" :class="rawPL >= 0 ? 'text-success' : 'text-danger'">
                        {{ store.currency(rawPL) }}
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Offsetting Profits and P/L Net side by side -->
                <div class="row mb-4">
                  <div class="col-6">
                    <div class="summary-item">
                      <label class="fw-bold">Offsetting Profits</label>
                      <div class="value text-success">
                        {{ store.currency(position.offsettingProfits || 0) }}
                      </div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="summary-item">
                      <label class="fw-bold">P/L Net</label>
                      <div class="value highlight" :class="netPL >= 0 ? 'text-success' : 'text-danger'">
                        {{ store.currency(netPL) }}
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Weeks Held -->
                <div class="summary-item mb-4">
                  <label class="fw-bold">Weeks Held</label>
                  <div class="value">
                    {{ weeksHeld }} {{ weeksHeld === 1 ? 'week' : 'weeks' }}
                  </div>
                </div>
                
                <!-- ROR and Weekly ROR side by side -->
                <div class="row mb-4">
                  <div class="col-6">
                    <div class="summary-item">
                      <label class="fw-bold">Return on Risk</label>
                      <div class="value highlight" :class="totalROR >= 0 ? 'text-success' : 'text-danger'">
                        {{ totalROR.toFixed(2) }}%
                      </div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="summary-item">
                      <label class="fw-bold">Weekly ROR</label>
                      <div class="value" :class="weeklyROR >= 0 ? 'text-success' : 'text-danger'">
                        {{ weeklyROR.toFixed(2) }}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Form column - now second -->
            <div class="col-md-8">
              <form @submit.prevent="save">
                <!-- Manual entry info block -->
                <div v-if="position.manual" class="alert alert-info mb-4">
                  All stock positions after the start date specified for the account will be created during import. Manual entry is intended to record open positions and their cost basis that were acquired before starting LSO.
                </div>
                <!-- Symbol (full width, editable for manual) -->
                <div class="mb-3">
                  <label for="position-symbol" class="form-label">Symbol</label>
                  <input type="text" class="form-control" id="position-symbol" v-model="position.symbol" :disabled="!position.manual" @input="position.symbol = position.symbol.toUpperCase()">
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
                    <label for="position-costBasis" class="form-label">Cost Basis (Including Fees)</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" class="form-control" id="position-costBasis" v-model.number="position.costBasis" min="0.01" step="0.01" :disabled="!position.manual">
                    </div>
                  </div>
                </div>
                <!-- Start Week (full width, editable) -->
                <div class="mb-3">
                  <label for="position-startWeek" class="form-label">Start Week</label>
                  <select class="form-select" id="position-startWeek" v-model="position.startWeek">
                    <option :value="null">Select Week</option>
                    <option v-for="p in store.projections" :key="p.week" :value="p.week">
                      Week {{ p.week }} ({{ store.weekRange(p.week, true) }})
                    </option>
                  </select>
                  <div class="form-text">
                    The first week premiums were collected (defaults to Assigned Week, but can be set earlier for migrated/edited positions).
                  </div>
                </div>
                <!-- Offsetting Profits | Current Price (50/50 split, editable) -->
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label for="position-offsettingProfits" class="form-label">Offsetting Profits</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" class="form-control" id="position-offsettingProfits" 
                             v-model.number="position.offsettingProfits" min="0" step="0.01">
                    </div>
                    <div class="form-text">
                      Total PUT/CALL premium income collected to offset this position's cost basis
                    </div>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label for="position-currentPrice" class="form-label">Current Price <small class="text-muted">(if still held)</small></label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" class="form-control" id="position-currentPrice" v-model.number="position.currentPrice" min="0" step="0.01" :disabled="!!position.soldWeek">
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

/* Responsive adjustments */
@media (max-width: 767.98px) {
  .position-summary {
    margin-bottom: 2rem;
    padding: 1rem;
  }
  
  .summary-item {
    margin-bottom: 1rem !important;
  }
  
  .summary-item .value {
    font-size: 1.1rem;
  }
  
  .summary-item .highlight {
    font-size: 1.25rem;
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
</style>
