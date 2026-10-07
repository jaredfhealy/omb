<script setup>
import { useAppStore } from '@/stores/app'
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import DataTable from '@/components/custom/DataTable.vue'

const store = useAppStore()
const selectedRows = ref({})
const selectionSummary = ref(null)
const scrollableWindow = ref(null)
const currentWeekRef = ref(null)
const summaryExpanded = ref(false)
const weekRangeFilter = ref('current-minus-4')

const weekRangeOptions = [
  { value: 'current-minus-4', label: 'Current - 4' },
  { value: 'current-minus-8', label: 'Current - 8' },
  { value: 'current-minus-12', label: 'Current - 12' },
  { value: 'all', label: 'All Weeks' }
]

// Add local function (without exposing to store)
function getAssignmentsForWeek(week) {
  return (store.activeAccount.positions || []).filter(position => 
    position.assignedWeek === week
  )
}

function getSoldPositionsForWeek(week) {
  return (store.activeAccount.positions || []).filter(position => 
    position.soldWeek === week
  )
}

const getAssignmentsTooltip = (projection, type) => {
  if (type === 'sold') {
    const soldPositions = getSoldPositionsForWeek(projection.week)
    if (soldPositions.length > 0)
      return `Positions Sold This Week:<br>` +
      `${soldPositions.map(p2 => `${p2.symbol}: ${p2.shares} shares}`).join('<br>')}` +
      `<br>Total: ${store.currency(projection.sharesSold)}`
    else
      console.log("No sold positions for week", projection.week)
  }
  else if (type === 'bought') {
    const assignments = getAssignmentsForWeek(projection.week)

    if (assignments.length > 0)
      return `New Assignments This Week:<br>` +
      `${assignments.map(p => `${p.symbol}: ${p.shares} shares}`).join('<br>')}` + 
      `<br>Total: ${store.currency(projection.sharesBought)}`
    else
      console.log("No assigned positions for week", projection.week)
  }
  
  return "";
}

// Add function to determine current week
const getCurrentWeek = computed(() => {
  return store.getCurrentWeek()
})

const filteredProjections = computed(() => {
  if (weekRangeFilter.value === 'all') {
    return store.projections
  }

  const windowByFilter = {
    'current-minus-4': 4,
    'current-minus-8': 8,
    'current-minus-12': 12
  }

  const lookbackWindow = windowByFilter[weekRangeFilter.value] ?? 4
  const maxWeek = store.projections.length || 1
  const currentWeek = Math.max(1, Math.min(getCurrentWeek.value || 1, maxWeek))
  const startWeek = Math.max(1, currentWeek - lookbackWindow)

  return store.projections.filter((projection) => projection.week >= startWeek)
})

