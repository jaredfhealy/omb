<script setup>
import { useAppStore } from '@/stores/app'
import { useRoute } from 'vue-router'

const store = useAppStore()
const route = useRoute()
</script>

<template>
  <nav id="appNav" class="navbar navbar-expand-lg navbar-dark bg-primary mb-3">
    <div class="container-fluid">
      <span class="navbar-brand">Operation More Bacon</span>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarContent"
        aria-controls="navbarContent" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      
      <!-- Center tabs -->
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

      <!-- Right-aligned items -->
      <div class="collapse navbar-collapse justify-content-end" id="navbarContent">
        <ul class="navbar-nav">
          <li class="nav-item" v-if="route.path === '/'">
            <a href="#" class="nav-link" @click.prevent="store.openSwitchAccountModal">
              Manage/Switch Accounts
            </a>
          </li>
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
                <a class="dropdown-item" href="#" @click.prevent="store.logout">
                  <i class="bi bi-box-arrow-right"></i> Logout
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
</style>