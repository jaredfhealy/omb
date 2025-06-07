<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import Papa from 'papaparse'

const store = useAppStore()
const isVisible = ref(false)
const csvFile = ref(null)
const isProcessing = ref(false)
const importResults = ref(null)
const hasError = ref(false)
const errorMessage = ref('')
const discardFirstWeek = ref(true) // Default to true for this option
const deleteAllData = ref(false) // Default to false for this option

// Modal control methods
const show = () => {
  migrateNotesToArray() // Trigger migration when modal is displayed
  isVisible.value = true
  resetForm()
}

const close = () => {
  isVisible.value = false
  resetForm()
}

const resetForm = () => {
  csvFile.value = null
  isProcessing.value = false
  importResults.value = null
  hasError.value = false
  errorMessage.value = ''
  discardFirstWeek.value = true // Reset to default
  deleteAllData.value = false // Reset to default
  
  // Reset the file input element to clear the selected file
  const fileInput = document.querySelector('#csvFile')
  if (fileInput) {
    fileInput.value = ''
  }
}

// Handle file selection
const handleFileChange = (event) => {
  const file = event.target.files[0]
  
  if (file && file.type !== 'text/csv') {
    hasError.value = true
    errorMessage.value = 'Please select a valid CSV file'
    return
  }
  
  csvFile.value = file
  hasError.value = false
}

// Process the CSV file
const processImport = async () => {
  if (!csvFile.value) {
    hasError.value = true
    errorMessage.value = 'Please select a CSV file first'
    return
  }

  // Get the filename and replace underscores with spaces
  const fileName = csvFile.value.name.replace(/_/g, ' ')
  const accountName = store.activeAccount.name.trim()
  // Check if the filename starts with the account name (case-insensitive)
  let confirmMessage = `Are you sure you want to import transactions into the "${store.activeAccount.name}" account?`
  if (!fileName.toLowerCase().startsWith(accountName.toLowerCase())) {
    confirmMessage = `WARNING: The file you selected ("${fileName}") does not appear to match the current account ("${accountName}"). Are you sure you want to import this file?`
  }

  store.confirm(
    confirmMessage,
    async () => {
      // User confirmed, proceed with import
      isProcessing.value = true
      
      try {
        // Store the file before clearing the input
        const fileToProcess = csvFile.value
        
        // Call the local function to handle the actual import
        const results = await importTransactionsFromCSV(fileToProcess)
        importResults.value = results
        hasError.value = false
        
        // Trigger projections and save
        store.calculateProjections()
      } catch (error) {
        hasError.value = true
        errorMessage.value = error.message || 'An error occurred during import'
        console.error('Import error:', error)
      } finally {
        isProcessing.value = false
      }
    },
    () => { close() }
  )
}

// CSV import function - moved from store
async function importTransactionsFromCSV(file) {
  // Ensure we have an account to import to
  if (!store.activeAccount) {
    throw new Error('No active account found')
  }
  
  try {
    // Step 1: Parse CSV file and extract structured data
    const text = await file.text()
    const { dataRows, errors, meta } = parseCSV(text)

    // If delete all data is selected, clear all data arrays before import
    if (deleteAllData.value) {
      store.activeAccount.actuals = []
      store.activeAccount.positions = []
      store.activeAccount.sells = []
    }
    
    // Get broker map for type categorization
    const brokerMap = store.getBrokerageMap(meta.headers.toString())
    
    // Step 2: Process data rows and assign to actuals array by week
    // Returns arrays of transactions, positions, and sells for further processing
    const { transactionsImport, positionsImport, sellsImport, processDataResults } = 
      _processData(dataRows, brokerMap)
    
    // Step 3: Process transactions into account transactions array
    const transactionResults = _processTransactions(transactionsImport)

    // Step 4: Process positions data
    const positionsResults = _processPositions(positionsImport)

    // Step 5: Process sell data if any
    const sellResults = _processSellData(sellsImport)
    
    // Combine all results for display
    const results = {
      totalProcessed: processDataResults.rowsProcessed, // Add proper property name
      weeksProcessed: processDataResults.weeksProcessed,
      weeksUpdated: processDataResults.weeksUpdated,
      weeksChanged: processDataResults.weeksChanged,
      transfersDeleted: transactionResults.transactionsDeleted, // Map to template expected property
      transfersAdded: transactionResults.transactionsAdded, // Map to template expected property
      errors: errors,
      skippedRows: errors.length
    }
    
    // After processing the import, recalculate any weeks that need it
    const recalculationResults = calculateWeeklyTotals()
    results.recalculation = recalculationResults
    
    return results
  } catch (error) {
    console.error('Import transaction error:', error)
    throw error
  }
}

