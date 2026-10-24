<script setup>
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppNavigation from '@/components/AppNavigation.vue'
import SyncCenter from '@/components/SyncCenter.vue'
import {
  ConfirmModal,
  EditAccountModal,
  SettingsModal,
  ManageAccountModal,
  ImportTransactionsModal
} from '@/components/modals'

const store = useAppStore()
const route = useRoute()
const confirmModal = ref(null)
const isFixedNavRoute = computed(() =>
  route.path.startsWith('/summarizer') ||
  route.path.startsWith('/data-manager') ||
  route.path.startsWith('/reporting')
)

// Set up the confirm method
store.confirm = (message, callback, cancelCallback, options = {}) => {
  if (confirmModal.value) {
    confirmModal.value.show(message, callback, cancelCallback, options)
  } else {
    console.error('ConfirmModal ref is not available');
  }
}

onMounted(() => {
  store.bindSyncCenterListener()
})

onBeforeUnmount(() => {
  store.unbindSyncCenterListener()
})
</script>

<template>
  <AppNavigation />
  <div v-if="store.persistenceError" class="alert alert-danger rounded-0 mb-0 px-3 py-2 d-flex justify-content-between align-items-center" role="alert">
    <span>{{ store.persistenceError }}</span>
    <button type="button" class="btn btn-sm btn-outline-light ms-3" @click="store.persistenceError = null">Dismiss</button>
  </div>
  <div :class="[
    'container-fluid',
    { 'fixed-nav': isFixedNavRoute }
  ]" v-cloak>
    <router-view/>
  </div>

  <SyncCenter />
  
  <!-- Global Modals - fix the ref name -->
  <ConfirmModal ref="confirmModal" />
  
  <!-- Account Level Modals -->
  <SettingsModal />
  <ManageAccountModal />
  <EditAccountModal />
  <ImportTransactionsModal />
</template>

<style>
html,
body,
#app {
  height: 100%;
  overflow: hidden;
}

/* Remove the navbar's default margin-bottom and rounded borders */
.navbar {
    margin-bottom: 0;
    border-radius: 0;
}

/* Navbar styles */
#appNav .navbar-nav .nav-link,
#appNav .navbar-brand,
#appNav .dropdown-toggle {
  color: white;
}

#appNav .navbar-nav .nav-link:hover,
#appNav .dropdown-toggle:hover {
  color: rgba(255, 255, 255, 0.8);
}
.dropdown-item.flex-grow-1.active {
  background-color: white;
  color: black;
}

.fixed-nav {
  padding-top: 72px;
  height: 100vh;
  overflow-y: auto;
  overflow-x: auto;
}

#confirm-modal {
  z-index: 1060 !important;
}
</style>