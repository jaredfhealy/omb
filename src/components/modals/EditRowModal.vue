<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const row = ref(null)
const showModal = computed(() => row.value !== null)
if (!Array.isArray(store.activeAccount.notes)) store.activeAccount.notes = []

const show = (week) => {
  const projection = store.projections.find(p => Number(p.week) === Number(week))

  // Find the note for this week in the notes array
  const noteEntry = store.activeAccount.notes.find(n => Number(n.week) === week)
  row.value = {
    week,
    growth: projection?.actualGrowth ?? null,
    note: noteEntry?.note || ''
  }
}

const close = () => {
  row.value = null
}

const save = async () => {
  const week = row.value.week

  const weekStart = store.calculateWeekStartEnd(week).weekStart || null

  // Remove any existing note for this week
  store.activeAccount.notes = store.activeAccount.notes.filter(n => Number(n.week) !== week)
  // Only save if note is not empty
  if (row.value.note && row.value.note.trim()) {
    store.activeAccount.notes.push({
      week,
      weekStart,
      note: row.value.note.trim()
    })
  }
  await store.saveChangesAndRecalculate()
  close()
}

// Expose show function to store
store.showWeeklyRowModal = (week) => show(week)
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': showModal }" v-if="showModal">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Edit Week {{ row?.week }}</h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Actual Growth ($)</label>
            <input type="number" class="form-control" v-model.number="row.growth" step="0.01" disabled>
          </div>
          <div class="mb-3">
            <label class="form-label">Notes</label>
            <textarea class="form-control" v-model="row.note" rows="5"
              placeholder="Enter notes for this week..."></textarea>
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