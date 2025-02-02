<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const row = ref(null)
const isVisible = computed(() => row.value !== null)

const show = (week) => {
  const existingActual = store.activeAccount.actuals.find(a => Number(a.week) === week)
  row.value = {
    week,
    growth: existingActual?.growth || null,
    notes: existingActual?.notes || ''
  }
}

const close = () => {
  row.value = null
}

const save = () => {
  const weekIndex = store.activeAccount.actuals.findIndex(a => Number(a.week) === row.value.week)
  const hasData = row.value.growth || row.value.notes.trim()

  if (weekIndex === -1 && hasData) {
    store.activeAccount.actuals.push({
      week: row.value.week.toString(),
      growth: row.value.growth,
      notes: row.value.notes.trim() || null
    })
  } else if (weekIndex !== -1) {
    if (hasData) {
      store.activeAccount.actuals[weekIndex] = {
        week: row.value.week.toString(),
        growth: row.value.growth,
        notes: row.value.notes.trim() || null
      }
    } else {
      store.activeAccount.actuals.splice(weekIndex, 1)
    }
  }

  store.calculateProjections()
  close()
}

defineExpose({ show })
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': isVisible }" v-if="isVisible">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Edit Week {{ row?.week }}</h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Actual Growth ($)</label>
            <input type="number" class="form-control" v-model.number="row.growth" step="0.01">
          </div>
          <div class="mb-3">
            <label class="form-label">Notes</label>
            <textarea class="form-control" v-model="row.notes" rows="5"
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