// Helper function to parse financial values from string
function _parseAmount(amountStr, defaultValue = 0) {
  if (!amountStr || amountStr.length === 0) {
    return defaultValue
  }
  
  // Check if the value is in parentheses (negative)
  const isNegative = amountStr.includes('(') && amountStr.includes(')')
  
  // Remove all non-numeric characters except decimal point and minus sign
  amountStr = amountStr.replace(/[^\d.-]/g, '')
  
  // Apply negative sign if needed (for values in parentheses)
  if (isNegative && !amountStr.startsWith('-')) {
    amountStr = `-${amountStr}`
  }
  
  // Parse to float
  const parsedValue = parseFloat(amountStr)
  if (isNaN(parsedValue)) {
    return defaultValue
  }
  
  // Round to 2 decimal places for financial values
  return Math.round(parsedValue * 100) / 100
}

// CSV parser function
function parseCSV(csvText) {
  // Parse CSV with Papa Parse
  const parseResult = Papa.parse(csvText, {
    skipEmptyLines: true,
    header: false
  })
  const lines = parseResult.data
  if (!lines || lines.length === 0) {
    throw new Error('CSV file appears to be empty')
  }
  const headerRow = lines[0]
  // Detect brokerage format and get column mapping
  const brokerageMap = store.getBrokerageMap(headerRow.toString())
  const columnMap = brokerageMap.columns
  
  // Check that required columns exist
  const requiredColumns = ['date', 'action', 'symbol', 'amount']
  for (const col of requiredColumns) {
    if (columnMap[col] === undefined) {
      throw new Error(`CSV must contain ${requiredColumns.join(', ')} columns`)
    }
  }
  
  // Parse data rows - store all transaction data
  const dataRows = []
  const errors = []
  
  // Start from index 1 to skip the header
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]
    if (!values || values.length === 0) continue

    // Parse date and amount but don't skip any transaction types yet
    let transactionDate
    
    // Parse date
    try {
      const dateStr = values[columnMap.date]
      let dateToUse = dateStr
      
      // Check if the date has the special "as of" format
      if (dateStr && dateStr.includes(' as of ')) {
        dateToUse = dateStr.split(' as of ')[0].trim()
      }
      
      transactionDate = new Date(dateToUse)
      if (isNaN(transactionDate.getTime())) {
        throw new Error('Invalid date')
      }
    } catch (e) {
      errors.push({
        message: `Invalid date format at line ${i+1}: "${values[columnMap.date]}"`,
        line: i+1
      })
      continue
    }

    // Create a data object with all available data
    const actionValue = (values[columnMap.action] || '').trim()
    const amountValue = values[columnMap.amount] ? _parseAmount(values[columnMap.amount]) : 0
    // Skip any action of "journal" with amount 0
    if (actionValue.toLowerCase() === 'journal' && amountValue === 0) continue

    const dataObj = {
      date: transactionDate.toISOString().split('T')[0], // Store as YYYY-MM-DD
      description: values[columnMap.description] || '',
      amount: amountValue,
      action: actionValue,
      symbol: values[columnMap.symbol] || '',
      quantity: values[columnMap.quantity] ? parseInt(values[columnMap.quantity].replace(/,/g, ''), 10) : 0,
      price: values[columnMap.price] ? _parseAmount(values[columnMap.price]) : 0,
      fees: values[columnMap.fees] ? _parseAmount(values[columnMap.fees]) : 0
    }

    // Add to the data array (without filtering)
    dataRows.push(dataObj)
  }
  
  // Add any Papa Parse errors
  if (parseResult.errors && parseResult.errors.length > 0) {
    parseResult.errors.forEach(error => {
      errors.push({
        message: `CSV parsing error: ${error.message} at line ${error.row + 1}`,
        line: error.row + 1
      })
    })
  }
  
  return { 
    dataRows,
    errors, 
    meta: { 
      headers: headerRow, 
      brokerageFormat: brokerageMap.name 
    } 
  }
}

