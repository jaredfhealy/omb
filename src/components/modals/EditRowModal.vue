<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const row = ref(null)
const showModal = computed(() => row.value !== null)

const show = (week) => {
  const existingActual = store.activeAccount.actuals.find(a => Number(a.week) === week)
  row.value = {
    week,
    growth: existingActual?.growth || null,
    notes: existingActual?.notes || '',
    needsRecalculation: existingActual?.needsRecalculation || false
  }
}

const close = () => {
  row.value = null
}

const save = () => {
  const weekIndex = store.activeAccount.actuals.findIndex(a => Number(a.week) === row.value.week)
  const hasData = row.value.growth || row.value.notes.trim() || row.value.needsRecalculation
  const recalculateTotal = row.value.needsRecalculation === true;

  if (weekIndex === -1 && hasData) {
    // Creating a new entry - add minimal required fields
    store.activeAccount.actuals.push({
      week: row.value.week.toString(),
      growth: row.value.growth,
      notes: row.value.notes.trim() || null,
      needsRecalculation: row.value.needsRecalculation
    })
  } else if (weekIndex !== -1) {
    if (hasData) {
      // Updating existing entry - only update the fields we're editing
      const existingActual = store.activeAccount.actuals[weekIndex];
      
      // Update only specific properties
      existingActual.growth = row.value.growth;
      existingActual.notes = row.value.notes.trim() || null;
      existingActual.needsRecalculation = row.value.needsRecalculation;
      
      // Force reactivity by replacing the object in the array
      store.activeAccount.actuals = [
        ...store.activeAccount.actuals.slice(0, weekIndex),
        existingActual,
        ...store.activeAccount.actuals.slice(weekIndex + 1)
      ];
    } else {
      // No data - remove the entry
      store.activeAccount.actuals.splice(weekIndex, 1)
    }
  }

  // If recalculation is needed, trigger it
  if (row.value.needsRecalculation) {
    // Recalculate also triggers calculateProjections
    store.recalculateActuals();
  } else {
    // Just update projections without full recalculation
    store.calculateProjections();
  }
  
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
            <input type="number" class="form-control" v-model.number="row.growth" step="0.01">
          </div>
          <div class="mb-3">
            <label class="form-label">Notes</label>
            <textarea class="form-control" v-model="row.notes" rows="5"
              placeholder="Enter notes for this week..."></textarea>
          </div>
          <div class="form-check mb-3">
            <input class="form-check-input" type="checkbox" id="needsRecalculation" v-model="row.needsRecalculation">
            <label class="form-check-label" for="needsRecalculation">
              Recalculate from transaction data
            </label>
            <div class="form-text">
              If checked, growth value will be recalculated based on transaction data when saving.
            </div>
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