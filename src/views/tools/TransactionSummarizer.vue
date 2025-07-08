<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import html2canvas from 'html2canvas'
import { useAppStore } from '@/stores/app'

const store = useAppStore()

const summaryData = ref([])
const expiredContracts = ref([])
const symbolFilter = ref('')
const selectedWeek = ref('')
const endWeek = ref('')
const selectedAccount = ref('all')
const copyStatus = ref('')
const isLoading = ref(false)
const showRawData = ref(false)
const summaryRef = ref(null)
let brokerMap = null

const accountOptions = computed(() => {
  if (store.db && Array.isArray(store.db.accounts)) {
    return [
      { label: 'All Accounts', value: 'all' },
      ...store.db.accounts.map((acc, idx) => ({ label: acc.name || `Account ${idx + 1}`, value: idx }))
    ]
  }
  return [{ label: 'All Accounts', value: 'all' }]
})

// Update availableWeeks to show all weeks from account start to current week
const availableWeeks = computed(() => {
  // Get the account start date
  let startDate = null
  if (selectedAccount.value === 'all') {
    if (store.db && Array.isArray(store.db.accounts) && store.db.accounts.length > 0) {
      // Find the oldest startDate among all accounts
      const validDates = store.db.accounts
        .map(acc => acc.settings && acc.settings.startDate ? new Date(acc.settings.startDate) : null)
        .filter(d => d && !isNaN(d))
      if (validDates.length > 0) {
        startDate = new Date(Math.min(...validDates.map(d => d.getTime())))
      }
    }
  } else {
    const acc = store.db.accounts[selectedAccount.value]
    if (acc && acc.settings && acc.settings.startDate) {
      startDate = new Date(acc.settings.startDate)
    }
  }
  if (!startDate) return []
  const today = new Date()
  const diffTime = today - startDate
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  const currentWeek = Math.floor(diffDays / 7) + 1
  // Weeks are 1-based
  return Array.from({ length: currentWeek }, (_, i) => i + 1)
})

// Default to last week on load
onMounted(() => {
  if (availableWeeks.value.length > 0) {
    selectedWeek.value = availableWeeks.value[availableWeeks.value.length - 1]
    console.log('Default selected week:', selectedWeek.value)
  }
})

// Computed property for totals that respects the symbol filter
const filteredTotalPremium = computed(() => {
  return summaryData.value.reduce((total, item) => {
    return total + parseFloat(item.premium || 0)
  }, 0)
})

watch(
  () => availableWeeks.value,
  (weeks, oldWeeks) => {
    // Only reset selectedWeek if the available weeks set actually changed (e.g. account switch)
    if (
      (!oldWeeks || oldWeeks.length !== weeks.length || weeks.some((w, i) => w !== oldWeeks[i])) &&
      weeks.length > 0
    ) {
      selectedWeek.value = weeks[weeks.length - 1]
    }
  }
)

// When start week changes, set end week to match if not after
watch(selectedWeek, (newVal) => {
  endWeek.value = newVal
})

// Clear summary data when any form value changes
watch([selectedAccount, symbolFilter, selectedWeek, endWeek, showRawData], () => {
  summaryData.value = []
})