// Process data rows and organize into actuals and identify transactions/positions
function _processData(dataRows, brokerMap) {
  // Variables used for processing
  let rowsProcessed = 0
  let transactionsImport = []
  let positionsImport = []
  let sellsImport = []
  let smallestWeek = Infinity
  let weeksChanged = []
  
  // Get the account start date
  const startDate = new Date(store.activeAccount.settings.startDate)
  
  // Create a mapping of transactions by week
  const dataByWeek = {}
  
  // First pass: Group all data rows by their corresponding week
  dataRows.forEach(dataRow => {
    // Calculate which week this data row belongs to
    const transactionDate = new Date(dataRow.date)
    const diffTime = transactionDate - startDate
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    // Skip rows before the start date
    if (diffDays < 0) return
    
    const week = Math.floor(diffDays / 7) + 1
    
    // Track smallest week for potential discarding
    if (week < smallestWeek) {
      smallestWeek = week
    }
    
    // Initialize the array for this week if it doesn't exist
    if (!dataByWeek[week]) {
      dataByWeek[week] = []
    }
    
    // Add this row to the week's array
    dataByWeek[week].push(dataRow)
    
    // Identify if this is a transaction, position, or sell based on action
    const action = dataRow.action.toLowerCase()
    
    // Categorize based on broker map types
    if (brokerMap.transactionTypes.includes(action)) {
      // Add to transactions import for later processing
      transactionsImport.push({
        ...dataRow,
        week: week
      })
    } else if (brokerMap.positionTypes.includes(action)) {
      // Add to positions import for later processing (only buys)
      positionsImport.push({
        ...dataRow,
        week: week
      })
    } else if (brokerMap.sellTypes && brokerMap.sellTypes.includes(action)) {
      // Add to sells import for later processing (only sells)
      sellsImport.push({
        ...dataRow,
        week: week
      })
    }
    
    rowsProcessed++
  })
  
  // If requested, discard the first week's data
  if (discardFirstWeek.value && smallestWeek !== Infinity) {
    delete dataByWeek[smallestWeek]
    // Adjust the processed count
    if (dataByWeek[smallestWeek]) {
      rowsProcessed -= dataByWeek[smallestWeek].length
    }
  }

  // Always discard the current week (in progress) from actuals, not from imported data
  const today = new Date()
  const startDateObj = new Date(store.activeAccount.settings.startDate)
  const diffTime = today - startDateObj
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  const currentWeek = Math.floor(diffDays / 7) + 1
  store.activeAccount.actuals = store.activeAccount.actuals.filter(a => parseInt(a.week) !== currentWeek)

  // Process each week's data into the actuals array
  const weeksProcessed = Object.keys(dataByWeek).length

  Object.entries(dataByWeek).forEach(([week, weekData]) => {
    const weekNumber = parseInt(week)
    
    // Find existing entry for this week
    const existingEntry = store.activeAccount.actuals.find(a => parseInt(a.week) === weekNumber)
    
    if (!existingEntry) {
      // Create new entry with data array and hash
      store.activeAccount.actuals.push({
        week: weekNumber,
        growth: 0,
        data: [...weekData]
      })
      
      weeksChanged.push(weekNumber)
    }
  })

  return {
    transactionsImport,
    positionsImport,
    sellsImport,
    processDataResults: {
      rowsProcessed,
      weeksProcessed,
      weeksUpdated: weeksChanged.length,
      weeksChanged
    }
  }
}

