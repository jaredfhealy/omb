<script setup>
import AppNavigation from '../components/AppNavigation.vue'
import BalanceProjector from '../components/BalanceProjector.vue'
import {
  NewAccountModal,
  SwitchAccountModal,
  ConfirmModal,
  EditTransactionModal,
  EditRowModal,
  SettingsModal,
  EditPositionModal,
  ChangePasswordModal
} from '../components/modals'
</script>

<template>
  <div id="app" v-cloak>
    <AppNavigation />
    <div class="container-fluid" style="height: calc(100vh - 20px);">
      <BalanceProjector />
    </div>

    <!-- Modals -->
    <ConfirmModal />
    <EditTransactionModal />
    <EditRowModal />
    <SettingsModal />
    <NewAccountModal />
    <SwitchAccountModal />
    <EditPositionModal />
    <ChangePasswordModal />

  </div>
</template>

<style scoped>
.table-responsive {
    overflow-y: auto;
}

thead {
    position: sticky;
    top: 0;
    background: white;
    z-index: 1;
}
</style>