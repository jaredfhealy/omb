// stores/app.js
import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import { getSyncCenterEventName, isDriveConnected, isDrivePersistenceConfigured, loadAppState, saveAppState } from '@/services/stateRepository'
import {
  buildActualGrowthMap,
  buildPositionCollateralMap,
  buildCashFlowsMap,
  sumWithdrawals,
  getWeekDateRange,
  getWeekStatus
} from '@/services/projectionEngineV2'
import { getOpenShares } from '@/utils/positionUtils'

const SELECTED_ACCOUNT_ID_KEY = 'omb.selectedAccountId.v1'
const POSITION_SHARE_EPSILON = 1e-6
const OPTION_SYMBOL_REGEX = /^([\w.-]+)\s+(\d{2}\/\d{2}\/\d{2,4})\s+([\d.]+)\s+([CP])$/i
const TRADE_OPEN_EVENT_KINDS = new Set(['open', 'opened', 'assignment', 'assigned', 'sell-to-open', 'buy-to-open'])
const TRADE_CLOSE_EVENT_KINDS = new Set(['close', 'closed', 'sell-to-close', 'buy-to-close', 'expired'])

function getPutCollateralFromOpenShortContracts(timelineEntries) {
  if (!Array.isArray(timelineEntries) || timelineEntries.length === 0) return 0

  const openShortPutsByContract = new Map()

  timelineEntries.forEach((event) => {
    const source = event?.source || null
    const symbol = toUpperSymbol(source?.symbol)
    const description = String(source?.description || '').trim()
    const optionMatch = OPTION_SYMBOL_REGEX.exec(symbol) || OPTION_SYMBOL_REGEX.exec(description)
    if (!optionMatch) return

    const right = String(optionMatch[4] || '').toUpperCase()
    if (right !== 'P') return

    const strike = Number(optionMatch[3])
    const quantity = Math.abs(Number(source?.quantity ?? event?.quantity ?? 0))
    if (!Number.isFinite(strike) || strike <= 0 || quantity <= 0) return

    const action = String(source?.action || '').trim().toLowerCase()
    const eventKind = String(event?.eventKind || '').trim().toLowerCase()
    const contractKey = `${String(optionMatch[1] || '').toUpperCase()}|${optionMatch[2]}|${strike.toFixed(4)}`

    let delta = 0
    if (action.includes('sell to open')) {
      delta = quantity
    } else if (action.includes('buy to close')) {
      delta = -quantity
    } else if (action.includes('expired') || eventKind === 'expired') {
      delta = -quantity
    } else if (action.includes('assigned') || eventKind === 'assignment' || eventKind === 'assigned') {
      delta = -quantity
    } else if (action.includes('sell') && !action.includes('sell to close')) {
      delta = quantity
    } else if (action.includes('buy') && !action.includes('buy to open')) {
      delta = -quantity
    }
    if (delta === 0) return

    const existing = openShortPutsByContract.get(contractKey)
    const existingQuantity = Number(existing?.quantity || 0)
    const nextQuantity = Math.max(0, existingQuantity + delta)
    openShortPutsByContract.set(contractKey, { strike, quantity: nextQuantity })
  })

  let collateral = 0
  openShortPutsByContract.forEach((entry) => {
    const strike = Number(entry?.strike)
    const quantity = Number(entry?.quantity)
    if (!Number.isFinite(strike) || strike <= 0 || !Number.isFinite(quantity) || quantity <= 0) return
    collateral += strike * quantity * 100
  })

  return roundMoney(collateral)
}

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

function pruneOrphanedTradeNotes(dbState) {
  if (!dbState || !Array.isArray(dbState.accounts)) return false
  let migrated = false

  dbState.accounts.forEach((account) => {
    const trades = Array.isArray(account?.trades) ? account.trades : []
    const notes = Array.isArray(account?.notes) ? account.notes : []
    if (!notes.length) return

    const tradeIds = new Set(trades.map((trade) => String(trade?.id || '').trim()).filter(Boolean))
    const filtered = notes.filter((note) => {
      const targetCollection = String(note?.targetCollection || '')
      if (targetCollection !== 'trades') return true
      const targetId = String(note?.targetId || '').trim()
      return targetId && tradeIds.has(targetId)
    })
    if (filtered.length !== notes.length) {
      account.notes = filtered
      migrated = true
    }
  })

  return migrated
}