// Define columns for the DataTable
const columns = [
  {
    key: 'week',
    header: {
      text: 'Week'
    },
    class: 'col-12 col-xl-2'
  },
  {
    key: 'startBalance',
    header: {
      text: 'Start: Cash',
      tooltip: 'Total cash balance and cash investments'
    },
    class: 'col-6 col-xl',
    value: (item) => store.currency(item.startBalance)
  },
  {
    key: 'startShares',
    header: {
      text: 'Start: Shares Bal.',
      tooltip: 'Total cost basis (balance) of assigned positions at week start'
    },
    class: 'col-6 col-xl',
    value: (item) => store.currency(item.startSharesBalance)
  },
  {
    key: 'netShares',
    header: {
      text: 'Net Shares',
      tooltip: 'Net shares bought minus shares sold for this week.'
    },
    class: 'col-6 col-xl',
    value: (item) => store.currency((item.sharesSold || 0) - (item.sharesBought || 0)),
    getTooltip: (item) => {
      if ((item.sharesBought || 0) > 0 || (item.sharesSold || 0) > 0) {
        return `Shares Bought: ${store.currency(item.sharesBought || 0)}<br>Shares Sold: ${store.currency(item.sharesSold || 0)}`
      }
      return null;
    },
    tooltipHtml: true,
    slot: 'netShares'
  },
  {
    key: 'netTransaction',
    header: {
      text: 'Net Trans.',
      tooltip: 'Rows marked with (*) have both deposits and withdrawals'
    },
    class: 'col-6 col-xl',
    getTooltip: (item) => {
      return getNetTransactionTooltip(item.deposit, item.withdrawal)
    },
    tooltipHtml: true
  },
  {
    key: 'projectedActualGrowth',
    header: {
      text: 'Projected/Actual',
      tooltip: 'Shows actual growth if available, otherwise projected growth. Based on estimated weekly % ROR from settings.'
    },
    class: 'col-6 col-xl',
    value: (item) => store.currency(item.actualGrowth !== null && item.actualGrowth !== undefined ? item.actualGrowth : item.projectedGrowth),
    getTooltip: (item) => {
      if (item.actualGrowth !== null && item.actualGrowth !== undefined) {
        // Preserve the detailed tooltip from the old Actual column
        return `Avg All: ${store.currency(item.averageGrowth)}<br>` +
          `Avg to Date: ${store.currency(item.trailingTotalGrowthAvg)}<br>` +
          `Avg Last 8: ${store.currency(item.trailing8WeekGrowthAvg)}<br>` +
          `Avg Last 4: ${store.currency(item.trailing4WeekGrowthAvg)}`;
      }
    },
    tooltipHtml: true
  },
  {
    key: 'ror',
    header: {
      text: 'ROR %',
      tooltip: 'Rate of Return percentage'
    },
    class: 'col-6 col-xl',
    getTooltip: (item) => item.actualROR ? 
      `Avg All: ${item.averageROR}%<br>
       Avg to Date: ${item.trailingTotalRORAvg}%<br>
       Avg Last 8: ${item.trailing8WeekRORAvg}%<br>
       Avg Last 4: ${item.trailing4WeekRORAvg}%` : null,
    tooltipHtml: true,
    value: (item) => item.actualROR ? `${Number(item.actualROR).toFixed(2)}%` : '0%'
  },
  {
    key: 'endBalance',
    header: {
      text: 'End: Total',
      tooltip: 'Final balance after all transactions and growth'
    },
    class: 'col-6 col-xl',
    value: (item) => store.currency(item.endBalance)
  },
  {
    key: 'actions',
    header: {
      text: 'Actions'
    },
    class: 'col-6 col-xl'
  }
]

