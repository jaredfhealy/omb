<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import Papa from 'papaparse'

const store = useAppStore()
const isVisible = ref(false)
const importMode = ref('transactions')
const transactionCsvFile = ref(null)
const positionsCsvFile = ref(null)
const isProcessingTransactions = ref(false)
const isProcessingPositions = ref(false)
const transactionImportResults = ref(null)
const positionsImportResults = ref(null)
const transactionError = ref('')
const positionsError = ref('')
const discardFirstWeek = ref(true) // Default to true for this option
const deleteAllData = ref(false) // Default to false for this option
const refreshPendingAfterClose = ref(false)
const selectedImportAccountId = ref(null)
const importTargetAccount = ref(null)

// Modal control methods
const show = () => {
  migrateNotesToArray() // Trigger migration when modal is displayed
  isVisible.value = true
  resetForm()
  const preferredId = Number(store.activeAccount?.id)
  selectedImportAccountId.value = Number.isFinite(preferredId)
    ? preferredId
    : Number(store.db.accounts?.[0]?.id || null)
}

const close = () => {
  isVisible.value = false
  const shouldRefresh = refreshPendingAfterClose.value
  refreshPendingAfterClose.value = false
  resetForm()
  if (shouldRefresh) {
    window.setTimeout(() => {
      window.location.reload()
    }, 100)
  }
}

const resetForm = () => {
  importMode.value = 'transactions'
  transactionCsvFile.value = null
  positionsCsvFile.value = null
  isProcessingTransactions.value = false
  isProcessingPositions.value = false
  transactionImportResults.value = null
  positionsImportResults.value = null
  transactionError.value = ''
  positionsError.value = ''
  discardFirstWeek.value = true // Reset to default
  deleteAllData.value = false // Reset to default
  importTargetAccount.value = null
  
  // Reset the file input element to clear the selected file
  const transactionFileInput = document.querySelector('#transactionsCsvFile')
  if (transactionFileInput) {
    transactionFileInput.value = ''
  }
  const positionsFileInput = document.querySelector('#positionsCsvFile')
  if (positionsFileInput) {
    positionsFileInput.value = ''
  }
}

function getSelectedImportAccount() {
  const targetId = Number(selectedImportAccountId.value)
  const account = store.db.accounts.find(a => Number(a.id) === targetId)
  return account || null
}

function getWorkingAccount() {
  return importTargetAccount.value || store.activeAccount
}

function getExecutionOrderedRows(dataRows) {
  if (!Array.isArray(dataRows) || dataRows.length === 0) return []

  const firstDate = new Date(dataRows[0].date).getTime()
  const lastDate = new Date(dataRows[dataRows.length - 1].date).getTime()
  const sourceIsDescendingByDate = Number.isFinite(firstDate) && Number.isFinite(lastDate) && firstDate > lastDate

  const ordered = dataRows
    .slice()
    .sort((a, b) => {
      if (a.date < b.date) return -1
      if (a.date > b.date) return 1
      if (sourceIsDescendingByDate) {
        return Number(b.sourceLine || 0) - Number(a.sourceLine || 0)
      }
      return Number(a.sourceLine || 0) - Number(b.sourceLine || 0)
    })
    .map((row, idx) => ({
      ...row,
      executionOrder: idx + 1
    }))

  return ordered
}

const handleTransactionFileChange = (event) => {
  const file = event.target.files[0]
  
  if (file && file.type !== 'text/csv') {
    transactionError.value = 'Please select a valid CSV file'
    transactionCsvFile.value = null
    return
  }
  
  transactionCsvFile.value = file
  transactionError.value = ''
}

const handlePositionsFileChange = (event) => {
  const file = event.target.files[0]

  if (file && file.type !== 'text/csv') {
    positionsError.value = 'Please select a valid CSV file'
    positionsCsvFile.value = null
    return
  }

  positionsCsvFile.value = file
  positionsError.value = ''
}

