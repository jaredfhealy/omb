// stores/app.js
import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import { loadState, saveState } from '@/services/stateApi'

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
    user: null,
    projections: [],
    loading: true,

    // UI State
    activeTab: 'yearly',
    transactionFilter: 'all',
    selectedWeek: null,
    windowWidth: window.innerWidth,
  }),

  getters: {
    activeAccount(state) {
      return state.db.accounts.find(a => a.id === state.db.selectedAccountId)
    },

    weeks(state) {
      return state.activeAccount.settings.years * 52
    },

    unselectedAccounts(state) {
      return state.db.accounts.filter(a => a.id !== state.db.selectedAccountId)
    },

    isBelowXL: (state) => state.windowWidth < 1200,
  },

  actions: {
    // State API interactions
    async getBaconStash() {
      try {
        const data = await loadState()

        if (data && Array.isArray(data.accounts)) {
          data.accounts.forEach(account => {
            if (!account.positions) account.positions = []
          })
          this.db = data
        }
        this.calculateProjections()
      } catch (error) {
        console.error('Failed to fetch the bacon:', error)
        this.calculateProjections()
      }
    },
    
    async saveBacon() {
      try {
        const dataToSave = {
          ...this.db,
          lastUpdated: new Date().toISOString()
        }
        await saveState(dataToSave)
        this.initTooltips()  // Initialize tooltips after save
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
        const transactions = this._getTransactionsForWeek(week)

        // Calculate shares sold this week and previous week
        let sharesSold = 0
        let startSharesBalance = 0
        let sharesSoldPreviousWeek = 0
        const sells = this.activeAccount.sells || []
        for (let i = 0; i < sells.length; i++) {
          const sell = sells[i]
          if (sell.week === week) {
            sharesSold += sell.amount || 0
          } else if (sell.week === week - 1) {
            sharesSoldPreviousWeek += sell.amount || 0
          }
        }

        // Calculate shares bought this week and previous week, and shares held at start of week
        let sharesBought = 0
        let sharesBoughtPreviousWeek = 0
        const positions = this.activeAccount.positions || []
        for (let i = 0; i < positions.length; i++) {
          const position = positions[i]
          // Bought (assigned) this week
          if (position.assignedWeek === week) {
            sharesBought += Math.abs(position.costBasis || 0)
          }
          // Bought (assigned) previous week
          if (position.assignedWeek === week - 1) {
            sharesBoughtPreviousWeek += Math.abs(position.costBasis || 0)
          }
          // Shares held at start of week (assigned before this week, not yet sold)
          if (position.assignedWeek < week && (!position.soldWeek || position.soldWeek >= week)) {
            startSharesBalance += Math.abs(position.costBasis || 0)
          }
        }

        // Calculate projected growth based on total account value (cash + shares)
        const projectedGrowth = (startBalance + startSharesBalance) * (this.activeAccount.settings.weeklyReturn / 100)

        // Add sold positions back to cash balance and subtract newly assigned positions
        startBalance = startBalance + sharesSoldPreviousWeek - sharesBoughtPreviousWeek

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
        // Use actual growth for completed and current week, projected for future weeks
        if (weekEndDate <= today || (
          weekStartDate <= today && today <= weekEndDate
        )) {
          // For completed or current week, use actual growth (including 0)
          growth = actualEntry ? Number(actualEntry.growth) : 0
        } else {
          // For future weeks:
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
        
        // Add calculation for trailing 4-week growth total (sum)
        const trailing4WeekGrowthTotal = last4WeeksGrowth.length > 0
          ? last4WeeksGrowth.reduce((sum, g) => sum + g, 0)
          : null
        
        const trailing4WeekGrowthAvg = last4WeeksGrowth.length > 0
          ? trailing4WeekGrowthTotal / last4WeeksGrowth.length
          : null
        
        const trailing8WeekGrowthAvg = last8WeeksGrowth.length > 0
          ? last8WeeksGrowth.reduce((sum, g) => sum + g, 0) / last8WeeksGrowth.length
          : null

        // Calculate trailing total growth
        const trailingTotalGrowthAvg = actualGrowths.length > 0
          ? actualGrowths.reduce((sum, g) => sum + g, 0) / actualGrowths.length
          : null

        // Calculate this week's actual ROR if available
        const weekROR = (Number(growth) / (startBalance + startSharesBalance) * 100)

        // Track RORs when available
        if (weekROR !== null) {
          actualRORs.push(weekROR)
        }

        // Calculate ROR averages
        const last4Weeks = actualRORs.slice(-4)
        const last8Weeks = actualRORs.slice(-8)
        
        const trailing4WeekRORAvg = last4Weeks.length > 0 
          ? last4Weeks.reduce((sum, ror) => sum + ror, 0) / last4Weeks.length 
          : null
        
        const trailing8WeekRORAvg = last8Weeks.length > 0 
          ? last8Weeks.reduce((sum, ror) => sum + ror, 0) / last8Weeks.length 
          : null

        // Calculate trailing total ROR
        const trailingTotalRORAvg = actualRORs.length > 0
          ? actualRORs.reduce((sum, ror) => sum + ror, 0) / actualRORs.length
          : null

        // Adjust end balance calculation - ADD startSharesBalance here for total assets
        const endBalance = startBalance + growth + transactions.deposits - transactions.totalWithdrawals + startSharesBalance

        this.projections.push({
          week,
          startBalance,
          startSharesBalance,
          sharesBought,
          sharesSold,
          sharesBoughtPreviousWeek,
          sharesSoldPreviousWeek,
          deposit: transactions.deposits,
          withdrawal: transactions.totalWithdrawals,
          withdrawalsByCategory: transactions.withdrawals,
          projectedGrowth,
          actualGrowth: actualEntry ? Number(actualEntry.growth) : null,
          actualROR: weekROR,
          averageROR: 0,
          trailing4WeekRORAvg: trailing4WeekRORAvg?.toFixed(2),
          trailing8WeekRORAvg: trailing8WeekRORAvg?.toFixed(2),
          trailingTotalRORAvg: trailingTotalRORAvg?.toFixed(2),
          averageGrowth: 0,
          trailing4WeekGrowthAvg: trailing4WeekGrowthAvg?.toFixed(2),
          trailing8WeekGrowthAvg: trailing8WeekGrowthAvg?.toFixed(2),
          trailingTotalGrowthAvg: trailingTotalGrowthAvg?.toFixed(2),
          trailing4WeekGrowthTotal: trailing4WeekGrowthTotal?.toFixed(2),
          endBalance
        })

        // Next week's start balance should be cash only (endBalance minus startSharesBalance)
        startBalance = endBalance - startSharesBalance
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

    // Only used locally by calculateProjections
    _getTransactionsForWeek(week) {
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

    // Utility and formatting Methods
    currency(value) {
      const num = Number(value)
      if (!value || isNaN(num)) return '$0.00'
      if (num < 0) {
        // Format negative numbers with parentheses
        return '($' + Math.abs(num).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,') + ')'
      } else {
        // Format positive numbers normally
        return '$' + num.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')
      }
    },

    weekRange(weekNum, plainText = false) {
      if (!weekNum) return ''
      const startDate = this.activeAccount.settings.startDate
        ? new Date(this.activeAccount.settings.startDate)
        : new Date()

      startDate.setDate(startDate.getDate() + (weekNum - 1) * 7)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 6)

      // Format with year first, then MM-DD
      const startYear = startDate.getFullYear()
      const endYear = endDate.getFullYear()
      
      const formatMonthDay = (date) => {
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${month}/${day}`
      }
      
      // For plain text version (used in selects and other non-HTML contexts)
      if (plainText) {
        
        if (startYear === endYear) {
          return `${startYear}: ${formatMonthDay(startDate)} - ${formatMonthDay(endDate)}`
        } else {
          return `${startYear}: ${formatMonthDay(startDate)} - ${endYear}: ${formatMonthDay(endDate)}`
        }
      }
      
      // HTML version with badges (for v-html rendering)
      const shortStartYear = startYear.toString().substring(2)
      const shortEndYear = endYear.toString().substring(2)
      
      // If years are the same, only show year once
      if (startYear === endYear) {
        return `<span class="badge rounded-pill bg-secondary text-white">'${shortStartYear}</span> ${formatMonthDay(startDate)} - ${formatMonthDay(endDate)}`
      } else {
        // If years differ, show both years
        return `<span class="badge rounded-pill bg-secondary text-white">'${shortStartYear}</span> ${formatMonthDay(startDate)} - <span class="badge rounded-pill bg-secondary text-white">'${shortEndYear}</span> ${formatMonthDay(endDate)}`
      }
    },

    formatDate(dateString) {
      if (!dateString) return ''
      return new Date(dateString).toISOString().split('T')[0]
    },

    initTooltips() {
      nextTick(() => {
        document.querySelectorAll('[data-bs-toggle="tooltip"]')
        .forEach(el => {
          let tooltip = bootstrap.Tooltip.getInstance(el)
          if (tooltip) {
            tooltip.dispose()
          }
          new bootstrap.Tooltip(el)
        })
      })
    },

    setupWindowResizeListener() {
      const handleResize = () => {
        this.windowWidth = window.innerWidth
      }
      
      window.addEventListener('resize', handleResize)
      
      // To ensure proper cleanup, we can return a function that removes the event listener
      return () => window.removeEventListener('resize', handleResize)
    },

    getPositionKey(pos, action) {
      return `${pos.symbol}_${pos.shares}_${action}_${pos.date}_${Math.abs(pos.costBasis || pos.amount)}`
    },

    calculateWeekStartEnd(weekNumber) {
      const startDate = new Date(this.activeAccount.settings.startDate)
      startDate.setDate(startDate.getDate() + (weekNumber - 1) * 7)
      const endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 6)
      return {
        weekStart: startDate.toISOString().slice(0, 10),
        weekEnd: endDate.toISOString().slice(0, 10)
      }
    },

    getWeekNumber(dateString) {
      // Returns the week number (1-based) for a given date string, relative to the account's startDate
      if (!dateString) return null
      const startDate = new Date(this.activeAccount.settings.startDate)
      const date = new Date(dateString)
      if (isNaN(date.getTime()) || isNaN(startDate.getTime())) return null
      const diffTime = date - startDate
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      return diffDays < 0 ? null : Math.floor(diffDays / 7) + 1
    },

    getBrokerageMap(keySearch) {
      // If keySearch is empty, check for active account's formatKey
      keySearch = this.activeAccount?.formatKey || keySearch
      if (!keySearch || keySearch.length === 0) {
        throw new Error('No brokerage format specified')
      }

      // Define known brokerage formats with their header patterns and column mappings
      const knownFormats = {
        'schwab': {
          headerRow: 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount',
          columns: {
            date: 0,
            action: 1,
            symbol: 2,
            description: 3,
            quantity: 4,
            price: 5,
            fees: 6,
            amount: 7
          },
          weeklyTotalTypes: ['sell to open', 'sell to close', 'buy to open', 'buy to close', 'qualified dividend', 'bank interest', 'dividend', 'cash dividend', 'credit interest', 'foreign tax paid', 'expired', 'margin interest', 'substitute inc pmt'],
          transactionTypes: ['moneylink transfer', 'moneylink deposit', 'journal', 'funds received'],
          positionTypes: ['buy'],
          sellTypes: ['sell', 'sell short'],
        }
      }
      // Try direct lookup first (header string as key)
      let brokerMap = knownFormats[keySearch]
      // If not found, search by formatKey
      if (!brokerMap) {
        for (const key in knownFormats) {
          if (knownFormats[key].headerRow === keySearch) {
            brokerMap = knownFormats[key]
            // Store the brokerage name in our account data for recalculation purposes
            this.activeAccount.formatKey = key
            break
          }
        }
      }
      // If still not found, default to the first format
      if (!brokerMap) {
        const firstHeader = Object.keys(knownFormats)[0]
        brokerMap = knownFormats[firstHeader]
      }
      return brokerMap
    },

    /**
     * Recalculate offsettingProfits for a given position object.
     * Mutates the position.offsettingProfits property.
     */
    recalculateOffsettingProfits(position) {
      if (!position || !position.startWeek || !position.symbol) {
        position.offsettingProfits = 0
        return
      }
      let total = 0
      const actuals = this.activeAccount?.actuals || []
      actuals.forEach(a => {
        if (Array.isArray(a.data) && parseInt(a.week) >= parseInt(position.startWeek)) {
          a.data.forEach(txn => {
            if (
              txn.symbol &&
              txn.symbol.toUpperCase().split(" ")[0].includes(position.symbol.toUpperCase()) &&
              txn.action &&
              !['buy', 'sell'].includes(txn.action.toLowerCase())
            ) {
              total += parseFloat(txn.amount || 0)
            }
          })
        }
      })
      position.offsettingProfits = parseFloat((total * ((position.profitAllocation || 100) / 100)).toFixed(2))
    },

    /**
     * Recalculate offsettingProfits for all positions on the active account.
     */
    recalculateAllOffsettingProfits() {
      if (!this.activeAccount || !Array.isArray(this.activeAccount.positions)) return
      this.activeAccount.positions.forEach(pos => {
        this.recalculateOffsettingProfits(pos)
      })
    },

    /**
     * Get the current week number based on the active account's start date.
     * Returns the week number as an integer.
     */
    getCurrentWeek() {
      const today = new Date()
      const startDate = new Date(this.activeAccount.settings.startDate)
      const diffTime = today - startDate
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      return Math.ceil(diffDays / 7)
    },
  }
})