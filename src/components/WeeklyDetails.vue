<script setup>
import { useAppStore } from '@/stores/app'
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'

const store = useAppStore()
// Replace selection variables with selectedRows object
const selectedRows = ref({})
const selectionSummary = ref(null)
// Add a reference to the scrollable container
const scrollableContainer = ref(null)
// Add a reference to the current week element
const currentWeekRef = ref(null)

// Add state to track expanded selected rows
const expandedRows = ref({})

// Add state to track whether summary is expanded
const summaryExpanded = ref(false)

// Add local function (without exposing to store)
function getAssignmentsForWeek(week) {
  return (store.activeAccount.positions || []).filter(position => 
    position.assignedWeek === week
  )
}

const getAssignmentsTooltip = (projection) => {
  const assignments = getAssignmentsForWeek(projection.week)
  return `New Assignments This Week:<br>
    ${assignments.map(p => `${p.symbol}: ${p.shares} shares @ ${store.currency(p.strikePrice)}`).join('<br>')}
    <br>Total: ${store.currency(projection.sharesBalanceAddedThisWeek)}`
}

// Add function to determine current week
const getCurrentWeek = computed(() => {
  const today = new Date()
  const startDate = new Date(store.activeAccount.settings.startDate)
  const diffTime = today - startDate
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.ceil(diffDays / 7)
})

// Define selectable columns - removing 'transaction' and 'projectedGrowth'
const SELECTABLE_COLUMNS = ['actualGrowth', 'actualROR']

// Format column titles for display
const formatColumnTitle = (column) => {
  switch (column) {
    case 'transaction': return 'Net Transaction'
    case 'projectedGrowth': return 'Projected Growth'
    case 'actualGrowth': return 'Actual Growth'
    case 'actualROR': return 'ROR %'
    default: return column
  }
}

// Updated to calculate summaries for all columns at once
const calculateSummary = () => {
  const selectedWeeks = Object.keys(selectedRows.value)
    .filter(week => selectedRows.value[week])
    .map(week => Number(week))
  
  if (selectedWeeks.length === 0) return null
  
  // Calculate summaries for all columns at once
  const columns = SELECTABLE_COLUMNS
  const summaries = {}
  
  columns.forEach(column => {
    const values = selectedWeeks.map(week => {
      const projection = store.projections[week - 1]
      return column === 'actualROR' 
        ? (projection.actualROR || 0) 
        : (column === 'transaction' 
           ? (projection.deposit - projection.withdrawal) 
           : (projection[column] || 0))
    }).filter(v => !isNaN(v))
    
    if (values.length > 0) {
      summaries[column] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        total: values.reduce((a, b) => a + b, 0),
        isROR: column === 'actualROR'
      }
    }
  })
  
  return Object.keys(summaries).length > 0 ? summaries : null
}

// Add function to scroll to a specific week
const scrollToWeek = async (week) => {
  await nextTick()
  
  const element = document.querySelector(`.row-selected[data-week="${week}"]`)
  if (element && scrollableContainer.value) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    })
  }
}

// Function called when checkboxes change - enhanced to scroll
const updateSummary = () => {
  const wasEmpty = selectionSummary.value === null
  const newSelectionCount = Object.values(selectedRows.value).filter(Boolean).length
  
  // Update summary
  selectionSummary.value = calculateSummary()
  
  // Case 1: First selection - scroll to the selected row
  if (selectionSummary.value && wasEmpty && newSelectionCount === 1) {
    // This means we just selected our first row - find which one
    const selectedWeek = Object.keys(selectedRows.value).find(week => selectedRows.value[week])
    if (selectedWeek) {
      // Wait for collapse to occur before scrolling
      setTimeout(() => {
        scrollToWeek(selectedWeek)
      }, 50)
    }
  } 
  // Case 2: All rows were unchecked manually - scroll to current week
  else if (!wasEmpty && newSelectionCount === 0) {
    // Previously had selections but now all unchecked
    selectionSummary.value = null
    expandedRows.value = {}
    
    // Wait for rows to expand before scrolling
    setTimeout(() => {
      scrollToCurrentWeek()
    }, 50)
  }
}

