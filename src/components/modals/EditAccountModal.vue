<script setup>
import { ref, reactive, computed } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const isVisible = ref(false)
const isNewAccount = ref(false)

// Default account template
const defaultAccountTemplate = {
  id: null,
  name: '',
  description: '',
  transactions: [],
  actuals: [],
  positions: [],
  settings: {
    startDate: new Date().toISOString().split('T')[0],
    startingBalance: 5000,
    weeklyReturn: 1,
    years: 4
  }
}

// Initialize with defaults
const account = reactive({...defaultAccountTemplate})

// Update this to explicitly use the flag instead of checking account.id
const isEdit = computed(() => !isNewAccount.value)

const show = (existingAccount = null) => {
  if (existingAccount) {
    // Editing an existing account
    isNewAccount.value = false
    Object.assign(account, JSON.parse(JSON.stringify(existingAccount)))
  } else {
    // Creating a new account - reset to defaults
    isNewAccount.value = true
    
    // Reset to defaults first
    Object.assign(account, {...defaultAccountTemplate})
    
    // Then just set the new ID
    account.id = Date.now()
  }
  isVisible.value = true
}

const close = () => {
  isVisible.value = false
}

const save = () => {
  if (!account.name.trim()) {
    alert('Account name is required')
    return
  }

  // Validate numeric fields
  if (isNaN(account.settings.startingBalance) || account.settings.startingBalance < 0) {
    alert('Starting Balance must be a positive number')
    return
  }
  
  if (isNaN(account.settings.weeklyReturn)) {
    alert('Weekly Return Rate must be a number')
    return
  }
  
  if (isNaN(account.settings.years) || account.settings.years < 1 || account.settings.years > 10) {
    alert('Years must be between 1 and 10')
    return
  }

  if (isEdit.value) {
    // Update existing account
    const index = store.db.accounts.findIndex(a => a.id === account.id)
    if (index !== -1) {
      store.db.accounts[index] = JSON.parse(JSON.stringify(account))
    }
  } else {
    // Add new account
    store.db.accounts.push(JSON.parse(JSON.stringify(account)))
    store.db.selectedAccountId = account.id
  }

  close()
  store.calculateProjections()
  
  // Set the active tab to "yearly" after saving
  store.activeTab = 'yearly'
}

// Expose show function to store
store.openEditAccountModal = (existingAccount = null) => show(existingAccount)
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': isVisible }" v-show="isVisible">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ isEdit ? 'Edit' : 'Add' }} Account</h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="save">
            <!-- Account Basic Info Section -->
            <div class="mb-3">
              <label for="account-name" class="form-label">Account Name</label>
              <input type="text" class="form-control" id="account-name" v-model="account.name" required>
            </div>
            
            <div class="mb-3">
              <label for="account-description" class="form-label">Description (Optional)</label>
              <textarea class="form-control" id="account-description" v-model="account.description" rows="2"></textarea>
            </div>
            
            <!-- Account Settings Section -->
            <h6 class="border-bottom pb-2 mt-4">Account Settings</h6>
            
            <div class="mb-3">
              <label for="account-startDate" class="form-label">Start Date</label>
              <input type="date" class="form-control" id="account-startDate" v-model="account.settings.startDate" required>
            </div>
            
            <div class="mb-3">
              <label for="account-startingBalance" class="form-label">Starting Balance</label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <input type="number" class="form-control" id="account-startingBalance" 
                       v-model.number="account.settings.startingBalance" min="0" step="0.01" required>
              </div>
            </div>
            
            <div class="mb-3">
              <label for="account-weeklyReturn" class="form-label">Weekly Return Rate</label>
              <div class="input-group">
                <input type="number" class="form-control" id="account-weeklyReturn" 
                       v-model.number="account.settings.weeklyReturn" step="0.01" required>
                <span class="input-group-text">%</span>
              </div>
              <div class="form-text">
                {{ account.settings.weeklyReturn }}% weekly is approximately 
                {{ ((Math.pow(1 + account.settings.weeklyReturn / 100, 52) - 1) * 100).toFixed(2) }}% annually
              </div>
            </div>
            
            <div class="mb-3">
              <label for="account-projectionYears" class="form-label">Projection Years</label>
              <input type="number" class="form-control" id="account-projectionYears" 
                     v-model.number="account.settings.years" min="1" max="10" required>
              <div class="form-text">Number of years to project (1-10)</div>
            </div>
            
            <div class="d-flex justify-content-end">
              <button type="button" class="btn btn-secondary me-2" @click="close">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>