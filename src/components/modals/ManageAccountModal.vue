<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const router = useRouter()
const isVisible = ref(false)

const show = () => {
  isVisible.value = true
}

const close = () => {
  isVisible.value = false
}

const editAccount = (account) => {
  close()
  store.openEditAccountModal(account)
}

const addNewAccount = () => {
  close()
  store.openEditAccountModal()
}

// Add a function to switch to an account
const switchToAccount = async (accountId) => {
  close()
  store.setSelectedAccount(Number(accountId))
}

const openDataManager = () => {
  close()
  router.push('/data-manager')
}

// Expose show function to store
store.showManageAccountModal = () => show()
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': isVisible }" v-show="isVisible">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Manage or Switch Accounts</h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <table class="table">
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="account in store.db.accounts" :key="account.id">
                <td>
                  <!-- Current account: show as bold text -->
                  <span v-if="account.id === store.selectedAccountId" class="fw-bold">
                    {{ account.name }}
                  </span>
                  
                  <!-- Other accounts: show as clickable links with tooltip -->
                  <a v-else href="#" 
                     @click.prevent="switchToAccount(account.id)">
                    {{ account.name }}
                  </a>
                </td>
                <td>
                  <button class="btn btn-sm btn-link" @click="editAccount(account)">
                    <i class="bi bi-pencil-square"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
            <button
              class="btn btn-outline-secondary"
              :class="store.isBelowXL ? 'btn-sm' : ''"
              @click="openDataManager">
              <i class="bi bi-database"></i> Open Data Manager
            </button>

            <button class="btn btn-primary"
              :class="store.isBelowXL ? 'btn-sm' : ''"
              @click="addNewAccount">
              <i class="bi bi-plus-circle"></i> Add New Account
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>