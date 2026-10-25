// stores/app.js
import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import { getSyncCenterEventName, isDriveConnected, isDrivePersistenceConfigured, loadAppState, saveAppState } from '@/services/stateRepository'

const SELECTED_ACCOUNT_ID_KEY = 'omb.selectedAccountId.v1'

function loadSelectedAccountIdPreference() {
  try {
    const raw = localStorage.getItem(SELECTED_ACCOUNT_ID_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  } catch (error) {
    return null
  }
}

function persistSelectedAccountIdPreference(accountId) {
  try {
    if (!Number.isFinite(Number(accountId))) return
    localStorage.setItem(SELECTED_ACCOUNT_ID_KEY, String(Number(accountId)))
  } catch (error) {
    // local preference persistence is best-effort
  }
}

function resolveSelectedAccountId(accounts, preferredId = null) {
  const safeAccounts = Array.isArray(accounts) ? accounts : []
  if (!safeAccounts.length) return null

  const preferred = Number(preferredId)
  if (Number.isFinite(preferred) && safeAccounts.some(account => Number(account?.id) === preferred)) {
    return preferred
  }

  const localPreferred = loadSelectedAccountIdPreference()
  if (Number.isFinite(localPreferred) && safeAccounts.some(account => Number(account?.id) === localPreferred)) {
    return localPreferred
  }

  return Number(safeAccounts[0]?.id) || null
}

function ensureAccountCollections(dbState) {
  if (!dbState || !Array.isArray(dbState.accounts)) return false

  let migrated = false
  if (dbState.accounts.length === 0) {
    dbState.accounts.push(createDefaultAccount())
    migrated = true
  }
  dbState.accounts.forEach(account => {
    if (!account.transactions) {
      account.transactions = []
      migrated = true
    }
    if (!account.importedTransactions) {
      account.importedTransactions = []
      migrated = true
    }
    if (!account.positions) {
      account.positions = []
      migrated = true
    }
    if (!account.notes) {
      account.notes = []
      migrated = true
    }
    if (!account.trades) {
      account.trades = []
      migrated = true
    }
    if (!account.relTradeTransactions) {
      account.relTradeTransactions = []
      migrated = true
    }
    if (!account.relPositionTransactions) {
      account.relPositionTransactions = []
      migrated = true
    }
    if (!account.positionMeta) {
      account.positionMeta = []
      migrated = true
    }
  })

  return migrated
}

function createDefaultAccount() {
  return {
    id: 1,
    name: 'Default',
    transactions: [],
    importedTransactions: [],
    positions: [],
    notes: [],
    trades: [],
    relTradeTransactions: [],
    relPositionTransactions: [],
    positionMeta: [],
    settings: {
      startDate: new Date().toISOString().split('T')[0],
      startingBalance: 5000,
      weeklyReturn: 1,
      years: 4
    }
  }
}

function createPersistableStateSnapshot(dbState) {
  try {
    const snapshot = JSON.parse(JSON.stringify(dbState))
    if (snapshot && typeof snapshot === 'object') {
      delete snapshot.selectedAccountId
      delete snapshot.lastUpdated
    }
    return snapshot
  } catch (error) {
    throw new Error(`Failed to serialize state for persistence: ${error?.message || error}`)
  }
}

export const useAppStore = defineStore('app', {
  state: () => ({
    // Core data
    db: {
      accounts: [createDefaultAccount()],
    },
    selectedAccountId: 1,
    user: null,
    projections: [],
    loading: true,
    persistenceMeta: null,
    persistenceError: null,
    syncCenter: {
      open: false,
      driveConfigured: isDrivePersistenceConfigured(),
      driveConnected: isDriveConnected(),
      localSaveAt: null,
      driveLastAttemptAt: null,
      driveLastSuccessAt: null,
      driveLastResult: 'idle',
      driveLastError: ''
    },
    syncCenterListenerBound: false,

    // UI State
    activeTab: 'yearly',
    transactionFilter: 'all',
    selectedWeek: null,
    windowWidth: window.innerWidth,
  }),

  getters: {
    activeAccount(state) {
      const selected = state.db.accounts.find(a => Number(a.id) === Number(state.selectedAccountId))
      return selected || state.db.accounts[0] || null
    },

    weeks() {
      const years = Number(this.activeAccount?.settings?.years || 0)
      return years > 0 ? years * 52 : 0
    },

    unselectedAccounts() {
      const activeId = Number(this.activeAccount?.id)
      return this.db.accounts.filter(a => Number(a.id) !== activeId)
    },

    isBelowXL: (state) => state.windowWidth < 1200,
    syncCenterNeedsAttention(state) {
      return state.syncCenter.driveLastResult === 'failed'
    }
  },

  actions: {
    bindSyncCenterListener() {
      if (this.syncCenterListenerBound || typeof window === 'undefined') return

      const eventName = getSyncCenterEventName()
      this._syncCenterListener = (event) => {
        const detail = event?.detail || {}
        const type = String(detail.type || '')
        const at = detail.at || new Date().toISOString()

        this.syncCenter.driveConfigured = isDrivePersistenceConfigured()
        this.syncCenter.driveConnected = isDriveConnected()

        if (type === 'local-save-complete') {
          this.syncCenter.localSaveAt = at
          return
        }

        if (type === 'drive-connection') {
          this.syncCenter.driveConnected = Boolean(detail.connected)
          if (!detail.connected) {
            this.syncCenter.driveLastResult = 'idle'
            this.syncCenter.driveLastError = ''
          }
          return
        }

        if (type === 'drive-mirror-queued' || type === 'drive-mirror-start') {
          this.syncCenter.driveLastAttemptAt = at
          this.syncCenter.driveLastResult = 'syncing'
          this.syncCenter.driveLastError = ''
          return
        }

        if (type === 'drive-mirror-complete') {
          const syncedAt = detail.syncedAt || at
          this.syncCenter.driveLastAttemptAt = at
          this.syncCenter.driveLastSuccessAt = syncedAt
          this.syncCenter.driveLastResult = 'success'
          this.syncCenter.driveLastError = ''
          if (!this.persistenceMeta || typeof this.persistenceMeta !== 'object') {
            this.persistenceMeta = {}
          }
          this.persistenceMeta.lastDriveSyncAt = syncedAt
          this.persistenceMeta.lastSyncedRevision = detail.revision ?? this.persistenceMeta.lastSyncedRevision ?? null
          return
        }

        if (type === 'drive-mirror-failed') {
          this.syncCenter.driveLastAttemptAt = at
          this.syncCenter.driveLastResult = 'failed'
          this.syncCenter.driveLastError = String(detail.error || 'Drive sync failed')
        }
      }

      window.addEventListener(eventName, this._syncCenterListener)
      this.syncCenterListenerBound = true
    },

    unbindSyncCenterListener() {
      if (!this.syncCenterListenerBound || typeof window === 'undefined' || !this._syncCenterListener) return
      window.removeEventListener(getSyncCenterEventName(), this._syncCenterListener)
      this._syncCenterListener = null
      this.syncCenterListenerBound = false
    },

    toggleSyncCenter() {
      this.syncCenter.open = !this.syncCenter.open
    },

    setSelectedAccount(accountId, { recalculate = true } = {}) {
      const resolved = resolveSelectedAccountId(this.db.accounts, accountId)
      if (!Number.isFinite(Number(resolved))) return
      this.selectedAccountId = Number(resolved)
      persistSelectedAccountIdPreference(this.selectedAccountId)
      if (recalculate) {
        this.calculateProjections()
      }
    },

    ensureSelectedAccount() {
      const resolved = resolveSelectedAccountId(this.db.accounts, this.selectedAccountId)
      if (!Number.isFinite(Number(resolved))) {
        this.selectedAccountId = null
        return
      }
      this.selectedAccountId = Number(resolved)
      persistSelectedAccountIdPreference(this.selectedAccountId)
    },

    async syncNow() {
      await this.saveChanges()
    },

    // State persistence interactions
    async loadData() {
      try {
        this.syncCenter.driveConfigured = isDrivePersistenceConfigured()
        this.syncCenter.driveConnected = isDriveConnected()
        const { data, meta, source } = await loadAppState()
        this.persistenceMeta = meta
        this.syncCenter.driveLastSuccessAt = meta?.lastDriveSyncAt || null

        if (data && Array.isArray(data.accounts)) {
          const migrated = ensureAccountCollections(data)
          this.db = createPersistableStateSnapshot(data)
          this.ensureSelectedAccount()
          this.applyPositionMetadataForActiveAccount()
          if (migrated) {
            await this.saveChanges()
          }
        } else if (source === 'empty') {
          this.db = createPersistableStateSnapshot({
            accounts: [createDefaultAccount()]
          })
          this.ensureSelectedAccount()
          await this.saveChanges()
        }
        this.persistenceError = null
        this.calculateProjections()
      } catch (error) {
        console.error('Failed to load data:', error)
        this.persistenceError = `Failed to load local state: ${error?.message || error}`
        this.calculateProjections()
      }
    },
    
    async saveChanges() {
      try {
        const dataToSave = createPersistableStateSnapshot(this.db)
        const { meta } = await saveAppState(dataToSave, this.persistenceMeta)
        this.persistenceMeta = meta
        this.persistenceError = null
        this.initTooltips()  // Initialize tooltips after save
      } catch (error) {
        console.error('Failed to save changes:', error)
        this.persistenceError = `Failed to save local state: ${error?.message || error}`
      }
    },

    async saveChangesAndRecalculate() {
      await this.saveChanges()
      this.calculateProjections()
    },

    // Core Data Actions
    calculateProjections() {
      this.projections = []
      if (!this.activeAccount?.settings) return
      let startBalance = this.activeAccount.settings.startingBalance
      let actualRORs = []
      let actualGrowths = []
      const actualGrowthByWeek = this._getWeeklyActualGrowthMap()
      const positionCloseCashByWeek = this._getPositionCloseCashByWeekMap()

      for (let week = 1; week <= this.weeks; week++) {
        const transactions = this._getTransactionsForWeek(week)

        // Calculate shares sold this week and previous week
        const sharesSold = Number(positionCloseCashByWeek.get(week) || 0)
        let startSharesBalance = 0
        const sharesSoldPreviousWeek = Number(positionCloseCashByWeek.get(week - 1) || 0)

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

        const hasActualGrowth = actualGrowthByWeek.has(week)
        const actualGrowth = hasActualGrowth ? Number(actualGrowthByWeek.get(week) || 0) : null
        
        // Determine which growth value to use
        let growth
        // Use actual growth for completed and current week, projected for future weeks
        if (weekEndDate <= today || (
          weekStartDate <= today && today <= weekEndDate
        )) {
          // For completed or current week, use actual growth (including 0)
          growth = actualGrowth ?? 0
        } else {
          // For future weeks:
          // If there's an actual entry, use it, otherwise use projected
          growth = actualGrowth ?? projectedGrowth
        }

        // Track actual growths when available
        if (hasActualGrowth) {
          actualGrowths.push(actualGrowth)
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
        if (hasActualGrowth && weekROR !== null) {
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
          actualGrowth,
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

      this.loading = false
    },

    _getWeeklyActualGrowthMap() {
      const growthByWeek = new Map()
      const importedRows = Array.isArray(this.activeAccount?.importedTransactions)
        ? this.activeAccount.importedTransactions
        : []
      if (!importedRows.length) return growthByWeek

      let weeklyTotalTypes = []
      try {
        const brokerMap = this.getBrokerageMap(this.activeAccount?.formatKey || 'schwab')
        weeklyTotalTypes = Array.isArray(brokerMap?.weeklyTotalTypes) ? brokerMap.weeklyTotalTypes : []
      } catch (error) {
        weeklyTotalTypes = []
      }
      const allowedActions = new Set(weeklyTotalTypes.map(action => String(action || '').toLowerCase()))

      importedRows.forEach((row) => {
        const week = Number(row?.week)
        if (!Number.isFinite(week) || week <= 0) return
        if (!growthByWeek.has(week)) growthByWeek.set(week, 0)

        const action = String(row?.action || '').trim().toLowerCase()
        if (!allowedActions.has(action)) return

        const amount = Number(row?.amount)
        if (!Number.isFinite(amount)) return
        const current = Number(growthByWeek.get(week) || 0)
        growthByWeek.set(week, Math.round((current + amount) * 100) / 100)
      })

      return growthByWeek
    },

    _getPositionCloseCashByWeekMap() {
      const closeCashByWeek = new Map()
      const relRows = Array.isArray(this.activeAccount?.relPositionTransactions)
        ? this.activeAccount.relPositionTransactions
        : []

      if (relRows.length > 0) {
        const importedById = new Map(
          (Array.isArray(this.activeAccount?.importedTransactions) ? this.activeAccount.importedTransactions : [])
            .filter(row => row?.id)
            .map(row => [String(row.id), row])
        )

        relRows.forEach((rel) => {
          const eventKind = String(rel?.eventKind || '').toLowerCase()
          if (!eventKind || eventKind === 'open') return

          const week = Number(rel?.eventWeek)
          if (!Number.isFinite(week) || week <= 0) return

          let amount = Number(rel?.allocatedAmount)
          if (!Number.isFinite(amount) && rel?.sourceTransactionId) {
            const sourceRow = importedById.get(String(rel.sourceTransactionId))
            amount = Number(sourceRow?.amount)
          }
          if (!Number.isFinite(amount)) return

          const current = Number(closeCashByWeek.get(week) || 0)
          closeCashByWeek.set(week, Math.round((current + amount) * 100) / 100)
        })

        return closeCashByWeek
      }

      const positions = Array.isArray(this.activeAccount?.positions) ? this.activeAccount.positions : []
      positions.forEach((position) => {
        const week = Number(position?.soldWeek)
        if (!Number.isFinite(week) || week <= 0) return
        const amount = Number(position?.sellAmount)
        if (!Number.isFinite(amount)) return
        const current = Number(closeCashByWeek.get(week) || 0)
        closeCashByWeek.set(week, Math.round((current + amount) * 100) / 100)
      })

      return closeCashByWeek
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

    getPositionMetaKey(position) {
      const baseKey = this.getPositionMetaBaseKey(position)
      const executionOrder = Number(position?.executionOrder || 0) > 0
        ? Number(position.executionOrder)
        : 'na'
      return `${baseKey}|${executionOrder}`
    },

    getPositionMetaBaseKey(position) {
      const symbol = (position?.symbol || '').trim().toUpperCase()
      const date = position?.date ? this.formatDate(position.date) : ''
      const type = (position?.positionType === 'short' || Number(position?.costBasis || 0) < 0) ? 'short' : 'long'
      const shares = Number(position?.shares || 0)
      const basis = Math.round(Math.abs(Number(position?.costBasis ?? position?.amount ?? 0)) * 1000) / 1000
      return `pmeta_v1|${symbol}|${date}|${type}|${shares}|${basis}`
    },

    ensurePositionMetaKey(position) {
      if (!position) return null
      const key = this.getPositionMetaKey(position)
      position.positionMetaKey = key
      return key
    },

    getPositionMetaEntry(position, account = this.activeAccount) {
      if (!account || !Array.isArray(account.positionMeta) || !position) return null
      const key = position.positionMetaKey || this.ensurePositionMetaKey(position)
      const exact = account.positionMeta.find(entry => entry.key === key)
      if (exact) return exact

      const basePrefix = `${this.getPositionMetaBaseKey(position)}|`
      const baseMatches = account.positionMeta.filter(entry => typeof entry.key === 'string' && entry.key.startsWith(basePrefix))
      if (baseMatches.length === 0) return null
      if (baseMatches.length === 1) return baseMatches[0]

      const withExactExecution = Number(position?.executionOrder || 0) > 0
        ? baseMatches.find(entry => entry.key === `${basePrefix}${Number(position.executionOrder)}`)
        : null
      if (withExactExecution) return withExactExecution

      return baseMatches
        .slice()
        .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))[0]
    },

    applyPositionMetaToPosition(account, position) {
      if (!account || !position) return
      if (!Array.isArray(account.positionMeta)) account.positionMeta = []
      this.ensurePositionMetaKey(position)
      const entry = this.getPositionMetaEntry(position, account)
      if (!entry) return

      if (Number.isFinite(Number(entry.profitAllocationOverride))) {
        position.profitAllocation = Number(entry.profitAllocationOverride)
      }
      if (Number.isFinite(Number(entry.offsettingProfitsOverride))) {
        position.offsettingProfits = Number(entry.offsettingProfitsOverride)
      }
    },

    applyPositionMetadataForActiveAccount() {
      if (!this.activeAccount || !Array.isArray(this.activeAccount.positions)) return
      this.activeAccount.positions.forEach(position => {
        this.applyPositionMetaToPosition(this.activeAccount, position)
      })
    },

    applyPositionMetadataForAccount(account) {
      if (!account || !Array.isArray(account.positions)) return
      account.positions.forEach(position => {
        this.applyPositionMetaToPosition(account, position)
      })
    },

    upsertPositionMetaOverride(position, { offsettingProfitsOverride, profitAllocationOverride } = {}) {
      if (!this.activeAccount || !position) return
      if (!Array.isArray(this.activeAccount.positionMeta)) this.activeAccount.positionMeta = []

      const key = this.ensurePositionMetaKey(position)
      let entry = this.getPositionMetaEntry(position, this.activeAccount)
      if (!entry) {
        entry = {
          key,
          createdAt: new Date().toISOString()
        }
        this.activeAccount.positionMeta.push(entry)
      } else if (!entry.key) {
        entry.key = key
      }

      if (offsettingProfitsOverride !== undefined) {
        entry.offsettingProfitsOverride = Number(offsettingProfitsOverride)
      }
      if (profitAllocationOverride !== undefined) {
        entry.profitAllocationOverride = Number(profitAllocationOverride)
      }
      entry.updatedAt = new Date().toISOString()
    },

    removePositionMeta(position) {
      if (!this.activeAccount || !Array.isArray(this.activeAccount.positionMeta) || !position) return
      const key = position.positionMetaKey || this.getPositionMetaKey(position)
      const basePrefix = `${this.getPositionMetaBaseKey(position)}|`
      this.activeAccount.positionMeta = this.activeAccount.positionMeta.filter(entry => entry.key !== key && !(typeof entry.key === 'string' && entry.key.startsWith(basePrefix)))
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
     * Sync offsetting-related fields for a position from persisted metadata overrides.
     * Offsetting profits are manual; no auto-derivation is performed here.
     */
    recalculateOffsettingProfits(position) {
      if (!position) return
      const existingMeta = this.getPositionMetaEntry(position, this.activeAccount)
      if (existingMeta && Number.isFinite(Number(existingMeta.profitAllocationOverride))) {
        position.profitAllocation = Number(existingMeta.profitAllocationOverride)
      }
      if (existingMeta && Number.isFinite(Number(existingMeta.offsettingProfitsOverride))) {
        position.offsettingProfits = Number(existingMeta.offsettingProfitsOverride)
        return
      }
      if (!Number.isFinite(Number(position.offsettingProfits))) {
        position.offsettingProfits = 0
      } else {
        position.offsettingProfits = Number(position.offsettingProfits)
      }
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