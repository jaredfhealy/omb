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
  strikePrice: 0,
  currentPrice: 0,
  assignedWeek: null,
  soldWeek: null,
  offsettingProfits: 0, // Renamed from putProfits
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

// Function to toggle showing all weeks
const toggleShowAllWeeks = () => {
  showAllWeeks.value = !showAllWeeks.value
}

// Reset showAllWeeks when modal is opened
const show = (existingPosition = null, index = null) => {
  // Reset to default state - only show current and future weeks
  showAllWeeks.value = false
  
  if (existingPosition) {
    isEdit.value = true
    editIndex.value = index
    
    // Handle migration of old profit fields if necessary
    if (existingPosition.putProfits !== undefined || existingPosition.callProfits !== undefined) {
      Object.assign(position, {
        ...existingPosition,
        offsettingProfits: (existingPosition.putProfits || 0) + (existingPosition.callProfits || 0)
      })
    } else {
      Object.assign(position, existingPosition)
    }
  } else {
    isEdit.value = false
    editIndex.value = null
    Object.assign(position, {
      symbol: '',
      shares: 100,
      strikePrice: 0,
      currentPrice: 0,
      assignedWeek: null,
      soldWeek: null,
      offsettingProfits: 0,
      startWeek: null
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
  
  // Validate price inputs
  if (isNaN(position.strikePrice) || position.strikePrice <= 0) {
    alert('Strike Price must be a positive number')
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
  
  if (isEdit.value && editIndex.value !== null) {
    // Update existing position
    store.activeAccount.positions[editIndex.value] = { ...position }
  } else {
    // Add new position
    store.activeAccount.positions.push({ ...position })
  }
  
  close()
  store.saveBacon()
}

// Expose the show function to the store
store.showPositionModal = (existingPosition = null, index = null) => show(existingPosition, index)

// Add real-time P/L calculations as computed properties
const perSharePL = computed(() => {
  const currentPrice = position.currentPrice || position.strikePrice
  return currentPrice - position.strikePrice
})

const rawPL = computed(() => {
  const currentValue = position.currentPrice 
    ? position.currentPrice * position.shares 
    : position.strikePrice * position.shares
  const costBasis = position.strikePrice * position.shares
  return currentValue - costBasis
})

const netPL = computed(() => {
  const currentValue = position.currentPrice 
    ? position.currentPrice * position.shares 
    : position.strikePrice * position.shares
  const costBasis = position.strikePrice * position.shares
  const totalProfits = position.offsettingProfits || 0
  return currentValue - costBasis + totalProfits
})

const totalROR = computed(() => {
  if (!position.strikePrice || position.strikePrice <= 0) return 0
  const costBasis = position.strikePrice * position.shares
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
</script>

<template>
  <div class="modal" id="edit-position-modal" tabindex="-1" :class="{ 'd-block': isVisible }" v-show="isVisible">
    <div class="modal-dialog modal-xl"> <!-- Changed to modal-xl for a wider dialog -->
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
                  <div class="value">{{ store.currency(position.strikePrice * position.shares) }}</div>
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
                <!-- Assigned Week -->
                <div class="mb-3">
                  <label for="position-assignedWeek" class="form-label">Assigned Week</label>
                  <select class="form-select" id="position-assignedWeek" v-model="position.assignedWeek" required>
                    <option :value="null">Select Week</option>
                    <option v-for="p in store.projections" :key="p.week" :value="p.week">
                      Week {{ p.week }} ({{ store.weekRange(p.week, true) }})
                    </option>
                  </select>
                </div>
                
                <!-- Position Basic Info -->
                <div class="mb-3">
                  <label for="position-symbol" class="form-label">Symbol</label>
                  <input type="text" class="form-control" id="position-symbol" v-model="position.symbol" required>
                </div>
                
                <div class="mb-3">
                  <label for="position-shares" class="form-label">Shares</label>
                  <input type="number" class="form-control" id="position-shares" v-model.number="position.shares" min="1" required>
                </div>
                
                <!-- Price Info -->
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label for="position-strikePrice" class="form-label">Strike Price</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" class="form-control" id="position-strikePrice" v-model.number="position.strikePrice" 
                             min="0.01" step="0.01" required>
                    </div>
                  </div>
                  
                  <div class="col-md-6 mb-3">
                    <label for="position-currentPrice" class="form-label">Current Price <small class="text-muted">(if still held)</small></label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" class="form-control" id="position-currentPrice" v-model.number="position.currentPrice" 
                             min="0" step="0.01">
                    </div>
                  </div>
                </div>
                
                <!-- Profits - now a single field -->
                <div class="mb-3">
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
                
                <!-- Sold week - filtered based on assigned week and current week -->
                <div class="mb-3">
                  <label for="position-soldWeek" class="form-label d-flex justify-content-between align-items-center">
                    <span>Sold Week <small class="text-muted">(if sold)</small></span>
                    <button 
                      type="button" 
                      class="btn btn-sm btn-link p-0" 
                      @click="toggleShowAllWeeks"
                      v-if="position.assignedWeek"
                    >
                      {{ showAllWeeks ? 'Show Recent Weeks' : 'Show All Weeks' }}
                    </button>
                  </label>
                  <select class="form-select" id="position-soldWeek" v-model="position.soldWeek" :disabled="!position.assignedWeek">
                    <option :value="null">Not Sold</option>
                    <option v-for="p in availableSoldWeeks" :key="p.week" :value="p.week">
                      Week {{ p.week }} ({{ store.weekRange(p.week, true) }})
                      {{ p.week === currentWeek ? '(Current)' : '' }}
                    </option>
                  </select>
                  <div class="form-text" v-if="!position.assignedWeek">
                    Please select an assigned week first
                  </div>
                  <div class="form-text" v-else-if="availableSoldWeeks.length === 0 && !showAllWeeks">
                    No valid weeks available. Try "Show All Weeks" to see past weeks.
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
</style>