function _processTransactions(transactionsImport) {
  let transactionsAdded = 0
  let transactionsDeleted = 0
  
  // Get the account start date
  const startDate = new Date(store.activeAccount.settings.startDate)
  
  // Delete existing transactions if requested (for deposits/withdrawals)
  if (deleteAllData.value) {
    if (store.activeAccount.transactions && store.activeAccount.transactions.length) {
      // Calculate the current week based on today's date
      const today = new Date()
      const diffTime = today - startDate
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      const currentWeek = Math.floor(diffDays / 7) + 1
      
      // Count transactions to be deleted (those at or before current week)
      const transactionsToDelete = store.activeAccount.transactions.filter(t => 
        t.startWeek <= currentWeek
      )
      
      transactionsDeleted = transactionsToDelete.length
      
      // Filter out transactions for weeks at or before the current week
      store.activeAccount.transactions = store.activeAccount.transactions.filter(t => 
        t.startWeek > currentWeek
      )
    }
  }
  
  // Process each transaction
  transactionsImport.forEach(transaction => {
    // Create a proper transaction object
    const week = transaction.week
    
    // Determine if it's a deposit or withdrawal based on amount
    const isDeposit = transaction.amount >= 0
    const transactionObject = {
      category: isDeposit ? '' : 'Income',
      amount: Math.abs(transaction.amount),
      type: isDeposit ? 'deposit' : 'withdrawal',
      description: transaction.description,
      startWeek: parseInt(week),
      endWeek: parseInt(week)
    }
    
    // Check if a matching transaction already exists
    const existingTransaction = store.activeAccount.transactions.find(t => 
      t.type === transactionObject.type && 
      t.startWeek === week && 
      (t.endWeek === week || t.endWeek == "") && 
      t.amount === transactionObject.amount
    )
    
    // Only add if no matching transaction exists
    if (!existingTransaction) {
      store.activeAccount.transactions.push(transactionObject)
      transactionsAdded++
    }
  })
  
  return {
    transactionsProcessed: transactionsImport.length,
    transactionsAdded,
    transactionsDeleted
  }
}

function _processPositions(positionsImport) {
  if (!Array.isArray(positionsImport) || positionsImport.length === 0) return
  if (!store.activeAccount.positions) store.activeAccount.positions = []

  positionsImport.forEach(data => {
    // Build the position object
    const position = {
      positionKey: '',
      startWeek: null,
      date: data.date,
      costBasis: Math.abs(data.amount),
      offsettingProfits: 0,
      shares: data.quantity,
      assignedWeek: data.week,
      soldShares: 0,
      sellAmount: 0,
      soldWeek: null,
      symbol: data.symbol,
      currentPrice: 0
    }
    position.currentPrice = (Number(position.costBasis / data.quantity) * 100) / 100

    // Add the position to the account's positions array
    position.positionKey = store.getPositionKey(position, 'buy')

    // Check if this positionKey already exists
    const exists = store.activeAccount.positions.some(p => p.positionKey === position.positionKey)
    if (exists) return

    // Add the position to the active account's positions
    store.activeAccount.positions.push(position)
  })

  // After adding all positions, sort by assignedWeek
  store.activeAccount.positions.sort((a, b) => a.assignedWeek - b.assignedWeek)

  // Trigger the store to recalculate positions
  store.recalculateAllOffsettingProfits()
}

