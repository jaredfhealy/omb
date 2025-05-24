<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import DataTable from '@/components/custom/DataTable.vue'

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

// Define columns for DataTable
const columns = [
  {
    key: 'type',
    header: { text: 'Type / Category' },
    class: 'col-12 col-xl-2'
  },
  {
    key: 'startWeek',
    header: { text: 'Start Week' },
    class: 'col-6 col-xl-3'
  },
  {
    key: 'endWeek',
    header: { text: 'End Week' },
    class: 'col-6 col-xl-3'
  },
  {
    key: 'amount',
    header: { text: 'Amount' },
    class: 'col-6 col-xl-2',
    value: (item) => store.currency(item.amount)
  },
  {
    key: 'actions',
    header: { text: 'Actions' },
    class: 'col-6 col-xl-2'
  }
]

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

// Expose functions to store
store.removeTransaction = removeTransaction
store.clearFilters = clearFilters
</script>

<template>
  <!-- Header section with filters - simplified structure -->
  <div class="p-2 filter-div">
    <!-- Combined row: Type filters, New button, and Week filter -->
    <div class="d-flex flex-wrap align-items-center justify-content-between">
      <div class="d-flex align-items-center">
        <div class="btn-group me-3">
          <button class="btn" :class="[
            store.transactionFilter === 'all' ? 'btn-primary' : 'btn-outline-primary', 
            store.isBelowXL ? 'btn-sm' : ''
          ]" @click="store.transactionFilter = 'all'">All</button>
          <button class="btn" :class="[
            store.transactionFilter === 'deposit' ? 'btn-primary' : 'btn-outline-primary',
            store.isBelowXL ? 'btn-sm' : ''
          ]" @click="store.transactionFilter = 'deposit'">Deposits</button>
          <button class="btn" :class="[
            store.transactionFilter === 'withdrawal' ? 'btn-primary' : 'btn-outline-primary',
            store.isBelowXL ? 'btn-sm' : ''
          ]" @click="store.transactionFilter = 'withdrawal'">Withdrawals</button>
        </div>
        <button class="btn btn-primary me-3" :class="store.isBelowXL ? 'btn-sm' : ''" @click="store.addNewTransaction">
          <i class="bi bi-plus"></i> New
        </button>
      </div>
      
      <div class="d-flex align-items-center mt-2 mt-md-0">
        <label class="me-2">Filter:</label>
        <select class="form-select me-2" :class="store.isBelowXL ? 'form-select-sm' : ''" style="max-width: 250px;" v-model="store.selectedWeek">
          <option :value="null">All Weeks</option>
          <option v-for="p in store.projections" :key="p.week" :value="p.week">
            Week {{ p.week }} ({{ store.weekRange(p.week, true) }})
          </option>
        </select>
        <button type="button" class="btn btn-warning" :class="store.isBelowXL ? 'btn-sm' : ''" @click="clearFilters()"
          v-show="store.selectedWeek || store.transactionFilter !== 'all'">
          <i class="bi bi-x-circle"></i>
        </button>
      </div>
    </div>
  </div>

  <!-- DataTable without unnecessary container -->
  <DataTable 
    :items="filteredTransactions"
    :columns="columns"
    :striped="true">
    <!-- Type column -->
    <template #type="{ item }">
      <div class="transaction-type">
        <span class="type-text" :class="item.type === 'deposit' ? 'text-success' : 'text-danger'">
          {{ item.type.charAt(0).toUpperCase() + item.type.slice(1) }}
        </span>
        <span v-if="item.category" class="category-text">
          {{ item.category.charAt(0).toUpperCase() + item.category.slice(1) }}
        </span>
      </div>
    </template>

    <!-- Start Week column -->
    <template #startWeek="{ item }">
      <span v-html="store.weekRange(item.startWeek)"></span>
    </template>

    <!-- End Week column -->
    <template #endWeek="{ item }">
      <span v-if="item.endWeek" v-html="store.weekRange(item.endWeek)"></span>
      <span v-else class="text-muted">Ongoing</span>
    </template>

    <!-- Actions column -->
    <template #actions="{ item }">
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-primary" @click="store.editTransaction(item)">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" @click="removeTransaction(item)">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </template>

    <!-- Move empty state inside DataTable as a slot -->
    <template v-if="filteredTransactions.length === 0" #empty>
      <div class="text-center py-5">
        <p class="text-muted">No transactions match your filters</p>
        <button class="btn btn-outline-secondary" @click="clearFilters">Reset filters</button>
      </div>
    </template>
  </DataTable>
</template>

<style>
/* Remove the container style that's no longer needed */

/* Transaction type and category styling */
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

/* Mobile styling */
@media (max-width: 1199.98px) {
  .data-label {
    font-weight: bold;
    font-size: 0.8rem;
    margin-bottom: 0.1rem;
    color: #6c757d;
  }
}
</style>