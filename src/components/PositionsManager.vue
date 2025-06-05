<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import DataTable from '@/components/custom/DataTable.vue'
import ConfirmModal from '@/components/modals/ConfirmModal.vue'
import { perSharePL, rawPL, netPL } from '@/utils/positionUtils'

const store = useAppStore()
const confirmModalRef = ref(null)

const _getCurrentValue = (position) => {
  if (position.soldWeek && position.sellAmount != null) {
    return position.sellAmount
  } else {
    return position.currentPrice 
      ? position.currentPrice * position.shares 
      : position.costBasis
  }
}

const getNetPL = (position) => {
  return netPL(position)
}

const getRawPL = (position) => {
  const currentValue = _getCurrentValue(position)
  return currentValue - position.costBasis
}

const getTotalROR = (position) => {
  const netPL = getNetPL(position)
  return (netPL / position.costBasis) * 100
}

const getCurrentWeek = () => {
  const today = new Date()
  const startDate = new Date(store.activeAccount.settings.startDate)
  
  const diffTime = today - startDate
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  const currentWeek = Math.floor(diffDays / 7) + 1

  return Math.min(currentWeek, store.weeks)
}

const getPerSharePL = (position) => {
  return (_getCurrentValue(position) - position.costBasis) / position.shares
}

const getWeeksHeld = (position) => {
  const currentWeek = getCurrentWeek()
  
  if (position.soldWeek) {
    return position.soldWeek - position.assignedWeek + 1
  }
  
  return currentWeek - position.assignedWeek + 1
}

const getWeeklyROR = (position) => {
  const totalROR = getTotalROR(position)
  const weeksHeld = getWeeksHeld(position)
  
  if (weeksHeld <= 0) return 0
  
  return totalROR / weeksHeld
}

// Define columns for DataTable
const columns = [
  {
    key: 'symbol',
    header: {
      text: 'Symbol',
      tooltip: 'Underlying symbol'
    },
    value: (position) => position.symbol
  },
  {
    key: 'weeks',
    header: {
      text: 'Weeks',
      tooltip: 'Assigned week (top) and sold week (bottom, or Not Yet Sold)'
    }
  },
  {
    key: 'costBasis',
    header: {
      text: 'Cost Basis',
      tooltip: 'Total cost basis including fees'
    },
    value: (position) => store.currency(position.costBasis)
  },
  {
    key: 'currentPrice',
    header: {
      text: 'Current Price',
      tooltip: 'Current market price per share'
    },
    value: (position) => position.soldWeek ? 'N/A' : store.currency(position.currentPrice)
  },
  {
    key: 'perSharePL',
    header: {
      text: 'P/L per Share',
      tooltip: 'Profit/Loss per share'
    },
    value: (position) => store.currency(getPerSharePL(position))
  },
  {
    key: 'rawPL',
    header: {
      text: 'P/L Total',
      tooltip: 'Total Profit/Loss (excluding offsetting profits)'
    },
    value: (position) => store.currency(getRawPL(position))
  },
  {
    key: 'netPL',
    header: {
      text: 'P/L Net',
      tooltip: 'Net Profit/Loss including offsetting profits'
    },
    value: (position) => store.currency(getNetPL(position))
  },
  {
    key: 'ror',
    header: {
      text: 'ROR %',
      tooltip: 'Return on Risk percentage based on net P/L'
    },
    value: (position) => getTotalROR(position).toFixed(2) + '%'
  },
  {
    key: 'actions',
    header: {
      text: 'Actions'
    }
  }
]

const filter = ref('open')

const filteredPositions = computed(() => {
  if (!store.activeAccount.positions) return []
  if (filter.value === 'open') {
    return store.activeAccount.positions.filter(p => !p.soldWeek)
  } else if (filter.value === 'closed') {
    return store.activeAccount.positions.filter(p => p.soldWeek)
  }
  return store.activeAccount.positions
})

const selectedIndexes = ref([])

const toggleSelect = (index) => {
  const i = selectedIndexes.value.indexOf(index)
  if (i === -1) {
    selectedIndexes.value.push(index)
  } else {
    selectedIndexes.value.splice(i, 1)
  }
}

const clearSelection = () => {
  selectedIndexes.value = []
}

const canMerge = computed(() => selectedIndexes.value.length >= 2)

const firstSelectedSymbol = computed(() => {
  if (selectedIndexes.value.length === 0) return null
  const first = filteredPositions.value[selectedIndexes.value[0]]
  return first ? first.symbol : null
})

