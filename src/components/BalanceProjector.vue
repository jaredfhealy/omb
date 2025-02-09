<script setup>
import BalanceProjectorHeader from '@/components/BalanceProjectorHeader.vue'
import TabNavigation from '@/components/TabNavigation.vue'
import YearlySummary from '@/components/YearlySummary.vue'
import WeeklyDetails from '@/components/WeeklyDetails.vue'
import TransactionManager from '@/components/TransactionManager.vue'
import PositionsManager from '@/components/PositionsManager.vue'
import { onMounted, onUpdated } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  EditAccountModal,
  ManageAccountModal,
  EditTransactionModal,
  EditRowModal,
  SettingsModal,
  EditPositionModal,
  ConfirmModal,
  ChangePasswordModal
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
  <div class="container-fluid" style="height: calc(100vh - 20px);">
    <div class="row">
      <div class="col-md-12">
        <div class="card" style="height: calc(100vh - 85px);">
          <BalanceProjectorHeader />
          <div class="card-body d-flex flex-column" style="padding: 0;">
            <TabNavigation />
            <YearlySummary v-if="store.activeTab === 'yearly'" />
            <WeeklyDetails v-if="store.activeTab === 'weekly'" />
            <TransactionManager v-if="store.activeTab === 'recurring'" />
            <PositionsManager v-if="store.activeTab === 'positions'" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modals -->
  <EditTransactionModal />
  <EditRowModal />
  <SettingsModal />
  <EditAccountModal />
  <ManageAccountModal />
  <EditPositionModal />
  <ConfirmModal />
  <ChangePasswordModal />
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

.table-responsive {
  overflow-y: auto;
}

thead {
  position: sticky;
  top: 0;
  background: white;
  z-index: 1;
}

/* Remove the navbar's default margin-bottom and rounded borders */
.navbar {
  margin-bottom: 0;
  border-radius: 0;
}

/* Set height of the grid so .sidenav can be 100% (adjust as needed) */
.row.content {
  height: 450px
}

/* Set gray background color and 100% height */
.sidenav {
  padding-top: 20px;
  background-color: #f1f1f1;
  height: 100%;
}

/* Set black background color, white text and some padding */
footer {
  background-color: #555;
  color: white;
  padding: 15px;
}

/* On small screens, set height to 'auto' for sidenav and grid */
@media screen and (max-width: 767px) {
  .sidenav {
    height: auto;
    padding: 15px;
  }

  .row.content {
    height: auto;
  }
}

.modal {
  z-index: 1050;
}

.modal-dialog {
  z-index: 1055;
}

.modal-backdrop {
  z-index: 1040;
}

.dropdown-item.flex-grow-1.active {
  background-color: white;
  color: black;
}

.cursor-pointer {
  cursor: pointer;
}
</style>