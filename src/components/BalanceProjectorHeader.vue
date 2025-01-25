<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()
</script>

<template>
  <div class="card-header">
    <div class="d-flex justify-content-between">
      <div>
        <h5 class="panel-title">Weekly Balance Projector</h5>
      </div>
      <div class="settings-grid">
        <strong>Account</strong>: {{ store.activeAccount.name }}
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong>Start Date</strong>: {{ store.formatDate(store.activeAccount.settings.startDate) }}
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong>Starting Balance</strong>: {{ store.currency(store.activeAccount.settings.startingBalance) }}
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong>Projected ROR</strong>: {{ store.activeAccount.settings.weeklyReturn }}%
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong>Years</strong>: {{ store.activeAccount.settings.years }}
        <button class="btn btn-sm btn-outline-secondary ms-1" style="border: none;" @click="store.openSettings">
          <i class="bi bi-gear"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-grid {
  font-size: smaller;
}

@media (min-width: 768px) {
  .settings-grid .col:not(:first-child) {
    border-left: 1px solid #bebebe;
  }
}
</style>