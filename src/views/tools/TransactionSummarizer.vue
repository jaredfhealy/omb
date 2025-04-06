<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import html2canvas from 'html2canvas'
import { useAppStore } from '@/stores/app'

const store = useAppStore()

const transactions = ref([])
const summaryData = ref([])
const expiredContracts = ref([])
// Change from Map to Array to track all Buy to Close transactions
const buyToCloseTransactions = ref([])
// Track all matched transactions by ID
const matchedTransactionIds = ref(new Set())
const openTransactions = ref(new Map())
const errorMessage = ref('')
const isLoading = ref(false)
const copyStatus = ref('')
const summaryRef = ref(null)
const symbolFilter = ref('')

// Computed property for filtered summary data
const filteredSummaryData = computed(() => {
  if (!symbolFilter.value) return summaryData.value

  const filter = symbolFilter.value.toUpperCase()
  return summaryData.value.filter(item => 
    item.ticker && item.ticker.toUpperCase().includes(filter)
  )
})

// Computed property for totals that respects the symbol filter
const filteredTotalPremium = computed(() => {
  return filteredSummaryData.value.reduce((total, item) => {
    return total + parseFloat(item.premium || 0)
  }, 0)
})

function getAccountName(filename) {
  return filename.split('_')[0]
}

function handleFileUpload(event) {
  const files = event.target.files
  if (!files.length) return
  
  // Reset states
  errorMessage.value = ''
  isLoading.value = true
  transactions.value = []
  summaryData.value = []
  
  // Process each file
  const filePromises = Array.from(files).map(file => {
    if (!file.name.endsWith('.json')) {
      errorMessage.value = 'Please select JSON files only'
      return Promise.reject('Invalid file type')
    }
    
    const accountName = getAccountName(file.name)
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result)
          if (!data.BrokerageTransactions || !Array.isArray(data.BrokerageTransactions)) {
            throw new Error('Invalid file format')
          }
          // Add account name to each transaction
          const transactions = data.BrokerageTransactions.map(t => ({
            ...t,
            accountName
          }))
          resolve(transactions)
        } catch (error) {
          reject(error)
        }
      }
      
      reader.onerror = () => {
        reject('Error reading file')
      }
      reader.readAsText(file)
    })
  })

  Promise.all(filePromises)
    .then(allTransactions => {
      // Combine all transactions into a single array
      transactions.value = allTransactions.flat()
      processSummary()
    })
    .catch(error => {
      errorMessage.value = 'Error processing files: Please upload valid Schwab transactions JSON files'
    })
    .finally(() => {
      isLoading.value = false
      event.target.value = '' // Reset file input
    })
}

