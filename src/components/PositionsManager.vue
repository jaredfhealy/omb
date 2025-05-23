<script setup>
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import DataTable from '@/components/custom/DataTable.vue'

const store = useAppStore()

const getNetPL = (position) => {
  const currentValue = position.currentPrice 
    ? position.currentPrice * position.shares 
    : position.strikePrice * position.shares
  const costBasis = position.strikePrice * position.shares
  const totalProfits = position.offsettingProfits || 0
  return currentValue - costBasis + totalProfits
}

const getRawPL = (position) => {
  const currentValue = position.currentPrice 
    ? position.currentPrice * position.shares 
    : position.strikePrice * position.shares
  const costBasis = position.strikePrice * position.shares
  return currentValue - costBasis
}

const getTotalROR = (position) => {
  const netPL = getNetPL(position)
  const costBasis = position.strikePrice * position.shares
  return (netPL / costBasis) * 100
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
  const currentPrice = position.currentPrice || position.strikePrice
  return currentPrice - position.strikePrice
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

function removePosition(index) {
  if (store.confirm) {
    store.confirm(
      'Are you sure you want to delete this position?',
      () => {
        store.activeAccount.positions.splice(index, 1)
        store.saveBacon()
      }
    )
  }
}

onMounted(() => {
  migratePositionProfits()
})

function migratePositionProfits() {
  let migrationPerformed = false
  
  store.activeAccount.positions.forEach(position => {
    if (position.hasOwnProperty('putProfits') || position.hasOwnProperty('callProfits')) {
      const putValue = position.hasOwnProperty('putProfits') ? position.putProfits : 0;
      const callValue = position.hasOwnProperty('callProfits') ? position.callProfits : 0;
      
      console.log(`Migrating position profits for: ${position.symbol}`, {
        putProfits: putValue,
        callProfits: callValue,
        total: (putValue + callValue).toFixed(2)
      });
      
      position.offsettingProfits = Number((putValue + callValue).toFixed(2));
      
      delete position.putProfits;
      delete position.callProfits;
      
      migrationPerformed = true;
    }
  });
  
  if (migrationPerformed) {
    console.log("Migration completed - saving changes");
    store.saveBacon();
  } else {
    console.log("No positions needed migration");
  }
}

// Define columns for DataTable
const columns = [
  {
    key: 'symbol',
    header: {
      text: 'Symbol'
    },
    class: 'col-12 col-xl',
  },
  {
    key: 'weeks',
    header: {
      text: 'Assigned / Sold',
      tooltip: 'Week when position was assigned and sold (if applicable)'
    }
  },
  {
    key: 'perSharePL',
    header: {
      text: 'P/L per Share',
      tooltip: 'Profit/Loss per share based on current or sale price'
    },
    value: (position) => store.currency(getPerSharePL(position))
  },
  {
    key: 'rawPL',
    header: {
      text: 'P/L Raw',
      tooltip: 'Raw Profit/Loss before offsetting profits'
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
</script>

<template>
  <!-- Single DataTable without unnecessary wrappers -->
  <DataTable 
    :columns="columns"
    :items="store.activeAccount.positions"
    :striped="true"
    @edit="index => store.showPositionModal(store.activeAccount.positions[index], index)"
    @delete="removePosition"
  >
    <!-- Symbol column -->
    <template #symbol="{ item }">
      <div class="position-symbol d-none d-xl-flex">
        <span class="symbol-text">{{ item.symbol }}</span>
        <span class="shares-count">{{ item.shares }} shares</span>
      </div>
      <div class="d-xl-none">
        <span class="symbol-text">{{ item.symbol }}</span>&nbsp;
        <span>({{ item.shares }} shares)</span>
      </div>
    </template>
    
    <!-- Weeks column -->
    <template #weeks="{ item }">
      <div>
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
        <button class="btn btn-sm btn-outline-primary flex-grow-0" 
                @click="store.showPositionModal(item, index)">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger flex-grow-0" 
                @click="removePosition(index)">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </template>
    
    <template #header-actions>
      <button class="btn btn-primary" style="width:80px;" @click="store.showPositionModal()">
        <i class="bi bi-plus-lg"></i> New
      </button>
    </template>
    
    <!-- Empty state message -->
    <template v-if="store.activeAccount.positions.length === 0" #empty>
      <div class="text-center py-5">
        <p class="text-muted">No positions found</p>
        <button class="btn btn-outline-primary" @click="store.showPositionModal()">Add your first position</button>
      </div>
    </template>
  </DataTable>
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
