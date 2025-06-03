<script setup>
import BalanceProjector from '@/components/BalanceProjector.vue'
</script>

<template>
  <!-- Main projection tracking component -->
  <BalanceProjector />
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