// Stub for processing sell data
function _processSellData(sellsImport) {
  if (!Array.isArray(sellsImport) || sellsImport.length === 0) return
  if (!store.activeAccount.sells) store.activeAccount.sells = []
  if (!store.activeAccount.positions) store.activeAccount.positions = []

  // Step 1: Add new sells to the account's sells array
  sellsImport.forEach(data => {
    const sell = {
      positionKey: '',
      week: data.week,
      date: data.date,
      amount: Math.abs(data.amount),
      shares: data.quantity,
      symbol: data.symbol,
      allocated: []
    }
    sell.positionKey = store.getPositionKey(sell, 'sell')
    // Check if this sell already exists
    const exists = store.activeAccount.sells.some(s => s.positionKey === sell.positionKey)
    if (exists) return
    store.activeAccount.sells.push(sell)
  })

  // Step 2: Allocate sells to open positions (FIFO)
  store.activeAccount.sells.forEach(sell => {
    if (sell.allocated && sell.allocated.length > 0) return // Already allocated
    let sharesToAllocate = sell.shares
    // Find open positions for this symbol, FIFO order (by date, then by startWeek)
    const openPositions = store.activeAccount.positions
      .filter(pos => pos.symbol === sell.symbol && (pos.soldShares || 0) < pos.shares)
      .sort((a, b) => {
        // FIFO: by date, then by startWeek
        if (a.date < b.date) return -1
        if (a.date > b.date) return 1
        return a.startWeek - b.startWeek
      })
    for (const pos of openPositions) {
      // Ensure soldShares is initialized
      if (typeof pos.soldShares !== 'number') pos.soldShares = 0
      const available = pos.shares - pos.soldShares
      if (available <= 0) continue
      const allocateQty = Math.min(available, sharesToAllocate)
      // Record allocation
      sell.allocated.push({
        positionKey: pos.positionKey,
        shares: allocateQty,
        buyWeek: pos.startWeek,
        sellWeek: sell.week
      })
      pos.soldShares += allocateQty
      // If all shares sold, set soldWeek and accumulate sellAmount
      if (pos.soldShares === pos.shares) {
        pos.soldWeek = sell.week
        if (!pos.sellAmount) pos.sellAmount = 0
        pos.sellAmount += sell.amount
        // Backfill currentPrice as sellAmount / soldShares rounded to 3 decimals
        if (pos.soldShares > 0) {
          pos.currentPrice = Math.round((pos.sellAmount / pos.soldShares) * 1000) / 1000
        }
      }
      sharesToAllocate -= allocateQty
      if (sharesToAllocate <= 0) break
    }
    // If not all shares could be allocated, leave the remainder unallocated
  })
}

// Function to recalculate week totals for actuals that need it
function calculateWeeklyTotals() {
  if (!store.activeAccount || !store.activeAccount.actuals) {
    return { weeksProcessed: 0, weeksUpdated: 0 }
  }

  // Get the brokerage map for the current account
  const brokerMap = store.getBrokerageMap()

  // Find weeks that need recalculation
  const weeksToRecalculate = store.activeAccount.actuals
    .filter(actual => (!actual.amount || actual.amount === 0) && actual.data.length > 0)
    .sort((a, b) => a.week - b.week)

  if (weeksToRecalculate.length === 0) {
    // No weeks need recalculation
    return { weeksProcessed: 0, weeksUpdated: 0 }
  }

  let weeksUpdated = 0
  // Process each week that needs recalculation
  weeksToRecalculate.forEach(actual => {
    // Use the calculation function to get new values
    const total = _calculateWeekTotal(actual.data || [], brokerMap)
    
    // Update the week's growth value if changed
    if (Number(actual.growth) !== total) {
      actual.growth = total
      weeksUpdated++
    }
  })
  
  return {
    weeksProcessed: weeksToRecalculate.length,
    weeksUpdated
  }
}

// Isolated function to calculate weekly total from transactions
function _calculateWeekTotal(weekData, brokerMap) {
  // Use broker map to identify types that contribute to weekly total
  const weeklyTotalTypes = brokerMap.weeklyTotalTypes
  let total = 0
  if (!weekData || !weekData.length) {
    return 0
  }
  weekData.forEach(dataRow => {
    const action = dataRow.action.toLowerCase()
    if (weeklyTotalTypes.includes(action)) {
      total += dataRow.amount
    }
  })
  // Round the final amount to 2 decimal places
  return Math.round(total * 100) / 100
}

// Migration: Move notes from actuals to a separate notes array
function migrateNotesToArray() {
  const account = store.activeAccount
  if (!account || !Array.isArray(account.actuals) || account.actuals.length === 0) return
  // Only run if the first actual has a 'notes' attribute
  if (!('notes' in account.actuals[0])) return

  if (!Array.isArray(account.notes)) account.notes = []

  account.actuals.forEach(actual => {
    if (actual.notes && typeof actual.notes === 'string' && actual.notes.trim() !== '') {
      // Calculate week start date
      const startDate = new Date(account.settings.startDate)
      startDate.setDate(startDate.getDate() + (Number(actual.week) - 1) * 7)
      const isoDate = startDate.toISOString().split('T')[0]
      account.notes.push({
        week: Number(actual.week),
        date: isoDate,
        note: actual.notes
      })
    }
    // Remove the notes attribute from actual
    delete actual.notes
  })
}

