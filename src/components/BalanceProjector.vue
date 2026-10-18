<script setup>
import TabNavigation from '@/components/TabNavigation.vue'
import YearlySummary from '@/components/YearlySummary.vue'
import WeeklyDetails from '@/components/WeeklyDetails.vue'
import TransactionManager from '@/components/TransactionManager.vue'
import PositionsManager from '@/components/PositionsManager.vue'
import { onMounted, onUpdated, onBeforeUnmount, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRoute, useRouter } from 'vue-router'
import {
  EditTransactionModal,
  EditRowModal,
  EditPositionModal,
  WeekRawDataModal,
} from '@/components/modals'

const store = useAppStore()
const route = useRoute()
const router = useRouter()
const validTabs = new Set(['yearly', 'weekly', 'recurring', 'positions'])

function normalizeTab(value) {
  return validTabs.has(value) ? value : 'yearly'
}

function syncTabFromRoute() {
  const routeTab = normalizeTab(route.query.tab)
  if (store.activeTab !== routeTab) {
    store.activeTab = routeTab
  }
}

watch(() => route.query.tab, () => {
  syncTabFromRoute()
}, { immediate: true })

watch(() => store.activeTab, (nextTab) => {
  const normalizedTab = normalizeTab(nextTab)
  const currentTab = normalizeTab(route.query.tab)

  const nextQuery = { ...route.query }
  if (normalizedTab !== 'positions') {
    delete nextQuery.pf
    delete nextQuery.symbols
  }

  if (normalizedTab === 'yearly') {
    delete nextQuery.tab
  } else {
    nextQuery.tab = normalizedTab
  }

  const nextQueryTab = normalizeTab(nextQuery.tab)
  const hasSameTab = nextQueryTab === currentTab
  const hasSamePf = (nextQuery.pf || undefined) === (route.query.pf || undefined)
  const hasSameSymbols = (nextQuery.symbols || undefined) === (route.query.symbols || undefined)
  if (hasSameTab && hasSamePf && hasSameSymbols) return

  router.replace({ query: nextQuery })
})

// Store the cleanup function for resize listener
let cleanupResizeListener

onMounted(() => {
  store.getBaconStash()
  cleanupResizeListener = store.setupWindowResizeListener()
})

onUpdated(() => {
  store.initTooltips()
})

onBeforeUnmount(() => {
  if (cleanupResizeListener) cleanupResizeListener()
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
  <WeekRawDataModal />
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
@media (max-width: 1199.98px) {
  .content-area {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    height: calc(100vh - 150px); /* Smaller subtraction for smaller screens */
  }
  
  /* Target direct children of content-area that have -container in their class name */
  .content-area [class*="-container"] {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
}

@media (min-width: 1200px) {
  .content-area {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    height: calc(100vh - 106px);
  }
  
  /* Target children of content-area that have -container in their class name */
  .content-area [class*="-container"] {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
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