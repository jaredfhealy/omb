<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
const store = useAppStore()

// Replace global state with local refs
const showSettingsModal = ref(false)
const settingsEdit = ref({})

// Update functions to use local state
function openSettings() {
  settingsEdit.value = { ...store.activeAccount.settings }
  showSettingsModal.value = true
}

function closeSettings() {
  showSettingsModal.value = false
}

async function saveSettings() {
  store.activeAccount.settings = { ...settingsEdit.value }
  await store.saveChangesAndRecalculate()
  closeSettings()
}

// Expose functions to store
store.openSettings = openSettings
store.closeSettings = closeSettings
store.saveSettings = saveSettings
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': showSettingsModal }" v-if="showSettingsModal">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Settings</h5>
          <button type="button" class="btn-close" @click="closeSettings"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Start Date</label>
            <input type="date" class="form-control" v-model="settingsEdit.startDate">
          </div>
          <div class="mb-3">
            <label class="form-label">Starting Balance ($)</label>
            <input type="number" class="form-control" v-model.number="settingsEdit.startingBalance" min="0">
          </div>
          <div class="mb-3">
            <label class="form-label">Weekly Return (%)</label>
            <input type="number" class="form-control" v-model.number="settingsEdit.weeklyReturn" min="0" max="100" step="0.01">
          </div>
          <div class="mb-3">
            <label class="form-label">Number of Years</label>
            <input type="number" class="form-control" v-model.number="settingsEdit.years" min="1" max="10">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="closeSettings">Cancel</button>
          <button type="button" class="btn btn-primary" @click="saveSettings">Save changes</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>