// Process the CSV file
const processTransactionImport = async () => {
  if (!transactionCsvFile.value) {
    transactionError.value = 'Please select a CSV file first'
    return
  }

  // Get the filename and replace underscores with spaces
  const fileName = transactionCsvFile.value.name.replace(/_/g, ' ')
  const targetAccount = getSelectedImportAccount()
  if (!targetAccount) {
    transactionError.value = 'Please select an account for this import'
    return
  }
  const accountName = targetAccount.name.trim()
  // Check if the filename starts with the account name (case-insensitive)
  let confirmMessage = `Import transactions into "${targetAccount.name}"?`
  if (!fileName.toLowerCase().startsWith(accountName.toLowerCase())) {
    confirmMessage = `WARNING: The file ("${fileName}") does not appear to match import target account ("${accountName}"). Continue importing anyway?`
  }

  store.confirm(
    confirmMessage,
    async () => {
      // User confirmed, proceed with import
      isProcessingTransactions.value = true
      
      try {
        importTargetAccount.value = targetAccount
        // Store the file before clearing the input
        const fileToProcess = transactionCsvFile.value
        
        // Call the local function to handle the actual import
        const results = await importTransactionsFromCSV(fileToProcess, targetAccount)
        transactionImportResults.value = results
        transactionError.value = ''
        
        // Persist imported state first, then refresh projections from saved state
        await store.saveChangesAndRecalculate()
        refreshPendingAfterClose.value = true
      } catch (error) {
        transactionError.value = error.message || 'An error occurred during import'
        console.error('Import error:', error)
      } finally {
        importTargetAccount.value = null
        isProcessingTransactions.value = false
      }
    },
    () => { close() }
  )
}

