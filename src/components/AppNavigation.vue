<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRoute, useRouter } from 'vue-router'

const store = useAppStore()
const route = useRoute()
const router = useRouter()
const baseUrl = import.meta.env.BASE_URL || '/'
const ACCOUNT_QUERY_PARAM = 'acct'
let syncingAccountQuery = false
let suppressAccountQueryWrite = false
let accountSelectionInitiatedByUser = false

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
    accountSelectionInitiatedByUser = true
    suppressAccountQueryWrite = false
    store.setSelectedAccount(Number(value))
  }
})

function parseAccountQueryParam(value) {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function getAccountQueryValue(accountId) {
  const selected = Number(accountId)
  if (!Number.isFinite(selected)) return null
  return String(selected)
}

function syncSelectedAccountFromRoute() {
  if (syncingAccountQuery) return
  const hasRouteAccountParam = route.query?.[ACCOUNT_QUERY_PARAM] !== undefined
  const routeAccountId = parseAccountQueryParam(route.query?.[ACCOUNT_QUERY_PARAM])
  if (!hasRouteAccountParam) return
  if (!Number.isFinite(routeAccountId)) {
    const fallbackId = Number(store.db.accounts?.[0]?.id)
    if (Number.isFinite(fallbackId) && Number(store.selectedAccountId) !== fallbackId) {
      store.setSelectedAccount(fallbackId)
    }
    const nextQuery = { ...route.query }
    delete nextQuery[ACCOUNT_QUERY_PARAM]
    suppressAccountQueryWrite = true
    syncingAccountQuery = true
    router.replace({ query: nextQuery }).finally(() => {
      syncingAccountQuery = false
    })
    return
  }
  const accountExists = store.db.accounts.some(account => Number(account?.id) === routeAccountId)
  if (!accountExists) {
    const fallbackId = Number(store.db.accounts?.[0]?.id)
    if (Number.isFinite(fallbackId) && Number(store.selectedAccountId) !== fallbackId) {
      store.setSelectedAccount(fallbackId)
    }
    const nextQuery = { ...route.query }
    delete nextQuery[ACCOUNT_QUERY_PARAM]
    suppressAccountQueryWrite = true
    syncingAccountQuery = true
    router.replace({ query: nextQuery }).finally(() => {
      syncingAccountQuery = false
    })
    return
  }
  if (Number(store.selectedAccountId) === routeAccountId) return
  store.setSelectedAccount(routeAccountId)
}

function syncRouteFromSelectedAccount() {
  if (syncingAccountQuery || suppressAccountQueryWrite) return
  const selected = Number(store.selectedAccountId)
  if (!Number.isFinite(selected)) return

  const nextAccountQuery = getAccountQueryValue(selected)
  const currentAccountQuery = Array.isArray(route.query?.[ACCOUNT_QUERY_PARAM])
    ? route.query[ACCOUNT_QUERY_PARAM][0]
    : route.query?.[ACCOUNT_QUERY_PARAM]
  const normalizedCurrent = currentAccountQuery === undefined ? null : String(currentAccountQuery)

  if (nextAccountQuery === normalizedCurrent) return

  const nextQuery = { ...route.query }
  if (nextAccountQuery === null) {
    delete nextQuery[ACCOUNT_QUERY_PARAM]
  } else {
    nextQuery[ACCOUNT_QUERY_PARAM] = nextAccountQuery
  }

  syncingAccountQuery = true
  router.replace({ query: nextQuery }).finally(() => {
    syncingAccountQuery = false
  })
}

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

watch(
  () => [
    route.query?.[ACCOUNT_QUERY_PARAM],
    store.db.accounts.map(account => Number(account?.id)).join(','),
    store.selectedAccountId,
    store.loading
  ],
  () => {
    // Wait until state hydration finishes so URL acct does not get cleared by
    // the pre-hydration default selectedAccountId.
    if (store.loading) return
    if (accountSelectionInitiatedByUser) {
      accountSelectionInitiatedByUser = false
      syncRouteFromSelectedAccount()
      return
    }
    syncSelectedAccountFromRoute()
    syncRouteFromSelectedAccount()
  },
  { immediate: true }
)

watch(
  () => route.query?.[ACCOUNT_QUERY_PARAM],
  (value) => {
    if (value !== undefined) {
      suppressAccountQueryWrite = false
    }
  }
)

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