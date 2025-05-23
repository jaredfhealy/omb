<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()
</script>

<template>
  <ul class="nav nav-tabs px-2 compact-tabs">
    <li class="nav-item">
      <a class="nav-link" :class="{ active: store.activeTab === 'yearly' }" @click="store.activeTab = 'yearly'"
        href="#"><i class="bi bi-calendar-range"></i> <span>Yearly</span></a>
    </li>
    <li class="nav-item">
      <a class="nav-link" :class="{ active: store.activeTab === 'weekly' }" @click="store.activeTab = 'weekly'"
        href="#"><i class="bi bi-graph-up"></i> <span>Weekly</span></a>
    </li>
    <li class="nav-item">
      <a class="nav-link" :class="{ active: store.activeTab === 'recurring' }" @click="store.activeTab = 'recurring'"
        href="#"><i class="bi bi-arrow-left-right"></i> <span>Transactions</span></a>
    </li>
    <li class="nav-item">
      <a class="nav-link" :class="{ active: store.activeTab === 'positions' }" @click="store.activeTab = 'positions'"
        href="#"><i class="bi bi-stack"></i> <span>Positions</span></a>
    </li>
  </ul>
</template>

<style scoped>
.compact-tabs {
  margin-top: 0;
  margin-bottom: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.4);
}

.compact-tabs .nav-item {
  margin-right: 2px;
}

.compact-tabs .nav-link {
  padding: 0.35rem 0.7rem;
  font-size: 0.875rem;
  border-radius: 4px 4px 0 0;
  display: flex;
  align-items: center;
  gap: 5px;
}

.compact-tabs .nav-link i {
  font-size: 0.9rem;
}

/* On mobile, make even more compact */
@media (max-width: 576px) {
  .compact-tabs .nav-link {
    padding: 0.25rem 0.5rem;
  }
  
  .compact-tabs .nav-link span {
    font-size: 0.8rem;
  }
}

/* Super compact for very small screens */
@media (max-width: 400px) {
  .compact-tabs .nav-link span {
    display: none;
  }
  
  .compact-tabs .nav-link i {
    font-size: 1rem;
  }
}
</style>