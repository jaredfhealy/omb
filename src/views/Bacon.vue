<script setup>
import BalanceProjector from '@/components/BalanceProjector.vue'
import {
  EditAccountModal,
  SettingsModal,
  ManageAccountModal,
} from '@/components/modals'
</script>

<template>
  <!-- Main projection tracking component -->
  <BalanceProjector />

  <!-- Account Level Modals -->
  <SettingsModal />
  <ManageAccountModal />
  <EditAccountModal />
</template>

<style>
.table-responsive {
  overflow-y: auto;
}

.header-row {
  font-weight: bold;
}

thead {
  position: sticky;
  top: 0;
  background: white;
  z-index: 1;
}
</style>