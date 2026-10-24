const PERSISTENCE_MODE_LOCAL_FIRST = 'local-first'

const INDEXED_DB_NAME = 'omb-local-first'
const INDEXED_DB_VERSION = 1
const INDEXED_DB_STORE_NAME = 'state'
const ENVELOPE_KEY = 'omb.data.envelope.v1'
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
      if (!db.objectStoreNames.contains(INDEXED_DB_STORE_NAME)) {
        db.createObjectStore(INDEXED_DB_STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
  })
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INDEXED_DB_STORE_NAME, 'readonly')
    const store = tx.objectStore(INDEXED_DB_STORE_NAME)
    const request = store.get(key)

    request.onerror = () => reject(new Error(`IndexedDB read failed: ${request.error?.message || 'unknown error'}`))
    request.onsuccess = () => resolve(request.result || null)
  })
}

function idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    try {
      const serializableValue = serializeForStorage(value)
      const tx = db.transaction(INDEXED_DB_STORE_NAME, 'readwrite')
      const store = tx.objectStore(INDEXED_DB_STORE_NAME)
      const request = store.put(serializableValue, key)

      request.onerror = () => reject(new Error(`IndexedDB write failed: ${request.error?.message || 'unknown error'}`))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(new Error(`IndexedDB transaction failed: ${tx.error?.message || 'unknown error'}`))
    } catch (error) {
      reject(new Error(`IndexedDB write failed: ${error?.message || error}`))
    }
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

function normalizeEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') return null
  if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) return null

  const safeData = serializeForStorage(envelope.data)
  if (!safeData || typeof safeData !== 'object') return null

  const revision = Number(envelope.meta?.revision || 1)
  const updatedAt = envelope.meta?.updatedAt || new Date().toISOString()
  const updatedByDevice = envelope.meta?.updatedByDevice || resolveDeviceId()
  const lastSyncedRevision = envelope.meta?.lastSyncedRevision ?? null
  const lastDriveSyncAt = envelope.meta?.lastDriveSyncAt || null

  return {
    meta: {
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
  const safeData = serializeForStorage(data)

  return {
    meta: {
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
    const envelope = await idbGet(db, ENVELOPE_KEY)
    return normalizeEnvelope(envelope)
  }

  async save(envelope) {
    const normalizedEnvelope = normalizeEnvelope(envelope)
    if (!normalizedEnvelope) {
      throw new Error('Attempted to save an invalid data envelope')
    }

    const db = await openIndexedDb()
    await idbPut(db, ENVELOPE_KEY, normalizedEnvelope)
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

export async function loadAppState() {
  const localRepository = getLocalRepository()
  const localEnvelope = await localRepository.load()
  if (localEnvelope) {
    return { data: localEnvelope.data, meta: localEnvelope.meta, source: 'indexeddb' }
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
