const PERSISTENCE_MODE_LOCAL_FIRST = 'local-first'

const INDEXED_DB_NAME = 'omb-local-first'
const INDEXED_DB_VERSION = 2
const META_STORE_NAME = 'meta'
const META_KEY = 'omb.meta.v2'
const V2_COLLECTION_STORES = [
  'accounts',
  'importedTransactions',
  'cashFlows',
  'positions',
  'trades',
  'relTradeTransactions',
  'relPositionTransactions',
  'notes'
]
const DATA_MODEL_VERSION = 'v2'
const DEVICE_ID_KEY = 'omb.deviceId.v1'
const DRIVE_TOKEN_KEY = 'omb.drive.accessToken.v1'
const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const GOOGLE_DRIVE_API_BASE_URL = 'https://www.googleapis.com'
const SYNC_CENTER_EVENT_NAME = 'omb:sync-center'

export function getDriveConfig() {
  const backupRetentionRaw = Number(import.meta.env.VITE_GOOGLE_DRIVE_BACKUP_RETENTION)
  const backupRetention = Number.isInteger(backupRetentionRaw) && backupRetentionRaw >= 0
    ? backupRetentionRaw
    : 20

  return {
    clientId: String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim(),
    appDataFolderName: String(import.meta.env.VITE_GOOGLE_DRIVE_APPDATA_FILENAME || 'omb-data-envelope.json').trim(),
    scope: String(import.meta.env.VITE_GOOGLE_DRIVE_SCOPE || 'https://www.googleapis.com/auth/drive.appdata').trim(),
    redirectUri: String(import.meta.env.VITE_GOOGLE_REDIRECT_URI || '').trim(),
    backupPrefix: String(import.meta.env.VITE_GOOGLE_DRIVE_BACKUP_PREFIX || 'omb-backup-').trim(),
    backupRetention,
  }
}

export function isDrivePersistenceConfigured() {
  return Boolean(getDriveConfig().clientId)
}

export function isDriveConnected() {
  try {
    return Boolean(localStorage.getItem(DRIVE_TOKEN_KEY))
  } catch (error) {
    return false
  }
}

export function clearDriveConnection() {
  try {
    localStorage.removeItem(DRIVE_TOKEN_KEY)
  } catch (error) {
    console.warn('Unable to clear Drive token from storage.', error)
  }
}

export function getPersistenceMode() {
  return PERSISTENCE_MODE_LOCAL_FIRST
}

let driveMirrorQueue = Promise.resolve()

function emitSyncCenterEvent(type, payload = {}) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(SYNC_CENTER_EVENT_NAME, {
      detail: {
        type,
        at: new Date().toISOString(),
        ...payload
      }
    }))
  } catch (error) {
    console.warn('Unable to publish sync status event.', error)
  }
}

export function getSyncCenterEventName() {
  return SYNC_CENTER_EVENT_NAME
}

function isDriveAuthError(error) {
  const message = String(error?.message || '')
  return message.includes('401') || message.includes('UNAUTHENTICATED') || message.includes('Invalid Credentials')
}

function loadGoogleIdentityScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Google Drive sync requires a browser environment'))
      return
    }

    if (window.google?.accounts?.oauth2) {
      resolve(window.google)
      return
    }

    let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
    if (!script) {
      script = document.createElement('script')
      script.src = GOOGLE_IDENTITY_SCRIPT_URL
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google)
      } else {
        reject(new Error('Google Identity Services failed to initialize'))
      }
    }

    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
  })
}

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'))
      return
    }

    const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION)

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message || 'unknown error'}`))
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        db.createObjectStore(META_STORE_NAME)
      }
      V2_COLLECTION_STORES.forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' })
        }
      })
    }

    request.onsuccess = () => resolve(request.result)
  })
}

function idbGetFromStore(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.get(key)

    request.onerror = () => reject(new Error(`IndexedDB read failed: ${request.error?.message || 'unknown error'}`))
    request.onsuccess = () => resolve(request.result || null)
  })
}

function idbPutToStore(db, storeName, key, value) {
  return new Promise((resolve, reject) => {
    try {
      const serializableValue = serializeForStorage(value)
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = key === undefined ? store.put(serializableValue) : store.put(serializableValue, key)

      request.onerror = () => reject(new Error(`IndexedDB write failed: ${request.error?.message || 'unknown error'}`))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(new Error(`IndexedDB transaction failed: ${tx.error?.message || 'unknown error'}`))
    } catch (error) {
      reject(new Error(`IndexedDB write failed: ${error?.message || error}`))
    }
  })
}

function idbGetAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    request.onerror = () => reject(new Error(`IndexedDB read-all failed: ${request.error?.message || 'unknown error'}`))
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : [])
  })
}

function idbClearStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.clear()

    request.onerror = () => reject(new Error(`IndexedDB clear failed: ${request.error?.message || 'unknown error'}`))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(new Error(`IndexedDB transaction failed: ${tx.error?.message || 'unknown error'}`))
  })
}

function createFallbackDeviceId() {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

function resolveDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing

    const generated = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : createFallbackDeviceId()
    localStorage.setItem(DEVICE_ID_KEY, generated)
    return generated
  } catch (error) {
    console.warn('Failed to access localStorage for device ID. Falling back to an ephemeral ID.', error)
    return createFallbackDeviceId()
  }
}

function serializeForStorage(value) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    throw new Error(`Could not serialize data for storage: ${error?.message || error}`)
  }
}

function normalizeString(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function toFixedNumericString(value, decimals = 6) {
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

function toIsoDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function extractSourceFingerprint(row) {
  const effectiveDate = toIsoDate(row?.date) || ''
  const actionNormalized = normalizeString(row?.action).toLowerCase()
  const symbolNormalized = normalizeString(row?.symbol).toUpperCase()
  const descriptionNormalized = normalizeString(row?.description)
  const quantityNormalized = toFixedNumericString(row?.quantity)
  const priceNormalized = toFixedNumericString(row?.price)
  const amountNormalized = toFixedNumericString(row?.amount)
  const feesNormalized = toFixedNumericString(row?.fees ?? 0)
  const executionOrder = Number(row?.executionOrder || 0)
  const input = [
    effectiveDate,
    actionNormalized,
    symbolNormalized,
    descriptionNormalized,
    quantityNormalized,
    priceNormalized,
    amountNormalized,
    feesNormalized,
    executionOrder
  ].join('|')
  return simpleStableHash(input)
}

function createRecordId(prefix, ...parts) {
  return simpleStableHash(`${prefix}|${parts.map(part => String(part ?? '')).join('|')}`)
}

function resolveV2AccountId(account, accountIndex) {
  const fromV2Id = String(account?.v2Id || '').trim()
  if (fromV2Id) return fromV2Id

  const rawId = account?.id
  const rawIdString = String(rawId ?? '').trim()
  if (rawIdString.startsWith('acct-')) return rawIdString

  const rawIdNumber = Number(rawId)
  if (Number.isFinite(rawIdNumber) && rawIdNumber > 0) return `acct-${rawIdNumber}`

  return `acct-${accountIndex + 1}`
}

function ensureUniqueAccountId(candidateId, usedIds, accountIndex) {
  let resolved = String(candidateId || '').trim()
  if (!resolved) {
    resolved = `acct-${accountIndex + 1}`
  }
  if (!usedIds.has(resolved)) {
    usedIds.add(resolved)
    return resolved
  }

  let suffix = 2
  let next = `${resolved}-${suffix}`
  while (usedIds.has(next)) {
    suffix += 1
    next = `${resolved}-${suffix}`
  }
  usedIds.add(next)
  return next
}

function deriveAppAccountId(v2AccountId, fallbackIndex = 0) {
  const accountId = String(v2AccountId || '').trim()
  const match = /^acct-(\d+)$/.exec(accountId)
  if (match) {
    const parsed = Number(match[1])
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return fallbackIndex + 1
}

function buildV2CollectionsFromAppStateData(data) {
  const safeData = (data && typeof data === 'object') ? data : {}
  const accountsInput = Array.isArray(safeData.accounts) ? safeData.accounts : []
  const now = new Date().toISOString()

  const collections = {
    accounts: [],
    importedTransactions: [],
    cashFlows: [],
    positions: [],
    trades: [],
    relTradeTransactions: [],
    relPositionTransactions: [],
    notes: []
  }
  const usedAccountIds = new Set()

  accountsInput.forEach((account, accountIndex) => {
    const accountId = ensureUniqueAccountId(resolveV2AccountId(account, accountIndex), usedAccountIds, accountIndex)
    const accountCreatedAt = account?.createdAt || now
    const accountUpdatedAt = account?.updatedAt || now

    collections.accounts.push({
      id: accountId,
      name: normalizeString(account?.name || `Account ${accountIndex + 1}`),
      description: account?.description ? String(account.description) : null,
      formatKey: normalizeString(account?.formatKey || 'schwab'),
      settings: {
        startDate: toIsoDate(account?.settings?.startDate) || toIsoDate(now),
        startingBalance: Number(account?.settings?.startingBalance || 0),
        weeklyReturn: Number(account?.settings?.weeklyReturn || 0),
        years: Number(account?.settings?.years || 1)
      },
      positionMeta: Array.isArray(account?.positionMeta) ? serializeForStorage(account.positionMeta) : [],
      createdAt: accountCreatedAt,
      updatedAt: accountUpdatedAt
    })

    const actuals = Array.isArray(account?.actuals) ? account.actuals : []
    const importedRows = []
    if (Array.isArray(account?.importedTransactions) && account.importedTransactions.length > 0) {
      account.importedTransactions.forEach((row, rowIndex) => {
        const executionOrder = Number(row?.executionOrder || rowIndex + 1)
        const sourceLine = Number.isFinite(Number(row?.sourceLine)) ? Number(row.sourceLine) : null
        const sourceFingerprint = row?.sourceFingerprint || extractSourceFingerprint({ ...row, executionOrder })
        const id = String(row?.id || createRecordId('tx', accountId, sourceFingerprint, sourceLine ?? executionOrder))
        importedRows.push({
          id,
          accountId,
          sourceFingerprint,
          sourceLine,
          executionOrder,
          week: Number.isFinite(Number(row?.week || 0)) ? Number(row.week) : null,
          date: toIsoDate(row?.date) || toIsoDate(now),
          action: normalizeString(row?.action),
          symbol: normalizeString(row?.symbol).toUpperCase(),
          description: normalizeString(row?.description),
          quantity: Number(row?.quantity || 0),
          price: Number(row?.price || 0),
          amount: Number(row?.amount || 0),
          fees: row?.fees === undefined || row?.fees === null ? null : Number(row.fees),
          raw: null,
          createdAt: row?.createdAt || now,
          updatedAt: row?.updatedAt || now
        })
      })
    } else {
      actuals.forEach(actual => {
        const week = Number(actual?.week || 0)
        const rows = Array.isArray(actual?.data) ? actual.data : []
        rows.forEach((row, rowIndex) => {
          const executionOrder = Number(row?.executionOrder || rowIndex + 1)
          const sourceLine = Number.isFinite(Number(row?.sourceLine)) ? Number(row.sourceLine) : null
          const sourceFingerprint = extractSourceFingerprint({ ...row, executionOrder })
          const id = createRecordId('tx', accountId, sourceFingerprint, sourceLine ?? executionOrder)
          importedRows.push({
            id,
            accountId,
            sourceFingerprint,
            sourceLine,
            executionOrder,
            week: Number.isFinite(week) && week > 0 ? week : null,
            date: toIsoDate(row?.date) || toIsoDate(now),
            action: normalizeString(row?.action),
            symbol: normalizeString(row?.symbol).toUpperCase(),
            description: normalizeString(row?.description),
            quantity: Number(row?.quantity || 0),
            price: Number(row?.price || 0),
            amount: Number(row?.amount || 0),
            fees: row?.fees === undefined || row?.fees === null ? null : Number(row.fees),
            raw: null,
            createdAt: now,
            updatedAt: now
          })
        })
      })
    }
    collections.importedTransactions.push(...importedRows)

    const cashFlows = Array.isArray(account?.transactions) ? account.transactions : []
    cashFlows.forEach((flow, flowIndex) => {
      collections.cashFlows.push({
        id: createRecordId('cf', accountId, flowIndex, flow?.type, flow?.startWeek, flow?.amount),
        accountId,
        sourceTransactionId: flow?.sourceTransactionId || null,
        type: flow?.type === 'withdrawal' ? 'withdrawal' : 'deposit',
        category: String(flow?.category || 'adjustment'),
        amount: Number(flow?.amount || 0),
        startWeek: Number(flow?.startWeek || 1),
        endWeek: flow?.endWeek === null || flow?.endWeek === undefined ? null : Number(flow.endWeek),
        isRecurring: Number(flow?.endWeek || 0) > Number(flow?.startWeek || 0),
        isProjected: Boolean(flow?.isProjected),
        notes: flow?.notes ? String(flow.notes) : null,
        createdAt: now,
        updatedAt: now
      })
    })

    const positions = Array.isArray(account?.positions) ? account.positions : []
    const positionIdByKey = new Map()
    positions.forEach((position, positionIndex) => {
      const positionId = String(position?.id || createRecordId('pos', accountId, position?.positionKey || '', positionIndex))
      if (position?.positionKey) {
        positionIdByKey.set(String(position.positionKey), positionId)
      }
      collections.positions.push({
        id: positionId,
        accountId,
        sourceTransactionId: position?.sourceTransactionId || null,
        positionKey: String(position?.positionKey || positionId),
        symbol: normalizeString(position?.symbol).toUpperCase(),
        shares: Number(position?.shares || 0),
        costBasis: Number(position?.costBasis || 0),
        currentPrice: position?.currentPrice === undefined || position?.currentPrice === null ? null : Number(position.currentPrice),
        assignedWeek: Number(position?.assignedWeek || 0),
        soldWeek: position?.soldWeek === undefined || position?.soldWeek === null ? null : Number(position.soldWeek),
        soldShares: Number(position?.soldShares || 0),
        sellAmount: position?.sellAmount === undefined || position?.sellAmount === null ? null : Number(position.sellAmount),
        offsettingProfits: Number(position?.offsettingProfits || 0),
        profitAllocation: Number(position?.profitAllocation || 100),
        positionType: position?.positionType || null,
        manual: Boolean(position?.manual),
        createdAt: now,
        updatedAt: now
      })
    })

    const trades = Array.isArray(account?.trades) ? account.trades : []
    trades.forEach((trade, tradeIndex) => {
      const tradeId = String(trade?.id || createRecordId('trd', accountId, tradeIndex, trade?.symbol || ''))
      const sourceTransactionId = trade?.sourceTransactionId || null
      collections.trades.push({
        id: tradeId,
        accountId,
        sourceTransactionId,
        symbol: normalizeString(trade?.symbol).toUpperCase(),
        status: trade?.status === 'closed' ? 'closed' : 'open',
        openedAt: toIsoDate(trade?.openedAt) || toIsoDate(now),
        closedAt: toIsoDate(trade?.closedAt),
        name: trade?.name ? String(trade.name) : null,
        notes: trade?.notes ? String(trade.notes) : null,
        createdAt: trade?.createdAt || now,
        updatedAt: trade?.updatedAt || now
      })
    })

    const relTradeRows = Array.isArray(account?.relTradeTransactions)
      ? account.relTradeTransactions
      : (Array.isArray(account?.tradeEvents) ? account.tradeEvents : [])
    relTradeRows.forEach((rel, relIndex) => {
      const sourceTransactionId = rel?.sourceTransactionId || rel?.sourceKey || null
      collections.relTradeTransactions.push({
        id: String(rel?.id || createRecordId('reltrd', accountId, rel?.tradeId || '', relIndex)),
        accountId,
        tradeId: String(rel?.tradeId || ''),
        sourceTransactionId,
        eventDate: toIsoDate(rel?.eventDate) || toIsoDate(now),
        eventWeek: rel?.eventWeek === undefined || rel?.eventWeek === null ? null : Number(rel.eventWeek),
        eventKind: normalizeString(rel?.eventKind || 'event'),
        cashImpact: Number(rel?.cashImpact || 0),
        quantity: rel?.quantity === undefined || rel?.quantity === null ? null : Number(rel.quantity),
        notes: rel?.notes ? String(rel.notes) : null,
        metadata: rel?.metadata && typeof rel.metadata === 'object' ? serializeForStorage(rel.metadata) : null,
        createdAt: rel?.createdAt || now,
        updatedAt: rel?.updatedAt || now
      })
    })

    const relPositionRows = Array.isArray(account?.relPositionTransactions) ? account.relPositionTransactions : []
    relPositionRows.forEach((rel, relIndex) => {
      const resolvedPositionId = String(
        rel?.positionId ||
        (rel?.positionKey ? positionIdByKey.get(String(rel.positionKey)) : '') ||
        ''
      )
      collections.relPositionTransactions.push({
        id: String(rel?.id || createRecordId('relpos', accountId, resolvedPositionId || rel?.positionKey || '', relIndex)),
        accountId,
        positionId: resolvedPositionId,
        sourceTransactionId: rel?.sourceTransactionId || null,
        eventDate: toIsoDate(rel?.eventDate) || toIsoDate(now),
        eventWeek: rel?.eventWeek === undefined || rel?.eventWeek === null ? null : Number(rel.eventWeek),
        eventKind: normalizeString(rel?.eventKind || 'event'),
        quantity: rel?.quantity === undefined || rel?.quantity === null ? null : Number(rel.quantity),
        allocatedShares: rel?.allocatedShares === undefined || rel?.allocatedShares === null ? null : Number(rel.allocatedShares),
        allocatedAmount: rel?.allocatedAmount === undefined || rel?.allocatedAmount === null ? null : Number(rel.allocatedAmount),
        notes: rel?.notes ? String(rel.notes) : null,
        metadata: rel?.metadata && typeof rel.metadata === 'object' ? serializeForStorage(rel.metadata) : null,
        createdAt: rel?.createdAt || now,
        updatedAt: rel?.updatedAt || now
      })
    })

    const notes = Array.isArray(account?.notes) ? account.notes : []
    notes.forEach((noteRow, noteIndex) => {
      const weekTarget = noteRow?.week
      collections.notes.push({
        id: String(noteRow?.id || createRecordId('note', accountId, weekTarget || '', noteIndex)),
        accountId,
        targetCollection: noteRow?.targetCollection || 'weeks',
        targetId: noteRow?.targetId || (weekTarget !== undefined && weekTarget !== null ? String(Number(weekTarget)) : '0'),
        noteText: noteRow?.noteText || noteRow?.note || '',
        createdAt: noteRow?.createdAt || now,
        updatedAt: noteRow?.updatedAt || now
      })
    })
  })

  return collections
}

function buildAppStateDataFromV2Collections(collections) {
  const safeCollections = collections && typeof collections === 'object' ? collections : {}
  const accounts = Array.isArray(safeCollections.accounts) ? safeCollections.accounts : []
  const importedTransactions = Array.isArray(safeCollections.importedTransactions) ? safeCollections.importedTransactions : []
  const cashFlows = Array.isArray(safeCollections.cashFlows) ? safeCollections.cashFlows : []
  const positions = Array.isArray(safeCollections.positions) ? safeCollections.positions : []
  const notes = Array.isArray(safeCollections.notes) ? safeCollections.notes : []
  const trades = Array.isArray(safeCollections.trades) ? safeCollections.trades : []
  const relTradeTransactions = Array.isArray(safeCollections.relTradeTransactions) ? safeCollections.relTradeTransactions : []
  const relPositionTransactions = Array.isArray(safeCollections.relPositionTransactions) ? safeCollections.relPositionTransactions : []

  const accountMap = new Map()
  accounts.forEach((account, index) => {
    const accountNumericId = deriveAppAccountId(account?.id, index)
    accountMap.set(String(account.id), {
      id: accountNumericId,
      v2Id: String(account.id),
      name: account?.name || `Account ${index + 1}`,
      description: account?.description || '',
      formatKey: account?.formatKey || 'schwab',
      settings: serializeForStorage(account?.settings || {}),
      transactions: [],
      importedTransactions: [],
      positions: [],
      notes: [],
      positionMeta: Array.isArray(account?.positionMeta) ? serializeForStorage(account.positionMeta) : [],
      trades: [],
      relTradeTransactions: [],
      relPositionTransactions: []
    })
  })

  importedTransactions.forEach(row => {
    const account = accountMap.get(String(row.accountId))
    if (!account) return
    account.importedTransactions.push({
      id: row?.id || null,
      sourceFingerprint: row?.sourceFingerprint || null,
      sourceLine: row?.sourceLine,
      date: row?.date,
      description: row?.description,
      amount: Number(row?.amount || 0),
      action: row?.action,
      symbol: row?.symbol || '',
      quantity: Number(row?.quantity || 0),
      price: Number(row?.price || 0),
      fees: row?.fees === undefined || row?.fees === null ? 0 : Number(row.fees),
      executionOrder: Number(row?.executionOrder || 0),
      week: row?.week === undefined || row?.week === null ? null : Number(row.week),
      createdAt: row?.createdAt || null,
      updatedAt: row?.updatedAt || null
    })
  })

  cashFlows.forEach(flow => {
    const account = accountMap.get(String(flow.accountId))
    if (!account) return
    account.transactions.push({
      type: flow?.type,
      category: flow?.category,
      startWeek: Number(flow?.startWeek || 1),
      endWeek: flow?.endWeek === undefined || flow?.endWeek === null ? null : Number(flow.endWeek),
      amount: String(Number(flow?.amount || 0)),
      sourceTransactionId: flow?.sourceTransactionId || null,
      isProjected: Boolean(flow?.isProjected),
      notes: flow?.notes || null
    })
  })

  positions.forEach(position => {
    const account = accountMap.get(String(position.accountId))
    if (!account) return
    account.positions.push({
      id: position?.id || null,
      positionKey: position?.positionKey,
      symbol: position?.symbol,
      shares: Number(position?.shares || 0),
      costBasis: Number(position?.costBasis || 0),
      currentPrice: position?.currentPrice === undefined || position?.currentPrice === null ? 0 : Number(position.currentPrice),
      assignedWeek: Number(position?.assignedWeek || 0),
      soldWeek: position?.soldWeek === undefined || position?.soldWeek === null ? null : Number(position.soldWeek),
      soldShares: Number(position?.soldShares || 0),
      sellAmount: position?.sellAmount === undefined || position?.sellAmount === null ? null : Number(position.sellAmount),
      offsettingProfits: Number(position?.offsettingProfits || 0),
      startWeek: position?.startWeek === undefined || position?.startWeek === null ? null : Number(position.startWeek),
      profitAllocation: Number(position?.profitAllocation || 100),
      positionType: position?.positionType || null,
      manual: Boolean(position?.manual),
      sourceTransactionId: position?.sourceTransactionId || null
    })
  })

  trades.forEach(trade => {
    const account = accountMap.get(String(trade.accountId))
    if (!account) return
    account.trades.push(serializeForStorage(trade))
  })

  relTradeTransactions.forEach(rel => {
    const account = accountMap.get(String(rel.accountId))
    if (!account) return
    account.relTradeTransactions.push(serializeForStorage(rel))
  })

  relPositionTransactions.forEach(rel => {
    const account = accountMap.get(String(rel.accountId))
    if (!account) return
    const positionMatch = account.positions.find(position => String(position?.id || '') === String(rel?.positionId || ''))
    account.relPositionTransactions.push({
      ...serializeForStorage(rel),
      positionKey: positionMatch?.positionKey || null
    })
  })

  notes.forEach(note => {
    const account = accountMap.get(String(note.accountId))
    if (!account) return
    if (note.targetCollection === 'weeks') {
      account.notes.push({
        week: Number(note.targetId || 0),
        weekStart: null,
        note: note.noteText || '',
        noteText: note.noteText || '',
        targetCollection: note.targetCollection,
        targetId: note.targetId,
        id: note.id,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
      })
    } else {
      account.notes.push({
        note: note.noteText || '',
        noteText: note.noteText || '',
        targetCollection: note.targetCollection,
        targetId: note.targetId,
        id: note.id,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
      })
    }
  })

  const accountsOut = Array.from(accountMap.values())

  return { accounts: accountsOut }
}

function createReferenceIndex(rows, key = 'id') {
  const index = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach(row => {
    const id = row?.[key]
    if (id !== undefined && id !== null && String(id).trim()) {
      index.set(String(id), row)
    }
  })
  return index
}

function validateV2Collections(data) {
  const errors = []
  const warnings = []
  const safeData = data && typeof data === 'object' ? data : {}

  const accounts = Array.isArray(safeData.accounts) ? safeData.accounts : []
  const importedTransactions = Array.isArray(safeData.importedTransactions) ? safeData.importedTransactions : []
  const cashFlows = Array.isArray(safeData.cashFlows) ? safeData.cashFlows : []
  const positions = Array.isArray(safeData.positions) ? safeData.positions : []
  const trades = Array.isArray(safeData.trades) ? safeData.trades : []
  const relTradeTransactions = Array.isArray(safeData.relTradeTransactions) ? safeData.relTradeTransactions : []
  const relPositionTransactions = Array.isArray(safeData.relPositionTransactions) ? safeData.relPositionTransactions : []
  const notes = Array.isArray(safeData.notes) ? safeData.notes : []

  const accountIndex = createReferenceIndex(accounts)
  const importedIndex = createReferenceIndex(importedTransactions)
  const positionIndex = createReferenceIndex(positions)
  const tradeIndex = createReferenceIndex(trades)

  const seenRelTradeSource = new Map()

  trades.forEach((trade) => {
    if (!trade?.accountId || !accountIndex.has(String(trade.accountId))) {
      errors.push(`Trade ${trade?.id || '<missing-id>'} references missing accountId ${trade?.accountId || '<missing>'}.`)
    }
    if (!trade?.sourceTransactionId) {
      warnings.push(`Trade ${trade?.id || '<missing-id>'} missing required sourceTransactionId.`)
      return
    }
    const source = importedIndex.get(String(trade.sourceTransactionId))
    if (!source) {
      errors.push(`Trade ${trade?.id || '<missing-id>'} references missing sourceTransactionId ${trade.sourceTransactionId}.`)
      return
    }
    if (source.accountId && trade.accountId && String(source.accountId) !== String(trade.accountId)) {
      errors.push(`Trade ${trade?.id || '<missing-id>'} account mismatch with source transaction ${trade.sourceTransactionId}.`)
    }
    const tradeSymbol = normalizeString(trade?.symbol).toUpperCase()
    const sourceSymbol = normalizeString(source?.symbol).toUpperCase()
    if (sourceSymbol && tradeSymbol && sourceSymbol !== tradeSymbol) {
      errors.push(`Trade ${trade?.id || '<missing-id>'} symbol (${tradeSymbol}) does not match source transaction symbol (${sourceSymbol}).`)
    }
  })

  positions.forEach((position) => {
    if (!position?.accountId || !accountIndex.has(String(position.accountId))) {
      errors.push(`Position ${position?.id || '<missing-id>'} references missing accountId ${position?.accountId || '<missing>'}.`)
    }
    if (!position?.sourceTransactionId) {
      warnings.push(`Position ${position?.id || '<missing-id>'} missing required sourceTransactionId.`)
      return
    }
    const source = importedIndex.get(String(position.sourceTransactionId))
    if (!source) {
      errors.push(`Position ${position?.id || '<missing-id>'} references missing sourceTransactionId ${position.sourceTransactionId}.`)
      return
    }
    if (source.accountId && position.accountId && String(source.accountId) !== String(position.accountId)) {
      errors.push(`Position ${position?.id || '<missing-id>'} account mismatch with source transaction ${position.sourceTransactionId}.`)
    }
  })

  relTradeTransactions.forEach((rel) => {
    if (!rel?.tradeId || !tradeIndex.has(String(rel.tradeId))) {
      errors.push(`relTradeTransactions ${rel?.id || '<missing-id>'} references missing tradeId ${rel?.tradeId || '<missing>'}.`)
    }
    if (!rel?.sourceTransactionId || !importedIndex.has(String(rel.sourceTransactionId))) {
      errors.push(`relTradeTransactions ${rel?.id || '<missing-id>'} references missing sourceTransactionId ${rel?.sourceTransactionId || '<missing>'}.`)
    }
    if (rel?.sourceTransactionId) {
      const key = String(rel.sourceTransactionId)
      const existingRelId = seenRelTradeSource.get(key)
      if (existingRelId && existingRelId !== rel?.id) {
        errors.push(`Duplicate trade linkage for sourceTransactionId ${key} in relTradeTransactions (${existingRelId}, ${rel?.id || '<missing-id>'}).`)
      } else {
        seenRelTradeSource.set(key, rel?.id || key)
      }
    }
  })

  relPositionTransactions.forEach((rel) => {
    if (!rel?.positionId || !positionIndex.has(String(rel.positionId))) {
      errors.push(`relPositionTransactions ${rel?.id || '<missing-id>'} references missing positionId ${rel?.positionId || '<missing>'}.`)
    }
    if (!rel?.sourceTransactionId || !importedIndex.has(String(rel.sourceTransactionId))) {
      errors.push(`relPositionTransactions ${rel?.id || '<missing-id>'} references missing sourceTransactionId ${rel?.sourceTransactionId || '<missing>'}.`)
    }
  })

  cashFlows.forEach((flow) => {
    const isProjected = Boolean(flow?.isProjected)
    if (isProjected && flow?.sourceTransactionId) {
      errors.push(`Cash flow ${flow?.id || '<missing-id>'} is projected but has sourceTransactionId ${flow.sourceTransactionId}.`)
    }
    if (!isProjected && !flow?.sourceTransactionId) {
      warnings.push(`Cash flow ${flow?.id || '<missing-id>'} is non-projected and missing sourceTransactionId.`)
    }
    if (flow?.sourceTransactionId && !importedIndex.has(String(flow.sourceTransactionId))) {
      errors.push(`Cash flow ${flow?.id || '<missing-id>'} references missing sourceTransactionId ${flow.sourceTransactionId}.`)
    }
  })

  const targetCollectionMap = {
    weeks: null,
    importedTransactions: importedIndex,
    cashFlows: createReferenceIndex(cashFlows),
    positions: positionIndex,
    trades: tradeIndex
  }

  notes.forEach((note) => {
    const targetCollection = String(note?.targetCollection || '')
    const targetId = note?.targetId === undefined || note?.targetId === null ? '' : String(note.targetId)
    if (!targetCollection || !targetId) {
      errors.push(`Note ${note?.id || '<missing-id>'} missing targetCollection/targetId.`)
      return
    }
    if (!(targetCollection in targetCollectionMap)) {
      warnings.push(`Note ${note?.id || '<missing-id>'} targets unsupported collection ${targetCollection}.`)
      return
    }
    if (targetCollection === 'weeks') return
    const targetIndex = targetCollectionMap[targetCollection]
    if (targetIndex && !targetIndex.has(targetId)) {
      errors.push(`Note ${note?.id || '<missing-id>'} target ${targetCollection}/${targetId} was not found.`)
    }
  })

  return { errors, warnings }
}

function normalizeEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') return null
  if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) return null

  let v2Data
  const incomingDataModel = String(envelope.meta?.dataModel || '')
  if (incomingDataModel === DATA_MODEL_VERSION) {
    v2Data = serializeForStorage(envelope.data)
  } else if (Array.isArray(envelope.data?.accounts)) {
    v2Data = buildV2CollectionsFromAppStateData(envelope.data)
  } else {
    v2Data = serializeForStorage(envelope.data)
  }

  const safeData = serializeForStorage(v2Data)
  if (!safeData || typeof safeData !== 'object') return null

  const validation = validateV2Collections(safeData)
  if (validation.warnings.length > 0) {
    console.warn('v2 data integrity warnings:', validation.warnings)
  }
  if (validation.errors.length > 0) {
    throw new Error(`v2 data integrity validation failed: ${validation.errors.join(' | ')}`)
  }

  const revision = Number(envelope.meta?.revision || 1)
  const updatedAt = envelope.meta?.updatedAt || new Date().toISOString()
  const updatedByDevice = envelope.meta?.updatedByDevice || resolveDeviceId()
  const lastSyncedRevision = envelope.meta?.lastSyncedRevision ?? null
  const lastDriveSyncAt = envelope.meta?.lastDriveSyncAt || null

  return {
    meta: {
      dataModel: DATA_MODEL_VERSION,
      revision: Number.isFinite(revision) && revision > 0 ? revision : 1,
      updatedAt,
      updatedByDevice,
      lastSyncedRevision,
      lastDriveSyncAt
    },
    data: safeData
  }
}

function createEnvelopeFromData(data, previousMeta = null) {
  const now = new Date().toISOString()
  const previousRevision = Number(previousMeta?.revision || 0)
  const revision = previousRevision > 0 ? previousRevision + 1 : 1
  const safeData = buildV2CollectionsFromAppStateData(serializeForStorage(data))

  return {
    meta: {
      dataModel: DATA_MODEL_VERSION,
      revision,
      updatedAt: now,
      updatedByDevice: previousMeta?.updatedByDevice || resolveDeviceId(),
      lastSyncedRevision: previousMeta?.lastSyncedRevision ?? null,
      lastDriveSyncAt: previousMeta?.lastDriveSyncAt || null
    },
    data: safeData
  }
}

function createBackupFileName(prefix, envelope) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const revision = Number(envelope?.meta?.revision || 0)
  const revisionSuffix = revision > 0 ? `-r${revision}` : ''
  return `${prefix}${timestamp}${revisionSuffix}.json`
}

function createDriveAppPropertiesFromEnvelope(envelope, fileType) {
  return {
    ombFileType: fileType,
    ombRevision: String(envelope?.meta?.revision ?? ''),
    ombUpdatedByDevice: String(envelope?.meta?.updatedByDevice ?? ''),
    ombUpdatedAt: String(envelope?.meta?.updatedAt ?? '')
  }
}

class IndexedDbStateRepository {
  async load() {
    const db = await openIndexedDb()
    const meta = await idbGetFromStore(db, META_STORE_NAME, META_KEY)
    if (meta && meta.dataModel === DATA_MODEL_VERSION) {
      const data = {}
      for (const storeName of V2_COLLECTION_STORES) {
        data[storeName] = await idbGetAllFromStore(db, storeName)
      }
      return normalizeEnvelope({ meta, data })
    }

    return null
  }

  async save(envelope) {
    const normalizedEnvelope = normalizeEnvelope(envelope)
    if (!normalizedEnvelope) {
      throw new Error('Attempted to save an invalid data envelope')
    }

    const db = await openIndexedDb()
    await idbPutToStore(db, META_STORE_NAME, META_KEY, normalizedEnvelope.meta)
    for (const storeName of V2_COLLECTION_STORES) {
      await idbClearStore(db, storeName)
      const rows = Array.isArray(normalizedEnvelope.data?.[storeName]) ? normalizedEnvelope.data[storeName] : []
      for (const row of rows) {
        await idbPutToStore(db, storeName, undefined, row)
      }
    }
  }
}

export class DriveStateRepository {
  constructor() {
    this.config = getDriveConfig()
    this.accessToken = null
  }

  ensureConfigured() {
    if (!this.config.clientId) {
      throw new Error('Google Drive sync is not configured. Set VITE_GOOGLE_CLIENT_ID to enable Drive mode.')
    }
  }

  getStoredAccessToken() {
    try {
      return localStorage.getItem(DRIVE_TOKEN_KEY)
    } catch (error) {
      return null
    }
  }

  setStoredAccessToken(token) {
    if (!token) return
    try {
      localStorage.setItem(DRIVE_TOKEN_KEY, token)
    } catch (error) {
      console.warn('Could not persist Drive access token.', error)
    }
  }

  async loadGoogleIdentity() {
    await loadGoogleIdentityScript()
    if (!window.google?.accounts?.oauth2) {
      throw new Error('Google Identity Services is unavailable in this browser')
    }
  }

  async connect() {
    this.ensureConfigured()
    await this.loadGoogleIdentity()

    const existingToken = this.getStoredAccessToken()
    if (existingToken) {
      this.accessToken = existingToken
      return existingToken
    }

    return await new Promise((resolve, reject) => {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: this.config.scope,
        callback: (response) => {
          if (!response?.access_token) {
            reject(new Error('Google Drive authorization did not return an access token'))
            return
          }

          this.accessToken = response.access_token
          this.setStoredAccessToken(response.access_token)
          emitSyncCenterEvent('drive-connection', { connected: true })
          resolve(response.access_token)
        },
        error_callback: (error) => {
          reject(new Error(error?.message || 'Google Drive authorization failed'))
        }
      })

      tokenClient.requestAccessToken({ prompt: 'consent' })
    })
  }

  async getAccessToken({ interactive = false } = {}) {
    const existingToken = this.getStoredAccessToken()
    if (existingToken) {
      this.accessToken = existingToken
      return existingToken
    }

    if (interactive) {
      return await this.connect()
    }

    return null
  }

  async disconnect() {
    this.accessToken = null
    clearDriveConnection()
    emitSyncCenterEvent('drive-connection', { connected: false })
    return true
  }

  async listFiles({ interactive = false } = {}) {
    const token = await this.getAccessToken({ interactive })
    if (!token) {
      throw new Error('Google Drive is not connected for this browser')
    }
    const query = encodeURIComponent(`'appDataFolder' in parents and name = "${this.config.appDataFolderName}" and trashed = false`)
    const response = await fetch(`${GOOGLE_DRIVE_API_BASE_URL}/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name,modifiedTime,createdTime,appProperties)`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to list Drive files: ${response.status} ${text || response.statusText}`)
    }

    const payload = await response.json()
    return Array.isArray(payload.files) ? payload.files : []
  }

  async listBackupFiles({ interactive = false } = {}) {
    const token = await this.getAccessToken({ interactive })
    if (!token) {
      throw new Error('Google Drive is not connected for this browser')
    }

    const query = encodeURIComponent(`'appDataFolder' in parents and name contains "${this.config.backupPrefix}" and trashed = false`)
    const response = await fetch(`${GOOGLE_DRIVE_API_BASE_URL}/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name,modifiedTime,createdTime,appProperties)&orderBy=modifiedTime desc`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to list Drive backup files: ${response.status} ${text || response.statusText}`)
    }

    const payload = await response.json()
    return Array.isArray(payload.files) ? payload.files : []
  }

  async readFile(fileId, { interactive = false } = {}) {
    const token = await this.getAccessToken({ interactive })
    if (!token) {
      throw new Error('Google Drive is not connected for this browser')
    }
    const response = await fetch(`${GOOGLE_DRIVE_API_BASE_URL}/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to read Drive file: ${response.status} ${text || response.statusText}`)
    }

    return await response.json()
  }

  async deleteFile(fileId, { interactive = false } = {}) {
    const token = await this.getAccessToken({ interactive })
    if (!token) {
      throw new Error('Google Drive is not connected for this browser')
    }

    const response = await fetch(`${GOOGLE_DRIVE_API_BASE_URL}/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to delete Drive file: ${response.status} ${text || response.statusText}`)
    }
  }

  async createDriveFile(metadata, content, { interactive = false } = {}) {
    const token = await this.getAccessToken({ interactive })
    if (!token) {
      throw new Error('Google Drive is not connected for this browser')
    }

    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }))

    const response = await fetch(`${GOOGLE_DRIVE_API_BASE_URL}/upload/drive/v3/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to create Drive file: ${response.status} ${text || response.statusText}`)
    }
  }

  async updateDriveFile(fileId, content, { interactive = false } = {}) {
    const token = await this.getAccessToken({ interactive })
    if (!token) {
      throw new Error('Google Drive is not connected for this browser')
    }

    const response = await fetch(`${GOOGLE_DRIVE_API_BASE_URL}/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(content)
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to update Drive file: ${response.status} ${text || response.statusText}`)
    }
  }

  async updateDriveFileMetadata(fileId, metadata, { interactive = false } = {}) {
    const token = await this.getAccessToken({ interactive })
    if (!token) {
      throw new Error('Google Drive is not connected for this browser')
    }

    const response = await fetch(`${GOOGLE_DRIVE_API_BASE_URL}/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to update Drive metadata: ${response.status} ${text || response.statusText}`)
    }
  }

  async createBackupFromEnvelope(envelope, { interactive = false } = {}) {
    if (this.config.backupRetention < 1) return

    const backupName = createBackupFileName(this.config.backupPrefix, envelope)
    const metadata = {
      name: backupName,
      parents: ['appDataFolder'],
      mimeType: 'application/json',
      appProperties: createDriveAppPropertiesFromEnvelope(envelope, 'backup')
    }

    await this.createDriveFile(metadata, envelope, { interactive })
  }

  async pruneBackups({ interactive = false } = {}) {
    if (this.config.backupRetention < 1) return

    const backups = await this.listBackupFiles({ interactive })
    const staleBackups = backups.slice(this.config.backupRetention)
    for (const staleBackup of staleBackups) {
      await this.deleteFile(staleBackup.id, { interactive })
    }
  }

  async findDriveEnvelope({ interactive = false } = {}) {
    const files = await this.listFiles({ interactive })
    if (!files.length) return null
    const file = files[0]
    const envelope = await this.readFile(file.id, { interactive })
    return normalizeEnvelope(envelope)
  }

  async upsertDriveEnvelope(envelope, { interactive = false } = {}) {
    const token = await this.getAccessToken({ interactive })
    if (!token) {
      throw new Error('Google Drive is not connected for this browser')
    }
    const files = await this.listFiles({ interactive })
    const normalized = normalizeEnvelope(envelope)
    if (!normalized) {
      throw new Error('Attempted to save an invalid Drive data envelope')
    }

    if (files.length) {
      const file = files[0]
      const response = await fetch(`${GOOGLE_DRIVE_API_BASE_URL}/upload/drive/v3/files/${file.id}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(normalized)
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Failed to update Drive file: ${response.status} ${text || response.statusText}`)
      }

      return normalized
    }

    const metadata = {
      name: this.config.appDataFolderName,
      parents: ['appDataFolder'],
      mimeType: 'application/json',
      appProperties: createDriveAppPropertiesFromEnvelope(normalized, 'main')
    }
    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    form.append('file', new Blob([JSON.stringify(normalized)], { type: 'application/json' }))

    const response = await fetch(`${GOOGLE_DRIVE_API_BASE_URL}/upload/drive/v3/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to create Drive file: ${response.status} ${text || response.statusText}`)
    }

    return normalized
  }

  async upsertDriveEnvelopeWithBackups(envelope, { interactive = false } = {}) {
    const files = await this.listFiles({ interactive })
    const normalized = normalizeEnvelope(envelope)
    if (!normalized) {
      throw new Error('Attempted to save an invalid Drive data envelope')
    }

    if (files.length) {
      const file = files[0]
      const previousEnvelope = normalizeEnvelope(await this.readFile(file.id, { interactive }))
      if (previousEnvelope) {
        await this.createBackupFromEnvelope(previousEnvelope, { interactive })
      }
      await this.updateDriveFile(file.id, normalized, { interactive })
      await this.updateDriveFileMetadata(file.id, {
        appProperties: createDriveAppPropertiesFromEnvelope(normalized, 'main')
      }, { interactive })
      await this.pruneBackups({ interactive })
      return normalized
    }

    const metadata = {
      name: this.config.appDataFolderName,
      parents: ['appDataFolder'],
      mimeType: 'application/json'
    }
    await this.createDriveFile(metadata, normalized, { interactive })
    return normalized
  }

  async load() {
    this.ensureConfigured()
    const existingToken = this.getStoredAccessToken()
    if (!existingToken) {
      return await getLocalRepository().load()
    }

    try {
      const remoteEnvelope = await this.findDriveEnvelope()
      if (remoteEnvelope) return remoteEnvelope
    } catch (error) {
      console.warn('Unable to load Drive-backed state; falling back to local state.', error)
    }

    const localFallback = await getLocalRepository().load()
    return localFallback
  }

  async save(envelope, { strictRemote = false } = {}) {
    this.ensureConfigured()
    const existingToken = this.getStoredAccessToken()
    if (!existingToken) {
      if (strictRemote) {
        throw new Error('Google Drive is not connected for this browser')
      }
      const localFallback = getLocalRepository()
      await localFallback.save(envelope)
      return normalizeEnvelope(envelope)
    }

    try {
      const remoteEnvelope = await this.upsertDriveEnvelopeWithBackups(envelope)
      const localFallback = getLocalRepository()
      await localFallback.save(remoteEnvelope)
      return remoteEnvelope
    } catch (error) {
      if (isDriveAuthError(error)) {
        try {
          await this.disconnect()
          await this.connect()
          const remoteEnvelope = await this.upsertDriveEnvelopeWithBackups(envelope, { interactive: true })
          const localFallback = getLocalRepository()
          await localFallback.save(remoteEnvelope)
          return remoteEnvelope
        } catch (retryError) {
          if (strictRemote) {
            throw retryError
          }
          console.warn('Drive save retry after re-auth failed; saving locally only.', retryError)
        }
      } else {
        if (strictRemote) {
          throw error
        }
        console.warn('Drive save failed; saving locally only.', error)
      }

      const localFallback = getLocalRepository()
      await localFallback.save(envelope)
      return normalizeEnvelope(envelope)
    }
  }
}

function getLocalRepository() {
  return new IndexedDbStateRepository()
}

export function convertAppStateToV2Collections(data) {
  return buildV2CollectionsFromAppStateData(serializeForStorage(data))
}

export function convertV2CollectionsToAppState(data) {
  return buildAppStateDataFromV2Collections(serializeForStorage(data))
}

export function normalizeV2CollectionsData(data) {
  const normalized = normalizeEnvelope({
    meta: {
      dataModel: DATA_MODEL_VERSION,
      revision: 1,
      updatedAt: new Date().toISOString(),
      updatedByDevice: resolveDeviceId(),
      lastSyncedRevision: null,
      lastDriveSyncAt: null
    },
    data
  })
  if (!normalized?.data) {
    throw new Error('Invalid v2 envelope data.')
  }
  return normalized.data
}

export async function loadLocalEnvelope() {
  const localRepository = getLocalRepository()
  return await localRepository.load()
}

export async function loadAppState() {
  const localRepository = getLocalRepository()
  const localEnvelope = await localRepository.load()
  if (localEnvelope) {
    return {
      data: buildAppStateDataFromV2Collections(localEnvelope.data),
      meta: localEnvelope.meta,
      source: 'indexeddb'
    }
  }

  return { data: null, meta: null, source: 'empty' }
}

export async function saveAppState(data, previousMeta = null) {
  const envelope = createEnvelopeFromData(data, previousMeta)
  const localRepository = getLocalRepository()
  emitSyncCenterEvent('local-save-start')
  await localRepository.save(envelope)
  emitSyncCenterEvent('local-save-complete', {
    revision: envelope?.meta?.revision ?? null
  })

  if (isDrivePersistenceConfigured() && isDriveConnected()) {
    const queuedEnvelope = normalizeEnvelope(envelope)
    emitSyncCenterEvent('drive-mirror-queued', {
      revision: queuedEnvelope?.meta?.revision ?? null
    })
    driveMirrorQueue = driveMirrorQueue
      .catch(() => {})
      .then(async () => {
        if (!queuedEnvelope) return
        const driveRepository = new DriveStateRepository()
        const syncAt = new Date().toISOString()
        queuedEnvelope.meta.lastSyncedRevision = queuedEnvelope?.meta?.revision ?? null
        queuedEnvelope.meta.lastDriveSyncAt = syncAt
        emitSyncCenterEvent('drive-mirror-start', {
          revision: queuedEnvelope?.meta?.revision ?? null
        })
        await driveRepository.save(queuedEnvelope, { strictRemote: true })
        await localRepository.save(queuedEnvelope)
        emitSyncCenterEvent('drive-mirror-complete', {
          revision: queuedEnvelope?.meta?.revision ?? null,
          syncedAt: syncAt
        })
      })
      .catch(error => {
        console.warn('Drive mirror save failed; local save already committed.', error)
        emitSyncCenterEvent('drive-mirror-failed', {
          error: String(error?.message || error || 'Unknown Drive sync error')
        })
      })
  }

  return { meta: envelope.meta, source: 'indexeddb' }
}
