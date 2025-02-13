<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppNavigation from '@/components/AppNavigation.vue'
import { ConfirmModal, ChangePasswordModal } from '@/components/modals'

const store = useAppStore()
const route = useRoute()
const confirmModalRef = ref(null)

const containerStyle = computed(() => {
  return route.path !== '/summarizer' ? { height: 'calc(100vh - 20px)' } : {}
})

const isOnSummarizer = computed(() => route.path === '/summarizer')

// Expose confirm modal methods to the store
store.confirm = (message, callback) => {
  confirmModalRef.value?.show(message, callback)
}
</script>

<template>
  <AppNavigation />
  <div :class="[
    store.user ? 'container-fluid' : 'container',
    { 'fixed-nav': isOnSummarizer }
  ]" :style="containerStyle" v-cloak>
    <router-view/>
  </div>
  
  <!-- Global Modals -->
  <ConfirmModal ref="confirmModalRef" v-if="store.user" />
  <ChangePasswordModal v-if="store.user" />
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
</style>