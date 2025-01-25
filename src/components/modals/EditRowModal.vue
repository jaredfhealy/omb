<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': store.editingRow !== null }" v-if="store.editingRow">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Edit Week {{ store.editingRow?.week }}</h5>
          <button type="button" class="btn-close" @click="store.closeWeekRow"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Actual Growth ($)</label>
            <input type="number" class="form-control" v-model.number="store.editingRow.growth" step="0.01">
          </div>
          <div class="mb-3">
            <label class="form-label">Notes</label>
            <textarea class="form-control" v-model="store.editingRow.notes" rows="5"
              placeholder="Enter notes for this week..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="store.closeWeekRow">Cancel</button>
          <button type="button" class="btn btn-primary" @click="store.saveWeekRow">Save</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>