const mergePositions = () => {
  // Get the selected positions (by filteredPositions)
  const selected = selectedIndexes.value.map(i => filteredPositions.value[i])
  if (selected.length < 2) return
  // Generate a unique group id
  const groupId = 'group_' + Date.now() + '_' + Math.floor(Math.random() * 10000)
  // Assign the group id to all selected positions
  selected.forEach(sel => {
    const idx = store.activeAccount.positions.findIndex(p => p === sel)
    if (idx !== -1) {
      store.activeAccount.positions[idx].mergeGroup = groupId
    }
  })
  store.saveBacon()
  clearSelection()
}

const addManualPosition = () => {
  // Only allow adding a manual position for stocks owned prior to the account start date
  const startWeek = 1 // Always week 1 for account start
  store.showPositionModal({
    symbol: '',
    shares: 0,
    costBasis: 0,
    assignedWeek: startWeek, // Default to account start week
    assignedDate: null, // No date selection
    offsettingProfits: 0,
    startWeek: startWeek, // Default to account start week
    manual: true
  }, null, { manual: true })
}

const removePosition = (index) => {
  const item = filteredPositions.value[index]
  if (!item || !item.manual) return
  confirmModalRef.value.show(
    `Are you sure you want to remove manual position for ${item.symbol}?`,
    () => {
      // Find the actual index in the positions array
      const actualIndex = store.activeAccount.positions.findIndex(p => p === item)
      if (actualIndex !== -1) {
        store.activeAccount.positions.splice(actualIndex, 1)
      }
    }
  )
}

const expandedGroups = ref([])

const toggleExpandGroup = (groupId) => {
  const i = expandedGroups.value.indexOf(groupId)
  if (i === -1) {
    expandedGroups.value.push(groupId)
  } else {
    expandedGroups.value.splice(i, 1)
  }
}

// Compute displayPositions: if 2+ selected with same symbol, show a summary row instead of those rows
const displayPositions = computed(() => {
  // Group positions by mergeGroup
  const groups = {}
  filteredPositions.value.forEach((pos, i) => {
    if (pos.mergeGroup) {
      if (!groups[pos.mergeGroup]) groups[pos.mergeGroup] = []
      groups[pos.mergeGroup].push({ pos, i })
    }
  })
  const result = []
  const usedGroups = new Set()
  filteredPositions.value.forEach((pos, i) => {
    if (pos.mergeGroup && groups[pos.mergeGroup] && !usedGroups.has(pos.mergeGroup)) {
      if (expandedGroups.value.includes(pos.mergeGroup)) {
        // Expanded: show all group members
        groups[pos.mergeGroup].forEach(({ pos }) => result.push(pos))
      } else {
        // Collapsed: show summary row
        const group = groups[pos.mergeGroup]
        const merged = { ...group[0].pos, isMergedSummary: true }
        merged.shares = group.reduce((sum, { pos }) => sum + (pos.shares || 0), 0)
        merged.costBasis = group.reduce((sum, { pos }) => sum + (pos.costBasis || 0), 0)
        merged.offsettingProfits = group.reduce((sum, { pos }) => sum + (pos.offsettingProfits || 0), 0)
        merged.assignedWeek = Math.min(...group.map(({ pos }) => pos.assignedWeek || 0))
        merged.startWeek = Math.min(...group.map(({ pos }) => pos.startWeek || 0))
        merged.soldWeek = group.every(({ pos }) => pos.soldWeek) ? Math.max(...group.map(({ pos }) => pos.soldWeek || 0)) : null
        merged.manual = group.some(({ pos }) => pos.manual)
        merged.currentPrice = group[0].pos.currentPrice
        merged.sellAmount = group.every(({ pos }) => pos.soldWeek) ? group.reduce((sum, { pos }) => sum + (pos.sellAmount || 0), 0) : null
        merged.mergeGroup = pos.mergeGroup
        result.push(merged)
      }
      usedGroups.add(pos.mergeGroup)
    } else if (!pos.mergeGroup) {
      result.push(pos)
    }
  })
  return result
})
</script>

