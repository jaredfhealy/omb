<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const isVisible = ref(false)
const csvFile = ref(null)
const isProcessing = ref(false)
const importResults = ref(null)
const hasError = ref(false)
const errorMessage = ref('')
const discardFirstWeek = ref(true) // Default to true for this option
const deleteAndReloadTransactions = ref(false) // Default to false for this option

// Modal control methods
const show = () => {
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
  deleteAndReloadTransactions.value = false // Reset to default
  
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
  
  // Call confirm with both success and cancel callbacks
  store.confirm(
    `Are you sure you want to import transactions into the "${store.activeAccount.name}" account?`,
    // Success callback
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
      } catch (error) {
        hasError.value = true
        errorMessage.value = error.message || 'An error occurred during import'
        console.error('Import error:', error)
      } finally {
        isProcessing.value = false
      }
    },
    // Cancel callback - close the import modal
    () => {
      close();
    }
  );
}

// CSV import function - moved from store
async function importTransactionsFromCSV(file) {
  // Ensure we have an account to import to
  if (!store.activeAccount) {
    throw new Error('No active account found')
  }
  
  try {
    // Parse the CSV file
    const text = await file.text()
    const { data, errors, meta } = parseCSV(text)
    
    // Process the transactions even if there are errors
    const results = processTransactions(data, discardFirstWeek.value)
    
    // Add the errors to the results
    results.errors = errors
    results.skippedRows = errors.length
    
    return results
  } catch (error) {
    console.error('Import transaction error:', error)
    throw error
  }
}

