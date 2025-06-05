// stores/app.js
import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import { auth, db } from '@/firebase'
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
        const weekROR = actualEntry ? (Number(actualEntry.growth) / (startBalance + startSharesBalance) * 100) : null

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
    }
  }
})