// Add escape key handler
const handleEscape = (e) => {
  if (e.key === 'Escape') {
    closeSummary()
  }
}

// Add function to scroll to current week
const scrollToCurrentWeek = async () => {
  // Wait for the DOM to update
  await nextTick()
  
  if (currentWeekRef.value && scrollableContainer.value) {
    // Use scrollIntoView with smooth behavior and positioning
    currentWeekRef.value.scrollIntoView({
      behavior: 'smooth',
      block: 'center' // Center the element in the viewport
    })
  }
}

// Add event listener for escape key
onMounted(() => {
  document.addEventListener('keydown', handleEscape)
  
  // Scroll to current week after component is mounted
  scrollToCurrentWeek()
})

// Watch for changes to the active tab
watch(() => store.activeTab, (newTab) => {
  if (newTab === 'weekly') {
    // Scroll to current week when tab becomes active
    scrollToCurrentWeek()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape)
})

// Add local function (without exposing to store)
function editNetTransactionFromRow(week) {
  store.activeTab = 'recurring'
  store.selectedWeek = week

  // Check if there are transactions for this week
  const hasTransactions = store.activeAccount.transactions.some(t =>
    t.startWeek === week && t.endWeek === week
  )

  if (!hasTransactions) {
    store.editingTransaction = {
      type: 'deposit',
      startWeek: week,
      endWeek: week,
      category: null,
      amount: 0
    }
    store.editingIndex = null
  }
}

// Add local function (without exposing to store)
function formatNetTransaction(deposit, withdrawal) {
  const net = deposit - withdrawal
  const hasMultiple = deposit && withdrawal

  return {
    value: net < 0
      ? `(${store.currency(Math.abs(net))})`
      : store.currency(net),
    style: { color: net < 0 ? 'red' : 'inherit' },
    indicator: hasMultiple ? '*' : ''
  }
}

// Add function to close the summary (for the close button)
const closeSummary = () => {
  // Clear all checkboxes
  Object.keys(selectedRows.value).forEach(key => {
    selectedRows.value[key] = false
  })
  expandedRows.value = {}
  selectionSummary.value = null
  summaryExpanded.value = false
  
  // Scroll back to current week
  scrollToCurrentWeek()
}

// Add computed property to check if any rows are selected
const hasSelection = computed(() => {
  return Object.values(selectedRows.value).some(selected => selected === true)
})

// Toggle expansion of a selected row in mobile view
const toggleRowExpansion = (week) => {
  if (selectedRows.value[week]) {
    expandedRows.value[week] = !expandedRows.value[week]
  }
}

// Function to toggle summary expansion
const toggleSummaryExpansion = () => {
  summaryExpanded.value = !summaryExpanded.value
}
</script>

