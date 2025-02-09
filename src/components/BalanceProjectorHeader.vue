<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()

const switchAccount = (accountId) => {
  store.db.selectedAccountId = Number(accountId)
  store.calculateProjections()
}
</script>

<template>
  <div class="card-header">
    <div class="d-flex justify-content-between align-items-center">
      <div class="d-flex align-items-center gap-3">
        <h5 class="panel-title mb-0">Weekly Balance Projector</h5>
        <select 
          class="form-select form-select-sm" 
          style="width: auto;"
          :value="store.db.selectedAccountId"
          @change="switchAccount($event.target.value)"
        >
          <option 
            v-for="account in store.db.accounts" 
            :key="account.id" 
            :value="account.id"
          >
            {{ account.name }}
          </option>
        </select>
      </div>
      <div class="settings-grid">
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