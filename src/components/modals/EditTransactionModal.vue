<script setup>
import { useAppStore } from '@/stores/app'
import { watch, ref } from 'vue'
const store = useAppStore()

// Replace global state with local ref
const editingTransaction = ref(null)
const editingIndex = ref(null)
const errors = ref([])

// Define local functions
function addNewTransaction() {
  editingTransaction.value = {
    type: null,
    startWeek: null,
    endWeek: null,
    amount: 0,
    category: null
  }
  editingIndex.value = null
}

function editTransaction(transaction) {
  console.log('Editing transaction:', transaction)
  editingTransaction.value = {
    type: transaction.type,
    startWeek: transaction.startWeek,
    endWeek: transaction.endWeek || null,
    amount: Number(transaction.amount),
    category: transaction.category || null
  }
  editingIndex.value = transaction.originalIndex
}

function closeEditModal() {
  editingTransaction.value = null
  editingIndex.value = null
  errors.value = []
}

function saveTransactionEdit() {
  // Reset errors
  errors.value = []

  const transaction = {
    type: editingTransaction.value.type,
    startWeek: editingTransaction.value.startWeek,
    endWeek: editingTransaction.value.endWeek,
    amount: editingTransaction.value.amount.toString(),
    category: editingTransaction.value.category
  }

  // Check required fields first
  if (!transaction.type)
    errors.value.push("Type is required.")
  if (!transaction.startWeek)
    errors.value.push("Start Week is required.")
  if (!transaction.amount || isNaN(transaction.amount) || transaction.amount <= 0)
    errors.value.push("Amount is required, and should be a positive number.")

  // If errors, return here
  if (errors.value.length > 0) return

  if (editingIndex.value === null) {
    store.activeAccount.transactions.push(transaction)
  } else {
    store.activeAccount.transactions[editingIndex.value] = transaction
  }

  store.calculateProjections()
  closeEditModal()
}

watch(
  () => editingTransaction.value?.startWeek,
  (newVal, oldVal) => {
    if (newVal > editingTransaction.value?.endWeek && newVal !== null && oldVal === null) {
      editingTransaction.value.endWeek = newVal
    }
    else if (newVal > editingTransaction.value?.endWeek && editingTransaction.value.endWeek !== null && newVal !== null) {
      editingTransaction.value.endWeek = newVal
    }
  }
)

watch(
  () => editingTransaction.value?.endWeek,
  (newVal, oldVal) => {
    if (newVal < editingTransaction.value?.startWeek && newVal !== null) {
      editingTransaction.value.startWeek = newVal
    }
  }
)

// Expose functions to store
store.addNewTransaction = addNewTransaction
store.editTransaction = editTransaction
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': editingTransaction !== null }" v-if="editingTransaction">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            {{ editingIndex === null ? 'Add New Transaction' : 'Edit ' +
              editingTransaction.type.charAt(0).toUpperCase() + editingTransaction.type.slice(1) }}
          </h5>
          <button type="button" class="btn-close" @click="closeEditModal"></button>
        </div>
        <div class="modal-body">
          <div class="text-danger" v-if="errors.length">
            <b>Please correct the following error(s):</b>
            <ul>
              <li v-for="error in errors">{{ error }}</li>
            </ul>
          </div>
          <div class="form-group mb-3">
            <label>Transaction Type</label>
            <select v-model="editingTransaction.type" class="form-select">
              <option :value="null">-- Select --</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label>Category</label>
            <select v-model="editingTransaction.category" class="form-select" required>
              <option :value="null">-- Select --</option>
              <option value="income">Income</option>
              <option value="taxes">Taxes</option>
              <option value="transfer">Transfer</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label class="me-2">Start Week</label>
            <select class="form-select w-auto me-2" v-model.number="editingTransaction.startWeek" required>
              <option :value="null">-- Select --</option>
              <option v-for="p in store.projections" :key="p.week" :value="p.week">
                Week {{ p.week }} ({{ store.weekRange(p.week) }})
              </option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label class="me-2">End Week</label>
            <select class="form-select w-auto me-2" v-model.number="editingTransaction.endWeek">
              <option :value="null">-- Ongoing / No End --</option>
              <option v-for="p in store.projections" :key="p.week" :value="p.week">
                Week {{ p.week }} ({{ store.weekRange(p.week) }})
              </option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label>Amount</label>
            <input type="number" class="form-control" v-model.number="editingTransaction.amount" step="0.01" required>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="closeEditModal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="saveTransactionEdit">Save changes</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>