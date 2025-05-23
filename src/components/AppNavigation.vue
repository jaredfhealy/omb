<script setup>
import { computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRoute } from 'vue-router'
import { signOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/firebase'
import router from '@/router'

const store = useAppStore()
const route = useRoute()

// Add state to track authentication
const isOnSummarizer = computed(() => route.path === '/summarizer')

// Initialize authentication state on component mount
onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      store.user = user
      // If we're on the summarizer page, don't initiate the full data load
      if (!isOnSummarizer.value) {
        store.getBaconStash()
      }
    } else if (!isOnSummarizer.value) {
      // Only redirect if not on summarizer page
      router.push('/login')
    }
  })
})

// Add local function (without exposing to store)
async function logout() {
  try {
    await signOut(auth)
    
    // Use imported router instead of global router
    await router.push('/login')
    
    store.$reset()
  } catch (error) {
    console.error('Logout error:', error)
    window.location.href = '/login'
  }
}

// Add account switching function
const switchAccount = (accountId) => {
  store.db.selectedAccountId = Number(accountId)
  store.calculateProjections()
}
</script>

<template>
  <nav id="appNav" class="navbar navbar-expand-lg navbar-dark bg-primary mb-3"
       :class="{ 'fixed-top': isOnSummarizer }">
    <div class="container-fluid">
      <span class="navbar-brand">Operation More Bacon</span>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarContent"
        aria-controls="navbarContent" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      
      <!-- Center tabs - show on all pages -->
      <div class="navbar-nav mx-auto">
        <ul class="nav nav-tabs border-0">
          <li class="nav-item">
            <router-link to="/" class="nav-link" :class="{ 'active': route.path === '/' }">
              Projections
            </router-link>
          </li>
          <li class="nav-item">
            <router-link to="/reporting" class="nav-link" :class="{ 'active': route.path === '/reporting' }">
              Reports
            </router-link>
          </li>
        </ul>
      </div>

      <!-- Right-aligned items - show conditionally based on existence of user -->
      <div class="collapse navbar-collapse justify-content-end" id="navbarContent">
        <ul class="navbar-nav align-items-center" v-if="store.user">
          <!-- Account Selector as standard dropdown -->
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="accountDropdown" role="button" data-bs-toggle="dropdown"
              aria-expanded="false">
              {{ store.activeAccount.name }}
            </a>
            <ul class="dropdown-menu" aria-labelledby="accountDropdown">
              <li v-for="account in store.db.accounts" :key="account.id">
                <a class="dropdown-item" 
                   href="#" 
                   @click.prevent="switchAccount(account.id)"
                   :class="{ 'active': account.id === store.db.selectedAccountId }">
                  {{ account.name }}
                </a>
              </li>
            </ul>
          </li>
          
          <li class="nav-item" v-if="route.path === '/'">
            <a href="#" class="nav-link" @click.prevent="store.showManageAccountModal">
              Manage Accounts
            </a>
          </li>
          <!-- New Tools Dropdown -->
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="toolsDropdown" role="button" data-bs-toggle="dropdown"
              aria-expanded="false">
              Tools
            </a>
            <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="toolsDropdown">
              <li>
                <router-link to="/summarizer" class="dropdown-item">
                  Schwab Transaction Summarizer
                </router-link>
              </li>
            </ul>
          </li>
          <!-- User Dropdown -->
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown"
              aria-expanded="false">
              {{ store.user.email }}
            </a>
            <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
              <li>
                <a class="dropdown-item" href="#" data-bs-toggle="modal" data-bs-target="#changePasswordModal">Change Password</a>
              </li>
              <li><hr class="dropdown-divider"></li>
              <li>
                <a class="dropdown-item" href="#" @click.prevent="logout">
                  <i class="bi bi-box-arrow-right"></i> Logout
                </a>
              </li>
            </ul>
          </li>
        </ul>
        <!-- Simplified menu for when not authenticated -->
        <ul class="navbar-nav align-items-center" v-else>
          <li class="nav-item">
            <router-link to="/login" class="nav-link">Login</router-link>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.nav-tabs {
  border-bottom: none;
}

.nav-tabs .nav-link {
  border: none;
  padding: 0.5rem 2rem;
  margin: 0 0.25rem;
  color: white;
}

.nav-tabs .nav-link:hover:not(.active) {
  border: none;
  background-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.nav-tabs .nav-link.active {
  border-radius: 4px;
  background-color: white;
  color: var(--bs-primary) !important;
  font-weight: 500;
}

.fixed-top + .container-fluid {
  padding-top: 72px;
}

/* Add styling for active dropdown item */
.dropdown-item.active {
  background-color: var(--bs-primary);
  color: white;
}
</style>