<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const errors = ref([])
const position = ref(null)
const editingIndex = ref(null)
const showModal = ref(false)

const isVisible = computed(() => position.value !== null)

const show = (existingPosition = null, index = null) => {
  errors.value = []
  editingIndex.value = index
  position.value = existingPosition ? { ...existingPosition } : {
    symbol: '',
    assignedWeek: null,
    soldWeek: null,
    strikePrice: null,
    currentPrice: null,
    shares: null,
    putProfits: 0,
    callProfits: 0,
    startWeek: null
  }
  showModal.value = true
}

const close = () => {
  position.value = null
  editingIndex.value = null
  errors.value = []
}

const save = () => {
  errors.value = []

  // Validate required fields
  if (!position.value.symbol)
    errors.value.push("Symbol is required.")
  if (!position.value.assignedWeek)
    errors.value.push("Assigned Date is required.")
  if (!position.value.strikePrice || position.value.strikePrice <= 0)
    errors.value.push("Assigned Price is required and must be greater than 0.")
  if (!position.value.shares || position.value.shares <= 0)
    errors.value.push("Shares quantity is required and must be greater than 0.")
  if (!position.value.startWeek)
    errors.value.push("Start Week is required.")

  if (errors.value.length > 0) return

  const formattedPosition = {
    symbol: position.value.symbol.toUpperCase(),
    assignedWeek: Number(position.value.assignedWeek),
    soldWeek: position.value.soldWeek ? Number(position.value.soldWeek) : null,
    strikePrice: Number(position.value.strikePrice),
    currentPrice: Number(position.value.currentPrice) || null,
    shares: Number(position.value.shares),
    putProfits: Number(position.value.putProfits || 0),
    callProfits: Number(position.value.callProfits || 0),
    startWeek: Number(position.value.startWeek)
  }

  // Validate that soldWeek is after assignedWeek if it exists
  if (formattedPosition.soldWeek && formattedPosition.soldWeek < formattedPosition.assignedWeek) {
    errors.value.push("Called/Sold Week must be after Assigned Week")
    return
  }

  if (editingIndex.value === null) {
    if (!store.activeAccount.positions) {
      store.activeAccount.positions = []
    }
    store.activeAccount.positions.push(formattedPosition)
  } else {
    store.activeAccount.positions[editingIndex.value] = formattedPosition
  }

  store.calculateProjections()
  close()
}

// Expose show function to store
store.showPositionModal = (position, index) => show(position, index)
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': isVisible }" v-if="isVisible">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            {{ editingIndex === null ? 'Add New Position' : 'Edit Position' }}
          </h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">

          <div class="text-danger" v-if="errors.length">
            <b>Please correct the following error(s):</b>
            <ul>
              <li v-for="error in errors">{{ error }}</li>
            </ul>
          </div>
          <div class="row mb-3">
            <div class="col-6">
              <div class="form-group">
                <label>Stock Symbol</label>
                <input type="text" class="form-control" v-model="position.symbol">
              </div>
            </div>
            <div class="col-6">
              <div class="form-group">
                <label>Shares Quantity</label>
                <input type="number" class="form-control" v-model.number="position.shares">
              </div>
            </div>
          </div>
          <div class="form-group mb-3">
            <label>Start Week</label>
            <div class="form-text ms-1 mb-1">First PUT sold for this stock</div>
            <select class="form-select" v-model.number="position.startWeek" required>
              <option :value="null">-- Select --</option>
              <option v-for="p in store.projections" :key="p.week" :value="p.week">
                Week {{ p.week }} ({{ store.weekRange(p.week) }})
              </option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label>Assigned Week</label>
            <select class="form-select" v-model.number="position.assignedWeek" required>
              <option :value="null">-- Select --</option>
              <option v-for="p in store.projections" :key="p.week" :value="p.week">
                Week {{ p.week }} ({{ store.weekRange(p.week) }})
              </option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label>CALLed/Sold Week</label>
            <div class="form-text ms-1 mb-1">Week when position was called away or sold (optional)</div>
            <select class="form-select" v-model.number="position.soldWeek">
              <option :value="null">-- Not Yet Sold --</option>
              <option v-for="p in store.projections" :key="p.week" :value="p.week">
                Week {{ p.week }} ({{ store.weekRange(p.week) }})
              </option>
            </select>
          </div>
          <div class="row mb-3">
            <div class="col-6">
              <div class="form-group">
                <label>Assigned Price</label>
                <input type="number" class="form-control" v-model.number="position.strikePrice" step="0.01">
              </div>
            </div>
            <div class="col-6">
              <div class="form-group">
                <label>CALL/Sold Price</label>
                <input type="number" class="form-control" v-model.number="position.currentPrice" step="0.01">
              </div>
            </div>
          </div>
          <div class="form-group mb-3">
            <label>Offsetting PUT Profits</label>
            <div class="form-text ms-1 mb-1">Total PUT premiums earned since start.
              <div class="fst-italic">(If partially assigned be sure to calculate the matching percentage of profits. Ex: 4/10 contracts assigned, only 40% of the premiums should be recorded.)</div>
            </div>
            <input type="number" class="form-control" v-model.number="position.putProfits" step="0.01">
          </div>
          <div class="form-group mb-3">
            <label>Offsetting CALL Profits</label>
            <div class="form-text ms-1 mb-1">Total CALL premiums earned since assignment.</div>
            <input type="number" class="form-control" v-model.number="position.callProfits" step="0.01">
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
            <button type="button" class="btn btn-primary" @click="save">Save changes</button>
          </div>

        </div> <!-- modal-body -->
      </div> <!-- modal-content -->
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>