// CSV parser function - moved from store
function parseCSV(csvText) {
  // Simple CSV parser (could use Papa Parse or similar in production)
  const lines = csvText.split('\n')
  const headerRow = lines[0].split(',').map(h => h.replace(/"/g, ''))
  
  // Build a column mapping from the header row
  const columnMap = {
    date: 0,
    action: 1,
    symbol: 2,
    description: 3,
    quantity: 4,
    price: 5,
    fees: 6,
    amount: 7
  }
  
  // Check that required columns exist
  const requiredColumns = ['date', 'symbol', 'description', 'amount']
  for (const col of requiredColumns) {
    if (columnMap[col] === undefined) {
      throw new Error(`CSV must contain ${requiredColumns.join(', ')} columns`)
    }
  }
  
  // Define skip types up here so we can use them during parsing
  const skipTypes = [
    // Specific actions to skip
    'sell', 'expired', 'buy', 'assigned'
  ]
  
  // Parse data rows
  const data = []
  const errors = []
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    
    // For CSV files, only remove enclosing quotes but preserve any quotes within the data
    const values = lines[i].replace(/^"(.*)"$/, '$1').split('","')

    // First check if this is a transaction type we want to skip
    const actionValue = values.length > columnMap.action ? 
      values[columnMap.action].toLowerCase() : ''

    // Skip transactions in skip list
    if (skipTypes.includes(actionValue)) {
      continue;
    }

    // Determine the target system for this entry
    let target = 'actuals' // Default target for regular entries
    
    // Set target to 'transaction' for special handling entries
    if (actionValue === 'moneylink transfer' || actionValue === 'journal') {
      target = 'transaction'
    }
    
    // Common code for parsing date and amount
    let transactionDate, amount;
    
    // Parse date
    try {
      const dateStr = values[columnMap.date];
      let dateToUse = dateStr;
      
      // Check if the date has the special "as of" format
      if (dateStr.includes(' as of ')) {
        dateToUse = dateStr.split(' as of ')[0].trim();
      }
      
      transactionDate = new Date(dateToUse);
      if (isNaN(transactionDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (e) {
      errors.push({
        message: `Invalid date format at line ${i+1}: "${values[columnMap.date]}"`,
        line: i+1
      });
      continue;
    }
    
    // Parse amount
    try {
      let amountStr = values[columnMap.amount];
      const isNegative = amountStr.includes('(') && amountStr.includes(')');
      
      // Remove all non-numeric characters except decimal point AND minus sign
      amountStr = amountStr.replace(/[^\d.-]/g, '');
      
      // Apply negative sign if needed (for values in parentheses)
      if (isNegative && !amountStr.startsWith('-')) {
        amountStr = `-${amountStr}`;
      }
      
      // Skip empty amount fields
      if (amountStr.length === 0) {
        amount = 0;
      } else {
        amount = parseFloat(amountStr);
        if (isNaN(amount)) {
          throw new Error(`Could not parse amount: ${values[columnMap.amount]}`);
        }
        // Round to 2 decimal places for financial values
        amount = Math.round(amount * 100) / 100;
      }
    } catch (e) {
      errors.push({
        message: `Invalid amount format at line ${i+1}: "${values[columnMap.amount]}"`,
        line: i+1
      });
      continue;
    }
    
    // Skip additional validation for transaction-targeted entries
    if (target === 'actuals' && values.length !== headerRow.length) {
      errors.push({ 
        message: `Line ${i+1} has ${values.length} values, expected ${headerRow.length}`,
        line: i+1
      });
      continue;
    }
    
    // Add the record to the data array
    data.push({
      date: transactionDate,
      description: values[columnMap.description],
      amount: amount,
      target: target,
      action: actionValue,
      originalValues: values // Store original values for reference
    });
  }
  
  return { data, errors, meta: { headers: headerRow } }
}

// Transaction processor function - moved from store
function processTransactions(transactions, shouldDiscardFirstWeek = false) {
  // Group transactions by week
  const weeklyTotals = {}
  const weeklyAmounts = {} // Track individual amounts per week
  let transactionsProcessed = 0
  let transfersAdded = 0 // Track transactions added to transactions array
  let transfersDeleted = 0 // Track transactions deleted
  let smallestWeek = Infinity
  
  // Get the account start date
  const startDate = new Date(store.activeAccount.settings.startDate)
  
  // Delete existing transactions if requested
  if (deleteAndReloadTransactions.value) {
    if (store.activeAccount.transactions && store.activeAccount.transactions.length) {
      // Calculate the current week based on today's date
      const today = new Date();
      const diffTime = today - startDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const currentWeek = Math.floor(diffDays / 7) + 1;
      
      // Count transactions to be deleted (those at or before current week)
      const transactionsToDelete = store.activeAccount.transactions.filter(t => 
        t.startWeek <= currentWeek
      );
      
      transfersDeleted = transactionsToDelete.length;
      
      // Filter out transactions for weeks at or before the current week
      store.activeAccount.transactions = store.activeAccount.transactions.filter(t => 
        t.startWeek > currentWeek
      );
    }
  }
  
  // Process each transaction
  transactions.forEach(transaction => {
    // Calculate which week this transaction belongs to
    const transactionDate = new Date(transaction.date)
    const diffTime = transactionDate - startDate
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    // Skip transactions before the start date
    if (diffDays < 0) return
    
    const week = Math.floor(diffDays / 7) + 1
    
    // Process based on target
    if (transaction.target === 'transaction') {
      // Add to account transactions instead of weekly totals
      const transferType = transaction.amount >= 0 ? 'deposit' : 'withdrawal';
      const transferCategory = transaction.amount >= 0 ? '' : 'Income';
      const transferAmount = Math.abs(transaction.amount); // Always positive for transaction objects
      
      // Check if a matching transaction already exists
      const existingTransaction = store.activeAccount.transactions.find(t => 
        t.type === transferType && 
        t.startWeek === week && 
        t.endWeek === week && 
        t.amount === transferAmount
      );
      
      // Only add if no matching transaction exists
      if (!existingTransaction) {
        store.activeAccount.transactions.push({
          category: transferCategory,
          amount: transferAmount,
          type: transferType,
          startWeek: week,
          endWeek: week,
          description: transaction.description
        });
        transfersAdded++;
      }
      
      transactionsProcessed++;
      return; // Skip regular processing
    }
    
    // Regular transaction processing for actuals
    // Track smallest week for potential discarding
    if (week < smallestWeek) {
      smallestWeek = week;
    }
    
    // Initialize arrays for tracking amounts if needed
    if (!weeklyAmounts[week]) {
      weeklyAmounts[week] = [];
    }
    
    // Store the individual transaction amount
    weeklyAmounts[week].push(transaction.amount);
    
    // Aggregate transactions by week
    if (!weeklyTotals[week]) {
      weeklyTotals[week] = 0;
    }
    weeklyTotals[week] += transaction.amount;
    
    transactionsProcessed++;
  });
  
  // If requested, discard the first week's data
  if (shouldDiscardFirstWeek && smallestWeek !== Infinity) {
    delete weeklyTotals[smallestWeek]
    delete weeklyAmounts[smallestWeek]
    // Adjust the processed count
    if (weeklyAmounts[smallestWeek]) {
      transactionsProcessed -= weeklyAmounts[smallestWeek].length
    }
  }
  
  // Track which weeks were actually updated (values changed)
  const weeksChanged = [];
  const weeksProcessed = Object.keys(weeklyTotals).length;
  
  // Update actuals in the store
  Object.entries(weeklyTotals).forEach(([week, amount]) => {
    week = parseInt(week)
    
    // Round the final amount to 2 decimal places
    amount = Math.round(amount * 100) / 100;
    
    // Find existing entry for this week
    const existingEntry = store.activeAccount.actuals.find(a => parseInt(a.week) === week)
    
    if (existingEntry) {
      // Only update if the amount is actually different
      if (Number(existingEntry.growth) !== amount) {
        existingEntry.growth = amount;
        weeksChanged.push(week); // Track that this week was updated
      }
    } else {
      // Create new entry (always counts as updated since it's new)
      store.activeAccount.actuals.push({
        week: week,
        growth: amount,
        notes: `Imported from CSV on ${new Date().toLocaleDateString()}`
      });
      weeksChanged.push(week); // Track that this week was added
    }
  });
  
  // Recalculate projections with new actuals data
  store.calculateProjections()
  
  // Return summary of changes
  return {
    totalProcessed: transactionsProcessed,
    transfersAdded: transfersAdded,
    transfersDeleted: transfersDeleted,
    weeksProcessed: weeksProcessed,
    weeksUpdated: weeksChanged.length,
    weeksChanged, // Include the actual array of week numbers that were updated
    weeklyTotals,
    weeklyAmounts,
    errors: [] // Initialize empty errors array that will be populated later
  }
}

// Expose the show method to the app store
store.showImportTransactionsModal = show
</script>

<template>
  <div class="modal" tabindex="-1" :class="{ 'd-block': isVisible }" v-show="isVisible">
    <div class="modal-dialog">
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

            <!-- Delete and reload transactions option -->
            <div class="form-check mb-3">
              <input 
                class="form-check-input" 
                type="checkbox" 
                id="deleteAndReloadOption" 
                v-model="deleteAndReloadTransactions"
              >
              <label class="form-check-label" for="deleteAndReloadOption">
                Delete and reload transactions
              </label>
              <div class="form-text">
                When checked, all historic deposit/withdrawal entries will be deleted and recreated from the import.
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
              <p>{{ importResults.transfersAdded }} deposits/withdrawals added</p>
              <p v-if="importResults.transfersDeleted">{{ importResults.transfersDeleted }} deposits/withdrawals deleted</p>
              <p v-if="importResults.skippedRows">{{ importResults.skippedRows }} rows skipped due to errors</p>
            </div>
            
            <div class="weekly-results">
              <h6>Processed Weeks:</h6>
              <ul class="list-group">
                <li 
                  v-for="(amount, week) in importResults.weeklyTotals" 
                  :key="week"
                  class="list-group-item"
                >
                  <div class="d-flex justify-content-between align-items-center">
                    <span>
                      Week {{ week }}: <span v-html="store.weekRange(week)"></span>
                      <!-- Add a badge to indicate which weeks were actually updated -->
                      <span v-if="importResults.weeksChanged && importResults.weeksChanged.includes(parseInt(week))" 
                            class="badge bg-success ms-2">Updated</span>
                    </span>
                    <span class="badge bg-primary rounded-pill">{{ store.currency(amount) }}</span>
                  </div>
                  
                  <!-- Expandable transaction amounts -->
                  <div v-if="importResults.weeklyAmounts && importResults.weeklyAmounts[week]" class="mt-2">
                    <a 
                      data-bs-toggle="collapse" 
                      :href="'#amounts-week-' + week" 
                      role="button" 
                      aria-expanded="false"
                      class="text-decoration-none small"
                    >
                      Show transaction amounts
                    </a>
                    <div class="collapse" :id="'amounts-week-' + week">
                      <div class="card card-body py-2 px-3 mt-2 bg-light">
                        <small>
                          {{ importResults.weeklyAmounts[week].join(', ') }}
                        </small>
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
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
