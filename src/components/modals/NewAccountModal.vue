<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': store.showNewAccountModal }" v-if="store.showNewAccountModal">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Add New Account</h5>
          <button type="button" class="btn-close" @click="store.closeNewAccountModal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Account Name *</label>
            <input type="text" class="form-control" v-model="store.newAccount.name" required>
          </div>
          <div class="mb-3">
            <label class="form-label">Description</label>
            <textarea class="form-control" v-model="store.newAccount.description" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="store.closeNewAccountModal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="store.saveAccount">Save</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>