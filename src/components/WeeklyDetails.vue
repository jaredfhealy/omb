<script setup>
import { useAppStore } from '@/stores/app'
import { computed, ref, onMounted, onUnmounted } from 'vue'

const store = useAppStore()
const isSelecting = ref(false)
const selectionStart = ref(null)
const selectedCells = ref(new Set())
const selectionSummary = ref(null)

const getAssignmentsTooltip = (projection) => {
  const assignments = store.getAssignmentsForWeek(projection.week)
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

// Add allowable columns constant
const SELECTABLE_COLUMNS = ['transaction', 'projectedGrowth', 'actualGrowth', 'actualROR']

const calculateSummary = (cells) => {
  if (cells.size === 0) return null

  const [firstCell] = cells
  const [, column] = firstCell.split('-')
  const isROR = column === 'actualROR'

  const values = [...cells].map(cell => {
    const [week] = cell.split('-')
    const projection = store.projections[Number(week) - 1]
    return isROR ? (projection.actualROR || 0) : (projection[column] || 0)
  }).filter(v => !isNaN(v))

  if (values.length === 0) return null

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    total: values.reduce((a, b) => a + b, 0),
    isROR
  }
}

const handleMouseDown = (week, column) => {
  if (!SELECTABLE_COLUMNS.includes(column)) return
  isSelecting.value = true
  selectionStart.value = { week, column }
  selectedCells.value = new Set([`${week}-${column}`])
  selectionSummary.value = calculateSummary(selectedCells.value)
}

const handleMouseOver = (week, column) => {
  if (!isSelecting.value || column !== selectionStart.value.column || !SELECTABLE_COLUMNS.includes(column)) return
  selectedCells.value.add(`${week}-${column}`)
  selectionSummary.value = calculateSummary(selectedCells.value)
}

const handleMouseUp = () => {
  isSelecting.value = false
}

// Add escape key handler
const handleEscape = (e) => {
  if (e.key === 'Escape') {
    selectedCells.value.clear()
    selectionSummary.value = null
  }
}

// Add event listener for escape key
onMounted(() => {
  document.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape)
})
</script>