// Expose the show method to the app store
store.showImportTransactionsModal = show
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': isVisible }" v-show="isVisible">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Import Transactions</h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <!-- File selection area -->
          <div v-if="!importResults">
            <div class="mb-3">
              <label for="csvFile" class="form-label">Select CSV file to import</label>
              <input 
                class="form-control" 
                type="file" 
                id="csvFile" 
                accept=".csv" 
                @change="handleFileChange"
                :class="{ 'is-invalid': hasError }"
              >
              <div class="invalid-feedback" v-if="hasError">{{ errorMessage }}</div>
              
              <div class="form-text">
                CSV file should contain transaction data with date, description, and amount columns.
              </div>
            </div>
            
            <!-- Discard first week option -->
            <div class="form-check mb-3">
              <input 
                class="form-check-input" 
                type="checkbox" 
                id="discardFirstWeekOption" 
                v-model="discardFirstWeek"
              >
              <label class="form-check-label" for="discardFirstWeekOption">
                Discard first week of data
              </label>
              <div class="form-text">
                When importing 'Last 6 Months' or similar, discard the first week as it may not be a full week of data
              </div>
            </div>

            <!-- Delete all data option -->
            <div class="form-check mb-3">
              <input 
                class="form-check-input" 
                type="checkbox" 
                id="deleteAllDataOption" 
                v-model="deleteAllData"
              >
              <label class="form-check-label" for="deleteAllDataOption">
                Delete all data before import
              </label>
              <div class="form-text">
                When checked, all transactions, positions, and weekly transaction data will be deleted before importing new data.
              </div>
            </div>
            
            <!-- Processing indicator -->
            <div class="text-center my-3" v-if="isProcessing">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Processing...</span>
              </div>
              <p class="mt-2">Processing your transactions...</p>
            </div>
          </div>
          
          <!-- Import results summary -->
          <div v-if="importResults" class="import-results">
            <div class="alert alert-success">
              <h5>Import Completed Successfully</h5>
              <p>{{ importResults.totalProcessed }} transactions processed</p>
              <p>{{ importResults.weeksUpdated }} of {{ importResults.weeksProcessed }} weeks updated</p>
              <p v-if="importResults.transfersDeleted">{{ importResults.transfersDeleted }} transactions deleted</p>
              <p>{{ importResults.transfersAdded }} deposit/withdrawal transactions added</p>
              <p v-if="importResults.skippedRows">{{ importResults.skippedRows }} rows skipped due to errors</p>
              <!-- Add recalculation results if available -->
              <p v-if="importResults.recalculation?.weeksProcessed">
                {{ importResults.recalculation.weeksUpdated }} of {{ importResults.recalculation.weeksProcessed }} weeks recalculated
              </p>
              <!-- Warning about missing data if applicable -->
              <p v-if="importResults.recalculation?.weeksWithoutData" class="text-warning">
                Warning: Weeks {{ importResults.recalculation.weeksWithoutData.join(', ') }} have no transaction data
              </p>
            </div>

            <!-- Only show errors section if there are errors -->
            <div v-if="importResults.errors && importResults.errors.length > 0" class="error-results mt-3">
              <h6>Errors:</h6>
              <ul class="list-group">
                <li 
                  v-for="(error, index) in importResults.errors" 
                  :key="index"
                  class="list-group-item list-group-item-warning"
                >
                  Line {{ error.line }}: {{ error.message }}
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button 
            type="button" 
            class="btn btn-secondary" 
            @click="close"
          >
            {{ importResults ? 'Close' : 'Cancel' }}
          </button>
          <button 
            v-if="!importResults && !isProcessing" 
            type="button" 
            class="btn btn-primary"
            @click="processImport" 
            :disabled="!csvFile || isProcessing"
          >
            Import Transactions
          </button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>

</template>
<style scoped>
.weekly-results {
  max-height: 300px;
  overflow-y: auto;
  margin-top: 20px;
}

.error-results {
  max-height: 200px;
  overflow-y: auto;
  margin-top: 20px;
}
</style>
