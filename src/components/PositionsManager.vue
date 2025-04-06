<script setup>
import { onMounted } from 'vue' // Add the missing import
import { useAppStore } from '@/stores/app'
const store = useAppStore()

const getNetPL = (position) => {
  const currentValue = position.currentPrice 
    ? position.currentPrice * position.shares 
    : position.strikePrice * position.shares
  const costBasis = position.strikePrice * position.shares
  const totalProfits = position.offsettingProfits || 0 // Changed to use single offsettingProfits field
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
  
  // Find how many weeks have passed since the start date
  const diffTime = today - startDate
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  const currentWeek = Math.floor(diffDays / 7) + 1

  return Math.min(currentWeek, store.weeks) // Don't exceed total weeks
}

const getPerSharePL = (position) => {
  const currentPrice = position.currentPrice || position.strikePrice
  return currentPrice - position.strikePrice
}

const getWeeksHeld = (position) => {
  const currentWeek = getCurrentWeek()
  return currentWeek - position.startWeek + 1
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

// Run migration to consolidate profit fields when component is loaded
onMounted(() => {
  migratePositionProfits()
})

// Add migration function to consolidate profit fields
function migratePositionProfits() {
  let migrationPerformed = false
  
  // Loop through all positions
  store.activeAccount.positions.forEach(position => {
    if (position.callProfits) {
      // If there are call profits, add them to the offsettingProfits (formerly putProfits)
      // Round the sum to 2 decimal places
      console.log("callProfits found - Migrating position profits for:", position.symbol)
      position.offsettingProfits = Number(((position.putProfits || 0) + (position.callProfits || 0)).toFixed(2))
      
      // Delete the old fields
      delete position.putProfits
      delete position.callProfits
      
      migrationPerformed = true
    } else if (position.putProfits && !position.offsettingProfits) {
      // If there are only putProfits, rename to offsettingProfits and round to 2 decimal places
      console.log("Only putProfits fount - Migrating position profits for:", position.symbol)
      position.offsettingProfits = Number(position.putProfits.toFixed(2))
      delete position.putProfits
      
      migrationPerformed = true
    }
  })
  
  // If any positions were migrated, save the changes
  if (migrationPerformed) {
    store.saveBacon()
  }
}
</script>

<template>
  <div class="positions-manager-container">
    <div class="scrollable-container">
      <div class="container-fluid pb-4">
        <!-- Table Header Row with position-relative added -->
        <div class="row sticky-top header-row bg-white py-2 mb-2 position-relative">
          <div class="col-12 col-xl-1">Symbol</div>
          <div class="col-12 col-xl-11 d-none d-xl-flex">
            <div class="col-2">Assigned / Sold</div>
            <div class="col-2" data-bs-toggle="tooltip" data-bs-title="Profit or Loss per share if sold at current price">P/L per Share*</div>
            <div class="col-2" data-bs-toggle="tooltip" data-bs-title="Total profit or loss on position before offsetting profits">P/L Total*</div>
            <!-- Consolidated P/L Net column -->
            <div class="col-2" data-bs-toggle="tooltip" data-bs-title="Net profit or loss including offsetting premium income">P/L Net*</div>
            <div class="col-1">ROR %</div>
            <div class="col-1">Weeks Held</div>
            <div class="col-1">Actions</div>
            <button class="btn btn-primary float-end" @click="store.showPositionModal()">
              <i class="bi bi-plus-lg"></i> New
            </button>
          </div>
          
          <!-- Mobile New Button (visible on smaller screens) -->
          <div class="position-button d-xl-none">
            <button class="btn btn-sm btn-primary" @click="store.showPositionModal()">
              <i class="bi bi-plus-lg"></i> New
            </button>
          </div>
        </div>

        <!-- Position Cards -->
        <div v-for="(position, index) in store.activeAccount.positions" :key="index" class="row mb-2">
          <div class="col-12">
            <div class="card h-100">
              <div class="card-body py-2">
                <div class="row">
                  <!-- Symbol/Shares Info - reduced width -->
                  <div class="col-12 col-xl-1 mb-2 mb-xl-0">
                    <div class="position-symbol">
                      <span class="symbol-text">{{ position.symbol }}</span>
                      <span class="shares-count">{{ position.shares }} shares</span>
                    </div>
                  </div>
                  
                  <!-- Position Details - adjusted column widths -->
                  <div class="col-12 col-xl-11">
                    <div class="row">
                      <!-- Assigned/Sold Weeks -->
                      <div class="col-12 col-xl-2">
                        <div class="row">
                          <div class="col-6 col-xl-12">
                            <div class="data-label d-xl-none">Assigned Week</div>
                            <div v-html="store.weekRange(position.assignedWeek)"></div>
                          </div>
                          <div class="col-6 col-xl-12">
                            <div class="data-label d-xl-none">Sold Week</div>
                            <div>
                              <span v-if="position.soldWeek" v-html="store.weekRange(position.soldWeek)"></span>
                              <span v-else class="text-muted">Not Yet Sold</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <!-- Per Share P/L -->
                      <div class="col-6 col-xl-2">
                        <div class="data-label d-xl-none">Per Share P/L</div>
                        <div :class="getPerSharePL(position) >= 0 ? 'text-success' : 'text-danger'"
                             data-bs-toggle="tooltip"
                             :data-bs-html="true"
                             :data-bs-title="`
                               Assigned: ${store.currency(position.strikePrice)}<br>
                               Current: ${store.currency(position.currentPrice || position.strikePrice)}
                             `">
                          {{ store.currency(getPerSharePL(position)) }}
                        </div>
                      </div>
                      
                      <!-- Changed to P/L Raw -->
                      <div class="col-6 col-xl-2">
                        <div class="data-label d-xl-none">P/L Raw</div>
                        <div :class="getRawPL(position) >= 0 ? 'text-success' : 'text-danger'"
                             data-bs-toggle="tooltip"
                             :data-bs-html="true"
                             :data-bs-title="`
                               Basis: ${store.currency(position.strikePrice * position.shares)}<br>
                               Value: ${store.currency(position.currentPrice ? position.currentPrice * position.shares : position.strikePrice * position.shares)}
                             `">
                          {{ store.currency(getRawPL(position)) }}
                        </div>
                      </div>
                      
                      <!-- Consolidated P/L Net column -->
                      <div class="col-6 col-xl-2">
                        <div class="data-label d-xl-none">P/L Net</div>
                        <div :class="getNetPL(position) >= 0 ? 'text-success' : 'text-danger'"
                             data-bs-toggle="tooltip"
                             :data-bs-html="true"
                             :data-bs-title="`
                               Raw P/L: ${store.currency(getRawPL(position))}<br>
                               Offsetting: ${store.currency(position.offsettingProfits || 0)}<br>
                               Net P/L: ${store.currency(getNetPL(position))}
                             `">
                          {{ store.currency(getNetPL(position)) }}
                        </div>
                      </div>
                      
                      <!-- Total % ROR -->
                      <div class="col-4 col-xl-1">
                        <div class="data-label d-xl-none">ROR %</div>
                        <div :class="getTotalROR(position) >= 0 ? 'text-success' : 'text-danger'">
                          {{ getTotalROR(position).toFixed(2) }}%
                        </div>
                      </div>
                      
                      <!-- Weeks Held -->
                      <div class="col-4 col-xl-1">
                        <div class="data-label d-xl-none">Weeks Held</div>
                        <div>{{ getWeeksHeld(position) }}</div>
                      </div>
                      
                      <!-- Actions -->
                      <div class="col-4 col-xl-1">
                        <div class="data-label d-xl-none">Actions</div>
                        <div class="d-flex gap-2">
                          <button class="btn btn-sm btn-outline-primary" @click="store.showPositionModal(position, index)">
                            <i class="bi bi-pencil-square"></i>
                          </button>
                          <button class="btn btn-sm btn-outline-danger" @click="removePosition(index)">
                            <i class="bi bi-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Empty state message -->
        <div v-if="store.activeAccount.positions.length === 0" class="text-center py-5">
          <p class="text-muted">No positions found</p>
          <button class="btn btn-outline-primary" @click="store.showPositionModal()">Add your first position</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.positions-manager-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
}

.scrollable-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Alternating background colors for cards */
.positions-manager-container .row.mb-2:nth-child(odd) .card {
  background-color: rgba(0, 0, 0, 0.05);
}

/* Hover effect */
.positions-manager-container .card:hover {
  background-color: rgba(244, 236, 192, 0.7);
}

.header-row {
  font-weight: bold;
  border-bottom: 2px solid #dee2e6;
  z-index: 1020;
  position: relative;
}

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

/* Mobile data labels */
.data-label {
  font-weight: bold;
  font-size: 0.8rem;
  margin-bottom: 0.1rem;
  color: #6c757d;
}

/* Fix the position button styling for both desktop and mobile */
.position-button {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
}

/* Mobile-specific styling */
@media (max-width: 1199.98px) {
  .card {
    margin-bottom: 0.75rem;
  }
  
  .row > [class*="col-"] {
    margin-bottom: 0.5rem;
  }
}
</style>
