<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': store.showSettingsModal }" v-if="store.showSettingsModal">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Settings</h5>
          <button type="button" class="btn-close" @click="store.closeSettings"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Start Date</label>
            <input type="date" class="form-control" v-model="store.settingsEdit.startDate">
          </div>
          <div class="mb-3">
            <label class="form-label">Starting Balance ($)</label>
            <input type="number" class="form-control" v-model.number="store.settingsEdit.startingBalance" min="0">
          </div>
          <div class="mb-3">
            <label class="form-label">Weekly Return (%)</label>
            <input type="number" class="form-control" v-model.number="store.settingsEdit.weeklyReturn" min="0" max="100"
              step="0.01">
          </div>
          <div class="mb-3">
            <label class="form-label">Number of Years</label>
            <input type="number" class="form-control" v-model.number="store.settingsEdit.years" min="1" max="10">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="store.closeSettings">Cancel</button>
          <button type="button" class="btn btn-primary" @click="store.saveSettings">Save changes</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>