<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppNavigation from '@/components/AppNavigation.vue'
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
const isOnSummarizer = computed(() => route.path === '/summarizer')

// Set up the confirm method
store.confirm = (message, callback, cancelCallback) => {
  if (confirmModal.value) {
    confirmModal.value.show(message, callback, cancelCallback);
  } else {
    console.error('ConfirmModal ref is not available');
  }
}
</script>

<template>
  <AppNavigation />
  <div :class="[
    'container-fluid',
    { 'fixed-nav': isOnSummarizer }
  ]" v-cloak>
    <router-view/>
  </div>
  
  <!-- Global Modals - fix the ref name -->
  <ConfirmModal ref="confirmModal" />
  
  <!-- Account Level Modals -->
  <SettingsModal />
  <ManageAccountModal />
  <EditAccountModal />
  <ImportTransactionsModal />
</template>

<style>
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
}

#confirm-modal {
  z-index: 1060 !important;
}
</style>