<template>
  <div class="weekly-details-container">
    <!-- Reorganized selection summary with collapsible feature -->
    <div v-if="selectionSummary" class="selection-summary">
      <div class="summary-header">
        <div class="d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            <i 
              class="bi expand-icon" 
              :class="summaryExpanded ? 'bi-chevron-up' : 'bi-chevron-down'"
              @click="toggleSummaryExpansion"
              title="Toggle summary"
            ></i>
            <span class="help-text ms-2" v-if="!summaryExpanded">
              Select multiple rows and expand to see summary
            </span>
            <span class="help-text ms-2 d-none d-xl-inline-block" v-else>Hit Esc to close</span>
          </div>
          <button type="button" class="btn-close btn-close-sm" @click="closeSummary" aria-label="Close"></button>
        </div>
      </div>
      
      <!-- Only show summary when expanded - now with grid layout -->
      <div v-if="summaryExpanded" class="summary-tables-container">
        <!-- Actual Growth Section -->
        <div class="summary-table-section" v-if="selectionSummary.actualGrowth">
          <h6 class="table-title">Actual Growth</h6>
          <div class="summary-grid-wrapper">
            <div class="summary-grid">
              <!-- First row: Min and Max -->
              <div class="summary-grid-item">
                <div class="grid-label">Min</div>
                <div class="grid-value">{{ store.currency(selectionSummary.actualGrowth.min) }}</div>
              </div>
              <div class="summary-grid-item">
                <div class="grid-label">Max</div>
                <div class="grid-value">{{ store.currency(selectionSummary.actualGrowth.max) }}</div>
              </div>
              
              <!-- Second row: Avg and Total -->
              <div class="summary-grid-item">
                <div class="grid-label">Avg</div>
                <div class="grid-value">{{ store.currency(selectionSummary.actualGrowth.avg) }}</div>
              </div>
              <div class="summary-grid-item">
                <div class="grid-label">Total</div>
                <div class="grid-value">{{ store.currency(selectionSummary.actualGrowth.total) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ROR % Section -->
        <div class="summary-table-section" v-if="selectionSummary.actualROR">
          <h6 class="table-title">ROR %</h6>
          <div class="summary-grid-wrapper">
            <div class="summary-grid">
              <!-- First row: Min and Max -->
              <div class="summary-grid-item">
                <div class="grid-label">Min</div>
                <div class="grid-value">{{ selectionSummary.actualROR.min.toFixed(2) }}%</div>
              </div>
              <div class="summary-grid-item">
                <div class="grid-label">Max</div>
                <div class="grid-value">{{ selectionSummary.actualROR.max.toFixed(2) }}%</div>
              </div>
              
              <!-- Second row: Avg and Total -->
              <div class="summary-grid-item">
                <div class="grid-label">Avg</div>
                <div class="grid-value">{{ selectionSummary.actualROR.avg.toFixed(2) }}%</div>
              </div>
              <div class="summary-grid-item">
                <div class="grid-label">Total</div>
                <div class="grid-value">{{ selectionSummary.actualROR.total.toFixed(2) }}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="scrollable-container" ref="scrollableContainer">
      <div class="container-fluid pb-4">
        <!-- Table Header -->
        <div class="row sticky-top header-row bg-white py-2 mb-2">
          <!-- First header row with column group -->
          <div class="col-12 d-none d-xl-flex mb-1">
            <div class="col-3"></div> <!-- Week column -->
            <div class="col-9 d-flex">
              <div class="col-2"></div> <!-- Start: Cash* -->
              <div class="col-2" v-if="store.activeAccount.positions.length > 0"></div> <!-- Start: Shares* -->
              <div class="col-2"></div> <!-- Net Trans.* -->
              
              <!-- Growth column group -->
              <div class="col-2 text-center border-bottom">
                <strong>Growth</strong>
              </div>
              
              <div class="col"></div> <!-- ROR % -->
              <div class="col-2"></div> <!-- End: Total* -->
              <div class="col-1"></div> <!-- Actions* -->
            </div>
          </div>
          
          <!-- Second header row with detailed column names -->
          <div class="col-12 col-xl-3 d-flex">
            <div class="col-12">Week</div> <!-- Week column header -->
          </div>
          <div class="col-12 col-xl-9 d-flex d-none d-xl-flex">
            <div class="col-2" data-bs-toggle="tooltip" data-bs-title="Total cash balance and cash investments">
              Start: Cash*
            </div>
            <div class="col-2" v-if="store.activeAccount.positions.length > 0" data-bs-toggle="tooltip"
              data-bs-title="Total cost basis of assigned positions. Weeks with new assignments marked with an info icon.">
              Start: Shares*
            </div>
            <div class="col-2" data-bs-toggle="tooltip"
              data-bs-title="Rows identified with an asterisk (*) have both deposit and withdrawal values.">
              Net Trans.*
            </div>
            <div class="col">Projected</div>
            <div class="col">Actual</div>
            <div class="col">ROR %</div>
            <div class="col">End: Total*</div>
            <div class="col-1">Actions*</div>
          </div>
        </div>

        <!-- Table Body -->
        <div v-for="(projection, index) in store.projections" :key="index" 
             class="row mb-2" 
             :class="{ 
                'current-week-card': projection.week === getCurrentWeek,
                'row-selected': selectedRows[projection.week],
                'row-collapsed': hasSelection && !expandedRows[projection.week]
             }"
             :data-week="projection.week"
             :ref="projection.week === getCurrentWeek ? el => currentWeekRef = el : null">
          <div class="col-12">
            <div class="card h-100">
              <div class="card-body py-2">
                <div class="row">
                  <!-- Week info with integrated checkbox and toggle icon for mobile -->
                  <div class="col-12 col-xl-3 mb-2 mb-xl-0">
                    <div class="week-combined">
                      <input type="checkbox" 
                             class="form-check-input enhanced-checkbox me-2" 
                             v-model="selectedRows[projection.week]" 
                             @change="updateSummary">
                      <span class="week-number">#{{ projection.week }}</span>
                      <span class="week-separator">|</span>
                      <span class="week-date" v-html="store.weekRange(projection.week)"></span>
                      
                      <!-- Add toggle button for mobile view when row is selected -->
                      <i v-if="hasSelection && selectedRows[projection.week]" 
                         @click="toggleRowExpansion(projection.week)"
                         class="bi d-xl-none ms-auto toggle-icon"
                         :class="expandedRows[projection.week] ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
                    </div>
                  </div>
                  
                  <!-- Details - flex layout on desktop, stacked on mobile -->
                  <div class="col-12 col-xl-9 details-section"
                       :class="{ 'd-none d-xl-block': hasSelection && !expandedRows[projection.week] }">
                    <div class="row">
                      <!-- Start: Cash Balance -->
                      <div class="col-6 col-xl-2">
                        <div class="data-label d-xl-none">Start: Cash Balance</div>
                        <div>{{ store.currency(projection.startBalance) }}</div>
                      </div>
                      
                      <!-- Start: Shares Balance (if positions exist) -->
                      <div class="col-6 col-xl-2" v-if="store.activeAccount.positions.length > 0">
                        <div class="data-label d-xl-none">Start: Shares Balance</div>
                        <div>
                          <span v-if="projection.sharesBalanceAddedThisWeek > 0" 
                                class="position-relative"
                                data-bs-toggle="tooltip"
                                :data-bs-html="true"
                                :data-bs-title="getAssignmentsTooltip(projection)">
                            {{ store.currency(projection.sharesBalance) }}
                            <i class="bi bi-info-circle ms-1"></i>
                          </span>
                          <span v-else>
                            {{ store.currency(projection.sharesBalance) }}
                          </span>
                        </div>
                      </div>
                      
                      <!-- Net Transaction - wider column -->
                      <div class="col-6 col-xl-2">
                        <div class="data-label d-xl-none">Net Transaction</div>
                        <div class="d-flex">
                          <i class="bi bi-pencil-square cursor-pointer me-1"
                             @click="editNetTransactionFromRow(projection.week)"></i>
                          <span 
                            data-bs-toggle="tooltip" 
                            :data-bs-html="true"
                            :data-bs-title="`Deposit: ${store.currency(projection.deposit)}<br />Withdraw: (${store.currency(projection.withdrawal)})`"
                            :style="formatNetTransaction(projection.deposit, projection.withdrawal).style">
                            {{ formatNetTransaction(projection.deposit, projection.withdrawal).value }}
                            {{ formatNetTransaction(projection.deposit, projection.withdrawal).indicator }}
                          </span>
                        </div>
                      </div>
                      
                      <!-- Projected Growth -->
                      <div class="col-6 col-xl">
                        <div class="data-label d-xl-none">Projected Growth</div>
                        <div>
                          {{ store.currency(projection.projectedGrowth) }}
                        </div>
                      </div>
                      
                      <!-- Actual Growth -->
                      <div class="col-6 col-xl">
                        <div class="data-label d-xl-none">Actual Growth</div>
                        <div>
                          <span v-if="projection.actualGrowth !== null" 
                                data-bs-toggle="tooltip" 
                                :data-bs-html="true"
                                :data-bs-title="`
                                  Avg All: ${store.currency(projection.averageGrowth)}<br>
                                  Avg to Date: ${store.currency(projection.trailingTotalGrowth)}<br>
                                  Avg Last 8: ${store.currency(projection.trailing8WeekGrowth)}<br>
                                  Avg Last 4: ${store.currency(projection.trailing4WeekGrowth)}
                                `">
                            {{ store.currency(projection.actualGrowth) }}
                          </span>
                          <span v-else>
                            {{ store.currency(0) }}
                          </span>
                        </div>
                      </div>
                      
                      <!-- Actual %ROR -->
                      <div class="col-6 col-xl">
                        <div class="data-label d-xl-none">Actual %ROR</div>
                        <div>
                          <span v-if="projection.actualROR" 
                                data-bs-toggle="tooltip" 
                                :data-bs-html="true" 
                                :data-bs-title="`
                                  Avg All: ${projection.averageROR}%<br>
                                  Avg to Date: ${projection.trailingTotalROR}%<br>
                                  Avg Last 8: ${projection.trailing8WeekROR}%<br>
                                  Avg Last 4: ${projection.trailing4WeekROR}%
                                `">
                            {{ Number(projection.actualROR).toFixed(2) }}%
                          </span>
                          <span v-else>
                            0%
                          </span>
                        </div>
                      </div>
                      
                      <!-- End: Total Balance -->
                      <div class="col-6 col-xl">
                        <div class="data-label d-xl-none">End: Total Balance</div>
                        <div>{{ store.currency(projection.endBalance) }}</div>
                      </div>
                      
                      <!-- Actions -->
                      <div class="col-6 col-xl-1">
                        <div class="data-label d-xl-none">Actions</div>
                        <div>
                          <button type="button" 
                                  class="btn btn-sm btn-outline-primary" 
                                  @click="store.showWeeklyRowModal(projection.week)">
                            <i class="bi bi-pencil-square"></i>
                          </button>
                          {{ store.activeAccount.actuals.some(a => Number(a.week) === projection.week && a.notes) ? '*' : '' }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.current-week-card {
  /* Highlight the current week card */
  border-left: 4px solid #6c757d;
}

/* Add alternating background colors to weekly cards - similar to table-striped */
/*.weekly-details-container .row.mb-2:nth-child(even) .card {
  background-color: rgba(0, 0, 0, 0.02);
}*/

.weekly-details-container .row.mb-2:nth-child(odd) .card {
  background-color: rgba(0, 0, 0, 0.05); /* Increased from 0.05 to 0.08 for better contrast */
}

/* Make sure current week highlighting remains prominent by using !important */
.current-week-card .card {
  background-color: rgba(198, 222, 210, 0.85) !important;
}

.current-week-card:hover .card {
  background-color: rgba(198, 222, 210, 0.95) !important;
}

/* Add subtle hover effect for all cards */
.weekly-details-container .card:hover:not(.current-week-card .card) {
  background-color: rgba(244, 236, 192, 0.7);
}

.header-row {
  font-weight: bold;
  border-bottom: 2px solid #dee2e6;
  z-index: 1020;
}

/* Ensure dropdown menus in the application appear above sticky headers */
.dropdown-menu.show {
  z-index: 1100;
}

/* Updated summary styles for grid layout */
.summary-table-wrapper {
  padding: 10px;
  overflow-x: auto;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

.summary-table th, 
.summary-table td {
  padding: 6px 12px;
  text-align: right;
  border: 1px solid #dee2e6;
}

.summary-table th {
  background-color: #f8f9fa;
  font-weight: bold;
  text-align: center;
}

.summary-table td.column-title {
  text-align: left;
  font-weight: 600;
  background-color: #f8f9fa;
}

.summary-table tr:nth-child(even) {
  background-color: rgba(0,0,0,0.02);
}

.summary-table tr:hover {
  background-color: rgba(0,0,0,0.05);
}

/* Remove old card-based summary styles */
.summary-content {
  display: block;
}
/* Remove old card-based summary styles */
.summary-content {
  display: block;
}

/* Checkbox styling */
.form-check-input {
  cursor: pointer;
  width: 1.1em;
  height: 1.1em;
}

/* Removed the selected class styles since they're no longer needed */

/* Prevent text selection while dragging */
.card-body {
  user-select: none;
}

.selection-summary {
  min-width: 300px;
  max-width: 90%;
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 1050;
  transition: all 0.3s ease;
}

.summary-header {
  margin-bottom: 8px;
  text-align: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.help-text {
  font-size: 0.8em;
  color: #666;
  font-style: italic;
}

.summary-content {
  display: flex;
  gap: 20px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.summary-item .label {
  font-size: 0.8em;
  color: #666;
}

.summary-item .value {
  font-weight: bold;
}

/* Mobile-specific styles */
@media (max-width: 1199.98px) {
  .data-label {
    font-weight: bold;
    font-size: 0.8rem;
    margin-bottom: 0.1rem;
    color: #6c757d;
  }
  
  .card {
    margin-bottom: 0.75rem;
  }
  
  .row > [class*="col-"] {
    margin-bottom: 0.5rem;
  }
}

/* Add specific styling for the column group header */
.header-row .border-bottom {
  border-bottom: 1px solid #dee2e6 !important;
  margin-bottom: 4px;
}

/* Add styling for the close button */
.selection-summary .btn-close-sm {
  font-size: 0.7rem;
  padding: 0.25rem;
}

/* New container styles */
.weekly-details-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
}

.scrollable-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Styling for combined week column */
.week-combined {
  display: flex;
  align-items: center;
  gap: 6px;
}

.week-number {
  font-weight: bold;
  white-space: nowrap;
}

.week-separator {
  color: #6c757d;
  font-weight: normal;
}

.week-date {
  flex: 1;
}

/* Improved checkbox styling */
.enhanced-checkbox {
  cursor: pointer;
  width: 1.1em;
  height: 1.1em;
  border: 1.5px solid #6c757d !important; /* Darker border */
  margin-right: 0.25rem !important;
}

/* Remove checkbox-column class since it's no longer needed */

/* Styling for collapsed cards in mobile view */
@media (max-width: 1199.98px) {
  .row-collapsed .card {
    background-color: #f8f9fa !important;
  }
  
  .row-collapsed .card-body {
    padding-top: 0.25rem !important;
    padding-bottom: 0.25rem !important;
  }
  
  .row-collapsed .card {
    opacity: 0.8;
    transition: opacity 0.2s ease;
  }
  
  .row-collapsed .card:hover {
    opacity: 1;
  }
  
  .row-selected .card {
    border-left: 4px solid #198754;
    background-color: rgba(198, 222, 210, 0.3) !important;
  }
  
  .details-section {
    transition: max-height 0.3s ease-out;
  }
  
  /* Add toggle icon styling */
  .toggle-icon {
    cursor: pointer;
    padding: 5px;
    font-size: 0.9rem;
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* Make sure selected rows have a clear indicator */
  .row-selected .card {
    border-left: 4px solid #198754;
    background-color: rgba(198, 222, 210, 0.3) !important;
  }
  
  /* Add a badge to indicate row is selected */
  .row-selected .week-combined::after {
    content: "Selected";
    font-size: 0.7rem;
    font-weight: 500;
    color: white;
    background-color: #198754;
    padding: 2px 6px;
    border-radius: 10px;
    margin-left: 8px;
    display: inline-block;
  }
}

/* Styling for the expand/collapse icon */
.expand-icon {
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0.25rem;
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
}

.expand-icon:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

/* New styles for the two-table layout */
.summary-tables-container {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  padding: 10px;
  justify-content: center;
}

.summary-table-section {
  flex: 1;
  min-width: 250px;
  max-width: 300px;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  overflow: hidden;
}

.table-title {
  padding: 8px 10px;
  margin: 0;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  text-align: center;
  font-weight: 600;
}

.summary-table {
  width: 100%;
  margin-top: 0;
}

/* New grid layout styles */
.summary-grid-wrapper {
  padding: 10px;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto;
  gap: 12px;
}

.summary-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  background-color: rgba(0,0,0,0.02);
  border-radius: 4px;
  border: 1px solid #e9ecef;
}

.grid-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #6c757d;
  margin-bottom: 4px;
}

.grid-value {
  font-size: 1rem;
  font-weight: 500;
}

/* Remove old table styles that are no longer needed */
.summary-table-wrapper {
  padding: 10px;
}
</style>