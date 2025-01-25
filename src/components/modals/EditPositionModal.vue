<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': store.editingPosition !== null }" v-if="store.editingPosition">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            {{ store.editingPositionIndex === null ? 'Add New Position' : 'Edit Position' }}
          </h5>
          <button type="button" class="btn-close" @click="store.closePositionModal"></button>
        </div>
        <div class="modal-body">

          <div class="text-danger" v-if="store.errors.length">
            <b>Please correct the following error(s):</b>
            <ul>
              <li v-for="error in store.errors">{{ error }}</li>
            </ul>
          </div>
          <div class="row mb-3">
            <div class="col-6">
              <div class="form-group">
                <label>Stock Symbol</label>
                <input type="text" class="form-control" v-model="store.editingPosition.symbol">
              </div>
            </div>
            <div class="col-6">
              <div class="form-group">
                <label>Shares Quantity</label>
                <input type="number" class="form-control" v-model.number="store.editingPosition.shares">
              </div>
            </div>
          </div>
          <div class="form-group mb-3">
            <label>Start Week</label>
            <div class="form-text ms-1 mb-1">First PUT sold for this stock</div>
            <select class="form-select" v-model.number="store.editingPosition.startWeek" required>
              <option :value="null">-- Select --</option>
              <option v-for="p in store.projections" :key="p.week" :value="p.week">
                Week {{ p.week }} ({{ store.weekRange(p.week) }})
              </option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label>Assigned Week</label>
            <select class="form-select" v-model.number="store.editingPosition.assignedWeek" required>
              <option :value="null">-- Select --</option>
              <option v-for="p in store.projections" :key="p.week" :value="p.week">
                Week {{ p.week }} ({{ store.weekRange(p.week) }})
              </option>
            </select>
          </div>
          <div class="form-group mb-3">
            <label>Called/Sold Week</label>
            <div class="form-text ms-1 mb-1">Week when position was called away or sold (optional)</div>
            <select class="form-select" v-model.number="store.editingPosition.soldWeek">
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
                <input type="number" class="form-control" v-model.number="store.editingPosition.strikePrice" step="0.01">
              </div>
            </div>
            <div class="col-6">
              <div class="form-group">
                <label>Current Price</label>
                <input type="number" class="form-control" v-model.number="store.editingPosition.currentPrice" step="0.01">
              </div>
            </div>
          </div>
          <div class="form-group mb-3">
            <label>Offsetting PUT Profits</label>
            <div class="form-text ms-1 mb-1">Total PUT premiums earned since start.
              <div class="fst-italic">(If partially assigned be sure to calculate the matching percentage of profits. Ex: 4/10 contracts assigned, only 40% of the premiums should be recorded.)</div>
            </div>
            <input type="number" class="form-control" v-model.number="store.editingPosition.putProfits" step="0.01">
          </div>
          <div class="form-group mb-3">
            <label>Offsetting CALL Profits</label>
            <div class="form-text ms-1 mb-1">Total CALL premiums earned since assignment.</div>
            <input type="number" class="form-control" v-model.number="store.editingPosition.callProfits" step="0.01">
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="store.closePositionModal">Cancel</button>
            <button type="button" class="btn btn-primary" @click="store.savePositionEdit">Save changes</button>
          </div>

        </div> <!-- modal-body -->
      </div> <!-- modal-content -->
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>
