<script setup>
import TabNavigation from '@/components/TabNavigation.vue'
import TradeManager from '@/components/TradeManager.vue'
import WeeklyDetails from '@/components/WeeklyDetails.vue'
import TransactionManager from '@/components/TransactionManager.vue'
import PositionsManager from '@/components/PositionsManager.vue'
import CheckpointManager from '@/components/CheckpointManager.vue'
import { onMounted, onUpdated, onBeforeUnmount, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRoute, useRouter } from 'vue-router'
import CreateEditTradePanel from '@/components/panels/CreateEditTradePanel.vue'
import {
  EditTransactionModal,
  EditRowModal,
  EditPositionModal,
  WeekRawDataModal,
  SelectTradeTransactionsModal
} from '@/components/modals'

const store = useAppStore()
const route = useRoute()
const router = useRouter()
// Yearly tab is intentionally disabled for now; re-add 'yearly' here and in TabNavigation to restore it.
const validTabs = new Set(['trades', 'weekly', 'recurring', 'positions', 'checkpoints'])

function normalizeTab(value) {
  return validTabs.has(value) ? value : 'trades'
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

  if (normalizedTab === 'trades') {
    delete nextQuery.tab
  } else {
    nextQuery.tab = normalizedTab
  }

  const nextQueryTab = normalizeTab(nextQuery.tab)
  const hasSameTab = nextQueryTab === currentTab
  if (hasSameTab) return

  router.replace({ query: nextQuery })
})

// Store the cleanup function for resize listener
let cleanupResizeListener

onMounted(() => {
  store.loadData().finally(() => {
    if (store.startupRequiresManualRecovery && route.path !== '/data-manager') {
      router.replace('/data-manager')
    }
  })
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

  <div class="trade-tabs-shell">
    <div class="card h-100 tabbed-workspace-card">
      <div class="card-header pt-2 pb-0">
        <TabNavigation />
      </div>

      <!-- Content Area (takes all remaining height) -->
      <div class="card-body p-2 content-area">
        <TradeManager v-if="store.activeTab === 'trades'" />
        <WeeklyDetails v-if="store.activeTab === 'weekly'" />
        <TransactionManager v-if="store.activeTab === 'recurring'" />
        <PositionsManager v-if="store.activeTab === 'positions'" />
        <CheckpointManager v-if="store.activeTab === 'checkpoints'" />
      </div>
    </div>
  </div>

  <!-- Modals -->
  <EditTransactionModal />
  <EditRowModal />
  <EditPositionModal />
  <WeekRawDataModal />
  <CreateEditTradePanel />
  <SelectTradeTransactionsModal />
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

/* Make tab shell and content area take full height */
@media (max-width: 1199.98px) {
  .trade-tabs-shell {
    height: calc(100vh - 150px); /* Smaller subtraction for smaller screens */
  }

  .content-area {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    min-height: 0;
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
  .trade-tabs-shell {
    height: calc(100vh - 106px);
  }

  .content-area {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    min-height: 0;
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

.tabbed-workspace-card .card-header {
  background-color: var(--bs-tertiary-bg);
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