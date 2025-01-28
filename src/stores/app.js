// stores/app.js
import { defineStore } from 'pinia'
import { watch, nextTick } from 'vue'
import { auth, db } from '@/firebase'
import { signOut, updatePassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import {
  doc,
  setDoc,
  getDoc
} from 'firebase/firestore'

export const useAppStore = defineStore('app', {
  state: () => ({
    // Core data
    db: {
      accounts: [{
        id: 1,
        name: 'Default',
        transactions: [],
        actuals: [],
        positions: [],
        settings: {
          startDate: new Date().toISOString().split('T')[0],
          startingBalance: 5000,
          weeklyReturn: 1,
          years: 4
        }
      }],
      selectedAccountId: 1
    },
    user: { displayName: "Default" },
    projections: [],
    loading: true,

    // UI State
    activeTab: 'yearly',
    transactionFilter: 'all',
    selectedWeek: null,

    // Modal States
    showSettingsModal: false,
    showNetTransactionModal: false,
    showNewAccountModal: false,
    showSwitchAccountModal: false,
    showConfirmModal: false,

    // Editing States
    editingTransaction: null,
    editingIndex: null,
    editingRow: null,
    settingsEdit: {},
    newAccount: { name: '', description: '' },
    editingPosition: null,
    editingPositionIndex: null,

    // Modal Control
    confirmModalMsg: '',
    confirmModalCallback: null,
    confirmModalResult: null,
    errors: []
  }),

  getters: {
    activeAccount(state) {
      return state.db.accounts.find(a => a.id === state.db.selectedAccountId)
    },

    weeks(state) {
      return state.activeAccount.settings.years * 52
    },

    yearlyTotals(state) {
      const totals = []
      const weeksPerYear = 52
      const today = new Date()

      for (let year = 1; year <= this.activeAccount.settings.years; year++) {
        const startWeek = (year - 1) * weeksPerYear
        const endWeek = year * weeksPerYear
        const yearProjections = state.projections.slice(startWeek, endWeek)

        // Calculate total growth
        const totalGrowth = yearProjections.reduce((sum, p) => {
          // Get start date for this week
          const weekStartDate = new Date(this.activeAccount.settings.startDate)
          weekStartDate.setDate(weekStartDate.getDate() + (p.week - 1) * 7)

          if (p.actualGrowth && p.actualGrowth > 0) {
            // Use actual if it exists and is greater than zero
            return sum + Number(p.actualGrowth)
          } else if (weekStartDate > today && p.projectedGrowth > 0) {
            // Use projected only for future weeks
            return sum + p.projectedGrowth
          }
          return sum
        }, 0)

        const summary = {
          year,
          startBalance: yearProjections[0]?.startBalance || 0,
          totalDeposits: yearProjections.reduce((sum, p) => sum + p.deposit, 0),
          totalTaxWithdrawals: yearProjections.reduce((sum, p) => sum + p.withdrawalsByCategory.taxes, 0),
          totalIncomeWithdrawals: yearProjections.reduce((sum, p) => sum + p.withdrawalsByCategory.income, 0),
          totalGrowth,
          endBalance: yearProjections[yearProjections.length - 1]?.endBalance || 0
        }
        totals.push(summary)
      }
      return totals
    },

    filteredTransactions(state) {
      const transactions = [...(this.activeAccount?.transactions || [])]
      let filtered = transactions
        .map((item, originalIndex) => ({ ...item, originalIndex }))
        .sort((a, b) => a.startWeek - b.startWeek)

      // Type filter
      if (state.transactionFilter !== 'all') {
        filtered = filtered.filter(t => t.type === state.transactionFilter)
      }

      // Week filter
      if (state.selectedWeek) {
        filtered = filtered.filter(t =>
          state.selectedWeek >= t.startWeek &&
          (!t.endWeek || state.selectedWeek <= t.endWeek)
        )
      }

      return filtered
    },

    unselectedAccounts(state) {
      return state.db.accounts.filter(a => a.id !== state.db.selectedAccountId)
    },

    activeAccount(state) {
      return state.db.accounts.find(a => a.id === state.db.selectedAccountId)
    }
  },

  actions: {
    // Add new helper method
    getAssignmentsForWeek(week) {
      return (this.activeAccount.positions || []).filter(position => 
        position.assignedWeek === week
      );
    },

    // Firestore interactions
    async getBaconStash() {
      const user = auth.currentUser
      const userId = user?.uid
      if (!userId) {
        console.log('No user logged in')
        return
      }
      else {
        this.user = user
      }
    
      try {
        const docRef = doc(db, 'accounts', userId)
        const docSnap = await getDoc(docRef)
    
        if (docSnap.exists()) {
          // Get the data so we can validate it
          let data = docSnap.data()

          // Validate that we have a positions array on each account
          data.accounts.forEach(account => {
            if (!account.positions) account.positions = []
          })
          this.db = data
        } else {
          console.log('No bacon data found for user')
        }
        this.calculateProjections()
      } catch (error) {
        console.error('Failed to fetch the bacon:', error)
        this.calculateProjections()
      }
    },
    
    async saveBacon() {
      const userId = auth.currentUser?.uid
      if (!userId) {
        console.log('No user logged in')
        return
      }
    
      try {
        const docRef = doc(db, 'accounts', userId)
        const dataToSave = {
          ...this.db,
          lastUpdated: new Date().toISOString()
        }
        await setDoc(docRef, dataToSave)
      } catch (error) {
        console.error('Failed to save the bacon:', error)
      }
    },

    // Core Data Actions
    calculateProjections() {
      this.projections = []
      let startBalance = this.activeAccount.settings.startingBalance
      let actualRORs = []
      let actualGrowths = []

      for (let week = 1; week <= this.weeks; week++) {
        const transactions = this.getTransactionsForWeek(week)
        const projectedGrowth = startBalance * (this.activeAccount.settings.weeklyReturn / 100)

        // Calculate positions being sold this week
        const positionsSoldThisWeek = (this.activeAccount.positions || []).reduce((sum, position) => {
          if (position.soldWeek === week) {
            return sum + (position.strikePrice * position.shares)
          }
          return sum
        }, 0)

        // Calculate newly assigned positions for this week
        const sharesBalanceAddedThisWeek = (this.activeAccount.positions || []).reduce((sum, position) => {
          if (position.assignedWeek === week) {
            return sum + (position.strikePrice * position.shares)
          }
          return sum
        }, 0)

        // Calculate total shares balance including previously assigned positions, excluding sold positions
        const sharesBalance = (this.activeAccount.positions || []).reduce((sum, position) => {
          if (position.assignedWeek <= week && (!position.soldWeek || position.soldWeek > week)) {
            return sum + (position.strikePrice * position.shares)
          }
          return sum
        }, 0)

        // Add sold positions back to cash balance and subtract newly assigned positions
        startBalance = startBalance + positionsSoldThisWeek - sharesBalanceAddedThisWeek

        // Calculate week's end date
        const weekStartDate = new Date(this.activeAccount.settings.startDate)
        weekStartDate.setDate(weekStartDate.getDate() + (week - 1) * 7)
        const weekEndDate = new Date(weekStartDate)
        weekEndDate.setDate(weekEndDate.getDate() + 6)  // Add 6 days to get end of week
        const today = new Date()

        // Get actual entry
        const actualEntry = this.activeAccount.actuals.find(a => Number(a.week) === week)
        
        // Determine which growth value to use
        let growth
        if (weekEndDate <= today) {
          // For completed weeks, use actual growth (including 0)
          growth = actualEntry ? Number(actualEntry.growth) : 0
        } else {
          // For future/current weeks:
          // If there's an actual entry, use it, otherwise use projected
          growth = actualEntry ? Number(actualEntry.growth) : projectedGrowth
        }

        // Track actual growths when available
        if (actualEntry) {
          actualGrowths.push(Number(actualEntry.growth))
        }

        // Calculate trailing growth averages
        const last4WeeksGrowth = actualGrowths.slice(-4)
        const last8WeeksGrowth = actualGrowths.slice(-8)
        
        const trailing4WeekGrowth = last4WeeksGrowth.length > 0
          ? last4WeeksGrowth.reduce((sum, g) => sum + g, 0) / last4WeeksGrowth.length
          : null
        
        const trailing8WeekGrowth = last8WeeksGrowth.length > 0
          ? last8WeeksGrowth.reduce((sum, g) => sum + g, 0) / last8WeeksGrowth.length
          : null

        // Calculate trailing total growth
        const trailingTotalGrowth = actualGrowths.length > 0
          ? actualGrowths.reduce((sum, g) => sum + g, 0) / actualGrowths.length
          : null

        // Calculate this week's actual ROR if available
        const weekROR = actualEntry && actualEntry.growth > 0 ? (Number(actualEntry.growth) / (startBalance + sharesBalance) * 100) : null

        // Track RORs when available
        if (weekROR !== null) {
          actualRORs.push(weekROR)
        }

        // Calculate ROR averages
        const last4Weeks = actualRORs.slice(-4)
        const last8Weeks = actualRORs.slice(-8)
        
        const trailing4WeekROR = last4Weeks.length > 0 
          ? last4Weeks.reduce((sum, ror) => sum + ror, 0) / last4Weeks.length 
          : null
        
        const trailing8WeekROR = last8Weeks.length > 0 
          ? last8Weeks.reduce((sum, ror) => sum + ror, 0) / last8Weeks.length 
          : null

        // Calculate trailing total ROR
        const trailingTotalROR = actualRORs.length > 0
          ? actualRORs.reduce((sum, ror) => sum + ror, 0) / actualRORs.length
          : null

        // Adjust end balance calculation - ADD sharesBalance here for total assets
        const endBalance = startBalance + growth + transactions.deposits - transactions.totalWithdrawals + sharesBalance

        this.projections.push({
          week,
          startBalance,
          sharesBalanceAddedThisWeek,
          sharesBalance,
          deposit: transactions.deposits,
          withdrawal: transactions.totalWithdrawals,
          withdrawalsByCategory: transactions.withdrawals,
          projectedGrowth,
          actualGrowth: actualEntry ? Number(actualEntry.growth) : null,
          actualROR: weekROR,
          averageROR: 0,
          trailing4WeekROR: trailing4WeekROR?.toFixed(2),
          trailing8WeekROR: trailing8WeekROR?.toFixed(2),
          trailingTotalROR: trailingTotalROR?.toFixed(2),
          averageGrowth: 0,
          trailing4WeekGrowth: trailing4WeekGrowth?.toFixed(2),
          trailing8WeekGrowth: trailing8WeekGrowth?.toFixed(2),
          trailingTotalGrowth: trailingTotalGrowth?.toFixed(2),
          endBalance
        })

        // Next week's start balance should be cash only (endBalance minus sharesBalance)
        startBalance = endBalance - sharesBalance
      }

      // Calculate growth average all time, must be calculated after all projections are done
      const allTimeAverageGrowth = actualGrowths.length > 0
        ? actualGrowths.reduce((sum, g) => sum + g, 0) / actualGrowths.length
        : null

      this.projections.forEach(p => {
        // Add the averageGrowth to each projection
        p.averageGrowth = allTimeAverageGrowth?.toFixed(2)
      })

      // Calculate ROR average all time, must be calculated after all projections are done
      const allTimeAverageROR = actualRORs.length > 0 
          ? actualRORs.reduce((sum, ror) => sum + ror, 0) / actualRORs.length 
          : null

      this.projections.forEach(p => {
        // Add the averageGrowth to each projection
        p.averageROR = allTimeAverageROR?.toFixed(2)
      })

      if (!this.loading) {
        this.saveBacon()
      } else {
        this.loading = false
      }
    },

    // User management
    async logout() {
      try {
        // Sign out first
        await signOut(auth)
        
        // Navigate before resetting store state
        await router.push('/login')
        
        // Reset store after successful navigation
        this.$reset()
      } catch (error) {
        console.error('Logout error:', error)
        // Force navigation on error
        window.location.href = '/login'
      }
    },

    async updatePassword(newPassword) {
      try {
        const user = auth.currentUser
        if (!user) throw new Error('No user logged in')
        
        await updatePassword(user, newPassword)
        return true
      } catch (error) {
        console.error('Password update failed:', error)
        throw new Error('Failed to update password. You may need to sign out and back in.')
      }
    },

    async createUser(email, password) {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password)
        this.user = userCredential.user
        
        // Initialize empty account structure for new user
        const newUserData = {
          accounts: [{
            id: 1,
            name: 'Default Account',
            transactions: [],
            actuals: [],
            positions: [],
            settings: {
              startDate: new Date().toISOString().split('T')[0],
              startingBalance: 5000,
              weeklyReturn: 1,
              years: 4
            }
          }],
          selectedAccountId: 1
        }
        
        // Save initial data
        await setDoc(doc(db, 'accounts', userCredential.user.uid), newUserData)
        
        this.db = newUserData
        return userCredential
      } catch (error) {
        console.error('Signup error:', error)
        throw new Error(error.message)
      }
    },

    async sendPasswordReset(email) {
      try {
        await sendPasswordResetEmail(auth, email)
        return true
      } catch (error) {
        console.error('Password reset failed:', error)
        throw new Error('Failed to send password reset email. Please try again.')
      }
    },

    // Transaction Management
    editWeekRow(week) {
      const existingActual = this.activeAccount.actuals.find(a => Number(a.week) === week)
      this.editingRow = {
        week,
        growth: existingActual?.growth || null,
        notes: existingActual?.notes || ''
      }
    },

    saveWeekRow() {
      const weekIndex = this.activeAccount.actuals.findIndex(a => Number(a.week) === this.editingRow.week)

      const hasData = this.editingRow.growth || this.editingRow.notes.trim()

      if (weekIndex === -1 && hasData) {
        this.activeAccount.actuals.push({
          week: this.editingRow.week.toString(),
          growth: this.editingRow.growth,
          notes: this.editingRow.notes.trim() || null
        })
      } else if (weekIndex !== -1) {
        if (hasData) {
          this.activeAccount.actuals[weekIndex] = {
            week: this.editingRow.week.toString(),
            growth: this.editingRow.growth,
            notes: this.editingRow.notes.trim() || null
          }
        } else {
          this.activeAccount.actuals.splice(weekIndex, 1)
        }
      }

      this.calculateProjections()
      this.closeWeekRow()
      
      // Add nextTick to initialize tooltips after DOM update
      nextTick(() => {
        this.initTooltips()
      })
    },

    closeWeekRow() {
      this.editingRow = null
    },

    getTransactionsForWeek(week) {
      const deposits = this.activeAccount?.transactions
        ?.filter(t => t.type === 'deposit' && week >= t.startWeek && (!t.endWeek || week <= t.endWeek))
        ?.reduce((sum, t) => sum + Number(t.amount), 0) || 0

      const withdrawals = {
        taxes: this.activeAccount?.transactions
          ?.filter(t => t.type === 'withdrawal' && t.category === 'taxes' &&
            week >= t.startWeek && (!t.endWeek || week <= t.endWeek))
          ?.reduce((sum, t) => sum + Number(t.amount), 0) || 0,
        income: this.activeAccount?.transactions
          ?.filter(t => t.type === 'withdrawal' && t.category === 'income' &&
            week >= t.startWeek && (!t.endWeek || week <= t.endWeek))
          ?.reduce((sum, t) => sum + Number(t.amount), 0) || 0,
        other: this.activeAccount?.transactions
          ?.filter(t => t.type === 'withdrawal' && t.category !== 'taxes' && t.category !== 'income' &&
            week >= t.startWeek && (!t.endWeek || week <= t.endWeek))
          ?.reduce((sum, t) => sum + Number(t.amount), 0) || 0
      }

      return {
        deposits,
        withdrawals,
        totalWithdrawals: withdrawals.taxes + withdrawals.income + withdrawals.other
      }
    },

    addNewTransaction() {
      this.editingTransaction = {
        type: null,
        startWeek: null,
        endWeek: null,
        amount: 0,
        category: null
      }
      this.editingIndex = null
    },

    editTransaction(transaction) {
      console.log('Editing transaction:', transaction)
      this.editingTransaction = {
        type: transaction.type,
        startWeek: transaction.startWeek,
        endWeek: transaction.endWeek || null,
        amount: Number(transaction.amount),
        category: transaction.category || null
      }
      this.editingIndex = transaction.originalIndex
    },

    editNetTransactionFromRow(week) {
      this.activeTab = 'recurring'
      this.selectedWeek = week

      // Check if there are transactions for this week
      const hasTransactions = this.activeAccount.transactions.some(t =>
        t.startWeek === week && t.endWeek === week
      )

      if (!hasTransactions) {
        this.editingTransaction = {
          type: 'deposit',
          startWeek: week,
          endWeek: week,
          category: null,
          amount: 0
        }
        this.editingIndex = null
      }
    },

    saveTransactionEdit() {
      // Reset errors
      this.errors = []

      const transaction = {
        type: this.editingTransaction.type,
        startWeek: this.editingTransaction.startWeek,
        endWeek: this.editingTransaction.endWeek,
        amount: this.editingTransaction.amount.toString(),
        category: this.editingTransaction.category
      }

      // Check required fields first
      if (!transaction.type)
        this.errors.push("Type is required.")
      if (!transaction.startWeek)
        this.errors.push("Start Week is required.")
      if (!transaction.amount || isNaN(transaction.amount) || transaction.amount <= 0)
        this.errors.push("Amount is required, and should be a positive number.")

      // If errors, return here
      if (this.errors.length > 0) return

      if (this.editingIndex === null) {
        this.activeAccount.transactions.push(transaction)
      } else {
        this.activeAccount.transactions[this.editingIndex] = transaction
      }

      this.calculateProjections()
      this.closeEditModal()
    },

    removeTransaction(transaction) {
      // If no confirmation result
      if (this.confirmModalResult === null) {
        // Trigger our custom confirmation modal with callback
        this.confirmModalToggle(
          `Are you sure you want to delete the week ${transaction.startWeek} ${transaction.type} for $${transaction.amount}?`,
          () => {
            // User confirmed, remove, run calculations and save
            this.activeAccount.transactions.splice(transaction.originalIndex, 1)
            this.calculateProjections()
            this.confirmModalReset()
          }
        )
      }
    },

    clearFilters() {
      this.selectedWeek = null
      this.transactionFilter = 'all'
    },

    /**
     * New Account modal methods
     */
    handleAccountSelection() {
      if (this.db.selectedAccountId === 'new') {
        this.openNewAccountModal()
      }
    },

    editAccount(account) {
      this.newAccount = {
        id: account.id,
        name: account.name,
        description: account.description
      }
      this.closeSwitchAccountModal()
      this.showNewAccountModal = true
    },

    /**
     * Settings modal methods
     */
    openSettings() {
      this.settingsEdit = { ...this.activeAccount.settings }
      this.showSettingsModal = true
    },

    closeSettings() {
      this.showSettingsModal = false
    },

    saveSettings() {
      this.activeAccount.settings = { ...this.settingsEdit }
      this.calculateProjections()
      this.closeSettings()
    },

    // Account Management
    saveAccount() {
      if (!this.newAccount.name) {
        alert('Account Name is required')
        return
      }

      if (this.newAccount.id === 'new') {
        const newId = Math.max(...this.db.accounts.map(a => a.id)) + 1
        this.db.accounts.push({
          id: newId,
          name: this.newAccount.name,
          description: this.newAccount.description,
          settings: {
            startDate: new Date().toISOString().split('T')[0],
            startingBalance: 5000,
            weeklyReturn: 1,
            years: 4
          },
          transactions: [],
          actuals: []
        })
        this.db.selectedAccountId = newId
      } else {
        const accountIndex = this.db.accounts.findIndex(a => a.id === this.newAccount.id)
        this.db.accounts[accountIndex].name = this.newAccount.name
        this.db.accounts[accountIndex].description = this.newAccount.description
      }

      this.calculateProjections()
      this.closeNewAccountModal()
    },

    deleteAccount(account) {
      this.closeSwitchAccountModal()
      this.confirmModalToggle(`Are you sure you want to delete ${account.name}?`, () => {
        this.db.accounts = this.db.accounts.filter(a => a.id !== account.id)
        if (this.db.selectedAccountId === account.id) {
          this.db.selectedAccountId = this.db.accounts[0].id
        }

        this.calculateProjections()
        this.closeSwitchAccountModal()
        this.confirmModalReset()
      })
    },

    switchToNewAccountModal() {
      this.closeSwitchAccountModal();
      this.openNewAccountModal();
    },

    selectAccount(id) {
      this.db.selectedAccountId = id
      this.calculateProjections()
      this.closeSwitchAccountModal()
    },

    // Utility Methods
    currency(value) {
      if (!value) return '$0.00'
      return '$' + Number(value).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')
    },

    weekRange(weekNum) {
      if (!weekNum) return ''
      const startDate = this.activeAccount.settings.startDate
        ? new Date(this.activeAccount.settings.startDate)
        : new Date()

      startDate.setDate(startDate.getDate() + (weekNum - 1) * 7)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 6)

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const formatWeekDate = (date) => {
        return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear()
      }

      return `${formatWeekDate(startDate)} - ${formatWeekDate(endDate)}`
    },

    formatDate(dateString) {
      if (!dateString) return ''
      return new Date(dateString).toISOString().split('T')[0]
    },

    getTransactionWeekDisplay(transaction, startEnd) {
      const start = transaction.startWeek
      const end = transaction.endWeek

      let result = `#${startEnd === 'start' ? start : end} (${startEnd === 'start' ? this.weekRange(start) : this.weekRange(end)})`

      if (startEnd === 'end') {
        if (start === end) return "Single Week"
        if (!end) return "Ongoing"
        result += ` [${end - start} Wks]`
      }

      return result
    },

    formatNetTransaction(deposit, withdrawal) {
      const net = deposit - withdrawal
      const hasMultiple = deposit && withdrawal

      return {
        value: net < 0
          ? `(${this.currency(Math.abs(net))})`
          : this.currency(net),
        style: { color: net < 0 ? 'red' : 'inherit' },
        indicator: hasMultiple ? '*' : ''
      }
    },

    initTooltips() {
      document.querySelectorAll('[data-bs-toggle="tooltip"]')
      .forEach(el => {
        let tooltip = bootstrap.Tooltip.getInstance(el)
        if (tooltip) {
          tooltip.dispose()
        }
        new bootstrap.Tooltip(el)
      })
    },

    downloadBackup() {
      const data = JSON.stringify(this.db, null, 2)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${this.user.email.split('@')[0]}_backup_${this.formatDate(new Date())}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },

    async restoreBackup(file) {
      if (!file) return

      try {
        const text = await file.text()
        const backupData = JSON.parse(text)

        // Verify backup data structure
        if (!backupData.accounts || !Array.isArray(backupData.accounts)) {
          throw new Error('Invalid backup file format')
        }

        // Make sure each account has transactions or an empty array
        backupData.accounts.forEach(account => {
          if (!account.transactions) account.transactions = []
        })

        // Close the switchAccountModal
        this.closeSwitchAccountModal()

        // Show confirmation with warning
        this.confirmModalToggle(
          'Warning: This will overwrite all current data. Make sure you have saved a backup of your current data before proceeding. Continue?',
          () => {
            // Update store data
            this.db = backupData
            this.calculateProjections()
            this.confirmModalReset()
          }
        )
      } catch (error) {
        alert('Error restoring backup: Invalid file format')
        console.error('Restore error:', error)
      }
    },

    // Modal Management
    confirmModalToggle(msg, cb) {
      // If modal is not yet shown and we have message and cb values
      if (!this.showConfirmModal && msg && cb) {
        this.confirmModalMsg = msg
        this.confirmModalCallback = cb
        this.confirmModalResult = false
        this.showConfirmModal = true;
      }

      // If the modal is already shown, and msg and cb area already set, and user confirmed with OK
      else if (this.showConfirmModal && msg === true && this.confirmModalCallback) {
        // User either confirmed or canceled, execute the callback function
        this.confirmModalResult = true
        this.confirmModalCallback()
      }
    },

    confirmModalReset() {
      // Clear all variables and hide
      this.confirmModalMsg = ""
      this.confirmModalCallback = null
      this.confirmModalResult = null
      this.showConfirmModal = false
    },

    closeEditModal() {
      this.editingTransaction = null
      this.editingIndex = null
      this.errors = []
      this.showNetTransactionModal = false
    },

    openNewAccountModal() {
      this.newAccount = { id: 'new', name: '', description: '' }
      this.showNewAccountModal = true
    },

    closeNewAccountModal() {
      this.showNewAccountModal = false
    },

    openSwitchAccountModal() {
      this.showSwitchAccountModal = true
    },

    closeSwitchAccountModal() {
      this.showSwitchAccountModal = false
    },

    // Add new position management actions
    addNewPosition() {
      this.editingPosition = {
        symbol: '',
        assignedWeek: null,  // Add new field
        soldWeek: null,    // Add new field
        strikePrice: null,
        currentPrice: null,
        shares: null,
        putProfits: 0,  // Changed from 
        callProfits: 0, // Added new field
        startWeek: null
      }
      this.editingPositionIndex = null
    },

    editPosition(position, index) {
      this.editingPosition = { ...position }
      this.editingPositionIndex = index
    },

    savePositionEdit() {
      this.errors = []

      // Validate required fields
      if (!this.editingPosition.symbol)
        this.errors.push("Symbol is required.")
      if (!this.editingPosition.assignedWeek)
        this.errors.push("Assigned Date is required.")
      if (!this.editingPosition.strikePrice || this.editingPosition.strikePrice <= 0)
        this.errors.push("Assigned Price is required and must be greater than 0.")
      if (!this.editingPosition.shares || this.editingPosition.shares <= 0)
        this.errors.push("Shares quantity is required and must be greater than 0.")
      if (!this.editingPosition.startWeek)
        this.errors.push("Start Week is required.")

      if (this.errors.length > 0) return

      const position = {
        symbol: this.editingPosition.symbol.toUpperCase(),
        assignedWeek: Number(this.editingPosition.assignedWeek),
        soldWeek: this.editingPosition.soldWeek ? Number(this.editingPosition.soldWeek) : null,  // Add new field
        strikePrice: Number(this.editingPosition.strikePrice),
        currentPrice: Number(this.editingPosition.currentPrice) || null,
        shares: Number(this.editingPosition.shares),
        putProfits: Number(this.editingPosition.putProfits || 0),
        callProfits: Number(this.editingPosition.callProfits || 0),
        startWeek: Number(this.editingPosition.startWeek)
      }

      // Validate that soldWeek is after assignedWeek if it exists
      if (position.soldWeek && position.soldWeek < position.assignedWeek) {
        this.errors.push("Called/Sold Week must be after Assigned Week")
        return
      }

      if (this.editingPositionIndex === null) {
        if (!this.activeAccount.positions) {
          this.activeAccount.positions = []
        }
        this.activeAccount.positions.push(position)
      } else {
        this.activeAccount.positions[this.editingPositionIndex] = position
      }

      this.closePositionModal()
      this.saveBacon()
    },

    removePosition(index) {
      this.confirmModalToggle(
        `Are you sure you want to delete this position?`,
        () => {
          this.activeAccount.positions.splice(index, 1)
          this.saveBacon()
          this.confirmModalReset()
        }
      )
    },

    closePositionModal() {
      this.editingPosition = null
      this.editingPositionIndex = null
      this.errors = []
    },

  }
})

// Add watchers during store creation
const store = useAppStore()
watch(
  () => store.editingTransaction?.startWeek,
  (newVal, oldVal) => {
    console.log('startWeek changed:', { newVal, oldVal })
    if (newVal > store.editingTransaction?.endWeek && newVal !== null && oldVal === null) {
      store.editingTransaction.endWeek = newVal
    }
    else if (newVal > store.editingTransaction?.endWeek && store.editingTransaction.endWeek !== null && newVal !== null) {
      store.editingTransaction.endWeek = newVal
    }
  }
)

watch(
  () => store.editingTransaction?.endWeek,
  (newVal, oldVal) => {
    console.log('endWeek changed:', { newVal, oldVal })
    if (newVal < store.editingTransaction?.startWeek && newVal !== null) {
      console.log("endWeek type: ", typeof newVal, "Value: ", newVal)
      store.editingTransaction.startWeek = newVal
    }
  }
)