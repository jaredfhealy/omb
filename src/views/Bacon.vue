<script setup>
import BalanceProjector from '@/components/BalanceProjector.vue'
import {
  EditAccountModal,
  SettingsModal,
  ManageAccountModal,
  ConfirmModal,
  ChangePasswordModal,
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