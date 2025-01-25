<script setup>
import { useAppStore } from '@/stores/app'

const store = useAppStore()
store.initTooltips()

const handleFileUpload = (event) => {
  const file = event.target.files[0]
  if (file) {
    store.restoreBackup(file)
  }
  // Reset input so same file can be selected again
  event.target.value = ''
}
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': store.showSwitchAccountModal }" v-show="store.showSwitchAccountModal">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Manage or Switch Accounts</h5>
          <button type="button" class="btn-close" @click="store.closeSwitchAccountModal"></button>
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
                  <a href="#" @click.prevent="store.selectAccount(account.id)" data-bs-toggle="tooltip"
                    data-bs-title="Click to change accounts">
                    {{ account.name }}
                  </a>
                </td>
                <td>
                  <button class="btn btn-sm btn-link" @click="store.editAccount(account)">
                    <i class="bi bi-pencil-square"></i>
                  </button>
                  <button class="btn btn-sm btn-link text-danger" @click="store.deleteAccount(account)">
                    <i class="bi bi-trash"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="d-flex justify-content-between mt-3">
            <div class="btn-group">
              <button class="btn btn-outline-secondary" @click.prevent="store.downloadBackup" data-bs-toggle="tooltip"
                data-bs-title="Download data backup">
                <i class="bi bi-download"></i> Backup
              </button>
              <button class="btn btn-outline-danger" @click.prevent="$refs.backupInput.click()" data-bs-toggle="tooltip"
                data-bs-title="Restore data from backup">
                <i class="bi bi-upload"></i> Restore
              </button>
            </div>

            <button class="btn btn-primary" @click="store.switchToNewAccountModal()">
              <i class="bi bi-plus-circle"></i> Add New Account
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>

    <!-- Hidden input for file upload to restoreBackup -->
    <input 
      type="file" 
      @change="handleFileUpload" 
      accept=".json"
      class="d-none"
      ref="backupInput">
  </div>
</template>