function processSummary() {
  // Clear existing data
  buyToCloseTransactions.value = []
  matchedTransactionIds.value = new Set()
  openTransactions.value = new Map()
  expiredContracts.value = []
  summaryData.value = []
  
  // Add a unique ID to each transaction for tracking
  transactions.value.forEach((t, index) => {
    t.id = index
  })
  
  // First check for dividend and interest transactions - add directly to summaryData
  transactions.value.forEach((t, index) => {
    const action = t.Action ? t.Action.toLowerCase() : '';
    if (action.includes('dividend') || action.includes('interest')) {
      // This is a dividend or interest payment
      const ticker = t.Symbol || 'N/A'
      const amount = parseFloat(t.Amount.replace(/[$,]/g, ''))
      
      // Add directly to summaryData instead of separate array
      summaryData.value.push({
        type: action.includes('dividend') ? 'Dividend' : 'Interest',
        ticker: ticker, // Keep the ticker if available
        description: `${t.Action} | ${t.Description || ''}`,
        premium: amount.toFixed(2), // Use premium field for consistency
        strike: '-',
        contractType: '-',
        quantity: '-',
        ror: '-',      // No ROR for dividends/interest
        date: t.Date,
        account: t.accountName
      })
    }
  })
  
  // First pass - collect all Buy to Close and Assigned transactions
  transactions.value.forEach((t, index) => {
    if (t.Action === 'Buy to Close') {
      const [ticker, expDate, strike, type] = t.Symbol.split(' ')
      const amount = parseFloat(t.Amount.replace(/[$,]/g, ''))
      const quantity = Math.abs(parseInt(t.Quantity))
      const totalFees = parseFloat(t['Fees & Comm']?.replace(/[$,]/g, '') || '0')
      const transactionDate = t.Date
      
      // Store each Buy to Close with all its details in an array
      buyToCloseTransactions.value.push({
        id: t.id,
        ticker,
        fromDate: expDate,
        amount,
        strike: parseFloat(strike),
        type,
        quantity,
        totalFees,
        date: transactionDate,
        account: t.accountName,
        matched: false
      })
    } else if (t.Action === 'Expired') {
      const [ticker, , , type] = t.Symbol.split(' ')
      expiredContracts.value.push(`${ticker} [${type}]`)
    } else if (t.Action === 'Assigned') {
      const [ticker, expDate, strike, type] = t.Symbol.split(' ')
      const quantity = Math.abs(parseInt(t.Quantity))
      const transactionDate = t.Date.split(' ')[0] // Take only the date part, not "as of" part
      
      summaryData.value.push({
        type: 'Assigned',
        ticker,
        description: `Assigned at $${strike} expiring ${expDate}`,
        premium: '0.00',
        strike,
        contractType: type,
        quantity,
        ror: '-',
        date: transactionDate,
        account: t.accountName
      })
    }
  })

  // Second pass - process Sell to Open and match with rolls
  transactions.value.forEach((t, index) => {
    if (t.Action === 'Sell to Open') {
      const [ticker, expDate, strike, type] = t.Symbol.split(' ')
      const transactionDate = t.Date
      const sellAmount = parseFloat(t.Amount.replace(/[$,]/g, ''))
      const quantity = Math.abs(parseInt(t.Quantity))
      const totalFees = parseFloat(t['Fees & Comm']?.replace(/[$,]/g, '') || '0')
      const strikePrice = parseFloat(strike)

      // Try to find a matching Buy to Close from the same day for the same ticker/type
      // that hasn't been matched yet
      const matchingBuyToClose = buyToCloseTransactions.value.find(btc => 
        !btc.matched && 
        btc.ticker === ticker && 
        btc.type === type && 
        btc.date === transactionDate &&
        !matchedTransactionIds.value.has(btc.id)
      )

      if (matchingBuyToClose) {
        // Found a matching Buy to Close - create a roll
        // Mark as matched
        matchingBuyToClose.matched = true
        matchedTransactionIds.value.add(matchingBuyToClose.id)
        matchedTransactionIds.value.add(t.id)
        
        const netAmount = (sellAmount + matchingBuyToClose.amount).toFixed(2)
        const combinedFees = totalFees + matchingBuyToClose.totalFees
        
        // Calculate cost basis and ROR
        const costBasis = (quantity * strikePrice * 100) + combinedFees
        const ror = ((parseFloat(netAmount) / costBasis) * 100).toFixed(2)
        
        // Determine strike display based on whether it changed
        const strikeDisplay = matchingBuyToClose.strike === strikePrice 
          ? strike 
          : `${matchingBuyToClose.strike} to ${strike}`
        
        summaryData.value.push({
          type: 'Roll',
          ticker,
          description: `Rolled from ${matchingBuyToClose.fromDate} to ${expDate}`,
          premium: netAmount,
          strike: strikeDisplay,
          contractType: type,
          quantity,
          ror: ror,
          date: transactionDate,
          account: t.accountName
        })
      } else {
        // See if this transaction is part of a roll chain
        // Check if there's a Buy to Close on the same day for the same symbol with the same expiry
        const isPartOfRollChain = transactions.value.some(otherT => 
          otherT.Action === 'Buy to Close' && 
          otherT.Date === transactionDate && 
          otherT.Symbol.split(' ')[0] === ticker &&
          otherT.Symbol.split(' ')[3] === type &&
          otherT.Symbol.split(' ')[1] === expDate &&
          matchedTransactionIds.value.has(otherT.id)
        )

        if (isPartOfRollChain) {
          matchedTransactionIds.value.add(t.id)
        } else {
          // New open position
          const costBasis = (quantity * strikePrice * 100) + totalFees
          const ror = ((sellAmount / costBasis) * 100).toFixed(2)
          
          openTransactions.value.set(`${ticker}-${type}-${expDate}`, {
            type: 'Open',
            ticker,
            description: `New position expiring ${expDate}`,
            premium: sellAmount.toFixed(2),
            strike,
            contractType: type,
            quantity,
            ror: ror,
            date: transactionDate,
            account: t.accountName
          })
        }
      }
    }
  })

  // Add remaining open transactions
  openTransactions.value.forEach(t => {
    summaryData.value.push(t)
  })

  // Add any unmatched Buy to Close transactions
  buyToCloseTransactions.value.filter(btc => !btc.matched).forEach(buyToClose => {
    summaryData.value.push({
      type: 'Close',
      ticker: buyToClose.ticker,
      description: `Closed position expiring ${buyToClose.fromDate}`,
      premium: buyToClose.amount.toFixed(2),
      strike: buyToClose.strike,
      contractType: buyToClose.type,
      quantity: buyToClose.quantity,
      ror: '-',
      date: buyToClose.date,
      account: buyToClose.account
    })
  })

  // Sort the summary data by date, then account, then description
  summaryData.value.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date)
    }
    if (a.account !== b.account) {
      return a.account.localeCompare(b.account)
    }
    return a.description.localeCompare(b.description)
  })
  
  // Trigger tooltip initialization
  store.initTooltips()
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
            <div class="mb-3">
              <label for="fileUpload" class="form-label">Upload Schwab Transaction JSON Files</label>
              <input type="file" 
                class="form-control" 
                id="fileUpload" 
                @change="handleFileUpload" 
                accept=".json"
                multiple
                :disabled="isLoading">
              <div class="form-text text-muted ms-2">*Upload one or more JSON files exported from Schwab. Files will be processed together.</div>
              <div v-if="errorMessage" class="alert alert-danger mt-2">
                {{ errorMessage }}
              </div>
              <div v-if="isLoading" class="mt-2">
                <div class="spinner-border spinner-border-sm" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
                <span class="ms-2">Processing file...</span>
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
              <div class="d-flex align-items-center" v-if="summaryData.length > 0">
                <label for="symbolFilter" class="me-2">Filter by Symbol:</label>
                <input
                  id="symbolFilter"
                  type="text"
                  class="form-control form-control-sm"
                  v-model="symbolFilter"
                  placeholder="Enter symbol..."
                />
              </div>
              
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
                <tr v-for="(item, index) in filteredSummaryData" :key="index">
                  <td>{{ item.date }}</td>
                  <td>{{ item.account }}</td>
                  <td>{{ item.ticker }}</td>
                  <td>{{ item.contractType }}</td>
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

            <!-- Expired contracts section -->
            <div v-if="expiredContracts.length > 0" class="mt-4">
              <br/>
              <p style="font-size: 18pt;">Expired Contracts:</p>
              <p>The following contracts expired worthless: <b>{{ expiredContracts.join(', ') }}</b></p>
            </div>
            
            <!-- No results message when filtered -->
            <div v-if="summaryData.length > 0 && filteredSummaryData.length === 0" 
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

/* Style the Symbol filter */
#symbolFilter {
  width: 150px;
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
