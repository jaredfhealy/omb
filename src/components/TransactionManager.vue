<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
const store = useAppStore()

// Add local computed property
const filteredTransactions = computed(() => {
  const transactions = [...(store.activeAccount?.transactions || [])]
  let filtered = transactions
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .sort((a, b) => a.startWeek - b.startWeek)

  // Type filter
  if (store.transactionFilter !== 'all') {
    filtered = filtered.filter(t => t.type === store.transactionFilter)
  }

  // Week filter
  if (store.selectedWeek) {
    filtered = filtered.filter(t =>
      store.selectedWeek >= t.startWeek &&
      (!t.endWeek || store.selectedWeek <= t.endWeek)
    )
  }

  return filtered
})

// Define local functions
function removeTransaction(transaction) {
  if (store.confirm) {
    store.confirm(
      `Are you sure you want to delete the week ${transaction.startWeek} ${transaction.type} for $${transaction.amount}?`,
      () => {
        store.activeAccount.transactions.splice(transaction.originalIndex, 1)
        store.calculateProjections()
      }
    )
  }
}

function clearFilters() {
  store.selectedWeek = null
  store.transactionFilter = 'all'
}

function getTransactionWeekDisplay(transaction, startEnd) {
  const start = transaction.startWeek
  const end = transaction.endWeek

  let result = `#${startEnd === 'start' ? start : end} (${startEnd === 'start' ? store.weekRange(start) : store.weekRange(end)})`

  if (startEnd === 'end') {
    if (start === end) return "Single Week"
    if (!end) return "Ongoing"
    result += ` [${end - start} Wks]`
  }

  return result
}

// Expose functions to store
store.removeTransaction = removeTransaction
store.clearFilters = clearFilters
</script>

<template>
  <div class="transaction-manager-container">
    <!-- Header section with filters -->
    <div class="p-3">
      <div class="d-flex justify-content-between align-items-center">
        <div class="btn-group">
          <button class="btn" :class="store.transactionFilter === 'all' ? 'btn-primary' : 'btn-outline-primary'"
            @click="store.transactionFilter = 'all'">All</button>
          <button class="btn" :class="store.transactionFilter === 'deposit' ? 'btn-primary' : 'btn-outline-primary'"
            @click="store.transactionFilter = 'deposit'">Deposits</button>
          <button class="btn" :class="store.transactionFilter === 'withdrawal' ? 'btn-primary' : 'btn-outline-primary'"
            @click="store.transactionFilter = 'withdrawal'">Withdrawals</button>
        </div>

        <div class="d-flex align-items-center">
          <label class="me-2">Filter by Week:</label>
          <select class="form-select w-auto me-2" v-model="store.selectedWeek">
            <option :value="null">All Weeks</option>
            <option v-for="p in store.projections" :key="p.week" :value="p.week">
              Week {{ p.week }} ({{ store.weekRange(p.week, true) }})
            </option>
          </select>
          <button type="button" class="btn btn-warning" @click="clearFilters()"
            v-show="store.selectedWeek || store.transactionFilter !== 'all'">
            <i class="bi bi-x-circle"></i> Reset
          </button>
        </div>

        <button class="btn btn-primary" @click="store.addNewTransaction">
          <i class="bi bi-plus"></i> New Transaction
        </button>
      </div>
    </div>

    <hr class="m-0"/>

    <!-- Scrollable container for transaction cards -->
    <div class="scrollable-container">
      <div class="container-fluid pb-4">
        <!-- Table Header Row -->
        <div class="row sticky-top header-row bg-white py-2 mb-2">
          <div class="col-12 col-xl-2">Type / Category</div>
          <div class="col-12 col-xl-10 d-none d-xl-flex">
            <div class="col-3">Start Week</div>
            <div class="col-3">End Week</div>
            <div class="col-2">Amount</div>
            <div class="col-4">Actions</div>
          </div>
        </div>

        <!-- Transaction Cards -->
        <div v-for="(transaction, index) in filteredTransactions" :key="index" class="row mb-2">
          <div class="col-12">
            <div class="card h-100">
              <div class="card-body py-2">
                <div class="row">
                  <!-- Transaction Type/Category Info - removed pill styling -->
                  <div class="col-12 col-xl-2 mb-2 mb-xl-0">
                    <div class="transaction-type">
                      <span class="type-text" :class="transaction.type === 'deposit' ? 'text-success' : 'text-danger'">
                        {{ transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1) }}
                      </span>
                      <span v-if="transaction.category" class="category-text">
                        {{ transaction.category.charAt(0).toUpperCase() + transaction.category.slice(1) }}
                      </span>
                    </div>
                  </div>
                  
                  <!-- Transaction Details - flex layout on desktop, stacked on mobile -->
                  <div class="col-12 col-xl-10">
                    <div class="row">
                      <!-- Start Week - now a separate column -->
                      <div class="col-6 col-xl-3">
                        <div class="data-label d-xl-none">Start Week</div>
                        <div v-html="store.weekRange(transaction.startWeek)"></div>
                      </div>
                      
                      <!-- End Week - now a separate column -->
                      <div class="col-6 col-xl-3">
                        <div class="data-label d-xl-none">End Week</div>
                        <div>
                          <span v-if="transaction.endWeek" v-html="store.weekRange(transaction.endWeek)"></span>
                          <span v-else class="text-muted">Ongoing</span>
                        </div>
                      </div>
                      
                      <!-- Amount - reduced width -->
                      <div class="col-6 col-xl-2">
                        <div class="data-label d-xl-none">Amount</div>
                        <div class="amount-display">
                          {{ store.currency(transaction.amount) }}
                        </div>
                      </div>
                      
                      <!-- Actions - reduced width -->
                      <div class="col-6 col-xl-4">
                        <div class="data-label d-xl-none">Actions</div>
                        <div class="d-flex gap-2">
                          <button class="btn btn-sm btn-outline-primary" @click="store.editTransaction(transaction)">
                            <i class="bi bi-pencil-square"></i> Edit
                          </button>
                          <button class="btn btn-sm btn-outline-danger" @click="removeTransaction(transaction)">
                            <i class="bi bi-trash"></i> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Empty state message -->
        <div v-if="filteredTransactions.length === 0" class="text-center py-5">
          <p class="text-muted">No transactions match your filters</p>
          <button class="btn btn-outline-secondary" @click="clearFilters">Reset filters</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.transaction-manager-container {
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

/* Alternating background colors for cards */
.transaction-manager-container .row.mb-2:nth-child(odd) .card {
  background-color: rgba(0, 0, 0, 0.05);
}

/* Hover effect */
.transaction-manager-container .card:hover {
  background-color: rgba(244, 236, 192, 0.7);
}

.header-row {
  font-weight: bold;
  border-bottom: 2px solid #dee2e6;
  z-index: 1020;
}

/* Updated Transaction type and category styling */
.transaction-type {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-text {
  font-weight: 600;
}

.category-text {
  font-weight: 500;
  color: #495057;
}

/* Mobile data labels */
.data-label {
  font-weight: bold;
  font-size: 0.8rem;
  margin-bottom: 0.1rem;
  color: #6c757d;
}

/* Amount display */
.amount-display {
  font-weight: 500;
}

/* Mobile-specific styling */
@media (max-width: 1199.98px) {
  .card {
    margin-bottom: 0.75rem;
  }
  
  .row > [class*="col-"] {
    margin-bottom: 0.5rem;
  }
}

/* Make badges stand out more */
.badge {
  padding: 0.5em 0.8em;
  font-size: 0.8rem;
}
</style>