<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const isVisible = ref(false)
const account = ref({ id: 'new', name: '', description: '' })

const show = (existingAccount = null) => {
  isVisible.value = true
  account.value = existingAccount || { id: 'new', name: '', description: '' }
}

const close = () => {
  isVisible.value = false
  account.value = { id: 'new', name: '', description: '' }
  store.showManageAccountModal()
}

const save = () => {
  if (!account.value.name) {
    alert('Account Name is required')
    return
  }

  if (account.value.id === 'new') {
    const newId = Math.max(...store.db.accounts.map(a => a.id)) + 1
    store.db.accounts.push({
      id: newId,
      name: account.value.name,
      description: account.value.description,
      settings: {
        startDate: new Date().toISOString().split('T')[0],
        startingBalance: 5000,
        weeklyReturn: 1,
        years: 4
      },
      transactions: [],
      actuals: []
    })
    store.db.selectedAccountId = newId
  } else {
    const accountIndex = store.db.accounts.findIndex(a => a.id === account.value.id)
    store.db.accounts[accountIndex].name = account.value.name
    store.db.accounts[accountIndex].description = account.value.description
  }

  store.calculateProjections()
  close()
  // Show the switch account modal after saving
  store.showManageAccountModal()
}

const handleAccountSelection = () => {
  if (store.db.selectedAccountId === 'new') {
    show()
  }
}

defineExpose({ show })

// Make methods available to store
store.openEditAccountModal = () => show()
store.editAccount = (existingAccount) => show(existingAccount)
store.closeEditAccountModal = close
store.handleAccountSelection = handleAccountSelection

</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': isVisible }" v-if="isVisible">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ account.id === 'new' ? 'Add New Account' : 'Edit Account' }}</h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Account Name *</label>
            <input type="text" class="form-control" v-model="account.name" required>
          </div>
          <div class="mb-3">
            <label class="form-label">Description</label>
            <textarea class="form-control" v-model="account.description" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
          <button type="button" class="btn btn-primary" @click="save">Save</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>