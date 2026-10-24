<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const router = useRouter()
const syncing = ref(false)
const isDataManagerRoute = computed(() => router.currentRoute.value.path === '/data-manager')

const statusLabel = computed(() => {
  const result = String(store.syncCenter.driveLastResult || 'idle')
  if (result === 'syncing') return 'Syncing'
  if (result === 'success') return 'Synced'
  if (result === 'failed') return 'Sync failed'
  return store.syncCenter.driveConnected ? 'Ready' : 'Not connected'
})

const statusClass = computed(() => {
  const result = String(store.syncCenter.driveLastResult || 'idle')
  if (result === 'syncing') return 'text-primary'
  if (result === 'success') return 'text-success'
  if (result === 'failed') return 'text-danger'
  return 'text-muted'
})

const storageModeLabel = computed(() => {
  if (store.syncCenter.driveConfigured && store.syncCenter.driveConnected) {
    return 'Local-first (IndexedDB) + Drive sync connected'
  }
  if (store.syncCenter.driveConfigured && !store.syncCenter.driveConnected) {
    return 'Local-first (IndexedDB) + Drive sync available'
  }
  return 'Local-first (IndexedDB)'
})

const revision = computed(() => store.persistenceMeta?.revision ?? 'n/a')
const lastSavedAt = computed(() => formatLocalTimestamp(store.persistenceMeta?.updatedAt))

function formatLocalTimestamp(value) {
  if (!value) return 'n/a'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

async function runSyncNow() {
  syncing.value = true
  try {
    await store.syncNow()
    store.syncCenter.open = true
  } finally {
    syncing.value = false
  }
}

async function openDataManagerSync() {
  store.syncCenter.open = false
  await router.push('/data-manager')
}
</script>

<template>
  <div class="sync-center">
    <button
      type="button"
      class="sync-center-tab btn btn-sm"
      :class="store.syncCenterNeedsAttention ? 'btn-outline-danger' : 'btn-outline-secondary'"
      @click="store.toggleSyncCenter()"
      :title="store.syncCenter.open ? 'Collapse Data Status panel' : 'Expand Data Status panel'"
    >
      <i class="bi bi-cloud-arrow-up"></i>
      <span class="ms-1 sync-center-tab-text">Data Status</span>
      <span
        class="sync-dot ms-1"
        :class="{
          'bg-danger': store.syncCenterNeedsAttention,
          'bg-primary': store.syncCenter.driveLastResult === 'syncing',
          'bg-success': store.syncCenter.driveLastResult === 'success',
          'bg-secondary': !store.syncCenterNeedsAttention && store.syncCenter.driveLastResult !== 'success' && store.syncCenter.driveLastResult !== 'syncing'
        }"
      ></span>
    </button>

    <div
      class="offcanvas offcanvas-end sync-center-offcanvas"
      tabindex="-1"
      aria-labelledby="syncCenterTitle"
      :class="{ show: store.syncCenter.open }"
      :style="store.syncCenter.open ? 'visibility: visible;' : 'visibility: hidden;'"
      role="dialog"
      aria-modal="true"
    >
      <div class="offcanvas-header py-2">
        <h5 id="syncCenterTitle" class="offcanvas-title fs-6">Data Status</h5>
        <button type="button" class="btn-close text-reset" aria-label="Close" @click="store.toggleSyncCenter()"></button>
      </div>
      <div class="offcanvas-body pt-0 pb-2 small">
        <div><strong>Storage:</strong> {{ storageModeLabel }}</div>
        <div><strong>Revision:</strong> {{ revision }}</div>
        <div><strong>Last saved:</strong> {{ lastSavedAt }}</div>
        <hr class="my-2" />
        <div><strong>Drive:</strong> {{ store.syncCenter.driveConnected ? 'Connected' : 'Not connected' }}</div>
        <div><strong>Status:</strong> <span :class="statusClass">{{ statusLabel }}</span></div>
        <div><strong>Last Drive sync:</strong> {{ formatLocalTimestamp(store.syncCenter.driveLastSuccessAt) }}</div>
        <div v-if="store.syncCenter.driveLastError" class="text-danger mt-1">
          <strong>Error:</strong> {{ store.syncCenter.driveLastError }}
        </div>
        <div class="d-flex gap-2 mt-2">
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            :disabled="!store.syncCenter.driveConfigured || !store.syncCenter.driveConnected || syncing"
            @click="runSyncNow"
          >
            {{ syncing ? 'Syncing…' : 'Sync now' }}
          </button>
          <button
            v-if="!isDataManagerRoute"
            type="button"
            class="btn btn-sm btn-outline-primary"
            @click="openDataManagerSync"
          >
            Open Data Manager
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="store.syncCenter.open"
      class="offcanvas-backdrop fade show"
      @click="store.toggleSyncCenter()"
    ></div>
  </div>
</template>

<style scoped>
.sync-center {
  position: fixed;
  right: 2.75rem;
  top: clamp(8.5rem, 22vh, 13.5rem);
  z-index: 1045;
}

.sync-center-tab {
  background: rgba(var(--bs-body-bg-rgb), 0.5);
  transform: rotate(-90deg);
  transform-origin: right top;
  position: fixed;
  right: 1.85rem;
  top: clamp(8.5rem, 22vh, 13.5rem);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  min-width: 8.5rem;
  white-space: nowrap;
  padding: 0.45rem 0.9rem;
  border-bottom: 1px solid var(--bs-border-color);
  border-radius: 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(2px);
}

.sync-center-offcanvas {
  width: min(340px, calc(100vw - 1.25rem));
}

.sync-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  display: inline-block;
}

.btn-close-sm {
  transform: scale(0.8);
}

.sync-center-tab-text {
  text-align: center;
  letter-spacing: 0.01em;
}
</style>
