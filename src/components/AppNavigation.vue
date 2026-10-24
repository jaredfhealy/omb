<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRoute } from 'vue-router'

const store = useAppStore()
const route = useRoute()

// Add state to track authentication
const isFixedTopRoute = computed(() =>
  route.path.startsWith('/summarizer') ||
  route.path.startsWith('/data-manager') ||
  route.path.startsWith('/reporting')
)
const isOnSummarizer = computed(() => route.path === '/summarizer')

// Add computed property for current page name
const currentPageName = computed(() => {
  switch(route.path) {
    case '/': return 'Projections';
    case '/reporting': return 'Reports';
    case '/summarizer': return 'Weekly Performance';
    case '/data-manager': return 'Data Manager';
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

// Load persisted state for all pages except the standalone summarizer tool
onMounted(() => {
  if (!isOnSummarizer.value) {
    store.loadData()
  }
})
</script>

<template>
  <nav id="appNav" class="navbar navbar-expand-lg navbar-dark bg-primary mb-3"
       :class="{ 'fixed-top': isFixedTopRoute }">
    <div class="container-fluid">
      <a href="#" class="navbar-brand" @click.prevent="store.showManageAccountModal" data-bs-toggle="tooltip" data-bs-title="Operation More Bacon">
        O.M.B. &nbsp;|&nbsp; <span class="small">{{ store.activeAccount.name }}</span>
      </a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarContent"
        aria-controls="navbarContent" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      
      <div class="collapse navbar-collapse justify-content-end" id="navbarContent" ref="navbarCollapse">
        <ul class="navbar-nav align-items-center">
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
                  Weekly Performance
                </router-link>
              </li>
              <li>
                <router-link to="/data-manager" class="dropdown-item" :class="{ 'active': route.path === '/data-manager' }">
                  Data Manager
                </router-link>
              </li>
            </ul>
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