<template>
  <DataTable 
    :columns="columns"
    :items="displayPositions"
    :striped="true"
    @edit="index => {
      const item = displayPositions[index]
      if (!item.isMergedSummary) store.showPositionModal(item, index)
    }"
  >
    <template #header-actions>
      <div class="btn-group" role="group">
        <button type="button" class="btn btn-outline-primary" :class="{ active: filter === 'open' }" @click="filter = 'open'">Open</button>
        <button type="button" class="btn btn-outline-primary" :class="{ active: filter === 'closed' }" @click="filter = 'closed'">Closed</button>
        <button type="button" class="btn btn-outline-primary" :class="{ active: filter === 'all' }" @click="filter = 'all'">All</button>
      </div>
      <button type="button" class="btn btn-primary ms-3" @click="addManualPosition">
        <i class="bi bi-plus-lg"></i> Add
      </button>
      <button v-if="canMerge" type="button" class="btn btn-warning ms-3" @click="mergePositions">
        <i class="bi bi-arrow-merge"></i> Merge
      </button>
    </template>
    <!-- Symbol column -->
    <template #symbol="{ item, index }">
      <div class="d-flex align-items-center">
        <div v-if="(selectedIndexes.length === 0 || (firstSelectedSymbol && item.symbol === firstSelectedSymbol)) && !item.isMergedSummary">
          <input
            type="checkbox"
            class="form-check-input me-2"
            :checked="selectedIndexes.includes(index)"
            @change="toggleSelect(index)"
          >
        </div>
        <div v-else-if="item.isMergedSummary">
          <i class="bi bi-arrow-merge text-warning position-symbol"></i>
        </div>
        <!-- Always render the symbol and shares labels -->
        <div class="position-symbol d-none d-xl-flex">
          <span class="symbol-text">{{ item.symbol }}</span>
          <span class="shares-count">{{ item.shares }} shares</span>
        </div>
        <div class="d-xl-none">
          <span class="symbol-text">{{ item.symbol }}</span>&nbsp;
          <span>({{ item.shares }} shares)</span>
        </div>
      </div>
    </template>
    
    <!-- Weeks column -->
    <template #weeks="{ item }">
      <div v-if="item.isMergedSummary">
        <div v-html="store.weekRange(item.assignedWeek)"></div>
        <div v-if="item.soldWeek" v-html="store.weekRange(item.soldWeek)"></div>
        <div v-else class="text-muted">Not Yet Sold</div>
      </div>
      <div v-else>
        <div v-html="store.weekRange(item.assignedWeek)"></div>
        <div v-if="item.soldWeek" v-html="store.weekRange(item.soldWeek)"></div>
        <div v-else class="text-muted">Not Yet Sold</div>
      </div>
    </template>
    
    <!-- Add slots for each value that needs conditional styling -->
    <template #perSharePL="{ item }">
      <div :class="getPerSharePL(item) >= 0 ? 'text-success' : 'text-danger'">
        {{ store.currency(getPerSharePL(item)) }}
      </div>
    </template>
    <template #rawPL="{ item }">
      <div :class="getRawPL(item) >= 0 ? 'text-success' : 'text-danger'">
        {{ store.currency(getRawPL(item)) }}
      </div>
    </template>
    <template #netPL="{ item }">
      <div :class="getNetPL(item) >= 0 ? 'text-success' : 'text-danger'">
        {{ store.currency(getNetPL(item)) }}
      </div>
    </template>
    <template #ror="{ item }">
      <div :class="getTotalROR(item) >= 0 ? 'text-success' : 'text-danger'">
        {{ getTotalROR(item).toFixed(2) }}%
      </div>
    </template>
    
    <!-- Actions column -->
    <template #actions="{ item, index }">
      <div class="d-flex gap-2">
        <template v-if="item.isMergedSummary">
          <button class="btn btn-sm btn-outline-secondary flex-grow-0" @click="toggleExpandGroup(item.mergeGroup)">
            <i :class="expandedGroups.includes(item.mergeGroup) ? 'bi bi-chevron-up' : 'bi bi-chevron-down'"></i>
            {{ expandedGroups.includes(item.mergeGroup) ? 'Collapse' : 'Expand' }}
          </button>
        </template>
        <template v-else>
          <button class="btn btn-sm btn-outline-primary flex-grow-0" 
                  @click="store.showPositionModal(item, index)">
            <i class="bi bi-pencil-square"></i>
          </button>
          <!-- Collapse button for expanded group members (only show on first member, after edit button) -->
          <button v-if="item.mergeGroup && expandedGroups.includes(item.mergeGroup) && displayPositions.findIndex(p => p === item) === displayPositions.findIndex(p => p.mergeGroup === item.mergeGroup && !p.isMergedSummary)" class="btn btn-sm btn-outline-secondary flex-grow-0" @click="toggleExpandGroup(item.mergeGroup)">
            <i class="bi bi-chevron-up"></i> Collapse
          </button>
          <button v-if="item.manual" class="btn btn-sm btn-outline-danger flex-grow-0" 
                  @click="removePosition(index)" title="Remove manual position">
            <i class="bi bi-trash"></i>
          </button>
        </template>
      </div>
    </template>
    
    <!-- Empty state message -->
    <template v-if="filteredPositions.length === 0" #empty>
      <div class="text-center py-5">
        <p class="text-muted">No positions found</p>
      </div>
    </template>
  </DataTable>
  <ConfirmModal ref="confirmModalRef" />
</template>

<style>
/* Position symbol and shares styling */
.position-symbol {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.symbol-text {
  font-weight: 700;
  font-size: 1.1rem;
}

.shares-count {
  font-size: 0.85rem;
  color: #6c757d;
}
</style>
