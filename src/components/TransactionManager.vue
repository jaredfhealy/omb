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
  <div class="d-flex flex-column h-100">
    <!-- Header section -->
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
              Week {{ p.week }} ({{ store.weekRange(p.week) }})
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

    <!-- Table section -->
    <div class="flex-grow-1 position-relative">
      <div class="table-responsive position-absolute" style="top: 0; bottom: 0; left: 0; right: 0;">
        <div class="pb-4">  <!-- Add padding wrapper -->
          <table class="table table-striped table-hover">
            <thead style="position: sticky; top: 0; z-index: 1020; background-color: white;">
              <tr>
                <th>Type</th>
                <th>Category</th>
                <th>Start Week</th>
                <th>End Week</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="transaction in filteredTransactions">
                <td>{{ transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1) }}</td>
                <td>{{ transaction.category ? transaction.category.charAt(0).toUpperCase() + transaction.category.slice(1) : "" }}</td>
                <td>{{ getTransactionWeekDisplay(transaction, 'start') }}</td>
                <td>{{ getTransactionWeekDisplay(transaction, 'end') }}</td>
                <td>{{ store.currency(transaction.amount) }}</td>
                <td>
                  <button class="btn btn-sm btn-primary me-2" @click="store.editTransaction(transaction)"><i
                      class="bi bi-pencil-square"></i></button>
                  <button class="btn btn-sm btn-danger" @click="removeTransaction(transaction)"><i
                      class="bi bi-trash"></i></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>