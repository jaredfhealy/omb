<script setup>
import { onMounted, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import BalanceGrowthChart from '@/components/BalanceGrowthChart.vue'
import ActualGrowthChart from '@/components/ActualGrowthChart.vue'
import RORChart from '@/components/RORChart.vue'

const store = useAppStore()
const activeTab = ref('growth')

onMounted(() => {
  if (!store.projections.length) {
    store.calculateProjections()
  }
})
</script>

<template>
  <h2 class="mb-4">Financial Reports</h2>
  
  <div class="card">
    <div class="card-header">
      <ul class="nav nav-tabs card-header-tabs">
        <li class="nav-item">
          <a class="nav-link" :class="{ active: activeTab === 'growth' }" 
             href="#" @click.prevent="activeTab = 'growth'">Weekly Growth Reports</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" :class="{ active: activeTab === 'balance' }" 
             href="#" @click.prevent="activeTab = 'balance'">Balance Growth</a>
        </li>
      </ul>
    </div>
    
    <div class="card-body">
      <div v-if="activeTab === 'growth'">
        <h4>Actual Growth per Week</h4>
        <ActualGrowthChart class="mb-4" />
        
        <h4>Rate of Return (ROR)</h4>
        <RORChart />
      </div>
      
      <div v-if="activeTab === 'balance'">
        <BalanceGrowthChart />
      </div>
    </div>
  </div>
</template>