// Moved summary calculation logic to calculateSummary function
const calculateSummary = () => {
  // Update the brokerMap
  brokerMap = store.getBrokerageMap()
  // Only populate expiredContracts if no symbol filter is applied
  expiredContracts.value = []
  const filterActive = !!symbolFilter.value
  if (!selectedWeek.value || !endWeek.value) {
    summaryData.value = []
    return
  }
  let actualsToProcess = []
  if (selectedAccount.value === 'all') {
    if (store.db && Array.isArray(store.db.accounts)) {
      store.db.accounts.forEach(acc => {
        if (Array.isArray(acc.actuals)) {
          acc.actuals.forEach(a => {
            if (a.week >= selectedWeek.value && a.week <= endWeek.value) actualsToProcess.push({ actual: a, accountName: acc.name })
          })
        }
      })
    }
  } else {
    const acc = store.db.accounts[selectedAccount.value]
    if (acc && Array.isArray(acc.actuals)) {
      acc.actuals.forEach(a => {
        if (a.week >= selectedWeek.value && a.week <= endWeek.value) actualsToProcess.push({ actual: a, accountName: acc.name })
      })
    }
  }
  // Combine all transactions for this week from all selected accounts
  let allRows = []
  actualsToProcess.forEach(({ actual, accountName }) => {
    if (Array.isArray(actual.data)) {
      allRows.push(...actual.data.map(txn => {
        // Only include actions in brokerMap.weeklyTotalTypes
        if (!brokerMap.weeklyTotalTypes.includes(txn.action.toLowerCase())) {
          return null
        }
        let ticker = txn.symbol
        let contractType = '-'
        let strike = '-'
        let qty = txn.quantity
        const optMatch = txn.symbol.match(/^([\w.-]+) (\d{2}\/\d{2}\/\d{4}) ([\d.]+) ([CP])$/)
        if (optMatch) {
          ticker = optMatch[1]
          strike = optMatch[3]
          contractType = optMatch[4] === 'C' ? 'Call' : 'Put'
        } else if (txn.symbol && txn.symbol.match(/^[A-Z.\-]+$/)) {
          ticker = txn.symbol
          // Use action in Title Case instead of 'Stock'
          contractType = txn.action
            ? txn.action.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            : '-'
          strike = '-'
        }
        // Symbol filter logic (enforced at data level)
        if (symbolFilter.value) {
          if (!ticker || ticker.toUpperCase() !== symbolFilter.value) {
            return null
          }
        }
        // Only collect expired contracts for the section if only one week is selected
        if (txn.action && txn.action.toLowerCase() === 'expired' && !symbolFilter.value && selectedWeek.value === endWeek.value) {
          expiredContracts.value.push(txn.symbol + " [" + txn.quantity + "]")
          return null
        }
        let type = txn.action
        return {
          date: txn.date,
          account: accountName,
          ticker,
          contractType,
          strike,
          quantity: qty,
          description: txn.description,
          premium: txn.amount,
          ror: '-',
          type,
          symbol: txn.symbol,
          action: txn.action
        }
      }).filter(Boolean))
    }
  })
  if (showRawData.value) {
    summaryData.value = allRows
    return
  }
  // Group rolls (Open/Close can be in any order)
  let groupedRows = []
  let usedIndexes = new Set()
  for (let i = 0; i < allRows.length; i++) {
    if (usedIndexes.has(i)) continue
    const curr = allRows[i]
    let foundPair = false
    for (let j = i + 1; j < allRows.length; j++) {
      if (usedIndexes.has(j)) continue
      const next = allRows[j]
      // Must be one Open, one Close, same ticker, quantity, contractType
      const isRollPair =
        ((curr.type === 'Sell to Open' && next.type === 'Buy to Close') || (curr.type === 'Buy to Close' && next.type === 'Sell to Open')) &&
        curr.ticker === next.ticker &&
        curr.quantity === next.quantity &&
        curr.contractType === next.contractType
      if (isRollPair) {
        // Parse dates from symbol
        const currDateMatch = curr.symbol.match(/\d{2}\/\d{2}\/\d{4}/)
        const nextDateMatch = next.symbol.match(/\d{2}\/\d{2}\/\d{4}/)
        const fromDate = curr.type === 'Buy to Close' ? (currDateMatch ? currDateMatch[0] : curr.date) : (nextDateMatch ? nextDateMatch[0] : next.date)
        const toDate = curr.type === 'Sell to Open' ? (currDateMatch ? currDateMatch[0] : curr.date) : (nextDateMatch ? nextDateMatch[0] : next.date)
        // Set strike column for roll
        let rollStrike = curr.type === 'Buy to Close' ? next.strike : curr.strike
        if (curr.strike !== next.strike && curr.strike !== '-' && next.strike !== '-') {
          rollStrike = `${curr.strike} to ${next.strike}`
        }
        // Calculate ROR for roll
        let ror = '-'
        let strikeForROR = (curr.strike !== '-' && !isNaN(curr.strike)) ? parseFloat(curr.strike) : (next.strike !== '-' && !isNaN(next.strike) ? parseFloat(next.strike) : null)
        if (strikeForROR && curr.quantity) {
          const cost = Math.abs(curr.quantity * strikeForROR * 100)
          if (cost > 0) {
            const premium = parseFloat(curr.premium) + parseFloat(next.premium)
            ror = ((premium / cost) * 100).toFixed(2)
          }
        }
        groupedRows.push({
          ...(curr.type === 'Sell to Open' ? curr : next),
          description: `Rolled from ${fromDate} to ${toDate}`,
          premium: (parseFloat(curr.premium) + parseFloat(next.premium)).toFixed(2),
          rollFrom: fromDate,
          rollTo: toDate,
          strike: rollStrike,
          ror: ror !== '-' ? ror : '-'
        })
        usedIndexes.add(i)
        usedIndexes.add(j)
        foundPair = true
        break
      }
    }
    if (!foundPair) {
      // If this is a buy to close, set description
      if (curr.type === 'Buy to Close') {
        const dateMatch = curr.symbol.match(/\d{2}\/\d{2}\/\d{4}/)
        curr.description = dateMatch ? `Closed position expiring ${dateMatch[0]}` : `Bought to close on ${curr.date}`
      }
      // If this is a sell to open, set description
      if (curr.type === 'Sell to Open') {
        const dateMatch = curr.symbol.match(/\d{2}\/\d{2}\/\d{4}/)
        curr.description = dateMatch ? `New position expiring ${dateMatch[0]}` : `Sold to open on ${curr.date}`
      }
      // Calculate ROR for single leg
      let ror = '-'
      if (curr.strike !== '-' && !isNaN(curr.strike) && curr.quantity) {
        const cost = Math.abs(curr.quantity * parseFloat(curr.strike) * 100)
        if (cost > 0) {
          ror = ((parseFloat(curr.premium) / cost) * 100).toFixed(2)
        }
      }
      groupedRows.push({ ...curr, ror: ror !== '-' ? ror : '-' })
    }
  }
  // Sort by account, then date ascending
  groupedRows.sort((a, b) => {
    if (a.account < b.account) return -1;
    if (a.account > b.account) return 1;
    // If accounts are equal, sort by date
    return new Date(a.date) - new Date(b.date);
  });
  summaryData.value = groupedRows
}

