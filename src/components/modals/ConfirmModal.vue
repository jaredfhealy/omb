<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': store.showConfirmModal }" v-if="store.showConfirmModal">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Confirm Action</h5>
          <button type="button" class="btn-close" @click="store.confirmModalReset"></button>
        </div>
        <div class="modal-body">
          <p>{{ store.confirmModalMsg }}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="store.confirmModalReset">Cancel</button>
          <button type="button" class="btn btn-primary" @click="store.confirmModalToggle(true)">OK</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>