function createDefaultAccount() {
  return {
    id: 1,
    name: 'Default',
    description: '',
    formatKey: 'schwab',
    transactions: [],
    importedTransactions: [],
    positions: [],
    notes: [],
    cashCheckpoints: [],
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

function toIsoDateOnly(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function toUpperSymbol(value) {
  return String(value || '').trim().toUpperCase()
}

function toTradeUnderlyingSymbol(value, fallback = '') {
  const raw = toUpperSymbol(value)
  const fallbackValue = String(fallback || '').trim()
  const match = OPTION_SYMBOL_REGEX.exec(raw) || OPTION_SYMBOL_REGEX.exec(fallbackValue)
  if (match) return toUpperSymbol(match[1])
  if (!raw) return ''
  if (raw.includes(' ')) return raw.split(/\s+/)[0]
  return raw
}

function normalizeSpace(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function getImportedTransactionAllocationKey(row) {
  if (!row || typeof row !== 'object') return ''
  const sourceFingerprint = String(row?.sourceFingerprint || '').trim()
  if (sourceFingerprint) return `fp:${sourceFingerprint}`

  const date = String(toIsoDateOnly(row?.date) || '').trim()
  const action = normalizeSpace(row?.action).toLowerCase()
  const symbol = toUpperSymbol(row?.symbol)
  const description = normalizeSpace(row?.description).toUpperCase()
  const quantity = Number(row?.quantity || 0)
  const price = Number(row?.price || 0)
  const amount = Number(row?.amount || 0)

  return `legacy:${date}|${action}|${symbol}|${description}|${quantity.toFixed(6)}|${price.toFixed(6)}|${amount.toFixed(2)}`
}

function getImportedTransactionLooseKey(row) {
  if (!row || typeof row !== 'object') return ''
  const symbol = toUpperSymbol(row?.symbol)
  const description = String(row?.description || '').trim()
  const optionMatch = OPTION_SYMBOL_REGEX.exec(symbol) || OPTION_SYMBOL_REGEX.exec(description)
  const date = String(toIsoDateOnly(row?.date) || '').trim()
  const underlying = toTradeUnderlyingSymbol(symbol, description)
  const action = normalizeSpace(row?.action).toLowerCase()
  const optionType = optionMatch ? String(optionMatch[4] || '').toUpperCase() : 'STOCK'
  const expiration = optionMatch ? String(optionMatch[2] || '').trim() : ''
  const strike = optionMatch ? String(optionMatch[3] || '').trim() : ''
  const quantity = Math.abs(Number(row?.quantity || 0))
  return `loose:${date}|${underlying}|${action}|${optionType}|${expiration}|${strike}|${quantity.toFixed(6)}`
}

function parseOptionExpirationToIso(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const parts = raw.split('/')
  if (parts.length !== 3) return ''

  const month = Number(parts[0])
  const day = Number(parts[1])
  let year = Number(parts[2])
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return ''
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  if (year < 100) year += 2000
  if (year < 1900 || year > 9999) return ''

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return ''
  if (parsed.toISOString().slice(0, 10) !== iso) return ''
  return iso
}

function getLatestOptionExpirationIso(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  let latestIso = ''

  rows.forEach((row) => {
    const symbol = toUpperSymbol(row?.symbol)
    const description = String(row?.description || '').trim()
    const optionMatch = OPTION_SYMBOL_REGEX.exec(symbol) || OPTION_SYMBOL_REGEX.exec(description)
    if (!optionMatch) return
    const expirationIso = parseOptionExpirationToIso(optionMatch[2])
    if (!expirationIso) return
    if (!latestIso || expirationIso > latestIso) {
      latestIso = expirationIso
    }
  })

  return latestIso
}

function isOptionTransactionRow(row) {
  if (!row || typeof row !== 'object') return false
  const symbol = toUpperSymbol(row?.symbol)
  const description = String(row?.description || '').trim().toUpperCase()
  const action = String(row?.action || '').trim().toLowerCase()
  if (OPTION_SYMBOL_REGEX.exec(symbol) || OPTION_SYMBOL_REGEX.exec(description)) return true
  if (/\b(PUT|CALL)\b/.test(description) && (/\bEXP\b/.test(description) || /\$\d+(\.\d+)?/.test(description))) {
    return true
  }
  return /to open|to close|assigned|assignment|expired/.test(action)
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function createLocalRecordId(prefix) {
  const randomPart = Math.random().toString(16).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`
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
    loadDataPromise: null,
    persistenceMeta: null,
    persistenceError: null,
    startupRequiresManualRecovery: false,
    startupRecoveryReason: null,
    startupValidationErrors: [],
    startupInspection: null,
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
    activeTab: 'trades',
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

    currentTrades() {
      const account = this.activeAccount
      if (!account || !Array.isArray(account.trades)) return []
      const importedById = new Map(
        (Array.isArray(account.importedTransactions) ? account.importedTransactions : [])
          .map(row => [String(row?.id || ''), row])
      )

      return account.trades
        .map((trade) => {
          const originSourceId = String(trade?.sourceTransactionId || '').trim()
          const originSource = originSourceId ? importedById.get(originSourceId) : null
          const originSymbol = toTradeUnderlyingSymbol(originSource?.symbol, originSource?.description)
          const tradeSymbol = toUpperSymbol(trade?.symbol)
          const tradeUnderlyingSymbol = toTradeUnderlyingSymbol(tradeSymbol)
          return {
            ...trade,
            symbol: tradeSymbol,
            displaySymbol: originSymbol || tradeUnderlyingSymbol || tradeSymbol,
            metrics: this._computeTradeMetrics(trade)
          }
        })
        .sort((a, b) => {
          const statusA = a?.status === 'closed' ? 1 : 0
          const statusB = b?.status === 'closed' ? 1 : 0
          if (statusA !== statusB) return statusA - statusB
          const dateA = String(a?.openedAt || '')
          const dateB = String(b?.openedAt || '')
          if (dateA > dateB) return -1
          if (dateA < dateB) return 1
          return String(a?.id || '').localeCompare(String(b?.id || ''))
        })
    },

    unallocatedSourceTransactionsBySymbol() {
      return (symbol) => {
        const account = this.activeAccount
        if (!account) return []

        const importedRows = Array.isArray(account.importedTransactions)
          ? account.importedTransactions
          : []
        const importedById = new Map(
          importedRows.map((row) => [String(row?.id || '').trim(), row])
        )
        const trades = Array.isArray(account.trades) ? account.trades : []
        const relRows = Array.isArray(account.relTradeTransactions) ? account.relTradeTransactions : []
        const symbolFilter = toUpperSymbol(symbol)

        const allocatedSourceIds = new Set()
        const allocatedSourceFingerprints = new Set()
        const allocatedSourceKeys = new Set()
        const allocatedSourceLooseKeys = new Set()
        const markAllocated = (sourceId) => {
          const normalizedId = String(sourceId || '').trim()
          if (!normalizedId) return
          allocatedSourceIds.add(normalizedId)
          const sourceRow = importedById.get(normalizedId)
          const sourceFingerprint = String(sourceRow?.sourceFingerprint || '').trim()
          if (sourceFingerprint) {
            allocatedSourceFingerprints.add(sourceFingerprint)
          }
          const sourceKey = getImportedTransactionAllocationKey(sourceRow)
          if (sourceKey) {
            allocatedSourceKeys.add(sourceKey)
          }
          const sourceLooseKey = getImportedTransactionLooseKey(sourceRow)
          if (sourceLooseKey) {
            allocatedSourceLooseKeys.add(sourceLooseKey)
          }
        }

        trades.forEach((trade) => {
          markAllocated(trade?.sourceTransactionId)
        })
        relRows.forEach((rel) => {
          markAllocated(rel?.sourceTransactionId)
        })

        return importedRows
          .filter((row) => {
            const sourceId = String(row?.id || '').trim()
            if (!sourceId || allocatedSourceIds.has(sourceId)) return false
            const sourceFingerprint = String(row?.sourceFingerprint || '').trim()
            if (sourceFingerprint && allocatedSourceFingerprints.has(sourceFingerprint)) return false
            const sourceKey = getImportedTransactionAllocationKey(row)
            if (sourceKey && allocatedSourceKeys.has(sourceKey)) return false
            const sourceLooseKey = getImportedTransactionLooseKey(row)
            if (sourceLooseKey && allocatedSourceLooseKeys.has(sourceLooseKey)) return false
            const rowSymbol = toTradeUnderlyingSymbol(row?.symbol, row?.description)
            if (!symbolFilter) return true
            if (!rowSymbol) return true
            return rowSymbol === symbolFilter
          })
          .slice()
          .sort((a, b) => {
            const dateA = String(a?.date || '')
            const dateB = String(b?.date || '')
            if (dateA > dateB) return -1
            if (dateA < dateB) return 1
            const orderA = Number(a?.executionOrder || 0)
            const orderB = Number(b?.executionOrder || 0)
            if (orderA !== orderB) return orderB - orderA
            return String(a?.id || '').localeCompare(String(b?.id || ''))
          })
      }
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
        this.calculateProjectionsV2()
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
      if (this.loadDataPromise) {
        return this.loadDataPromise
      }

      this.loadDataPromise = (async () => {
      try {
        this.syncCenter.driveConfigured = isDrivePersistenceConfigured()
        this.syncCenter.driveConnected = isDriveConnected()
        const { data, meta, source, reason, validationErrors, inspection } = await loadAppState()
        this.persistenceMeta = meta
        this.syncCenter.driveLastSuccessAt = meta?.lastDriveSyncAt || null
        this.startupInspection = inspection || null

        if (source === 'startup-manual-recovery-required') {
          this.startupRequiresManualRecovery = true
          this.startupRecoveryReason = String(reason || 'unrecognized-local-state')
          this.startupValidationErrors = Array.isArray(validationErrors) ? validationErrors.slice() : []
          const validationSummary = this.startupValidationErrors.length
            ? ` Validation issues: ${this.startupValidationErrors.join(' | ')}`
            : ''
          this.persistenceError = `Startup blocked: local data is not recognized for automatic runtime load. Open Data Manager to review or initialize starting data manually.${validationSummary}`
          this.loading = false
          return
        }

        if (source === 'empty') {
          this.db = createPersistableStateSnapshot({
            accounts: [createDefaultAccount()]
          })
          this.ensureSelectedAccount()
          this.startupRequiresManualRecovery = false
          this.startupRecoveryReason = null
          this.startupValidationErrors = []
          this.persistenceError = null
          await this.saveChanges()
          this.calculateProjectionsV2()
          return
        }

        if (data && Array.isArray(data.accounts)) {
          this.db = createPersistableStateSnapshot(data)
          this.ensureSelectedAccount()
          this.applyPositionMetadataForActiveAccount()
          this.startupRequiresManualRecovery = false
          this.startupRecoveryReason = null
          this.startupValidationErrors = []
        } else {
          this.startupRequiresManualRecovery = true
          this.startupRecoveryReason = 'startup-payload-missing-data'
          this.startupValidationErrors = []
          this.persistenceError = 'Startup blocked: no runtime account data was available. Open Data Manager to review local persistence.'
          this.loading = false
          return
        }
        this.persistenceError = null
        this.calculateProjectionsV2()
      } catch (error) {
        console.error('Failed to load data:', error)
        this.persistenceError = `Failed to load local state: ${error?.message || error}`
        this.startupRequiresManualRecovery = true
        this.startupRecoveryReason = 'startup-load-error'
        this.startupValidationErrors = []
        this.loading = false
      }
      finally {
        this.loadDataPromise = null
      }
      })()

      return this.loadDataPromise
    },
    
    async saveChanges() {
      try {
        pruneOrphanedTradeNotes(this.db)
        const dataToSave = createPersistableStateSnapshot(this.db)
        const { meta } = await saveAppState(dataToSave, this.persistenceMeta)
        this.persistenceMeta = meta
        this.persistenceError = null
        this.startupRequiresManualRecovery = false
        this.startupRecoveryReason = null
        this.startupValidationErrors = []
        this.initTooltips()  // Initialize tooltips after save
      } catch (error) {
        console.error('Failed to save changes:', error)
        this.persistenceError = `Failed to save local state: ${error?.message || error}`
      }
    },

    async saveChangesAndRecalculate() {
      await this.saveChanges()
      this.calculateProjectionsV2()
    },

    _requireActiveAccount() {
      if (!this.activeAccount) {
        throw new Error('Trade Desk requires an active account.')
      }
      return this.activeAccount
    },

    _findImportedTransactionById(sourceTransactionId, account = this.activeAccount) {
      const sourceId = String(sourceTransactionId || '').trim()
      if (!sourceId || !account) return null
      return (Array.isArray(account.importedTransactions) ? account.importedTransactions : [])
        .find((row) => String(row?.id || '') === sourceId) || null
    },

    _getTradeById(tradeId, account = this.activeAccount) {
      const id = String(tradeId || '').trim()
      if (!id || !account) return null
      return (Array.isArray(account.trades) ? account.trades : [])
        .find((trade) => String(trade?.id || '') === id) || null
    },

    _getAllocatedTradeIdBySourceId(sourceTransactionId, account = this.activeAccount) {
      const sourceId = String(sourceTransactionId || '').trim()
      if (!sourceId || !account) return null

      const tradeByOrigin = (Array.isArray(account.trades) ? account.trades : [])
        .find((trade) => String(trade?.sourceTransactionId || '') === sourceId)
      if (tradeByOrigin) return String(tradeByOrigin.id)

      const relation = (Array.isArray(account.relTradeTransactions) ? account.relTradeTransactions : [])
        .find((rel) => String(rel?.sourceTransactionId || '') === sourceId)
      return relation ? String(relation.tradeId || '') : null
    },

    _normalizeTradeDeskScopeForAccount(account = this.activeAccount) {
      const accountId = String(account?.id || '')
      if (!account || !accountId) return false

      let changed = false
      ;(Array.isArray(account.trades) ? account.trades : []).forEach((trade) => {
        if (String(trade?.accountId || '') === accountId) return
        trade.accountId = accountId
        changed = true
      })
      ;(Array.isArray(account.relTradeTransactions) ? account.relTradeTransactions : []).forEach((rel) => {
        if (String(rel?.accountId || '') === accountId) return
        rel.accountId = accountId
        changed = true
      })

      return changed
    },

    _ensureTradeScope(trade, account = this.activeAccount) {
      if (!trade || !account) return false
      const accountId = String(account?.id || '')
      if (!accountId) return false
      if (String(trade?.accountId || '') === accountId) return false
      trade.accountId = accountId
      return true
    },

    _inferTradeEventKindFromAction(action) {
      const normalized = String(action || '').trim().toLowerCase()
      if (!normalized) return 'event'

      if (normalized.includes('to open')) return 'open'
      if (normalized.includes('to close')) return 'close'
      if (normalized.includes('expired')) return 'close'
      if (normalized.includes('assignment') || normalized.includes('assigned')) return 'assignment'
      if (normalized === 'sell short') return 'open'
      if (normalized === 'buy' || normalized === 'buy to cover') return 'open'
      if (normalized === 'sell') return 'close'
      return 'event'
    },

    _getTradeTimelineEntries(trade) {
      const account = this._requireActiveAccount()
      const importedRows = Array.isArray(account.importedTransactions) ? account.importedTransactions : []
      const relRows = Array.isArray(account.relTradeTransactions) ? account.relTradeTransactions : []
      const tradeId = String(trade?.id || '')
      if (!tradeId) return []

      const importedById = new Map(importedRows.map(row => [String(row?.id || ''), row]))
      const timelineEntries = []
      const seenOriginSourceIds = new Set()

      const originSourceId = String(trade?.sourceTransactionId || '').trim()
      if (originSourceId) {
        const sourceRow = importedById.get(originSourceId) || null
        timelineEntries.push({
          id: `origin_${tradeId}_${originSourceId}`,
          tradeId,
          sourceTransactionId: originSourceId,
          relId: null,
          eventDate: toIsoDateOnly(sourceRow?.date || trade?.openedAt),
          eventWeek: Number.isFinite(Number(sourceRow?.week)) ? Number(sourceRow.week) : null,
          eventKind: sourceRow ? this._inferTradeEventKindFromAction(sourceRow?.action) : 'open',
          cashImpact: Number(sourceRow?.amount || 0),
          quantity: sourceRow?.quantity === undefined || sourceRow?.quantity === null ? null : Number(sourceRow.quantity),
          isOrigin: true,
          source: sourceRow
        })
        seenOriginSourceIds.add(originSourceId)
      }

      relRows
        .filter((rel) => String(rel?.tradeId || '') === tradeId)
        .forEach((rel) => {
          const sourceId = String(rel?.sourceTransactionId || '').trim()
          if (!sourceId) return
          if (seenOriginSourceIds.has(sourceId)) return
          const sourceRow = importedById.get(sourceId) || null
          const eventDate = toIsoDateOnly(rel?.eventDate || sourceRow?.date)
          timelineEntries.push({
            id: String(rel?.id || `rel_${tradeId}_${sourceId}`),
            tradeId,
            relId: String(rel?.id || ''),
            sourceTransactionId: sourceId,
            eventDate,
            eventWeek: rel?.eventWeek === undefined || rel?.eventWeek === null
              ? (Number.isFinite(Number(sourceRow?.week)) ? Number(sourceRow.week) : null)
              : Number(rel.eventWeek),
            eventKind: String(rel?.eventKind || this._inferTradeEventKindFromAction(sourceRow?.action) || 'event').toLowerCase(),
            cashImpact: Number(rel?.cashImpact || sourceRow?.amount || 0),
            quantity: rel?.quantity === undefined || rel?.quantity === null
              ? (sourceRow?.quantity === undefined || sourceRow?.quantity === null ? null : Number(sourceRow.quantity))
              : Number(rel.quantity),
            notes: rel?.notes || null,
            metadata: rel?.metadata || null,
            isOrigin: false,
            source: sourceRow
          })
        })

      return timelineEntries.sort((a, b) => {
        const dateA = String(a?.eventDate || '')
        const dateB = String(b?.eventDate || '')
        if (dateA < dateB) return -1
        if (dateA > dateB) return 1
        const orderA = Number(a?.source?.executionOrder || 0)
        const orderB = Number(b?.source?.executionOrder || 0)
        if (orderA !== orderB) return orderA - orderB
        return String(a?.id || '').localeCompare(String(b?.id || ''))
      })
    },

    getTradeTimeline(tradeId) {
      const account = this._requireActiveAccount()
      const trade = this._getTradeById(tradeId, account)
      if (!trade) return []
      return this._getTradeTimelineEntries(trade)
    },

    _inferCapitalAtRiskFromEvent(trade, event, openPositionsBySourceId) {
      const sourceRow = event?.source || null
      const rawMetadataCapital = Number(event?.metadata?.capitalAtRisk)
      if (Number.isFinite(rawMetadataCapital) && rawMetadataCapital > 0) {
        return {
          value: rawMetadataCapital,
          incomplete: false,
          reason: '',
          inferredFrom: 'metadata.capitalAtRisk'
        }
      }

      const sourceSymbol = toUpperSymbol(sourceRow?.symbol)
      const description = String(sourceRow?.description || '').trim()
      const action = String(sourceRow?.action || '').trim().toLowerCase()
      const quantity = Math.abs(Number(sourceRow?.quantity || event?.quantity || 0))
      const amount = Number(sourceRow?.amount || event?.cashImpact || 0)
      const optionMatch = OPTION_SYMBOL_REGEX.exec(sourceSymbol) || OPTION_SYMBOL_REGEX.exec(description)

      if (optionMatch) {
        const strike = Number(optionMatch[3])
        const right = String(optionMatch[4] || '').toUpperCase()
        if (right === 'P' && quantity > 0 && Number.isFinite(strike) && strike > 0) {
          return {
            value: strike * quantity * 100,
            incomplete: false,
            reason: '',
            inferredFrom: 'option put collateral'
          }
        }

        if (right === 'C') {
          const symbolToMatch = toUpperSymbol(optionMatch[1] || trade?.symbol)
          const symbolPositions = (Array.isArray(this.activeAccount?.positions) ? this.activeAccount.positions : [])
            .filter((position) => toUpperSymbol(position?.symbol) === symbolToMatch)
          const positionCapital = symbolPositions.reduce((highest, position) => {
            const basis = Math.abs(Number(position?.costBasis || 0))
            return basis > highest ? basis : highest
          }, 0)
          if (positionCapital > 0) {
            return {
              value: positionCapital,
              incomplete: false,
              reason: '',
              inferredFrom: 'covered-call position basis'
            }
          }
          return {
            value: null,
            incomplete: true,
            reason: 'Covered-call capital basis was not available.',
            inferredFrom: ''
          }
        }
      }

      const positionMatch = openPositionsBySourceId.get(String(event?.sourceTransactionId || ''))
      if (positionMatch) {
        const basis = Math.abs(Number(positionMatch?.costBasis || 0))
        if (basis > 0) {
          return {
            value: basis,
            incomplete: false,
            reason: '',
            inferredFrom: 'position source cost basis'
          }
        }
      }

      if (action.includes('buy') && amount < 0) {
        return {
          value: Math.abs(amount),
          incomplete: false,
          reason: '',
          inferredFrom: 'assignment cash outlay'
        }
      }

      return {
        value: null,
        incomplete: true,
        reason: `Unable to infer capital at risk for ${event?.eventDate || 'event'} (${event?.eventKind || 'event'}).`,
        inferredFrom: ''
      }
    },

    _computeTradeMetrics(trade) {
      if (!trade) {
        return {
          netPremiums: 0,
          netPL: 0,
          durationWeeks: 0,
          capitalAtRisk: null,
          currentCapitalTiedUp: 0,
          weeklyROR: null,
          plScenarios: {
            hasOpenStockExposure: false,
            needsPositionResolution: false,
            resolutionMessage: '',
            openShares: 0,
            costBasis: 0,
            currentValue: 0,
            worstCaseNetPL: null,
            fullRecoveryNetPL: null,
            plusTenRecoveryNetPL: null,
          },
          denominator: {
            complete: false,
            reasons: ['Trade was not found.'],
            inferredFrom: []
          }
        }
      }

      const timelineEntries = this._getTradeTimelineEntries(trade)
      if (!timelineEntries.length) {
        return {
          netPremiums: 0,
          netPL: 0,
          durationWeeks: 0,
          capitalAtRisk: null,
          currentCapitalTiedUp: 0,
          weeklyROR: null,
          plScenarios: {
            hasOpenStockExposure: false,
            needsPositionResolution: false,
            resolutionMessage: '',
            openShares: 0,
            costBasis: 0,
            currentValue: 0,
            worstCaseNetPL: null,
            fullRecoveryNetPL: null,
            plusTenRecoveryNetPL: null,
          },
          denominator: {
            complete: false,
            reasons: ['No linked source transactions found for this trade.'],
            inferredFrom: []
          }
        }
      }

      const openPositionsBySourceId = new Map(
        (Array.isArray(this.activeAccount?.positions) ? this.activeAccount.positions : [])
          .filter((position) => position?.sourceTransactionId)
          .map(position => [String(position.sourceTransactionId), position])
      )

      const netPremiums = roundMoney(
        timelineEntries.reduce((sum, event) => {
          const source = event?.source || null
          if (!isOptionTransactionRow(source)) return sum
          return sum + Number(event?.cashImpact || 0)
        }, 0)
      )

      const netPL = roundMoney(
        timelineEntries.reduce((sum, event) => sum + Number(event?.cashImpact || 0), 0)
      )

      const datedEntries = timelineEntries.filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(String(entry?.eventDate || '')))
      const startDate = datedEntries.length ? datedEntries[0].eventDate : toIsoDateOnly(trade?.openedAt)
      const latestOptionExpirationDate = getLatestOptionExpirationIso(
        timelineEntries.map((entry) => entry?.source || null).filter(Boolean)
      )
      const terminalDate = trade?.status === 'closed'
        ? (datedEntries.length ? datedEntries[datedEntries.length - 1].eventDate : toIsoDateOnly(trade?.closedAt || trade?.openedAt))
        : (latestOptionExpirationDate || toIsoDateOnly(new Date()))

      const startMs = new Date(startDate).getTime()
      const endMs = new Date(terminalDate).getTime()
      const durationWeeks = Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.max(1, Math.ceil(((endMs - startMs) / (1000 * 60 * 60 * 24) + 1) / 7))
        : 1

      let runningRequiredCapital = 0
      let maxRunningRequiredCapital = 0
      const capitalStack = []
      const denominatorReasons = []
      const inferredFromSet = new Set()

      timelineEntries.forEach((event) => {
        const capitalInference = this._inferCapitalAtRiskFromEvent(trade, event, openPositionsBySourceId)
        const inferredCapital = Number(capitalInference?.value)
        if (capitalInference?.reason) {
          denominatorReasons.push(capitalInference.reason)
        }
        if (capitalInference?.inferredFrom) {
          inferredFromSet.add(capitalInference.inferredFrom)
        }

        const eventKind = String(event?.eventKind || '').toLowerCase()
        const isOpenKind = TRADE_OPEN_EVENT_KINDS.has(eventKind) || event?.isOrigin
        const isCloseKind = TRADE_CLOSE_EVENT_KINDS.has(eventKind)

        if (isOpenKind) {
          if (Number.isFinite(inferredCapital) && inferredCapital > 0) {
            capitalStack.push(inferredCapital)
            runningRequiredCapital += inferredCapital
          }
        } else if (isCloseKind) {
          if (Number.isFinite(inferredCapital) && inferredCapital > 0) {
            runningRequiredCapital = Math.max(0, runningRequiredCapital - inferredCapital)
          } else if (capitalStack.length) {
            const closedCapital = Number(capitalStack.pop() || 0)
            runningRequiredCapital = Math.max(0, runningRequiredCapital - closedCapital)
          }
        }

        if (Number.isFinite(inferredCapital) && inferredCapital > 0) {
          maxRunningRequiredCapital = Math.max(maxRunningRequiredCapital, inferredCapital, runningRequiredCapital)
        } else if (!isCloseKind) {
          denominatorReasons.push(`Denominator is partial for ${event?.eventDate || 'an event'} due to missing capital inference.`)
        }
      })

      const linkedSourceIdSet = new Set(
        timelineEntries.map(entry => String(entry?.sourceTransactionId || '').trim()).filter(Boolean)
      )
      const allPositions = Array.isArray(this.activeAccount?.positions) ? this.activeAccount.positions : []
      const relPositionRows = Array.isArray(this.activeAccount?.relPositionTransactions)
        ? this.activeAccount.relPositionTransactions
        : []
      const linkedPositionKeySet = new Set(
        relPositionRows
          .filter((rel) => linkedSourceIdSet.has(String(rel?.sourceTransactionId || '').trim()))
          .map((rel) => String(rel?.positionKey || '').trim())
          .filter(Boolean)
      )
      const matchedPositions = allPositions.filter((position) => {
        const sourceId = String(position?.sourceTransactionId || '').trim()
        const positionKey = String(position?.positionKey || '').trim()
        return (sourceId && linkedSourceIdSet.has(sourceId)) || (positionKey && linkedPositionKeySet.has(positionKey))
      })

      const putCollateralCapital = getPutCollateralFromOpenShortContracts(timelineEntries)

      let capitalAtRisk = null
      let denominatorComplete = false
      if (putCollateralCapital > 0) {
        capitalAtRisk = putCollateralCapital
        denominatorComplete = true
        inferredFromSet.add('net open put collateral')
      } else if (maxRunningRequiredCapital > 0 && denominatorReasons.length === 0) {
        capitalAtRisk = roundMoney(maxRunningRequiredCapital)
        denominatorComplete = true
      }

      const hasStockExposureEvents = timelineEntries.some((event) => {
        const source = event?.source || null
        if (!source) return false
        const eventKind = String(event?.eventKind || '').toLowerCase()
        if (eventKind === 'assignment' || eventKind === 'assigned') return true
        const action = String(source?.action || '').trim().toLowerCase()
        if (!action.includes('buy')) return false
        const symbol = toUpperSymbol(source?.symbol)
        const description = String(source?.description || '').trim()
        const optionMatch = OPTION_SYMBOL_REGEX.exec(symbol) || OPTION_SYMBOL_REGEX.exec(description)
        return !optionMatch
      })

      const openStockExposure = matchedPositions.reduce((acc, position) => {
        const totalShares = Math.abs(Number(position?.shares || 0))
        const openShares = Math.abs(Number(getOpenShares(position) || 0))
        if (!Number.isFinite(openShares) || openShares <= 0) return acc

        const costBasis = Math.abs(Number(position?.costBasis || 0))
        const openCostBasis = totalShares > 0 ? costBasis * (openShares / totalShares) : costBasis
        const currentPrice = Number(position?.currentPrice || 0)
        const currentValue = openShares * currentPrice

        if (Number.isFinite(openCostBasis) && openCostBasis > 0) {
          acc.costBasis += openCostBasis
        }
        if (Number.isFinite(currentValue) && currentValue >= 0) {
          acc.currentValue += currentValue
        }
        acc.openShares += openShares
        return acc
      }, { openShares: 0, costBasis: 0, currentValue: 0 })

      const hasOpenStockExposure = openStockExposure.openShares > 0 && openStockExposure.costBasis > 0
      const stockTransactionExposure = timelineEntries.reduce((acc, event) => {
        const source = event?.source || null
        if (!source) return acc

        const symbol = toUpperSymbol(source?.symbol)
        const description = String(source?.description || '').trim()
        const optionMatch = OPTION_SYMBOL_REGEX.exec(symbol) || OPTION_SYMBOL_REGEX.exec(description)
        if (optionMatch) return acc

        const action = String(source?.action || event?.eventKind || '').trim().toLowerCase()
        const quantity = Math.abs(Number(source?.quantity ?? event?.quantity ?? 0))
        if (!Number.isFinite(quantity) || quantity <= 0) return acc

        const amount = Math.abs(Number(source?.amount ?? event?.cashImpact ?? 0))
        if (action.includes('buy')) {
          acc.buyShares += quantity
          if (Number.isFinite(amount) && amount > 0) acc.buyCost += amount
        } else if (action.includes('sell')) {
          acc.sellShares += quantity
        }
        return acc
      }, { buyShares: 0, sellShares: 0, buyCost: 0 })

      const openTransactionShares = Math.max(0, stockTransactionExposure.buyShares - stockTransactionExposure.sellShares)
      const inferredTransactionOpenCostBasis = stockTransactionExposure.buyShares > 0 && openTransactionShares > 0
        ? roundMoney(stockTransactionExposure.buyCost * (openTransactionShares / stockTransactionExposure.buyShares))
        : 0
      const hasStockTransactionExposure = openTransactionShares > POSITION_SHARE_EPSILON && inferredTransactionOpenCostBasis > 0

      if (hasOpenStockExposure) {
        capitalAtRisk = roundMoney(openStockExposure.costBasis)
        denominatorComplete = capitalAtRisk > 0
        inferredFromSet.add('linked open position cost basis total')
      } else if (hasStockTransactionExposure) {
        capitalAtRisk = inferredTransactionOpenCostBasis
        denominatorComplete = capitalAtRisk > 0
        inferredFromSet.add('linked stock transaction cost basis')
      }

      const currentCapitalTiedUp = capitalAtRisk !== null
        ? capitalAtRisk
        : roundMoney(Math.max(0, runningRequiredCapital))
      const weeklyROR = denominatorComplete && capitalAtRisk > 0 && durationWeeks > 0
        ? roundMoney((netPL / capitalAtRisk / durationWeeks) * 100)
        : null
      const normalizedDenominatorReasons = denominatorComplete
        ? []
        : (denominatorReasons.length
            ? Array.from(new Set(denominatorReasons))
            : ['Capital at risk could not be inferred from linked puts or linked open-position cost basis.'])

      const plScenarios = hasOpenStockExposure
        ? {
            hasOpenStockExposure: true,
            needsPositionResolution: false,
            resolutionMessage: '',
            openShares: roundMoney(openStockExposure.openShares),
            costBasis: roundMoney(openStockExposure.costBasis),
            currentValue: roundMoney(openStockExposure.currentValue),
            worstCaseNetPL: roundMoney(netPL + openStockExposure.currentValue),
            fullRecoveryNetPL: roundMoney(netPL + openStockExposure.costBasis),
            plusTenRecoveryNetPL: roundMoney(netPL + (openStockExposure.costBasis * 1.10)),
          }
        : {
            hasOpenStockExposure: false,
            needsPositionResolution: hasStockExposureEvents,
            resolutionMessage: hasStockExposureEvents
              ? 'Assignment/stock-buy activity exists, but no linked position was found from this trade’s linked transactions.'
              : '',
            openShares: 0,
            costBasis: 0,
            currentValue: 0,
            worstCaseNetPL: null,
            fullRecoveryNetPL: null,
            plusTenRecoveryNetPL: null,
          }

      return {
        netPremiums,
        netPL,
        durationWeeks,
        capitalAtRisk,
        currentCapitalTiedUp,
        weeklyROR,
        plScenarios,
        denominator: {
          complete: denominatorComplete,
          reasons: normalizedDenominatorReasons,
          inferredFrom: Array.from(inferredFromSet),
        },
        startDate,
        endDate: terminalDate
      }
    },

    _validateTradeMetricOutput(metrics, tradeId = '') {
      const context = tradeId ? ` for trade ${tradeId}` : ''
      if (!metrics || typeof metrics !== 'object') {
        throw new Error(`Trade metrics${context} did not return an object.`)
      }
      const requiredKeys = ['netPremiums', 'netPL', 'durationWeeks', 'capitalAtRisk', 'currentCapitalTiedUp', 'weeklyROR', 'denominator', 'plScenarios']
      requiredKeys.forEach((key) => {
        if (!(key in metrics)) {
          throw new Error(`Trade metrics${context} is missing required key "${key}".`)
        }
      })
      if (!metrics.denominator || typeof metrics.denominator !== 'object') {
        throw new Error(`Trade metrics${context} has invalid denominator payload.`)
      }
      if (!Array.isArray(metrics.denominator.reasons)) {
        throw new Error(`Trade metrics${context} denominator.reasons must be an array.`)
      }
      if (metrics.plScenarios !== null && typeof metrics.plScenarios !== 'object') {
        throw new Error(`Trade metrics${context} plScenarios must be an object or null.`)
      }
      if (
        metrics.weeklyROR !== null &&
        (metrics.capitalAtRisk === null || Number(metrics.capitalAtRisk) <= 0 || Number(metrics.durationWeeks) <= 0 || !metrics.denominator.complete)
      ) {
        throw new Error(`Trade metrics${context} produced weeklyROR while denominator was incomplete or invalid.`)
      }
      if (
        (metrics.capitalAtRisk === null || Number(metrics.capitalAtRisk) <= 0 || !metrics.denominator.complete) &&
        metrics.weeklyROR !== null
      ) {
        throw new Error(`Trade metrics${context} must return weeklyROR as null when denominator is incomplete.`)
      }
    },

    recalculateTradeMetrics(tradeId) {
      const account = this._requireActiveAccount()
      this._normalizeTradeDeskScopeForAccount(account)
      const trade = this._getTradeById(tradeId, account)
      if (!trade) {
        throw new Error(`Trade ${tradeId} was not found in the active account.`)
      }
      this._ensureTradeScope(trade, account)
      const metrics = this._computeTradeMetrics(trade)
      this._validateTradeMetricOutput(metrics, tradeId)
      return metrics
    },

    _assertTradeDeskInvariants() {
      this._normalizeTradeDeskScopeForAccount(this.activeAccount)
      const check = this.runTradeDeskInvariantChecks()
      if (!check.ok) {
        throw new Error(`Trade Desk invariant check failed: ${check.errors.join(' | ')}`)
      }
    },

    createTrade(payload = {}) {
      const account = this._requireActiveAccount()
      if (!Array.isArray(account.trades)) account.trades = []
      if (!Array.isArray(account.relTradeTransactions)) account.relTradeTransactions = []

      const sourceTransactionId = String(payload?.sourceTransactionId || '').trim()
      if (!sourceTransactionId) {
        throw new Error('Creating a trade requires sourceTransactionId.')
      }

      const sourceRow = this._findImportedTransactionById(sourceTransactionId, account)
      if (!sourceRow) {
        throw new Error('sourceTransactionId must reference an imported transaction in the active account.')
      }

      const allocatedTradeId = this._getAllocatedTradeIdBySourceId(sourceTransactionId, account)
      if (allocatedTradeId) {
        throw new Error(`Source transaction ${sourceTransactionId} is already allocated to trade ${allocatedTradeId}.`)
      }

      const sourceSymbol = toUpperSymbol(sourceRow?.symbol)
      const payloadSymbol = toUpperSymbol(payload?.symbol)
      const symbol = payloadSymbol || sourceSymbol
      if (!symbol) {
        throw new Error('Trade symbol is required. Provide payload.symbol or select a source transaction with a symbol.')
      }
      const sourceMatchSymbol = toTradeUnderlyingSymbol(sourceRow?.symbol, sourceRow?.description)
      const tradeMatchSymbol = toTradeUnderlyingSymbol(symbol)
      if (sourceMatchSymbol && tradeMatchSymbol && tradeMatchSymbol !== sourceMatchSymbol) {
        throw new Error(`Trade symbol ${symbol} does not match source transaction symbol ${sourceSymbol}.`)
      }

      const now = new Date().toISOString()
      const trade = {
        id: createLocalRecordId('trd'),
        accountId: String(account.id),
        sourceTransactionId,
        symbol,
        status: payload?.status === 'closed' ? 'closed' : 'open',
        openedAt: toIsoDateOnly(payload?.openedAt || sourceRow?.date || now),
        closedAt: payload?.status === 'closed'
          ? toIsoDateOnly(payload?.closedAt || payload?.openedAt || sourceRow?.date || now)
          : null,
        name: payload?.name ? String(payload.name) : null,
        notes: payload?.notes ? String(payload.notes) : null,
        createdAt: now,
        updatedAt: now
      }

      account.trades.push(trade)
      this.recalculateTradeMetrics(trade.id)
      this._assertTradeDeskInvariants()
      this.saveChangesAndRecalculate()
      return trade
    },

    updateTrade(id, patch = {}) {
      const account = this._requireActiveAccount()
      this._normalizeTradeDeskScopeForAccount(account)
      const trade = this._getTradeById(id, account)
      if (!trade) {
        throw new Error(`Trade ${id} was not found in the active account.`)
      }
      this._ensureTradeScope(trade, account)

      let sourceTransactionId = String(trade?.sourceTransactionId || '').trim()
      if (patch?.sourceTransactionId !== undefined) {
        sourceTransactionId = String(patch.sourceTransactionId || '').trim()
        if (!sourceTransactionId) {
          throw new Error('Trade sourceTransactionId is required.')
        }
        const sourceRow = this._findImportedTransactionById(sourceTransactionId, account)
        if (!sourceRow) {
          throw new Error('sourceTransactionId must reference an imported transaction in the active account.')
        }
        const allocatedTradeId = this._getAllocatedTradeIdBySourceId(sourceTransactionId, account)
        if (allocatedTradeId && allocatedTradeId !== String(trade.id)) {
          throw new Error(`Source transaction ${sourceTransactionId} is already allocated to trade ${allocatedTradeId}.`)
        }
        trade.sourceTransactionId = sourceTransactionId
      }

      if (patch?.symbol !== undefined) {
        const nextSymbol = toUpperSymbol(patch.symbol)
        if (!nextSymbol) {
          throw new Error('Trade symbol cannot be empty.')
        }
        const sourceRow = this._findImportedTransactionById(sourceTransactionId, account)
        const sourceSymbol = toUpperSymbol(sourceRow?.symbol)
        const sourceMatchSymbol = toTradeUnderlyingSymbol(sourceRow?.symbol, sourceRow?.description)
        const nextMatchSymbol = toTradeUnderlyingSymbol(nextSymbol)
        if (sourceMatchSymbol && nextMatchSymbol && sourceMatchSymbol !== nextMatchSymbol) {
          throw new Error(`Trade symbol ${nextSymbol} does not match source transaction symbol ${sourceSymbol}.`)
        }
        trade.symbol = nextSymbol
      }

      if (patch?.status !== undefined) {
        trade.status = patch.status === 'closed' ? 'closed' : 'open'
      }
      if (patch?.openedAt !== undefined) {
        const openedAt = toIsoDateOnly(patch.openedAt)
        if (!openedAt) throw new Error('Trade openedAt must be a valid YYYY-MM-DD date.')
        trade.openedAt = openedAt
      }
      if (patch?.closedAt !== undefined) {
        trade.closedAt = patch.closedAt ? toIsoDateOnly(patch.closedAt) : null
      }
      if (patch?.name !== undefined) {
        trade.name = patch.name ? String(patch.name) : null
      }
      if (patch?.notes !== undefined) {
        trade.notes = patch.notes ? String(patch.notes) : null
      }
      trade.updatedAt = new Date().toISOString()

      this.recalculateTradeMetrics(trade.id)
      this._assertTradeDeskInvariants()
      this.saveChangesAndRecalculate()
      return trade
    },

    deleteTrade(id) {
      const account = this._requireActiveAccount()
      this._normalizeTradeDeskScopeForAccount(account)
      const tradeId = String(id || '').trim()
      if (!tradeId) throw new Error('deleteTrade requires a trade id.')
      const tradeExists = (Array.isArray(account.trades) ? account.trades : []).some(trade => String(trade?.id || '') === tradeId)
      if (!tradeExists) throw new Error(`Trade ${tradeId} was not found in the active account.`)

      account.trades = (Array.isArray(account.trades) ? account.trades : [])
        .filter(trade => String(trade?.id || '') !== tradeId)
      account.relTradeTransactions = (Array.isArray(account.relTradeTransactions) ? account.relTradeTransactions : [])
        .filter(rel => String(rel?.tradeId || '') !== tradeId)
      account.notes = (Array.isArray(account.notes) ? account.notes : [])
        .filter((note) => !(
          String(note?.targetCollection || '') === 'trades' &&
          String(note?.targetId || '') === tradeId
        ))

      this._assertTradeDeskInvariants()
      this.saveChangesAndRecalculate()
    },

    linkSourceTransactionsToTrade(tradeId, sourceTransactionIds = []) {
      const account = this._requireActiveAccount()
      this._normalizeTradeDeskScopeForAccount(account)
      const trade = this._getTradeById(tradeId, account)
      if (!trade) {
        throw new Error(`Trade ${tradeId} was not found in the active account.`)
      }
      this._ensureTradeScope(trade, account)
      if (!Array.isArray(account.relTradeTransactions)) account.relTradeTransactions = []

      const uniqueSourceIds = Array.from(
        new Set((Array.isArray(sourceTransactionIds) ? sourceTransactionIds : []).map(id => String(id || '').trim()).filter(Boolean))
      )
      if (!uniqueSourceIds.length) return []

      const importedById = new Map(
        (Array.isArray(account.importedTransactions) ? account.importedTransactions : [])
          .map(row => [String(row?.id || ''), row])
      )
      const linkedSourceIdsInTrade = new Set(
        (Array.isArray(account.relTradeTransactions) ? account.relTradeTransactions : [])
          .filter(rel => String(rel?.tradeId || '') === String(trade.id))
          .map(rel => String(rel?.sourceTransactionId || ''))
      )

      const createdRelations = []
      uniqueSourceIds.forEach((sourceTransactionId) => {
        if (sourceTransactionId === String(trade.sourceTransactionId || '')) return
        if (linkedSourceIdsInTrade.has(sourceTransactionId)) return

        const sourceRow = importedById.get(sourceTransactionId)
        if (!sourceRow) {
          throw new Error(`sourceTransactionId ${sourceTransactionId} does not exist in active account importedTransactions.`)
        }

        const allocatedTradeId = this._getAllocatedTradeIdBySourceId(sourceTransactionId, account)
        if (allocatedTradeId && allocatedTradeId !== String(trade.id)) {
          throw new Error(`Source transaction ${sourceTransactionId} is already allocated to trade ${allocatedTradeId}.`)
        }

        const sourceSymbol = toTradeUnderlyingSymbol(sourceRow?.symbol, sourceRow?.description)
        const tradeSymbol = toTradeUnderlyingSymbol(trade?.symbol)
        if (sourceSymbol && tradeSymbol && sourceSymbol !== tradeSymbol) {
          throw new Error(`Cannot link ${sourceTransactionId}: source symbol ${sourceSymbol} does not match trade symbol ${tradeSymbol}.`)
        }

        const relation = {
          id: createLocalRecordId('reltrd'),
          accountId: String(account.id),
          tradeId: String(trade.id),
          sourceTransactionId,
          eventDate: toIsoDateOnly(sourceRow?.date) || toIsoDateOnly(new Date()),
          eventWeek: Number.isFinite(Number(sourceRow?.week)) ? Number(sourceRow.week) : this.getWeekNumber(sourceRow?.date),
          eventKind: this._inferTradeEventKindFromAction(sourceRow?.action),
          cashImpact: Number(sourceRow?.amount || 0),
          quantity: sourceRow?.quantity === undefined || sourceRow?.quantity === null ? null : Number(sourceRow.quantity),
          notes: null,
          metadata: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        account.relTradeTransactions.push(relation)
        createdRelations.push(relation)
      })

      this.recalculateTradeMetrics(trade.id)
      this._assertTradeDeskInvariants()
      this.saveChangesAndRecalculate()
      return createdRelations
    },

    unlinkTradeTransactions(relIds = []) {
      const account = this._requireActiveAccount()
      const relIdSet = new Set(
        (Array.isArray(relIds) ? relIds : []).map(id => String(id || '').trim()).filter(Boolean)
      )
      if (!relIdSet.size) return

      const impactedTradeIds = new Set()
      ;(Array.isArray(account.relTradeTransactions) ? account.relTradeTransactions : []).forEach((rel) => {
        if (relIdSet.has(String(rel?.id || ''))) {
          impactedTradeIds.add(String(rel?.tradeId || ''))
        }
      })

      account.relTradeTransactions = (Array.isArray(account.relTradeTransactions) ? account.relTradeTransactions : [])
        .filter(rel => !relIdSet.has(String(rel?.id || '')))

      impactedTradeIds.forEach((tradeId) => {
        if (!tradeId) return
        const trade = this._getTradeById(tradeId, account)
        if (trade) this.recalculateTradeMetrics(trade.id)
      })

      this._assertTradeDeskInvariants()
      this.saveChangesAndRecalculate()
    },

    runTradeDeskInvariantChecks() {
      const account = this._requireActiveAccount()
      const trades = Array.isArray(account.trades) ? account.trades : []
      const relRows = Array.isArray(account.relTradeTransactions) ? account.relTradeTransactions : []
      const importedRows = Array.isArray(account.importedTransactions) ? account.importedTransactions : []
      const notes = Array.isArray(account.notes) ? account.notes : []
      const importedById = new Map(importedRows.map(row => [String(row?.id || ''), row]))
      const tradeById = new Map(trades.map(trade => [String(trade?.id || ''), trade]))

      const errors = []
      const allocated = new Map()

      trades.forEach((trade) => {
        const tradeId = String(trade?.id || '')
        const sourceId = String(trade?.sourceTransactionId || '').trim()
        if (String(trade?.accountId || '') !== String(account?.id || '')) {
          errors.push(`Trade ${tradeId} accountId ${trade?.accountId || '<missing>'} is outside active account scope.`)
        }
        if (!sourceId) {
          errors.push(`Trade ${tradeId} is missing sourceTransactionId.`)
          return
        }
        const sourceRow = importedById.get(sourceId)
        if (!sourceRow) {
          errors.push(`Trade ${tradeId} sourceTransactionId ${sourceId} is missing from importedTransactions.`)
          return
        }
        const tradeSymbol = toTradeUnderlyingSymbol(trade?.symbol)
        const sourceSymbol = toTradeUnderlyingSymbol(sourceRow?.symbol, sourceRow?.description)
        if (sourceSymbol && tradeSymbol && sourceSymbol !== tradeSymbol) {
          errors.push(`Trade ${tradeId} symbol ${tradeSymbol} does not match source ${sourceSymbol}.`)
        }
        const existing = allocated.get(sourceId)
        if (existing && existing !== tradeId) {
          errors.push(`Source transaction ${sourceId} is allocated to multiple trades (${existing}, ${tradeId}).`)
        }
        allocated.set(sourceId, tradeId)
      })

      relRows.forEach((rel) => {
        const relId = String(rel?.id || '')
        const sourceId = String(rel?.sourceTransactionId || '').trim()
        const tradeId = String(rel?.tradeId || '')
        const trade = tradeById.get(tradeId)
        if (!trade) {
          errors.push(`Relation ${relId} references missing trade ${tradeId}.`)
          return
        }
        if (String(rel?.accountId || '') !== String(account?.id || '')) {
          errors.push(`Relation ${relId} accountId ${rel?.accountId || '<missing>'} is outside active account scope.`)
        }
        if (!sourceId) {
          errors.push(`Relation ${relId} is missing sourceTransactionId.`)
          return
        }
        const sourceRow = importedById.get(sourceId)
        if (!sourceRow) {
          errors.push(`Relation ${relId} sourceTransactionId ${sourceId} is missing from importedTransactions.`)
          return
        }
        const existing = allocated.get(sourceId)
        if (existing && existing !== tradeId) {
          errors.push(`Source transaction ${sourceId} is allocated to multiple trades (${existing}, ${tradeId}).`)
        } else {
          allocated.set(sourceId, tradeId)
        }
        const tradeSymbol = toTradeUnderlyingSymbol(trade?.symbol)
        const sourceSymbol = toTradeUnderlyingSymbol(sourceRow?.symbol, sourceRow?.description)
        if (sourceSymbol && tradeSymbol && sourceSymbol !== tradeSymbol) {
          errors.push(`Relation ${relId} symbol mismatch (${tradeSymbol} vs ${sourceSymbol}).`)
        }
      })

      notes.forEach((note) => {
        if (String(note?.targetCollection || '') !== 'trades') return
        const noteId = String(note?.id || '<missing-id>')
        const targetId = String(note?.targetId || '').trim()
        if (!targetId) {
          errors.push(`Trade note ${noteId} is missing targetId.`)
          return
        }
        if (!tradeById.has(targetId)) {
          errors.push(`Trade note ${noteId} targets missing trade ${targetId}.`)
        }
      })

      return {
        ok: errors.length === 0,
        errors
      }
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
      const projectionPositions = this._getProjectionPositions()

      for (let week = 1; week <= this.weeks; week++) {
        const transactions = this._getTransactionsForWeek(week)

        // Calculate shares sold this week and previous week
        const sharesSold = Number(positionCloseCashByWeek.get(week) || 0)
        let startSharesBalance = 0
        const sharesSoldPreviousWeek = Number(positionCloseCashByWeek.get(week - 1) || 0)

        // Calculate shares bought this week and previous week, and shares held at start of week
        let sharesBought = 0
        let sharesBoughtPreviousWeek = 0
        for (let i = 0; i < projectionPositions.length; i++) {
          const position = projectionPositions[i]
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
        const closeEventKinds = new Set(['close', 'closed', 'sell', 'assignment', 'assigned'])
        const importedById = new Map(
          (Array.isArray(this.activeAccount?.importedTransactions) ? this.activeAccount.importedTransactions : [])
            .filter(row => row?.id)
            .map(row => [String(row.id), row])
        )

        relRows.forEach((rel) => {
          const eventKind = String(rel?.eventKind || '').toLowerCase()
          if (!closeEventKinds.has(eventKind)) return

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

      const positions = this._getProjectionPositions()
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

    _getProjectionPositions() {
      const positions = Array.isArray(this.activeAccount?.positions) ? this.activeAccount.positions : []
      const normalizedByKey = new Map()

      positions.forEach((position) => {
        const sourceTransactionId = String(position?.sourceTransactionId || '').trim()
        const dedupeKey = sourceTransactionId
          ? `src|${sourceTransactionId}`
          : [
              'legacy',
              String(position?.symbol || '').trim().toUpperCase(),
              String(position?.date || ''),
              Number(position?.assignedWeek || 0),
              Number(position?.shares || 0),
              Number(position?.costBasis || 0),
              position?.soldWeek === undefined || position?.soldWeek === null ? '' : Number(position.soldWeek),
              String(position?.positionType || ''),
              Number(position?.manual ? 1 : 0)
            ].join('|')

        const existing = normalizedByKey.get(dedupeKey)
        if (!existing) {
          normalizedByKey.set(dedupeKey, position)
          return
        }

        const existingExecution = Number(existing?.executionOrder || 0)
        const candidateExecution = Number(position?.executionOrder || 0)
        if (candidateExecution > existingExecution) {
          normalizedByKey.set(dedupeKey, position)
        }
      })

      return Array.from(normalizedByKey.values())
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

    formatDateRangeWithYearBadges(startDateInput, endDateInput, plainText = false) {
      if (!startDateInput || !endDateInput) return ''
      const startDate = new Date(startDateInput)
      const endDate = new Date(endDateInput)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return ''

      const startYear = startDate.getFullYear()
      const endYear = endDate.getFullYear()

      const formatMonthDay = (date) => {
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${month}/${day}`
      }

      if (plainText) {
        if (startYear === endYear) {
          return `${startYear}: ${formatMonthDay(startDate)} - ${formatMonthDay(endDate)}`
        }
        return `${startYear}: ${formatMonthDay(startDate)} - ${endYear}: ${formatMonthDay(endDate)}`
      }

      const shortStartYear = startYear.toString().substring(2)
      const shortEndYear = endYear.toString().substring(2)

      if (startYear === endYear) {
        return `<span class="badge rounded-pill bg-secondary text-white">'${shortStartYear}</span> ${formatMonthDay(startDate)} - ${formatMonthDay(endDate)}`
      }
      return `<span class="badge rounded-pill bg-secondary text-white">'${shortStartYear}</span> ${formatMonthDay(startDate)} - <span class="badge rounded-pill bg-secondary text-white">'${shortEndYear}</span> ${formatMonthDay(endDate)}`
    },

    weekRange(weekNum, plainText = false) {
      if (!weekNum) return ''
      const startDate = this.activeAccount.settings.startDate
        ? new Date(this.activeAccount.settings.startDate)
        : new Date()

      startDate.setDate(startDate.getDate() + (weekNum - 1) * 7)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 6)
      return this.formatDateRangeWithYearBadges(startDate, endDate, plainText)
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
          transactionTypes: ['moneylink transfer', 'moneylink deposit', 'journal', 'funds received', 'qualified dividend', 'credit interest', 'dividend', 'cash dividend', 'bank interest', 'foreign tax paid', 'margin interest', 'substitute inc pmt'],
          positionTypes: ['buy', 'reinvest shares'],
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

    /**
     * Calculate projections using v2 data model and algorithm.
     * 
     * PURPOSE:
     * Compute weekly balance and growth metrics for an account by iterating through weeks,
     * aggregating actual (imported) vs. projected growth, tracking cash balances and position
     * collateral requirements, and calculating metrics (ROR, trailing averages, etc.).
     * 
     * PROCESS:
     * 1. Validate account and settings exist
     * 2. Build helper maps: actualGrowth, positionCollateral, cashFlows
     * 3. Iterate weeks 1 to totalWeeks:
     *    a. Aggregate week-specific data (deposits, withdrawals, position changes)
     *    b. Calculate position collateral (critical for margin fix)
     *    c. Calculate growth (actual or projected based on week status)
     *    d. Calculate end balances and ROR
     *    e. Track trailing averages (only from weeks with actual data)
     * 4. Post-process: compute all-time averages and attach to all rows
     * 
     * OUTPUT: Each projection row contains:
     * - Week number and date range
     * - Cash balance tracking (start, end, deposits, withdrawals)
     * - Growth (actual or projected)
     * - Position collateral (start, changes, end)
     * - Available balance (cash minus collateral)
     * - ROR calculations (actual, projected, trailing)
     * - Trailing averages (4-week, 8-week, all-time)
     * 
     * CRITICAL FIX FOR MARGIN:
     * This algorithm explicitly tracks position collateral as a commitment of capital,
     * preventing the overstatement of available cash that existed in v1.
     * 
     * SPEC REF: docs/spec/projection-engine-v2-detailed.md
     * 
     * @see buildActualGrowthMap - Query importedTransactions by week
     * @see buildPositionCollateralMap - Query positions by lifecycle
     * @see buildCashFlowsMap - Query cashFlows by date range
     */
    calculateProjectionsV2() {
      this.projections = []
      
      // Validate account and settings
      if (!this.activeAccount?.settings) {
        return
      }

      const settings = this.activeAccount.settings
      const totalWeeks = settings.years * 52

      // Step 0: Build helper maps
      let brokerageFormat = null
      try {
        brokerageFormat = this.getBrokerageMap(this.activeAccount?.formatKey || 'schwab')
      } catch (error) {
        console.error('Error loading brokerage format:', error)
        return
      }

      const actualGrowthByWeek = buildActualGrowthMap(this.activeAccount, brokerageFormat)
      const { movementByWeek: positionMovement } = buildPositionCollateralMap(this.activeAccount)
      const cashFlowsByWeek = buildCashFlowsMap(this.activeAccount, totalWeeks)

      // Tracking arrays for trailing averages
      const actualGrowths = []
      const actualRORs = []

      // Step 1: Iterate through each week
      let startCashBalance = settings.startingBalance

      for (let week = 1; week <= totalWeeks; week++) {
        // ===== Step 2: Gather week-specific data =====
        
        // Get cash flows for this week
        const weekCashFlows = cashFlowsByWeek.get(week) || { deposits: 0, withdrawals: {} }
        const deposit = weekCashFlows.deposits
        const withdrawalsByCategory = weekCashFlows.withdrawals
        const withdrawal = sumWithdrawals(withdrawalsByCategory)

        // Get position changes for this week
        const positionMovementThisWeek = positionMovement.get(week) || { opened: 0, closed: 0 }
        const positionCollateralAdded = positionMovementThisWeek.opened
        const positionCollateralRemoved = positionMovementThisWeek.closed

        // ===== Step 3: Calculate position collateral =====
        // Build running total of open position collateral (critical for margin fix)
        let startPositionCollateral = 0
        this.activeAccount.positions.forEach(position => {
          const assignedWeek = Number(position?.assignedWeek)
          const soldWeek = position?.soldWeek ? Number(position.soldWeek) : null
          const collateral = Number(position?.costBasis || 0)

          // Position is open if assigned at or before this week, and not yet sold
          if (assignedWeek <= week && (!soldWeek || soldWeek > week)) {
            startPositionCollateral += collateral
          }
        })
        startPositionCollateral = Math.round(startPositionCollateral * 100) / 100

        const endPositionCollateral = Math.round((startPositionCollateral + positionCollateralAdded - positionCollateralRemoved) * 100) / 100

        // ===== Step 4: Calculate available capital and growth =====
        // Available capital = cash not locked in positions (critical insight from v2 spec)
        const availableCapital = Math.max(0, startCashBalance - startPositionCollateral)
        
        // Projected growth based on available capital
        const projectedGrowth = Math.max(0, availableCapital * (settings.weeklyReturn / 100))

        // Actual growth from imported transactions
        const weekActualGrowth = actualGrowthByWeek.has(week) ? actualGrowthByWeek.get(week) : null

        // ===== Step 5: Determine which growth to use =====
        // Get week dates to determine if past/current/future
        const { start: weekStart, end: weekEnd } = getWeekDateRange(settings.startDate, week)
        const weekStatus = getWeekStatus(weekEnd)
        
        let growth = projectedGrowth
        let hasActualGrowth = false
        if (weekStatus !== 'future' && weekActualGrowth !== null) {
          growth = weekActualGrowth
          hasActualGrowth = true
          actualGrowths.push(weekActualGrowth)
        } else if (weekStatus === 'future' && weekActualGrowth !== null) {
          // For future weeks, still track actual if it exists (shouldn't normally happen)
          actualGrowths.push(weekActualGrowth)
          hasActualGrowth = true
        }

        // ===== Step 6: Calculate end-of-week cash balance =====
        const endBalance = Math.round((startCashBalance + deposit - withdrawal + growth) * 100) / 100
        
        // Available balance = cash minus position collateral
        const availableBalance = Math.round((endBalance - endPositionCollateral) * 100) / 100

        // ===== Step 7: Calculate ROR =====
        // Base amount for ROR = total capital at risk (cash + position collateral)
        const baseAmountForROR = startCashBalance + startPositionCollateral
        
        let actualROR = null
        let projectedROR = 0
        let ror = 0

        if (baseAmountForROR !== 0) {
          if (weekActualGrowth !== null) {
            actualROR = (weekActualGrowth / baseAmountForROR) * 100
            actualRORs.push(actualROR)
          }
          projectedROR = (projectedGrowth / baseAmountForROR) * 100
          ror = hasActualGrowth && actualROR !== null ? actualROR : projectedROR
        }

        // ===== Step 8: Calculate trailing averages =====
        const last4WeeksGrowth = actualGrowths.slice(-4)
        const last8WeeksGrowth = actualGrowths.slice(-8)
        
        const trailing4WeekGrowthTotal = last4WeeksGrowth.length > 0
          ? last4WeeksGrowth.reduce((sum, g) => sum + g, 0)
          : null
        const trailing4WeekGrowthAvg = last4WeeksGrowth.length > 0
          ? trailing4WeekGrowthTotal / last4WeeksGrowth.length
          : null
        const trailing8WeekGrowthAvg = last8WeeksGrowth.length > 0
          ? last8WeeksGrowth.reduce((sum, g) => sum + g, 0) / last8WeeksGrowth.length
          : null
        const trailingTotalGrowthAvg = actualGrowths.length > 0
          ? actualGrowths.reduce((sum, g) => sum + g, 0) / actualGrowths.length
          : null

        const last4WeeksROR = actualRORs.slice(-4)
        const last8WeeksROR = actualRORs.slice(-8)
        
        const trailing4WeekRORAvg = last4WeeksROR.length > 0
          ? last4WeeksROR.reduce((sum, r) => sum + r, 0) / last4WeeksROR.length
          : null
        const trailing8WeekRORAvg = last8WeeksROR.length > 0
          ? last8WeeksROR.reduce((sum, r) => sum + r, 0) / last8WeeksROR.length
          : null
        const trailingTotalRORAvg = actualRORs.length > 0
          ? actualRORs.reduce((sum, r) => sum + r, 0) / actualRORs.length
          : null

        // ===== Step 9: Append projection row =====
        // Calculate shares for compatibility with old components
        let sharesBought = 0
        let sharesSold = 0
        let sharesBoughtPreviousWeek = 0
        let sharesSoldPreviousWeek = 0
        let startSharesBalance = 0
        
        this.activeAccount.positions.forEach(position => {
          if (position.assignedWeek === week) {
            sharesBought += Math.abs(position.costBasis || 0)
          }
          if (position.assignedWeek === week - 1) {
            sharesBoughtPreviousWeek += Math.abs(position.costBasis || 0)
          }
          if (position.soldWeek === week) {
            sharesSold += Math.abs(position.sellAmount || 0)
          }
          if (position.soldWeek === week - 1) {
            sharesSoldPreviousWeek += Math.abs(position.sellAmount || 0)
          }
          if (position.assignedWeek < week && (!position.soldWeek || position.soldWeek >= week)) {
            startSharesBalance += Math.abs(position.costBasis || 0)
          }
        })

        this.projections.push({
          week,
          weekStart,
          weekEnd,
          
          // BACKWARD COMPAT: Old field names expected by components
          startBalance: startCashBalance,
          startSharesBalance,
          sharesBought,
          sharesSold,
          sharesBoughtPreviousWeek,
          sharesSoldPreviousWeek,
          deposit,
          withdrawal: withdrawalsByCategory && Object.values(withdrawalsByCategory).length > 0 
            ? Object.values(withdrawalsByCategory).reduce((sum, cat) => sum + cat, 0)
            : 0,
          withdrawalsByCategory,
          
          // NEW: Cash balance tracking (v2 specific)
          startCashBalance,
          
          // Growth
          actualGrowth: hasActualGrowth ? weekActualGrowth : null,
          projectedGrowth,
          growth,
          
          // NEW: Position collateral tracking (CRITICAL FOR MARGIN FIX)
          startPositionCollateral,
          positionCollateralAdded,
          positionCollateralRemoved,
          endPositionCollateral,
          
          // End-of-week balances
          endBalance,
          availableBalance,
          
          // ROR calculations
          actualROR,
          projectedROR,
          ror,
          baseAmountForROR,
          
          // Trailing averages
          trailing4WeekGrowthTotal: trailing4WeekGrowthTotal ? (trailing4WeekGrowthTotal).toFixed(2) : null,
          trailing4WeekGrowthAvg: trailing4WeekGrowthAvg ? (trailing4WeekGrowthAvg).toFixed(2) : null,
          trailing8WeekGrowthAvg: trailing8WeekGrowthAvg ? (trailing8WeekGrowthAvg).toFixed(2) : null,
          trailingTotalGrowthAvg: trailingTotalGrowthAvg ? (trailingTotalGrowthAvg).toFixed(2) : null,
          
          trailing4WeekRORAvg: trailing4WeekRORAvg ? (trailing4WeekRORAvg).toFixed(2) : null,
          trailing8WeekRORAvg: trailing8WeekRORAvg ? (trailing8WeekRORAvg).toFixed(2) : null,
          trailingTotalRORAvg: trailingTotalRORAvg ? (trailingTotalRORAvg).toFixed(2) : null,
          
          // All-time averages (computed in step 10)
          averageGrowth: null,
          averageROR: null
        })

        // ===== Step 10: Next week's starting balance =====
        startCashBalance = endBalance
      }

      // ===== Step 11: Post-process all-time averages =====
      const allTimeAverageGrowth = actualGrowths.length > 0
        ? Math.round((actualGrowths.reduce((sum, g) => sum + g, 0) / actualGrowths.length) * 100) / 100
        : null
      const allTimeAverageROR = actualRORs.length > 0
        ? Math.round((actualRORs.reduce((sum, r) => sum + r, 0) / actualRORs.length) * 100) / 100
        : null

      this.projections.forEach(p => {
        p.averageGrowth = allTimeAverageGrowth
        p.averageROR = allTimeAverageROR
      })

      this.loading = false
    },
  }
})