<template>
  <div class="flex-grow-1 position-relative">
    <!-- Update selection summary -->
    <div v-if="selectionSummary" class="selection-summary">
      <div class="summary-header">
        <span class="help-text">Hit Esc to close</span>
      </div>
      <div class="summary-content">
        <div class="summary-item">
          <span class="label">Min:</span>
          <span class="value" v-if="selectionSummary.isROR">
            {{ selectionSummary.min.toFixed(2) }}%
          </span>
          <span class="value" v-else>
            {{ store.currency(selectionSummary.min) }}
          </span>
        </div>
        <div class="summary-item">
          <span class="label">Max:</span>
          <span class="value" v-if="selectionSummary.isROR">
            {{ selectionSummary.max.toFixed(2) }}%
          </span>
          <span class="value" v-else>
            {{ store.currency(selectionSummary.max) }}
          </span>
        </div>
        <div class="summary-item">
          <span class="label">Avg:</span>
          <span class="value" v-if="selectionSummary.isROR">
            {{ selectionSummary.avg.toFixed(2) }}%
          </span>
          <span class="value" v-else>
            {{ store.currency(selectionSummary.avg) }}
          </span>
        </div>
        <div class="summary-item">
          <span class="label">Total:</span>
          <span class="value" v-if="selectionSummary.isROR">
            {{ selectionSummary.total.toFixed(2) }}%
          </span>
          <span class="value" v-else>
            {{ store.currency(selectionSummary.total) }}
          </span>
        </div>
      </div>
    </div>

    <div class="table-responsive position-absolute" style="top: 0; bottom: 0; left: 0; right: 0;">
      <div class="pb-4"> <!-- Add padding wrapper -->
        <table class="table table-striped table-hover">
          <thead style="position: sticky; top: 0; z-index: 1020; background-color: white;">
            <tr>
              <th>Week #</th>
              <th>Time Period (Sun - Sat)</th>
              <th data-bs-toggle="tooltip" data-bs-title="Total cash balance and cash investments">
                Start: Cash Balance*
              </th>
              <th v-if="store.activeAccount.positions.length > 0" data-bs-toggle="tooltip"
                data-bs-title="Total cost basis of assigned positions. Weeks with new assignments marked info icon. with an info icon <i class='bi bi-info-circle ms-1'></i>.">
                Start: Shares Balance*
              </th>
              <th data-bs-toggle="tooltip"
                data-bs-title="Rows identified with an asterisk (*) have both deposit and withdrawal values.">
                Net Transaction*
              </th>
              <th>Projected Growth</th>
              <th>Actual Growth</th>
              <th data-bs-toggle="tooltip" data-bs-title="Hover over values to see trailing averages">
                Actual %ROR
              </th>
              <th data-bs-toggle="tooltip" data-bs-html="true"
                data-bs-title="Total of Cash & Cash Investments and the Cost Basis of all Stock Positions.<br><br>This will not match your brokerage balances as they calculate based on current stock price rather than original assigned price.">
                End: Total Balance*
              </th>
              <th data-bs-toggle="tooltip" data-bs-title="Rows identified with an asterisk (*) have notes.">
                Actions*
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(projection, index) in store.projections" :key="index" :class="{ 'current-week': projection.week === getCurrentWeek }">
              <td>{{ projection.week }}</td>
              <td>{{ store.weekRange(projection.week) }}</td>
              <td>{{ store.currency(projection.startBalance) }}</td>
              <td v-if="store.activeAccount.positions.length > 0">
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
              </td>
              <td>
                <div class="d-flex ">
                  <i class="bi bi-pencil-square cursor-pointer me-3"
                    @click="store.editNetTransactionFromRow(projection.week)"></i>
                  <span data-bs-toggle="tooltip" :data-bs-html="true"
                    :data-bs-title="`Deposit: ${store.currency(projection.deposit)}<br />Withdraw: (${store.currency(projection.withdrawal)})`"
                    :style="store.formatNetTransaction(projection.deposit, projection.withdrawal).style"
                    @mousedown="handleMouseDown(projection.week, 'transaction')"
                    @mouseover="handleMouseOver(projection.week, 'transaction')"
                    @mouseup="handleMouseUp"
                    :class="{ 'selected': selectedCells.has(`${projection.week}-transaction`) }">
                    {{ store.formatNetTransaction(projection.deposit,
                      projection.withdrawal).value }}
                    {{ store.formatNetTransaction(projection.deposit,
                      projection.withdrawal).indicator }}
                  </span>
                </div>
              </td>
              <td @mousedown="handleMouseDown(projection.week, 'projectedGrowth')"
                  @mouseover="handleMouseOver(projection.week, 'projectedGrowth')"
                  @mouseup="handleMouseUp"
                  :class="{ 'selected': selectedCells.has(`${projection.week}-projectedGrowth`) }">
                {{ store.currency(projection.projectedGrowth) }}
              </td>
              <td @mousedown="handleMouseDown(projection.week, 'actualGrowth')"
                  @mouseover="handleMouseOver(projection.week, 'actualGrowth')"
                  @mouseup="handleMouseUp"
                  :class="{ 'selected': selectedCells.has(`${projection.week}-actualGrowth`) }">
                <span v-if="projection.actualGrowth !== null" data-bs-toggle="tooltip" :data-bs-html="true"
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
              </td>
              <td @mousedown="handleMouseDown(projection.week, 'actualROR')"
                  @mouseover="handleMouseOver(projection.week, 'actualROR')"
                  @mouseup="handleMouseUp"
                  :class="{ 'selected': selectedCells.has(`${projection.week}-actualROR`) }">
                <span v-if="projection.actualROR" data-bs-toggle="tooltip" :data-bs-html="true" :data-bs-title="`
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
              </td>
              <td>{{ store.currency(projection.endBalance) }}</td>
              <td>
                <button type="button" 
                        class="btn btn-sm btn-outline-primary" 
                        @click="store.showWeeklyRowModal(projection.week)">
                  <i class="bi bi-pencil-square"></i>
                </button>
                {{ store.activeAccount.actuals.some(a => Number(a.week) ===
                  projection.week &&
                  a.notes) ? '*' : '' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style>
.current-week > td {
  background-color: rgba(198, 222, 210, 0.85) !important;
}

/* Add hover state to maintain highlighting */
.current-week:hover > td {
  background-color: rgba(198, 222, 210, 0.95) !important;
}

.selected {
  background-color: rgba(0, 123, 255, 0.15) !important;
  position: relative;
  z-index: 2;
}

/* Make selection more visible on current week */
.current-week .selected {
  background-color: rgba(0, 123, 255, 0.25) !important;
}

/* Prevent text selection while dragging */
.table td {
  user-select: none;
}

.selection-summary {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 1000;
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
</style>