<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()
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
          <button type="button" class="btn btn-warning" @click="store.clearFilters()"
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
              <tr v-for="transaction in store.filteredTransactions">
                <td>{{ transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1) }}</td>
                <td>{{ transaction.category ? transaction.category.charAt(0).toUpperCase() + transaction.category.slice(1) : "" }}</td>
                <td>{{ store.getTransactionWeekDisplay(transaction, 'start') }}</td>
                <td>{{ store.getTransactionWeekDisplay(transaction, 'end') }}</td>
                <td>{{ store.currency(transaction.amount) }}</td>
                <td>
                  <button class="btn btn-sm btn-primary me-2" @click="store.editTransaction(transaction)"><i
                      class="bi bi-pencil-square"></i></button>
                  <button class="btn btn-sm btn-danger" @click="store.removeTransaction(transaction)"><i
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