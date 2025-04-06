<script setup>
import TabNavigation from '@/components/TabNavigation.vue'
import YearlySummary from '@/components/YearlySummary.vue'
import WeeklyDetails from '@/components/WeeklyDetails.vue'
import TransactionManager from '@/components/TransactionManager.vue'
import PositionsManager from '@/components/PositionsManager.vue'
import { onMounted, onUpdated } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  EditTransactionModal,
  EditRowModal,
  EditPositionModal,
} from '@/components/modals'

const store = useAppStore()

onMounted(() => {
  store.getBaconStash()
})

onUpdated(() => {
  store.initTooltips()
})
</script>

<template>
  <!-- Add loading overlay -->
  <div id="loading-overlay" v-if="store.loading" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 1000; display: flex; justify-content: center; align-items: center;">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
  </div>
  
  <!-- Tab Navigation -->
  <TabNavigation />
  
  <!-- Content Area (takes all remaining height) -->
  <div class="content-area flex-grow-1">
    <YearlySummary v-if="store.activeTab === 'yearly'" />
    <WeeklyDetails v-if="store.activeTab === 'weekly'" />
    <TransactionManager v-if="store.activeTab === 'recurring'" />
    <PositionsManager v-if="store.activeTab === 'positions'" />
  </div>

  <!-- Modals -->
  <EditTransactionModal />
  <EditRowModal />
  <EditPositionModal />
</template>

<style>
/* Add loading overlay styles */
#loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

/* Settings Summary Bar */
.settings-summary-bar {
  background-color: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  font-size: 0.8rem;
}

.settings-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.settings-grid span {
  white-space: nowrap;
}

/* Make content area take full height */
.content-area {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  height: 100%;
}

/* All direct children of content-area should be full height */
.content-area > * {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Modal styles */
.modal {
  z-index: 1050;
}

.modal-dialog {
  z-index: 1055;
}

.modal-backdrop {
  z-index: 1040;
}

.cursor-pointer {
  cursor: pointer;
}
</style>