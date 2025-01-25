<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()
</script>

<template>
    <ul class="nav nav-tabs px-3 mt-3">
      <li class="nav-item">
        <a class="nav-link" :class="{ active: store.activeTab === 'yearly' }" @click="store.activeTab = 'yearly'"
          href="#">Yearly Summary</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" :class="{ active: store.activeTab === 'weekly' }" @click="store.activeTab = 'weekly'"
          href="#">Weekly Details</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" :class="{ active: store.activeTab === 'recurring' }" @click="store.activeTab = 'recurring'"
          href="#">Transactions</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" :class="{ active: store.activeTab === 'positions' }" @click="store.activeTab = 'positions'"
          href="#">Assigned Positions</a>
      </li>
    </ul>
</template>