<script setup>
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import BalanceGrowthChart from '@/components/BalanceGrowthChart.vue'

const store = useAppStore()

onMounted(() => {
  if (!store.projections.length) {
    store.calculateProjections()
  }
})
</script>

<template>
  <h2 class="mb-4">Financial Reports</h2>
  <div class="card">
    <div class="card-body">
      <BalanceGrowthChart />
    </div>
  </div>
</template>
