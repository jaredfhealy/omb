<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import DataTable from '@/components/custom/DataTable.vue'

const store = useAppStore()

const sourceFilter = ref('all')
const editingCheckpoint = ref(null)
const editingIndex = ref(null)
const saveError = ref('')

const filteredCheckpoints = computed(() => {
  const checkpoints = Array.isArray(store.activeAccount?.cashCheckpoints)
    ? store.activeAccount.cashCheckpoints
    : []

  let items = checkpoints
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .sort((a, b) => {
      const aKey = `${a?.asOfDate || ''} ${String(a?.source || '').toLowerCase()}`
      const bKey = `${b?.asOfDate || ''} ${String(b?.source || '').toLowerCase()}`
      return bKey.localeCompare(aKey)
    })

  if (sourceFilter.value !== 'all') {
    items = items.filter(item => String(item?.source || '').toLowerCase() === sourceFilter.value)
  }

  return items
})

const columns = [
  {
    key: 'asOf',
    header: { text: 'As Of' },
    class: 'col-12 col-xl-2'
  },
  {
    key: 'cashBalance',
    header: { text: 'Cash Balance' },
    class: 'col-6 col-xl-2',
    value: (item) => store.currency(Number(item.cashBalance || 0))
  },
  {
    key: 'source',
    header: { text: 'Source' },
    class: 'col-6 col-xl-2'
  },
  {
    key: 'notes',
    header: { text: 'Notes' },
    class: 'col-12 col-xl-4'
  },
  {
    key: 'actions',
    header: { text: 'Actions' },
    class: 'col-6 col-xl-2'
  }
]

function formatSourceLabel(source) {
  const normalized = String(source || '').toLowerCase()
  if (normalized === 'positions-import') return 'Positions Import'
  if (normalized === 'manual') return 'Manual'
  return normalized || 'Unknown'
}

function openCreateModal() {
  saveError.value = ''
  editingIndex.value = null
  editingCheckpoint.value = {
    asOfDate: new Date().toISOString().slice(0, 10),
    cashBalance: '',
    source: 'manual',
    sourceFingerprint: null,
    notes: ''
  }
}

function openEditModal(checkpoint) {
  saveError.value = ''
  editingIndex.value = checkpoint.originalIndex
  editingCheckpoint.value = {
    ...checkpoint,
    asOfDate: checkpoint?.asOfDate || new Date().toISOString().slice(0, 10),
    cashBalance: Number(checkpoint?.cashBalance || 0),
    source: checkpoint?.source || 'manual',
    sourceFingerprint: checkpoint?.sourceFingerprint || null,
    notes: checkpoint?.notes || ''
  }
}

function closeModal() {
  editingCheckpoint.value = null
  editingIndex.value = null
  saveError.value = ''
}

async function saveCheckpoint() {
  if (!editingCheckpoint.value) return

  const asOfDate = String(editingCheckpoint.value.asOfDate || '').trim()
  const cashBalance = Number(editingCheckpoint.value.cashBalance)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    saveError.value = 'As-of date is required and must be valid.'
    return
  }
  if (!Number.isFinite(cashBalance)) {
    saveError.value = 'Cash balance must be a valid number.'
    return
  }

  const checkpoint = {
    ...editingCheckpoint.value,
    asOfDate,
    cashBalance: Math.round(cashBalance * 100) / 100,
    source: String(editingCheckpoint.value.source || 'manual')
  }

  if (!Array.isArray(store.activeAccount.cashCheckpoints)) {
    store.activeAccount.cashCheckpoints = []
  }

  if (editingIndex.value === null) {
    store.activeAccount.cashCheckpoints.push(checkpoint)
  } else {
    store.activeAccount.cashCheckpoints.splice(editingIndex.value, 1, checkpoint)
  }

  await store.saveChangesAndRecalculate()
  closeModal()
}

function deleteCheckpoint(checkpoint) {
  if (!store.confirm) return
  const summary = `${checkpoint.asOfDate} (${formatSourceLabel(checkpoint.source)})`
  store.confirm(
    `Delete checkpoint ${summary} for ${store.currency(Number(checkpoint.cashBalance || 0))}?`,
    async () => {
      store.activeAccount.cashCheckpoints.splice(checkpoint.originalIndex, 1)
      await store.saveChangesAndRecalculate()
    }
  )
}
</script>

<template>
  <DataTable
    :items="filteredCheckpoints"
    :columns="columns"
    :striped="true"
  >
    <template #table-controls>
      <div class="d-flex flex-wrap align-items-center justify-content-between w-100">
        <div class="d-flex align-items-center">
          <button class="btn btn-primary me-2" :class="store.isBelowXL ? 'btn-sm' : ''" @click="openCreateModal">
            <i class="bi bi-plus"></i> New
          </button>
        </div>
        <div class="d-flex align-items-center mt-2 mt-md-0">
          <label class="me-2">Source:</label>
          <select
            class="form-select"
            :class="store.isBelowXL ? 'form-select-sm' : ''"
            style="max-width: 200px;"
            v-model="sourceFilter"
          >
            <option value="all">All</option>
            <option value="manual">Manual</option>
            <option value="positions-import">Positions Import</option>
          </select>
        </div>
      </div>
    </template>

    <template #asOf="{ item }">
      <div>{{ item.asOfDate }}</div>
    </template>

    <template #source="{ item }">
      <span class="badge text-bg-secondary">{{ formatSourceLabel(item.source) }}</span>
    </template>

    <template #notes="{ item }">
      <span class="text-muted">{{ item.notes || '—' }}</span>
    </template>

    <template #actions="{ item }">
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-primary" @click="openEditModal(item)">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" @click="deleteCheckpoint(item)">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </template>

    <template #empty>
      <div class="text-center py-5">
        <p class="text-muted mb-2">No cash checkpoints found.</p>
      </div>
    </template>
  </DataTable>

  <div class="modal" tabindex="-1" :class="{ 'd-block': editingCheckpoint !== null }" v-if="editingCheckpoint">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ editingIndex === null ? 'Add Cash Checkpoint' : 'Edit Cash Checkpoint' }}</h5>
          <button type="button" class="btn-close" @click="closeModal"></button>
        </div>
        <div class="modal-body">
          <div class="text-danger mb-3" v-if="saveError">{{ saveError }}</div>
          <div class="mb-3">
            <label class="form-label">As-of Date</label>
            <input type="date" class="form-control" v-model="editingCheckpoint.asOfDate">
          </div>
          <div class="mb-3">
            <label class="form-label">Cash Balance</label>
            <input type="number" step="0.01" class="form-control" v-model.number="editingCheckpoint.cashBalance">
          </div>
          <div class="mb-3">
            <label class="form-label">Source</label>
            <select class="form-select" v-model="editingCheckpoint.source">
              <option value="manual">Manual</option>
              <option value="positions-import">Positions Import</option>
            </select>
          </div>
          <div class="mb-0">
            <label class="form-label">Notes</label>
            <textarea class="form-control" rows="3" v-model="editingCheckpoint.notes"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="closeModal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="saveCheckpoint">Save changes</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>
