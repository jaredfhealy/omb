<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const isVisible = ref(false)

const show = () => {
  isVisible.value = true
}

const close = () => {
  isVisible.value = false
}
const editAccount = (account) => {
  close()
  store.editAccount(account)
}

const deleteAccount = (account) => {
  if (store.confirm) {
    close()
    store.confirm(
      `Are you sure you want to delete ${account.name}?`,
      () => {
        store.db.accounts = store.db.accounts.filter(a => a.id !== account.id)
        if (store.db.selectedAccountId === account.id) {
          store.db.selectedAccountId = store.db.accounts[0].id
        }
        store.calculateProjections()
        show()
      }
    )
  }
}

const addNewAccount = () => {
  close()
  store.openEditAccountModal()
}

function downloadBackup() {
  const data = JSON.stringify(store.db, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${store.user.email.split('@')[0]}_backup_${store.formatDate(new Date())}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function restoreBackup(file) {
  if (!file) return

  try {
    const text = await file.text()
    const backupData = JSON.parse(text)

    // Verify backup data structure
    if (!backupData.accounts || !Array.isArray(backupData.accounts)) {
      throw new Error('Invalid backup file format')
    }

    // Make sure each account has transactions or an empty array
    backupData.accounts.forEach(account => {
      if (!account.transactions) account.transactions = []
    })

    // Use the store's confirm method directly
    if (store.confirm) {
      store.confirm(
        'Warning: This will overwrite all current data. Make sure you have saved a backup of your current data before proceeding. Continue?',
        () => {
          // Update store data
          store.db = backupData
          store.calculateProjections()
        }
      )
    }
  } catch (error) {
    alert('Error restoring backup: Invalid file format')
    console.error('Restore error:', error)
  }
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
                <td>{{ account.name }}</td>
                <td>
                  <button class="btn btn-sm btn-link" @click="editAccount(account)">
                    <i class="bi bi-pencil-square"></i>
                  </button>
                  <button class="btn btn-sm btn-link text-danger" @click="deleteAccount(account)">
                    <i class="bi bi-trash"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="d-flex justify-content-between mt-3">
            <div class="btn-group">
              <button class="btn btn-outline-secondary" @click.prevent="downloadBackup" data-bs-toggle="tooltip"
                data-bs-title="Download data backup">
                <i class="bi bi-download"></i> Backup
              </button>
              <button class="btn btn-outline-danger" @click.prevent="$refs.backupInput.click()" data-bs-toggle="tooltip"
                data-bs-title="Restore data from backup">
                <i class="bi bi-upload"></i> Restore
              </button>
            </div>

            <button class="btn btn-primary" @click="addNewAccount">
              <i class="bi bi-plus-circle"></i> Add New Account
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>

    <input 
      type="file" 
      @change="e => restoreBackup(e.target.files[0])" 
      accept=".json"
      class="d-none"
      ref="backupInput">
  </div>
</template>