// CSV import function - moved from store
async function importTransactionsFromCSV(file, targetAccount) {
  // Ensure we have an account to import to
  if (!targetAccount) {
    throw new Error('No import target account found')
  }
  
  try {
    // Step 1: Parse CSV file and extract structured data
    const text = await file.text()
    const { dataRows, errors, meta } = parseCSV(text)
    const preservedPositionMeta = Array.isArray(targetAccount.positionMeta)
      ? [...targetAccount.positionMeta]
      : []

    // If delete all data is selected, clear all data arrays before import
    if (deleteAllData.value) {
      targetAccount.actuals = []
      targetAccount.positions = []
      targetAccount.sells = []
      targetAccount.positionMeta = preservedPositionMeta
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
    const positionsResults = _processPositions(positionsImport, sellsImport)

    // Step 5: Process sell data if any
    const sellResults = _processSellData(sellsImport)

    // Final metadata pass: reapply persisted overrides after all lots and allocations settle.
    // This ensures delete+reimport keeps user-edited position fields.
    store.applyPositionMetadataForAccount(targetAccount)
    
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

const processPositionsImport = async () => {
  if (!positionsCsvFile.value) {
    positionsError.value = 'Please select a Positions CSV file first'
    return
  }

  const targetAccount = getSelectedImportAccount()
  if (!targetAccount) {
    positionsError.value = 'Please select an account for this import'
    return
  }

  const fileName = positionsCsvFile.value.name.replace(/_/g, ' ')
  const accountName = targetAccount.name.trim()
  let confirmMessage = `Update current position pricing for "${targetAccount.name}" from this Schwab positions export?`
  if (!fileName.toLowerCase().startsWith(accountName.toLowerCase())) {
    confirmMessage = `WARNING: The file you selected ("${fileName}") does not appear to match import target account ("${accountName}"). Continue importing current positions anyway?`
  }

  store.confirm(
    confirmMessage,
    async () => {
      isProcessingPositions.value = true

      try {
        importTargetAccount.value = targetAccount
        const results = await importCurrentPositionsFromCSV(positionsCsvFile.value, targetAccount)
        positionsImportResults.value = results
        positionsError.value = ''
        await store.saveChangesAndRecalculate()
        refreshPendingAfterClose.value = true
      } catch (error) {
        positionsError.value = error.message || 'An error occurred during positions import'
        console.error('Positions import error:', error)
      } finally {
        importTargetAccount.value = null
        isProcessingPositions.value = false
      }
    }
  )
}

async function importCurrentPositionsFromCSV(file, targetAccount) {
  if (!targetAccount) {
    throw new Error('No import target account found')
  }

  const text = await file.text()
  const rows = Papa.parse(text, { header: false, skipEmptyLines: true }).data || []
  const { positionsRows, summaryRows } = parsePositionsRows(rows)
  if (!positionsRows.length) {
    throw new Error('No position rows found. Confirm this is a Schwab Positions export CSV.')
  }

  const accountPositions = targetAccount.positions || []
  const equityPriceBySymbol = new Map()
  const snapshot = {
    asOf: new Date().toISOString(),
    source: 'schwab-positions-csv',
    totals: {
      positionsTotal: null,
      cashAndCashInvestments: null,
      equitiesMarketValue: 0,
      optionsMarketValue: 0
    }
  }

  positionsRows.forEach((row) => {
    const marketValue = _parseAmount(row.marketValue, 0)
    const assetType = (row.assetType || '').toLowerCase()
    const quantity = Number(String(row.quantity || '').replace(/,/g, ''))
    const price = _parseAmount(row.price, 0)

    if (assetType === 'equity' && row.symbol && quantity > 0 && price > 0) {
      equityPriceBySymbol.set(row.symbol, price)
      snapshot.totals.equitiesMarketValue += marketValue
    } else if (assetType.includes('option')) {
      snapshot.totals.optionsMarketValue += marketValue
    } else if (assetType.includes('cash')) {
      snapshot.totals.cashAndCashInvestments = marketValue
    }
  })

  summaryRows.forEach((row) => {
    if ((row.symbol || '').toLowerCase() === 'positions total') {
      snapshot.totals.positionsTotal = _parseAmount(row.marketValue, 0)
    }
  })

  let lotsUpdated = 0
  let symbolsUpdated = 0
  const matchedSymbols = new Set()
  accountPositions.forEach((position) => {
    if (!position?.symbol) return
    const price = equityPriceBySymbol.get(position.symbol)
    if (typeof price !== 'number') return

    position.currentPrice = Math.round(price * 1000) / 1000
    lotsUpdated++
    matchedSymbols.add(position.symbol)
  })
  symbolsUpdated = matchedSymbols.size

  targetAccount.brokerageSnapshot = snapshot

  return {
    rowsProcessed: positionsRows.length,
    symbolsInFile: equityPriceBySymbol.size,
    symbolsUpdated,
    lotsUpdated,
    unmatchedSymbols: [...equityPriceBySymbol.keys()].filter(symbol => !matchedSymbols.has(symbol)),
    snapshot
  }
}

function parsePositionsRows(rows) {
  const headerIndex = rows.findIndex((row) => String(row?.[0] || '').trim() === 'Symbol')
  if (headerIndex === -1) {
    throw new Error('Could not find Schwab positions CSV header row')
  }

  const headers = rows[headerIndex].map((h) => String(h || '').trim())
  const rowsAfterHeader = rows.slice(headerIndex + 1)

  const normalizedRows = rowsAfterHeader
    .map((cells) => headers.reduce((obj, header, idx) => {
      obj[header] = String(cells[idx] || '').trim()
      return obj
    }, {}))
    .filter((row) => row.Symbol && row.Symbol.length > 0)

  const positionsRows = normalizedRows
    .filter((row) => row.Symbol.toLowerCase() !== 'positions total')
    .map((row) => ({
      symbol: row.Symbol,
      quantity: row['Qty (Quantity)'],
      price: row.Price,
      marketValue: row['Mkt Val (Market Value)'],
      assetType: row['Asset Type']
    }))

  const summaryRows = normalizedRows
    .filter((row) => row.Symbol.toLowerCase() === 'positions total')
    .map((row) => ({
      symbol: row.Symbol,
      marketValue: row['Mkt Val (Market Value)']
    }))

  return {
    positionsRows,
    summaryRows
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
      
      // If present, use the "as of" date as the effective trade date
      if (dateStr && dateStr.includes(' as of ')) {
        dateToUse = dateStr.split(' as of ')[1].trim()
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
      sourceLine: i,
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
  const account = getWorkingAccount()
  if (!account) {
    throw new Error('No account available while processing import data')
  }
  // Variables used for processing
  let rowsProcessed = 0
  let transactionsImport = []
  let positionsImport = []
  let sellsImport = []
  let smallestWeek = Infinity
  let weeksChanged = []
  
  // Get the account start date
  const startDate = new Date(account.settings.startDate)
  
  // Create a mapping of transactions by week
  const dataByWeek = {}
  
  const orderedRows = getExecutionOrderedRows(dataRows)

  // First pass: Group all data rows by their corresponding week
  orderedRows.forEach(dataRow => {
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
        executionOrder: dataRow.executionOrder,
        week: week
      })
    } else if (brokerMap.positionTypes.includes(action)) {
      // Add to positions import for later processing (only buys)
      positionsImport.push({
        ...dataRow,
        executionOrder: dataRow.executionOrder,
        week: week
      })
    } else if (brokerMap.sellTypes && brokerMap.sellTypes.includes(action)) {
      // Add to sells import for later processing (only sells)
      sellsImport.push({
        ...dataRow,
        action,
        executionOrder: dataRow.executionOrder,
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
  const startDateObj = new Date(account.settings.startDate)
  const diffTime = today - startDateObj
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  const currentWeek = Math.floor(diffDays / 7) + 1
  account.actuals = account.actuals.filter(a => parseInt(a.week) !== currentWeek)

  // Process each week's data into the actuals array
  const weeksProcessed = Object.keys(dataByWeek).length

  Object.entries(dataByWeek).forEach(([week, weekData]) => {
    const weekNumber = parseInt(week)
    
    // Find existing entry for this week
    const existingEntry = account.actuals.find(a => parseInt(a.week) === weekNumber)
    
    if (!existingEntry) {
      // Create new entry with data array and hash
      account.actuals.push({
        week: weekNumber,
        growth: 0,
        data: [...weekData]
      })
      
      weeksChanged.push(weekNumber)
      return
    }

    existingEntry.data = [...weekData]
    existingEntry.growth = 0
    weeksChanged.push(weekNumber)
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
  const account = getWorkingAccount()
  if (!account) {
    throw new Error('No account available while processing transactions')
  }
  let transactionsAdded = 0
  let transactionsDeleted = 0
  
  // Get the account start date
  const startDate = new Date(account.settings.startDate)
  
  // Delete existing transactions if requested (for deposits/withdrawals)
  if (deleteAllData.value) {
    if (account.transactions && account.transactions.length) {
      // Calculate the current week based on today's date
      const today = new Date()
      const diffTime = today - startDate
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      const currentWeek = Math.floor(diffDays / 7) + 1
      
      // Count transactions to be deleted (those at or before current week)
      const transactionsToDelete = account.transactions.filter(t => 
        t.startWeek <= currentWeek
      )
      
      transactionsDeleted = transactionsToDelete.length
      
      // Filter out transactions for weeks at or before the current week
      account.transactions = account.transactions.filter(t => 
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
    const existingTransaction = account.transactions.find(t => 
      t.type === transactionObject.type && 
      t.startWeek === week && 
      (t.endWeek === week || t.endWeek == "") && 
      t.amount === transactionObject.amount
    )
    
    // Only add if no matching transaction exists
    if (!existingTransaction) {
      account.transactions.push(transactionObject)
      transactionsAdded++
    }
  })
  
  return {
    transactionsProcessed: transactionsImport.length,
    transactionsAdded,
    transactionsDeleted
  }
}

function _processPositions(positionsImport, sellsImport = []) {
  const account = getWorkingAccount()
  if (!account) {
    throw new Error('No account available while processing positions')
  }
  if (!Array.isArray(positionsImport) || positionsImport.length === 0) return
  if (!account.positions) account.positions = []
  if (!account.sells) account.sells = []

  const shortSells = (Array.isArray(sellsImport) ? sellsImport : [])
    .filter(sell => (sell.action || '').toString().toLowerCase().includes('short'))
    .sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week
      if (a.date < b.date) return -1
      if (a.date > b.date) return 1
      return (a.executionOrder || 0) - (b.executionOrder || 0)
    })

  shortSells.forEach((sell) => {
    const shortPosition = {
      positionKey: '',
      startWeek: sell.week,
      date: sell.date,
      executionOrder: sell.executionOrder,
      costBasis: -Math.abs(sell.amount),
      offsettingProfits: 0,
      shares: Number(sell.quantity || 0),
      assignedWeek: sell.week,
      soldShares: 0,
      sellAmount: 0,
      soldWeek: null,
      symbol: sell.symbol,
      currentPrice: Number(sell.price || 0),
      profitAllocation: 100,
      manual: false,
      positionType: 'short'
    }
    shortPosition.positionKey = `${store.getPositionKey(shortPosition, 'short')}_${sell.executionOrder}`
    store.ensurePositionMetaKey(shortPosition)
    store.applyPositionMetaToPosition(account, shortPosition)
    const exists = account.positions.some(p => p.positionKey === shortPosition.positionKey)
    if (!exists) {
      account.positions.push(shortPosition)
    }

    const shortSellRecord = {
      positionKey: `${store.getPositionKey(sell, 'sellshort')}_${sell.executionOrder}`,
      week: sell.week,
      date: sell.date,
      action: (sell.action || '').toString().toLowerCase(),
      amount: Math.abs(sell.amount),
      shares: Number(sell.quantity || 0),
      symbol: sell.symbol,
      executionOrder: sell.executionOrder,
      remainingShares: Number(sell.quantity || 0),
      shortPositionKey: shortPosition.positionKey,
      allocated: []
    }
    const sellExists = account.sells.some(s => s.positionKey === shortSellRecord.positionKey)
    if (!sellExists) {
      account.sells.push(shortSellRecord)
    }
  })

  positionsImport
    .slice()
    .sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week
      if (a.date < b.date) return -1
      if (a.date > b.date) return 1
      return (a.executionOrder || 0) - (b.executionOrder || 0)
    })
    .forEach(data => {
    let sharesRemaining = Number(data.quantity || 0)
    if (sharesRemaining <= 0) return

    const buyAmount = Math.abs(Number(data.amount || 0))

    const openShortSells = account.sells
      .filter(sell =>
        (sell.action || '').includes('short') &&
        sell.symbol === data.symbol &&
        Number(sell.remainingShares || 0) > 0 &&
        Number(sell.week || 0) <= Number(data.week || 0) &&
        Number(sell.executionOrder || 0) < Number(data.executionOrder || 0)
      )
      .sort((a, b) => {
        if (a.week !== b.week) return a.week - b.week
        if (a.date < b.date) return -1
        if (a.date > b.date) return 1
        return (a.executionOrder || 0) - (b.executionOrder || 0)
      })

    for (const shortSell of openShortSells) {
      if (sharesRemaining <= 0) break
      const availableShortShares = Number(shortSell.remainingShares || 0)
      if (availableShortShares <= 0) continue
      const coverQty = Math.min(availableShortShares, sharesRemaining)
      const coverCost = Math.round((buyAmount * (coverQty / Number(data.quantity || 1))) * 1000) / 1000

      shortSell.remainingShares -= coverQty
      shortSell.allocated.push({
        positionKey: shortSell.shortPositionKey,
        shares: coverQty,
        buyWeek: data.week,
        sellWeek: shortSell.week
      })

      const shortPosition = account.positions.find(p => p.positionKey === shortSell.shortPositionKey)
      if (shortPosition) {
        shortPosition.soldShares = Number(shortPosition.soldShares || 0) + coverQty
        shortPosition.sellAmount = Number(shortPosition.sellAmount || 0) + coverCost
        if (shortPosition.soldShares > 0) {
          shortPosition.currentPrice = Math.round((shortPosition.sellAmount / shortPosition.soldShares) * 1000) / 1000
        }
        if (shortPosition.soldShares >= Number(shortPosition.shares || 0)) {
          shortPosition.soldWeek = data.week
        }
      }

      sharesRemaining -= coverQty
    }

    if (sharesRemaining <= 0) return

    const remainingCostBasis = Math.round((buyAmount * (sharesRemaining / Number(data.quantity || 1))) * 1000) / 1000
    // Build the position object
    const position = {
      positionKey: '',
      startWeek: null,
      date: data.date,
      executionOrder: data.executionOrder,
      costBasis: remainingCostBasis,
      offsettingProfits: 0,
      shares: sharesRemaining,
      assignedWeek: data.week,
      soldShares: 0,
      sellAmount: 0,
      soldWeek: null,
      symbol: data.symbol,
      currentPrice: 0,
      profitAllocation: 100
    }
    position.currentPrice = (Number(position.costBasis / sharesRemaining) * 100) / 100

    // Add the position to the account's positions array
    position.positionKey = `${store.getPositionKey(position, 'buy')}_${data.executionOrder}`
    store.ensurePositionMetaKey(position)
    store.applyPositionMetaToPosition(account, position)

    // Check if this positionKey already exists
    const exists = account.positions.some(p => p.positionKey === position.positionKey)
    if (exists) return

    // Add the position to the active account's positions
    account.positions.push(position)
  })

  // After adding all positions, sort by assignedWeek
  account.positions.sort((a, b) => a.assignedWeek - b.assignedWeek)

}

// Stub for processing sell data
function _processSellData(sellsImport) {
  const account = getWorkingAccount()
  if (!account) {
    throw new Error('No account available while processing sells')
  }
  if (!Array.isArray(sellsImport) || sellsImport.length === 0) return
  if (!account.sells) account.sells = []
  if (!account.positions) account.positions = []

  // Step 1: Add new sells to the account's sells array
  sellsImport.forEach(data => {
    if ((data.action || '').toString().toLowerCase().includes('short')) return
    const sell = {
      positionKey: '',
      week: data.week,
      date: data.date,
      action: (data.action || '').toString().toLowerCase(),
      amount: Math.abs(data.amount),
      shares: data.quantity,
      symbol: data.symbol,
      executionOrder: data.executionOrder,
      allocated: []
    }
    sell.positionKey = `${store.getPositionKey(sell, 'sell')}_${data.executionOrder}`
    // Check if this sell already exists
    const exists = account.sells.some(s => s.positionKey === sell.positionKey)
    if (exists) return
    account.sells.push(sell)
  })

  // Step 2: Allocate sells to open positions (FIFO)
  account.sells.forEach(sell => {
    if (sell.allocated && sell.allocated.length > 0) return // Already allocated
    if ((sell.action || '').includes('short')) return // "sell short" opens a short; do not allocate as long-position close
    let sharesToAllocate = sell.shares
    // Find open positions for this symbol, FIFO order (by date, then by startWeek)
    const openPositions = account.positions
      .filter(pos =>
        pos.symbol === sell.symbol &&
        (pos.soldShares || 0) < pos.shares &&
        Number(pos.assignedWeek || 0) <= Number(sell.week || 0)
      )
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
      // Update position's soldShares and sellAmount
      pos.soldShares += allocateQty
      // Allocate proportional sellAmount for this position
      pos.sellAmount += Math.round((sell.amount * (allocateQty / sell.shares)) * 1000) / 1000
      // Backfill currentPrice as sellAmount / soldShares rounded to 3 decimals
      if (pos.soldShares > 0) {
        pos.currentPrice = Math.round((pos.sellAmount / pos.soldShares) * 1000) / 1000
      }
      // If all shares sold, set soldWeek
      if (pos.soldShares === pos.shares) {
        pos.soldWeek = sell.week
      }
      sharesToAllocate -= allocateQty
      if (sharesToAllocate <= 0) break
    }
    // If not all shares could be allocated, create a new position for the remainder
    if (sharesToAllocate > 0) {
      const unallocatedSellAmount = Math.round((sell.amount * (sharesToAllocate / sell.shares)) * 1000) / 1000
      const startDate = account.settings.startDate
      const newPosition = {
        startWeek: sell.week,
        date: startDate,
        executionOrder: sell.executionOrder,
        costBasis: unallocatedSellAmount,
        offsettingProfits: 0,
        shares: sharesToAllocate,
        assignedWeek: 1,
        soldShares: sharesToAllocate,
        sellAmount: unallocatedSellAmount,
        soldWeek: sell.week,
        symbol: sell.symbol,
        currentPrice: Math.round((sell.amount / sell.shares) * 1000) / 1000,
        profitAllocation: 100,
        manual: true // Mark as manual/unallocated
      }
      newPosition.positionKey = store.getPositionKey(newPosition, 'buy')
      store.ensurePositionMetaKey(newPosition)
      store.applyPositionMetaToPosition(account, newPosition)
      account.positions.push(newPosition)
      sell.allocated.push({
        positionKey: newPosition.positionKey,
        shares: sharesToAllocate,
        buyWeek: sell.week,
        sellWeek: sell.week
      })
      console.warn(`Created new unallocated position for ${sharesToAllocate} shares of ${sell.symbol} on week ${sell.week}`)
    }
  })
}

// Function to recalculate week totals for actuals that need it
function calculateWeeklyTotals() {
  const account = getWorkingAccount()
  if (!account || !account.actuals) {
    return { weeksProcessed: 0, weeksUpdated: 0 }
  }

  // Get the brokerage map for the current account
  const brokerMap = store.getBrokerageMap()

  // Find weeks that need recalculation
  const weeksToRecalculate = account.actuals
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
  const account = getWorkingAccount()
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
          <h5 class="modal-title">Import Data</h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label for="importTargetAccount" class="form-label">Import target account</label>
            <select
              id="importTargetAccount"
              class="form-select"
              v-model.number="selectedImportAccountId"
            >
              <option v-for="account in store.db.accounts" :key="account.id" :value="account.id">
                {{ account.name }}
              </option>
            </select>
            <div class="form-text">
              Select which account this CSV import updates. This does not change the selected account used in projections/reports.
            </div>
          </div>

          <ul class="nav nav-tabs import-tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <button
                class="nav-link"
                :class="{ active: importMode === 'transactions' }"
                type="button"
                role="tab"
                :aria-selected="importMode === 'transactions'"
                @click="importMode = 'transactions'"
              >
                Transaction History
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button
                class="nav-link"
                :class="{ active: importMode === 'positions' }"
                type="button"
                role="tab"
                :aria-selected="importMode === 'positions'"
                @click="importMode = 'positions'"
              >
                Current Positions
              </button>
            </li>
          </ul>

          <div class="tab-content import-tab-content">
          <div class="tab-pane fade" :class="{ 'show active': importMode === 'transactions' }" role="tabpanel">
            <div v-if="!transactionImportResults">
              <div class="mb-3">
                <label for="transactionsCsvFile" class="form-label">Select transactions CSV file</label>
                <input 
                  class="form-control" 
                  type="file" 
                  id="transactionsCsvFile" 
                  accept=".csv" 
                  @change="handleTransactionFileChange"
                  :class="{ 'is-invalid': !!transactionError }"
                >
                <div class="invalid-feedback" v-if="transactionError">{{ transactionError }}</div>
                
                <div class="form-text">
                  CSV file should contain transaction data with date, description, and amount columns.
                </div>
              </div>
              
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
              
              <div class="text-center my-3" v-if="isProcessingTransactions">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Processing...</span>
                </div>
                <p class="mt-2">Processing your transactions...</p>
              </div>
            </div>

            <div v-if="transactionImportResults" class="import-results">
              <div class="alert alert-success">
                <h5>Transactions Import Completed</h5>
                <p>{{ transactionImportResults.totalProcessed }} transactions processed</p>
                <p>{{ transactionImportResults.weeksUpdated }} of {{ transactionImportResults.weeksProcessed }} weeks updated</p>
                <p v-if="transactionImportResults.transfersDeleted">{{ transactionImportResults.transfersDeleted }} transactions deleted</p>
                <p>{{ transactionImportResults.transfersAdded }} deposit/withdrawal transactions added</p>
                <p v-if="transactionImportResults.skippedRows">{{ transactionImportResults.skippedRows }} rows skipped due to errors</p>
                <p v-if="transactionImportResults.recalculation?.weeksProcessed">
                  {{ transactionImportResults.recalculation.weeksUpdated }} of {{ transactionImportResults.recalculation.weeksProcessed }} weeks recalculated
                </p>
                <p v-if="transactionImportResults.recalculation?.weeksWithoutData" class="text-warning">
                  Warning: Weeks {{ transactionImportResults.recalculation.weeksWithoutData.join(', ') }} have no transaction data
                </p>
              </div>

              <div v-if="transactionImportResults.errors && transactionImportResults.errors.length > 0" class="error-results mt-3">
                <h6>Errors:</h6>
                <ul class="list-group">
                  <li 
                    v-for="(error, index) in transactionImportResults.errors" 
                    :key="index"
                    class="list-group-item list-group-item-warning"
                  >
                    Line {{ error.line }}: {{ error.message }}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div class="tab-pane fade" :class="{ 'show active': importMode === 'positions' }" role="tabpanel">
            <div v-if="!positionsImportResults">
              <div class="mb-3">
                <label for="positionsCsvFile" class="form-label">Select Schwab positions CSV file</label>
                <input 
                  class="form-control" 
                  type="file" 
                  id="positionsCsvFile" 
                  accept=".csv" 
                  @change="handlePositionsFileChange"
                  :class="{ 'is-invalid': !!positionsError }"
                >
                <div class="invalid-feedback" v-if="positionsError">{{ positionsError }}</div>

                <div class="form-text">
                  Imports current prices from your positions export and updates open lots by symbol. Also stores a brokerage snapshot for reporting.
                </div>
              </div>

              <div class="text-center my-3" v-if="isProcessingPositions">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Processing...</span>
                </div>
                <p class="mt-2">Processing current positions...</p>
              </div>
            </div>

            <div v-if="positionsImportResults" class="import-results">
              <div class="alert alert-success">
                <h5>Current Positions Import Completed</h5>
                <p>{{ positionsImportResults.rowsProcessed }} position rows processed</p>
                <p>{{ positionsImportResults.symbolsUpdated }} symbols updated across {{ positionsImportResults.lotsUpdated }} lots</p>
                <p v-if="positionsImportResults.snapshot?.totals?.positionsTotal !== null">
                  Brokerage Positions Total: {{ store.currency(positionsImportResults.snapshot.totals.positionsTotal) }}
                </p>
                <p v-if="positionsImportResults.unmatchedSymbols?.length" class="text-warning mb-0">
                  Unmatched symbols: {{ positionsImportResults.unmatchedSymbols.join(', ') }}
                </p>
              </div>
            </div>
          </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button 
            type="button" 
            class="btn btn-secondary" 
            @click="close"
          >
            {{ (importMode === 'transactions' && transactionImportResults) || (importMode === 'positions' && positionsImportResults) ? 'Close' : 'Cancel' }}
          </button>
          <button 
            v-if="importMode === 'transactions' && !transactionImportResults && !isProcessingTransactions" 
            type="button" 
            class="btn btn-primary"
            @click="processTransactionImport" 
            :disabled="!transactionCsvFile || isProcessingTransactions || !selectedImportAccountId"
          >
            Import Transactions
          </button>
          <button 
            v-if="importMode === 'positions' && !positionsImportResults && !isProcessingPositions" 
            type="button" 
            class="btn btn-primary"
            @click="processPositionsImport" 
            :disabled="!positionsCsvFile || isProcessingPositions || !selectedImportAccountId"
          >
            Import Current Positions
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

.import-tab-content {
  padding: 1rem;
  border: 1px solid var(--bs-border-color);
  border-top: 0;
  border-radius: 0 0 0.5rem 0.5rem;
}

.import-tabs {
  margin-bottom: 0;
}

.import-tabs .nav-link {
  margin-bottom: -1px;
}

@media (max-width: 767.98px) {
  .import-tab-content {
    padding: 0.75rem;
  }
}
</style>
