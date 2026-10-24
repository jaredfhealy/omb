<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRoute } from 'vue-router'

const store = useAppStore()
const route = useRoute()
const baseUrl = import.meta.env.BASE_URL || '/'

// Add state to track authentication
const isFixedTopRoute = computed(() =>
  route.path.startsWith('/summarizer') ||
  route.path.startsWith('/data-manager') ||
  route.path.startsWith('/reporting')
)
const isOnSummarizer = computed(() => route.path === '/summarizer')

// Reference to collapse element
const navbarCollapse = ref(null)
const selectedAccountId = computed({
  get: () => Number(store.selectedAccountId),
  set: (value) => {
    store.setSelectedAccount(Number(value))
  }
})

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

const openEditSelectedAccount = () => {
  if (!store.activeAccount || !store.openEditAccountModal) return
  store.openEditAccountModal(store.activeAccount)
  closeMenu()
}

const openAddAccount = () => {
  if (!store.openEditAccountModal) return
  store.openEditAccountModal()
  closeMenu()
}
</script>

<template>
  <nav id="appNav" class="navbar navbar-expand-lg navbar-dark bg-primary mb-3"
       :class="{ 'fixed-top': isFixedTopRoute }">
    <div class="container-fluid">
      <div class="navbar-brand d-flex align-items-center gap-2 mb-0" data-bs-toggle="tooltip" data-bs-title="Operation More Bacon">
        <span>O.M.B.</span>
        <span class="opacity-75">|</span>
        <select
          class="form-select form-select-sm account-select"
          v-model.number="selectedAccountId"
          aria-label="Select account"
        >
          <option v-for="account in store.db.accounts" :key="account.id" :value="account.id">
            {{ account.name }}
          </option>
        </select>
        <button
          class="btn btn-link btn-sm text-white p-0 account-edit-btn"
          type="button"
          title="Edit selected account"
          @click="openEditSelectedAccount"
        >
          <i class="bi bi-pencil-square"></i>
        </button>
        <button
          class="btn btn-link btn-sm text-white p-0 account-edit-btn"
          type="button"
          title="Add account"
          @click="openAddAccount"
        >
          <i class="bi bi-plus-circle"></i>
        </button>
      </div>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarContent"
        aria-controls="navbarContent" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      
      <div class="collapse navbar-collapse justify-content-end" id="navbarContent" ref="navbarCollapse">
        <ul class="navbar-nav align-items-center">
          <li class="nav-item">
            <router-link to="/" class="nav-link" :class="{ 'active': route.path === '/' }">Projections</router-link>
          </li>
          <li class="nav-item">
            <router-link to="/reporting" class="nav-link" :class="{ 'active': route.path === '/reporting' }">Reports</router-link>
          </li>
          
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="pageSelector" role="button" data-bs-toggle="dropdown"
              aria-expanded="false">
              Utilities
            </a>
            <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="pageSelector">
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
              <li>
                <a href="#" class="dropdown-item" @click.prevent="store.showImportTransactionsModal(); closeMenu()">
                  <i class="bi bi-file-earmark-arrow-up"></i> Import CSV
                </a>
              </li>
            </ul>
          </li>

          <li class="nav-item dropdown">
            <a
              class="nav-link dropdown-toggle py-1"
              href="#"
              id="infoMenu"
              role="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
              title="Information">
              <i class="bi bi-info-circle"></i>
            </a>
            <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="infoMenu">
              <li>
                <a
                  class="dropdown-item"
                  :href="`${baseUrl}privacy.html`"
                  target="_blank"
                  rel="noopener noreferrer"
                  @click="closeMenu">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  class="dropdown-item"
                  :href="`${baseUrl}terms.html`"
                  target="_blank"
                  rel="noopener noreferrer"
                  @click="closeMenu">
                  Terms of Service
                </a>
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

.account-select {
  width: 220px;
}

.account-edit-btn {
  line-height: 1;
}

@media (max-width: 767.98px) {
  .account-select {
    width: 160px;
  }
}
</style>