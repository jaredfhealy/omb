<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import BalanceProjector from '@/components/BalanceProjector.vue'
import {
  NewAccountModal,
  SwitchAccountModal,
  EditTransactionModal,
  EditRowModal,
  SettingsModal,
  EditPositionModal
} from '@/components/modals'

const store = useAppStore()
const positionModalRef = ref(null)
const weeklyRowModalref = ref(null)
const switchAccountModalRef = ref(null)

// Make modals available globally
store.showPositionModal = positionModalRef.value?.show(position, index)
store.showWeeklyRowModal = (week) => weeklyRowModalref.value?.show(week)
store.openSwitchAccountModal = () => switchAccountModalRef.value?.show()
</script>

<template>
  <!-- Main projection tracking component -->
  <BalanceProjector />

  <!-- View-specific Modals -->
  <EditTransactionModal />
  <EditRowModal ref="weeklyRowModalref" />
  <SettingsModal />
  <NewAccountModal />
  <SwitchAccountModal ref="switchAccountModalRef" />
  <EditPositionModal id="positionModal" ref="positionModalRef" />
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