<script setup>
import BalanceProjector from '@/components/BalanceProjector.vue'
import {
  EditAccountModal,
  EditTransactionModal,
  EditRowModal,
  SettingsModal,
  EditPositionModal,
  ManageAccountModal
} from '@/components/modals'
</script>

<template>
  <!-- Main projection tracking component -->
  <BalanceProjector />

  <!-- View-specific Modals -->
  <EditTransactionModal />
  <EditRowModal />
  <SettingsModal />
  <EditAccountModal />
  <EditPositionModal />
  <ManageAccountModal />
</template>

<style scoped>
#app {
  overflow: hidden;
}
body {
  overflow: hidden;
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
</style>