// Updated to calculate summaries for all columns at once
const calculateSummary = () => {
  const selectedWeeks = Object.keys(selectedRows.value)
    .filter(week => selectedRows.value[week])
    .map(week => Number(week))
  
  if (selectedWeeks.length === 0) return null
  
  // Calculate summaries for all columns at once
  const columns = ['actualGrowth', 'actualROR']
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
  if (element && scrollableWindow.value) {
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
  await nextTick()
  
  if (currentWeekRef.value && dataTableRef.value?.scrollableWindow) {
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

watch(weekRangeFilter, () => {
  closeSummary()
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
function getNetTransactionTooltip(deposit, withdrawal) {
  const hasMultiple = deposit > 0 && withdrawal > 0

  if (hasMultiple) {
    return `Deposit: ${store.currency(deposit)}<br>Withdrawal: ${store.currency(withdrawal)}`
  }
}

// Add function to close the summary (for the close button)
const closeSummary = () => {
  // Clear all checkboxes
  Object.keys(selectedRows.value).forEach(key => {
    selectedRows.value[key] = false
  })
  selectionSummary.value = null
  summaryExpanded.value = false
  
  // Scroll back to current week
  scrollToCurrentWeek()
}

// Add computed property to check if any rows are selected
const hasSelection = computed(() => {
  return Object.values(selectedRows.value).some(selected => selected === true)
})

// Function to toggle summary expansion
const toggleSummaryExpansion = () => {
  summaryExpanded.value = !summaryExpanded.value
}

// Add function to get row attributes
const getRowAttributes = (item) => ({
  'data-week': item.week,
  class: {
    'current-week-card': item.week === getCurrentWeek.value, // Use .value here
    'row-selected': selectedRows[item.week]
  }
})

// Add ref handling function
const handleRowRef = (el, item) => {
  // Compare against the computed value
  if (item.week === getCurrentWeek.value) {
    currentWeekRef.value = el
  }
}

// Add ref for the DataTable component
const dataTableRef = ref(null)
</script>

<template>
  <div class="weekly-details-container">
    <div class="d-xl-none mb-3">
      <label for="week-filter-mobile" class="form-label mb-1">Week Range</label>
      <select
        id="week-filter-mobile"
        class="form-select form-select-sm week-filter-select-mobile"
        v-model="weekRangeFilter"
      >
        <option
          v-for="option in weekRangeOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
    </div>

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
            <span class="help-text ms-2 d-none d-xl-inline-block" v-else>
              Hit Esc to close ({{ Object.values(selectedRows).filter(Boolean).length }} weeks selected)
            </span>
          </div>
          <button type="button" class="btn-close btn-close-sm" @click="closeSummary" aria-label="Close"></button>
        </div>
      </div>
      
      <!-- Only show summary when expanded - now with grid layout -->
      <div v-if="summaryExpanded" class="summary-tables-div">
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

    <!-- Replace table with DataTable -->
    <DataTable 
      ref="dataTableRef"
      :items="filteredProjections"
      :columns="columns"
      :striped="true"
      :get-row-attributes="getRowAttributes"
      :get-row-ref="handleRowRef">
      <template #header-week>
        <div class="d-flex flex-column gap-1">
          <span>Week</span>
          <select
            class="form-select form-select-sm week-filter-select"
            v-model="weekRangeFilter"
            @click.stop
          >
            <option
              v-for="option in weekRangeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
      </template>

      <!-- Week column with checkbox -->
      <template #week="{ item }">
        <div class="week-combined">
          <input type="checkbox" 
                 class="form-check-input enhanced-checkbox me-2" 
                 v-model="selectedRows[item.week]" 
                 @change="updateSummary">
          <span class="week-number">
            <span class="d-xl-none">Week </span>{{ item.week }}
          </span>
          <span class="week-separator">|</span>
          <span class="week-date" v-html="store.weekRange(item.week)"></span>
        </div>
      </template>

      <!-- Actions column -->
      <template #actions="{ item }">
        <button type="button" 
                class="btn btn-sm btn-outline-primary" 
                @click="store.showWeeklyRowModal(item.week)">
          <i class="bi bi-pencil-square"></i>
        </button>
        {{ store.activeAccount.notes?.some(a => Number(a.week) === item.week && a.note) ? '*' : '' }}
      </template>

      <!-- Net Transaction column with edit icon -->
      <template #netTransaction="{ item }">
        <div class="d-flex">
          <i class="bi bi-pencil-square cursor-pointer me-1"
             @click="editNetTransactionFromRow(item.week)"></i>
          <span :class="(item.deposit || 0) < (item.withdrawal || 0) ? 'text-danger' : ''">
            {{ store.currency(item.deposit - item.withdrawal) }}
            <span v-if="item.deposit > 0 && item.withdrawal > 0">*</span>
          </span>
        </div>
      </template>

      <!-- Net Shares column with conditional styling -->
      <template #netShares="{ item }">
        <span :class="(item.sharesBought || 0) > (item.sharesSold || 0) ? 'text-danger' : ''">
          {{ store.currency((item.sharesSold || 0) - (item.sharesBought || 0)) }}
        </span>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
/* Keep week-specific styles */
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

.enhanced-checkbox {
  cursor: pointer;
  width: 1.1em;
  height: 1.1em;
  border: 1.5px solid #6c757d !important;
  margin-right: 0.25rem !important;
}

.week-filter-select {
  max-width: 150px;
}

.week-filter-select-mobile {
  max-width: 220px;
}

/* Keep summary styles */
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
  display: block;
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
.summary-tables-div {
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