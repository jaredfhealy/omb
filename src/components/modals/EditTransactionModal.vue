<script setup>
import { useAppStore } from '@/stores/app'
import { watch } from 'vue'

const store = useAppStore()

// Move watchers to the modal component
watch(
  () => store.editingTransaction?.startWeek,
  (newVal, oldVal) => {
    if (newVal > store.editingTransaction?.endWeek && newVal !== null && oldVal === null) {
      store.editingTransaction.endWeek = newVal
    }
    else if (newVal > store.editingTransaction?.endWeek && store.editingTransaction.endWeek !== null && newVal !== null) {
      store.editingTransaction.endWeek = newVal
    }
  }
)

watch(
  () => store.editingTransaction?.endWeek,
  (newVal, oldVal) => {
    if (newVal < store.editingTransaction?.startWeek && newVal !== null) {
      store.editingTransaction.startWeek = newVal
    }
  }
)
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': store.editingTransaction !== null }" v-if="store.editingTransaction">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            {{ store.editingIndex === null ? 'Add New Transaction' : 'Edit ' +
              store.editingTransaction.type.charAt(0).toUpperCase() + store.editingTransaction.type.slice(1) }}
          </h5>
          <button type="button" class="btn-close" @click="store.closeEditModal"></button>
        </div>
        <div class="modal-body">
          <div class="text-danger" v-if="store.errors.length">
            <b>Please correct the following error(s):</b>
            <ul>
              <li v-for="error in store.errors">{{ error }}</li>
            </ul>
          </div>
          <div class="form-group mb-3">
            <label>Transaction Type</label>
            <select v-model="store.editingTransaction.type" class="form-select">
              <option :value="null">-- Select --</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label>Category</label>
            <select v-model="store.editingTransaction.category" class="form-select" required>
              <option :value="null">-- Select --</option>
              <option value="income">Income</option>
              <option value="taxes">Taxes</option>
              <option value="transfer">Transfer</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label class="me-2">Start Week</label>
            <select class="form-select w-auto me-2" v-model.number="store.editingTransaction.startWeek" required>
              <option :value="null">-- Select --</option>
              <option v-for="p in store.projections" :key="p.week" :value="p.week">
                Week {{ p.week }} ({{ store.weekRange(p.week) }})
              </option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label class="me-2">End Week</label>
            <select class="form-select w-auto me-2" v-model.number="store.editingTransaction.endWeek">
              <option :value="null">-- Ongoing / No End --</option>
              <option v-for="p in store.projections" :key="p.week" :value="p.week">
                Week {{ p.week }} ({{ store.weekRange(p.week) }})
              </option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label>Amount</label>
            <input type="number" class="form-control" v-model.number="store.editingTransaction.amount" step="0.01" required>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="store.closeEditModal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="store.saveTransactionEdit">Save changes</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>