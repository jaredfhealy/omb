<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRoute } from 'vue-router'
import { signOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/firebase'
import router from '@/router'

const store = useAppStore()
const route = useRoute()

// Add state to track authentication
const isOnSummarizer = computed(() => route.path === '/summarizer')

// Add computed property for current page name
const currentPageName = computed(() => {
  switch(route.path) {
    case '/': return 'Projections';
    case '/reporting': return 'Reports';
    case '/summarizer': return 'Summarizer';
    default: return 'Select Page';
  }
})

// Reference to collapse element
const navbarCollapse = ref(null)

// Function to close mobile menu
const closeMenu = () => {
  if (window.innerWidth < 992) { // Bootstrap lg breakpoint
    // Use Bootstrap collapse API to hide menu
    const bsCollapse = window.bootstrap?.Collapse.getInstance(navbarCollapse.value)
    if (bsCollapse) {
      bsCollapse.hide()
    }
  }
}

// Watch for route changes to close the menu
watch(() => route.path, () => {
  closeMenu()
})

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
      <a href="#" class="navbar-brand" @click.prevent="store.showManageAccountModal" data-bs-toggle="tooltip" data-bs-title="Operation More Bacon">
        O.M.B. &nbsp;|&nbsp; <span class="small">{{ store.activeAccount.name }}</span>
      </a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarContent"
        aria-controls="navbarContent" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      
      <!-- Right-aligned items - show conditionally based on existence of user -->
      <div class="collapse navbar-collapse justify-content-end" id="navbarContent" ref="navbarCollapse">
        <ul class="navbar-nav align-items-center" v-if="store.user">
          <!-- Add the Import CSV button -->
          <li class="nav-item">
            <a href="#" class="nav-link" @click.prevent="store.showImportTransactionsModal(); closeMenu()">
              <i class="bi bi-file-earmark-arrow-up"></i> Import CSV
            </a>
          </li>

          <li class="nav-item">
            <a href="#" class="nav-link" @click.prevent="store.showManageAccountModal(); closeMenu()">
              Manage / Switch Accounts
            </a>
          </li>
          
          <!-- Dynamic page selector dropdown -->
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="pageSelector" role="button" data-bs-toggle="dropdown"
              aria-expanded="false">
              {{ currentPageName }}
            </a>
            <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="pageSelector">
              <li>
                <router-link to="/" class="dropdown-item" :class="{ 'active': route.path === '/' }">
                  Projections
                </router-link>
              </li>
              <li>
                <router-link to="/reporting" class="dropdown-item" :class="{ 'active': route.path === '/reporting' }">
                  Reports
                </router-link>
              </li>
              <li>
                <router-link to="/summarizer" class="dropdown-item" :class="{ 'active': route.path === '/summarizer' }">
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
                <a class="dropdown-item" href="#" data-bs-toggle="modal" data-bs-target="#changePasswordModal" @click="closeMenu">Change Password</a>
              </li>
              <li><hr class="dropdown-divider"></li>
              <li>
                <a class="dropdown-item" href="#" @click.prevent="logout(); closeMenu()">
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