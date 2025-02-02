<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()

const getNetPL = (position) => {
  const currentValue = position.currentPrice 
    ? position.currentPrice * position.shares 
    : position.strikePrice * position.shares
  const costBasis = position.strikePrice * position.shares
  const totalProfits = (position.putProfits || 0) + (position.callProfits || 0)
  return currentValue - costBasis + totalProfits
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

const getWeeklyROR = (position) => {
  const totalROR = getTotalROR(position)
  const currentWeek = getCurrentWeek()
  const weeksHeld = currentWeek - position.startWeek + 1
  return weeksHeld > 0 ? totalROR / weeksHeld : totalROR
}

const getPerSharePL = (position) => {
  const currentPrice = position.currentPrice || position.strikePrice
  return currentPrice - position.strikePrice
}

const getWeeksHeld = (position) => {
  const currentWeek = getCurrentWeek()
  return currentWeek - position.startWeek + 1
}
</script>

<template>
  <div class="flex-grow-1 position-relative">
    <div class="d-flex justify-content-between align-items-center px-3 py-2">
      <h4>Assigned Positions</h4>
      <button class="btn btn-primary" @click="store.showPositionModal()">
        <i class="bi bi-plus-lg"></i> Add Position
      </button>
    </div>

    <hr class="m-0"/>
    
    <div class="table-responsive">
      <table class="table table-striped table-hover">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Shares</th>
            <th>Assigned Week</th>
            <th data-bs-toggle="tooltip" 
                :data-bs-html="true"
                :data-bs-title="`
                  Profit or Loss if sold at current price (Not including offsetting profits). <br><br>
                  Hover over values to see breakdown.
                `">
              Per Share P/L*
            </th>
            <th>Cost Basis</th>
            <th>Current Value</th>
            <th data-bs-toggle="tooltip" 
              data-bs-title="Hover over values to see breakdown.">
              Offsetting Profits*
            </th>
            <th data-bs-toggle="tooltip" 
              data-bs-title="Total profit or loss including offsetting profits.">
              Total Net P/L*
            </th>
            <th>Total %ROR</th>
            <th>Number of Weeks</th>
            <th>Weekly %ROR</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(position, index) in store.activeAccount.positions" :key="index">
            <td>{{ position.symbol }}</td>
            <td>{{ position.shares }}</td>
            <td>{{ store.weekRange(position.assignedWeek) }}</td>
            <td :style="{ color: getPerSharePL(position) >= 0 ? 'inherit' : 'red' }"
                data-bs-toggle="tooltip"
                :data-bs-html="true"
                :data-bs-title="`
                  Assigned: ${store.currency(position.strikePrice)}<br>
                  Current: ${store.currency(position.currentPrice || position.strikePrice)}
                `">
              {{ store.currency(getPerSharePL(position)) }}
            </td>
            <td>{{ store.currency(position.strikePrice * position.shares) }}</td>
            <td>{{ store.currency(position.currentPrice ? position.currentPrice * position.shares : position.strikePrice * position.shares) }}</td>
            <td data-bs-toggle="tooltip"
                :data-bs-html="true"
                :data-bs-title="`
                  PUT Profits: ${store.currency(position.putProfits || 0)}<br>
                  CALL Profits: ${store.currency(position.callProfits || 0)}
                `">
              {{ store.currency((position.putProfits || 0) + (position.callProfits || 0)) }}
            </td>
            <td :style="{ color: getNetPL(position) >= 0 ? 'inherit' : 'red' }">
              {{ store.currency(getNetPL(position)) }}
            </td>
            <td :style="{ color: getTotalROR(position) >= 0 ? 'inherit' : 'red' }">
              {{ getTotalROR(position).toFixed(2) }}%
            </td>
            <td>{{ getWeeksHeld(position) }}</td>
            <td :style="{ color: getWeeklyROR(position) >= 0 ? 'inherit' : 'red' }">
              {{ getWeeklyROR(position).toFixed(2) }}%
            </td>
            <td>
              <button class="btn btn-sm btn-outline-primary me-2" @click="store.showPositionModal(position, index)">
                <i class="bi bi-pencil-square"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger" @click="store.removePosition(index)">
                <i class="bi bi-trash"></i>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
