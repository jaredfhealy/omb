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

function normalizeSpace(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function toIsoDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function toFixedString(value, decimals = 6) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return (0).toFixed(decimals)
  return parsed.toFixed(decimals)
}

function simpleStableHash(input) {
  const text = String(input || '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  const baseHex = (hash >>> 0).toString(16).padStart(8, '0')
  return `${baseHex}${baseHex}${baseHex}${baseHex}`.slice(0, 32)
}

function createSourceFingerprint(row) {
  const input = [
    toIsoDate(row?.date),
    normalizeSpace(row?.action).toLowerCase(),
    normalizeSpace(row?.symbol).toUpperCase(),
    normalizeSpace(row?.description),
    toFixedString(row?.quantity),
    toFixedString(row?.price),
    toFixedString(row?.amount),
    toFixedString(row?.fees ?? 0),
    Number(row?.executionOrder || 0)
  ].join('|')
  return simpleStableHash(input)
}

function createImportedTransactionId(row) {
  const fingerprint = createSourceFingerprint(row)
  return `tx_${simpleStableHash(`${fingerprint}|${Number(row?.sourceLine || 0)}|${Number(row?.executionOrder || 0)}`)}`
}

function upsertRelPositionTransaction(account, rel) {
  if (!account) return
  if (!Array.isArray(account.relPositionTransactions)) {
    account.relPositionTransactions = []
  }

  const positionKey = String(rel?.positionKey || '')
  const sourceTransactionId = String(rel?.sourceTransactionId || '')
  if (!sourceTransactionId) {
    console.warn('Skipping relPositionTransactions row without sourceTransactionId.', rel)
    return
  }
  const eventKind = String(rel?.eventKind || 'event').toLowerCase()
  const eventWeek = Number(rel?.eventWeek || 0)
  const quantity = Number(rel?.allocatedShares ?? rel?.quantity ?? 0)

  const existing = account.relPositionTransactions.find((row) =>
    String(row?.positionKey || '') === positionKey &&
    String(row?.sourceTransactionId || '') === sourceTransactionId &&
    String(row?.eventKind || '').toLowerCase() === eventKind &&
    Number(row?.eventWeek || 0) === eventWeek &&
    Number(row?.allocatedShares ?? row?.quantity ?? 0) === quantity
  )
  if (existing) return

  const relId = rel?.id || `relpos_${simpleStableHash(`${positionKey}|${sourceTransactionId}|${eventKind}|${eventWeek}|${quantity}`)}`
  account.relPositionTransactions.push({
    id: relId,
    positionKey: rel?.positionKey || null,
    sourceTransactionId,
    eventDate: rel?.eventDate || null,
    eventWeek: Number.isFinite(Number(rel?.eventWeek)) ? Number(rel.eventWeek) : null,
    eventKind: rel?.eventKind || 'event',
    quantity: rel?.quantity === undefined || rel?.quantity === null ? null : Number(rel.quantity),
    allocatedShares: rel?.allocatedShares === undefined || rel?.allocatedShares === null ? null : Number(rel.allocatedShares),
    allocatedAmount: rel?.allocatedAmount === undefined || rel?.allocatedAmount === null ? null : Number(rel.allocatedAmount),
    notes: rel?.notes || null,
    metadata: rel?.metadata || null,
    createdAt: rel?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
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
    const existingImportedTransactions = Array.isArray(targetAccount.importedTransactions)
      ? targetAccount.importedTransactions
      : []
    const previousIdToFingerprint = new Map(
      existingImportedTransactions
        .filter(row => row?.id)
        .map(row => [String(row.id), row.sourceFingerprint || createSourceFingerprint(row)])
    )
    const preservedTrades = Array.isArray(targetAccount.trades)
      ? JSON.parse(JSON.stringify(targetAccount.trades))
      : []
    const preservedRelTradeTransactions = Array.isArray(targetAccount.relTradeTransactions)
      ? JSON.parse(JSON.stringify(targetAccount.relTradeTransactions))
      : []
    const preservedNotes = Array.isArray(targetAccount.notes)
      ? JSON.parse(JSON.stringify(targetAccount.notes))
      : []

    // If delete all data is selected, clear all data arrays before import
    if (deleteAllData.value) {
      targetAccount.importedTransactions = []
      targetAccount.positions = []
      targetAccount.relPositionTransactions = []
      targetAccount.positionMeta = preservedPositionMeta
      targetAccount.trades = preservedTrades
      targetAccount.relTradeTransactions = preservedRelTradeTransactions
      targetAccount.notes = preservedNotes
    }
    
    // Get broker map for type categorization
    const brokerMap = store.getBrokerageMap(meta.headers.toString())
    
    // Step 2: Ingest/import rows and classify for follow-on processors
    const { transactionsImport, positionsImport, sellsImport, processDataResults } = 
      _processData(dataRows, brokerMap)
    
    // Step 3: Process transactions into account transactions array
    const transactionResults = _processTransactions(transactionsImport)

    // Step 4: Process positions data
    const positionsResults = _processPositions(positionsImport, sellsImport)

    // Step 5: Process sell data if any
    const sellResults = _processSellData(sellsImport)
    let unresolvedTradeLinks = 0

    if (deleteAllData.value) {
      const nextFingerprintToId = new Map(
        (Array.isArray(targetAccount.importedTransactions) ? targetAccount.importedTransactions : [])
          .map(row => [row?.sourceFingerprint || createSourceFingerprint(row), row?.id])
          .filter(([fingerprint, id]) => Boolean(fingerprint) && Boolean(id))
      )

      const remapSourceTransactionId = (previousId) => {
        if (!previousId) return { id: null, unresolved: false }
        const oldId = String(previousId)
        const fingerprint = previousIdToFingerprint.get(oldId) || oldId
        const nextId = nextFingerprintToId.get(fingerprint) || null
        if (!nextId) {
          return { id: null, unresolved: true }
        }
        return { id: String(nextId), unresolved: false }
      }

      targetAccount.trades = (Array.isArray(targetAccount.trades) ? targetAccount.trades : []).map(trade => {
        const remap = remapSourceTransactionId(trade?.sourceTransactionId)
        if (remap.unresolved) unresolvedTradeLinks += 1
        return {
          ...trade,
          sourceTransactionId: remap.id
        }
      })

      targetAccount.relTradeTransactions = (Array.isArray(targetAccount.relTradeTransactions) ? targetAccount.relTradeTransactions : []).map(rel => {
        const remap = remapSourceTransactionId(rel?.sourceTransactionId)
        if (remap.unresolved) unresolvedTradeLinks += 1
        return {
          ...rel,
          sourceTransactionId: remap.id
        }
      })

      targetAccount.notes = (Array.isArray(targetAccount.notes) ? targetAccount.notes : []).map(note => {
        if (note?.targetCollection !== 'importedTransactions') return note
        const remap = remapSourceTransactionId(note?.targetId)
        if (remap.unresolved) unresolvedTradeLinks += 1
        return {
          ...note,
          targetId: remap.id
        }
      })

    }

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
      unallocatedPositionsCreated: Number(sellResults?.unallocatedPositionsCreated || 0),
      errors: errors,
      skippedRows: errors.length,
      unresolvedTradeLinks: Number(unresolvedTradeLinks || 0)
    }

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

// Process data rows into imported transaction records and classification buckets
function _processData(dataRows, brokerMap) {
  const account = getWorkingAccount()
  if (!account) {
    throw new Error('No account available while processing import data')
  }
  if (!Array.isArray(account.importedTransactions)) {
    account.importedTransactions = []
  }
  // Variables used for processing
  let rowsProcessed = 0
  let transactionsImport = []
  let positionsImport = []
  let sellsImport = []
  let smallestWeek = Infinity
  const changedWeeks = new Set()
  
  // Get the account start date
  const startDate = new Date(account.settings.startDate)
  
  const orderedRows = getExecutionOrderedRows(dataRows)
  const importedRows = []

  // First pass: derive week + ids/fingerprint and classify each row
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
    
    changedWeeks.add(week)

    const importedRow = {
      sourceLine: Number.isFinite(Number(dataRow.sourceLine)) ? Number(dataRow.sourceLine) : null,
      date: dataRow.date,
      description: dataRow.description || '',
      amount: Number(dataRow.amount || 0),
      action: dataRow.action || '',
      symbol: dataRow.symbol || '',
      quantity: Number(dataRow.quantity || 0),
      price: Number(dataRow.price || 0),
      fees: dataRow.fees === undefined || dataRow.fees === null ? 0 : Number(dataRow.fees || 0),
      executionOrder: Number(dataRow.executionOrder || 0),
      week
    }
    importedRow.sourceFingerprint = createSourceFingerprint(importedRow)
    importedRow.id = createImportedTransactionId(importedRow)
    importedRows.push(importedRow)
    
    // Identify if this is a transaction, position, or sell based on action
    const action = dataRow.action.toLowerCase()
    const normalizedRow = {
      ...dataRow,
      id: importedRow.id,
      sourceFingerprint: importedRow.sourceFingerprint,
      executionOrder: dataRow.executionOrder,
      week
    }
    
    // Categorize based on broker map types
    if (brokerMap.transactionTypes.includes(action)) {
      // Add to transactions import for later processing
      transactionsImport.push(normalizedRow)
    } else if (brokerMap.positionTypes.includes(action)) {
      // Add to positions import for later processing (only buys)
      positionsImport.push(normalizedRow)
    } else if (brokerMap.sellTypes && brokerMap.sellTypes.includes(action)) {
      // Add to sells import for later processing (only sells)
      sellsImport.push({
        ...normalizedRow,
        action,
      })
    }
    
    rowsProcessed++
  })
  
  // If requested, discard the first week's data
  if (discardFirstWeek.value && smallestWeek !== Infinity) {
    changedWeeks.delete(Number(smallestWeek))
    transactionsImport = transactionsImport.filter(row => Number(row?.week) !== Number(smallestWeek))
    positionsImport = positionsImport.filter(row => Number(row?.week) !== Number(smallestWeek))
    sellsImport = sellsImport.filter(row => Number(row?.week) !== Number(smallestWeek))
    for (let i = importedRows.length - 1; i >= 0; i--) {
      if (Number(importedRows[i]?.week) === Number(smallestWeek)) {
        importedRows.splice(i, 1)
      }
    }
  }

  const changedWeekList = Array.from(changedWeeks)
  if (changedWeekList.length) {
    account.importedTransactions = account.importedTransactions.filter(row => {
      const week = Number(row?.week || 0)
      return !changedWeekList.includes(week)
    })
    account.importedTransactions.push(...importedRows)
    account.importedTransactions.sort((a, b) => {
      const weekA = Number(a?.week || 0)
      const weekB = Number(b?.week || 0)
      if (weekA !== weekB) return weekA - weekB
      return Number(a?.executionOrder || 0) - Number(b?.executionOrder || 0)
    })
  }

  return {
    transactionsImport,
    positionsImport,
    sellsImport,
    processDataResults: {
      rowsProcessed,
      weeksProcessed: changedWeekList.length,
      weeksUpdated: changedWeekList.length,
      weeksChanged: changedWeekList
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
      endWeek: parseInt(week),
      sourceTransactionId: transaction.id || null,
      isProjected: false
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
  if (!account.relPositionTransactions) account.relPositionTransactions = []

  const shortSells = (Array.isArray(sellsImport) ? sellsImport : [])
    .filter(sell => (sell.action || '').toString().toLowerCase().includes('short'))
    .sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week
      if (a.date < b.date) return -1
      if (a.date > b.date) return 1
      return (a.executionOrder || 0) - (b.executionOrder || 0)
    })

  const shortSellLots = []
  shortSells.forEach((sell) => {
    const shortPosition = {
      positionKey: '',
      sourceTransactionId: sell.id || null,
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
      id: `${store.getPositionKey(sell, 'sellshort')}_${sell.executionOrder}`,
      sourceTransactionId: sell.id || null,
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
    shortSellLots.push(shortSellRecord)
    upsertRelPositionTransaction(account, {
      positionKey: shortPosition.positionKey,
      sourceTransactionId: sell.id || null,
      eventDate: sell.date,
      eventWeek: sell.week,
      eventKind: 'open',
      quantity: Number(sell.quantity || 0),
      allocatedShares: Number(sell.quantity || 0),
      allocatedAmount: Number(sell.amount || 0)
    })
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

    const openShortSells = shortSellLots
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

      upsertRelPositionTransaction(account, {
        positionKey: shortSell.shortPositionKey,
        sourceTransactionId: data.id || null,
        eventDate: data.date,
        eventWeek: data.week,
        eventKind: 'close',
        quantity: coverQty,
        allocatedShares: coverQty,
        allocatedAmount: -Math.abs(coverCost)
      })

      sharesRemaining -= coverQty
    }

    if (sharesRemaining <= 0) return

    const remainingCostBasis = Math.round((buyAmount * (sharesRemaining / Number(data.quantity || 1))) * 1000) / 1000
    // Build the position object
    const position = {
      positionKey: '',
      sourceTransactionId: data.id || null,
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
    upsertRelPositionTransaction(account, {
      positionKey: position.positionKey,
      sourceTransactionId: data.id || null,
      eventDate: data.date,
      eventWeek: data.week,
      eventKind: 'open',
      quantity: sharesRemaining,
      allocatedShares: sharesRemaining,
      allocatedAmount: -Math.abs(remainingCostBasis)
    })
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
  if (!Array.isArray(sellsImport) || sellsImport.length === 0) {
    return {
      sellsProcessed: 0,
      unallocatedPositionsCreated: 0
    }
  }
  if (!account.positions) account.positions = []
  if (!account.relPositionTransactions) account.relPositionTransactions = []
  let unallocatedPositionsCreated = 0

  const sellsToProcess = sellsImport
    .filter(data => !((data.action || '').toString().toLowerCase().includes('short')))
    .map(data => {
      const sell = {
        sourceTransactionId: data.id || null,
        week: data.week,
        date: data.date,
        action: (data.action || '').toString().toLowerCase(),
        amount: Math.abs(data.amount),
        shares: data.quantity,
        symbol: data.symbol,
        executionOrder: data.executionOrder,
        allocated: []
      }
      return sell
    })
    .sort((a, b) => {
      if (Number(a.week || 0) !== Number(b.week || 0)) return Number(a.week || 0) - Number(b.week || 0)
      if (a.date < b.date) return -1
      if (a.date > b.date) return 1
      return Number(a.executionOrder || 0) - Number(b.executionOrder || 0)
    })

  // Step 1: Process each sell in-order (FIFO allocation)
  sellsToProcess.forEach(sell => {
    const sellSourceId = String(sell.sourceTransactionId || '')
    const hasExistingAllocation = Boolean(
      sellSourceId &&
      account.relPositionTransactions.some((rel) =>
        String(rel?.sourceTransactionId || '') === sellSourceId &&
        String(rel?.eventKind || '').toLowerCase() === 'close'
      )
    )
    if (hasExistingAllocation) return

    if (sell.allocated && sell.allocated.length > 0) return
    if ((sell.action || '').includes('short')) return
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
      const allocatedAmount = Math.round((sell.amount * (allocateQty / sell.shares)) * 1000) / 1000
      // Update position's soldShares and sellAmount
      pos.soldShares += allocateQty
      // Allocate proportional sellAmount for this position
      pos.sellAmount += allocatedAmount
      // Backfill currentPrice as sellAmount / soldShares rounded to 3 decimals
      if (pos.soldShares > 0) {
        pos.currentPrice = Math.round((pos.sellAmount / pos.soldShares) * 1000) / 1000
      }
      // If all shares sold, set soldWeek
      if (pos.soldShares === pos.shares) {
        pos.soldWeek = sell.week
      }
      upsertRelPositionTransaction(account, {
        positionKey: pos.positionKey,
        sourceTransactionId: sell.sourceTransactionId || null,
        eventDate: sell.date,
        eventWeek: sell.week,
        eventKind: 'close',
        quantity: allocateQty,
        allocatedShares: allocateQty,
        allocatedAmount
      })
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
        sourceTransactionId: sell.sourceTransactionId || null,
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
      upsertRelPositionTransaction(account, {
        positionKey: newPosition.positionKey,
        sourceTransactionId: sell.sourceTransactionId || null,
        eventDate: sell.date,
        eventWeek: sell.week,
        eventKind: 'close',
        quantity: sharesToAllocate,
        allocatedShares: sharesToAllocate,
        allocatedAmount: unallocatedSellAmount
      })
      unallocatedPositionsCreated += 1
      console.info(`Created unallocated fallback position for ${sharesToAllocate} shares of ${sell.symbol} on week ${sell.week}`)
    }
  })

  return {
    sellsProcessed: sellsImport.length,
    unallocatedPositionsCreated
  }
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
                  When checked, imported transaction history and derived position/link data are rebuilt. Notes, manual position profit allocations, and trade data are preserved and relinked when possible.
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
                <p v-if="transactionImportResults.unallocatedPositionsCreated" class="mb-1">
                  {{ transactionImportResults.unallocatedPositionsCreated }} unallocated fallback position(s) were created while matching sells.
                </p>
                <p v-if="transactionImportResults.skippedRows">{{ transactionImportResults.skippedRows }} rows skipped due to errors</p>
                <p v-if="transactionImportResults.unresolvedTradeLinks" class="text-warning mb-0">
                  Warning: {{ transactionImportResults.unresolvedTradeLinks }} preserved trade/note link(s) could not be remapped to imported transactions.
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