async function copyAsImage() {
  try {
    copyStatus.value = 'Copying...'
    const element = summaryRef.value
    
    if (!element) {
      throw new Error('Summary content not found')
    }

    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2, // Higher resolution
      logging: false,
      useCORS: true
    })

    // Convert canvas to blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    
    // Copy to clipboard
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob
      })
    ])

    copyStatus.value = 'Copied!'
    setTimeout(() => {
      copyStatus.value = ''
    }, 2000)
  } catch (error) {
    console.error('Copy as image failed:', error)
    copyStatus.value = 'Copy failed'
    setTimeout(() => {
      copyStatus.value = ''
    }, 2000)
  }
}
</script>

<template>
  <div class="container">
    <div class="row mb-4">
      <div class="col">
        <div class="card">
          <div class="card-header">
            <h4>Schwab Transaction Summarizer</h4>
          </div>
          <div class="card-body">
            <div class="mb-3 row align-items-end">
              <!-- Account selector (50%) -->
              <div class="col-12 col-md-6 mb-3 mb-md-0">
                <label for="accountSelector" class="form-label">Select Account</label>
                <select id="accountSelector" class="form-select w-100" v-model="selectedAccount">
                  <option v-for="option in accountOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <!-- Symbol filter input (50%, full width) -->
              <div class="col-12 col-md-6 mb-3 mb-md-0">
                <label for="symbolFilter" class="form-label">Filter by Symbol</label>
                <input
                  id="symbolFilter"
                  type="text"
                  class="form-control w-100"
                  v-model="symbolFilter"
                  placeholder="Enter symbol..."
                  @input="symbolFilter = symbolFilter.toUpperCase()"
                />
              </div>
            </div>
            <!-- Start/End Week selectors row -->
            <div class="mb-3 row align-items-end">
              <div class="col-12 col-md-6 mb-3 mb-md-0">
                <label for="weekSelector" class="form-label">Start Week</label>
                <select id="weekSelector" class="form-select w-100" v-model="selectedWeek">
                  <option :value="null">Select Week</option>
                  <option v-for="week in availableWeeks" :key="week" :value="week">
                    Week {{ week }} ({{ store.weekRange(week, true) }})
                  </option>
                </select>
              </div>
              <div class="col-12 col-md-6">
                <label for="endWeekSelector" class="form-label">End Week</label>
                <select id="endWeekSelector" class="form-select w-100" v-model="endWeek">
                  <option :value="null">Select Week</option>
                  <option v-for="week in availableWeeks.filter(w => w >= selectedWeek)" :key="week" :value="week">
                    Week {{ week }} ({{ store.weekRange(week, true) }})
                  </option>
                </select>
              </div>
            </div>
            <!-- Show Raw Data checkbox row -->
            <div class="mb-3 row">
              <div class="col-12 d-flex align-items-center">
                <div class="form-check me-2">
                  <input class="form-check-input" type="checkbox" id="showRawData" v-model="showRawData">
                  <label class="form-check-label" for="showRawData">Show Raw Data</label>
                </div>
                <small class="text-muted ms-2">
                  If the summarized data looks incorrect, show the raw data and the UI will not attempt to identify "Roll" transactions.
                </small>
              </div>
            </div>
            <!-- Calculate Summary button -->
            <div class="mb-3 row">
              <div class="col-12">
                <button class="btn btn-primary w-100" @click="calculateSummary">Calculate Summary</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row" v-if="summaryData.length > 0">
      <div class="col">
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h5 class="mb-0">Transaction Summary</h5>
            <!-- Add Symbol filter alongside Copy button -->
            <div class="d-flex align-items-center gap-3">
              <button 
                class="btn btn-sm btn-outline-primary" 
                @click="copyAsImage"
                :disabled="isLoading || copyStatus === 'Copying...'"
              >
                <span v-if="!copyStatus">Copy as Image</span>
                <span v-else>{{ copyStatus }}</span>
              </button>
            </div>
          </div>
          <div class="card-body" ref="summaryRef">
            <!-- Options summary table -->
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Symbol</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Strike</th>
                  <th>Description</th>
                  <th>Premium</th>
                  <th>
                    <span style="cursor: help;" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="ROR is calculated after Comm & Fees">
                      ROR <i class="bi bi-info-circle ms-1"></i>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in summaryData" :key="index">
                  <td>{{ item.date }}</td>
                  <td>{{ item.account }}</td>
                  <td>{{ item.ticker }}</td>
                  <td>{{ showRawData ? item.type : item.contractType }}</td>
                  <td>{{ item.quantity }}</td>
                  <td>{{ item.strike === '-' ? '-' : '$' + item.strike }}</td>
                  <td>{{ item.description }}</td>
                  <td>{{ store.currency(item.premium) }}</td>
                  <td>{{ item.ror === '-' ? '-' : item.ror + '%' }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="table-light">
                  <td colspan="7" align="right"><b>Total Premium:</b></td>
                  <td><b>{{ store.currency(filteredTotalPremium) }}</b></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            <!-- Expired contracts section (multi-week or filtered) -->
            <div class="mt-0" v-if="!symbolFilter && expiredContracts.length > 0 && (selectedWeek === endWeek)">
              <p style="font-size: 18pt;">Contracts Expired Worthless: <span class="fw-bold small" v-if="expiredContracts.length == 0">None</span></p>
              <div class="d-flex flex-wrap gap-2">
                <span v-for="(symbol, idx) in expiredContracts" :key="idx" class="expired-pill">{{ symbol }}</span>
              </div>
            </div>

            <!-- No results message when filtered -->
            <div v-if="summaryData.length > 0 && summaryData.length === 0" 
                 class="alert alert-info mt-3">
              No transactions match your filter criteria.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-body {
  background-color: white;
}
.container {
  margin-bottom: 30px;
}

.expired-pill {
  display: inline-block;
  background: #d4edda;
  color: #155724;
  border-radius: 999px;
  padding: 0.4em 1em;
  font-weight: 500;
  margin-bottom: 0.25em;
  border: 1px solid #c3e6cb;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .d-flex.align-items-center.gap-3 {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
  }
  
  #symbolFilter {
    width: 100%;
  }
}
</style>
