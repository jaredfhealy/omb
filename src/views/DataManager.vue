<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import JSONEditor from 'jsoneditor'
import 'jsoneditor/dist/jsoneditor.min.css'
import DataTable from '@/components/custom/DataTable.vue'
import { useAppStore } from '@/stores/app'
import { DriveStateRepository, isDriveConnected, isDrivePersistenceConfigured } from '@/services/stateRepository'

const store = useAppStore()

const editorHost = ref(null)
const statusMessage = ref('')
const statusType = ref('secondary')
const editorParseError = ref('')
const hasUnsavedChanges = ref(false)
const importInput = ref(null)
const showDriveModal = ref(false)
const driveFiles = ref([])
const driveFilesLoading = ref(false)
const driveFilesError = ref('')
const driveFileExportingId = ref(null)
const driveFileLoadingToEditorId = ref(null)
const driveFileDeletingId = ref(null)
const driveFilesDeletingAll = ref(false)
const hasListedDriveFiles = ref(false)
const syncInProgress = ref(false)
const driveSyncStatus = ref({
  lastAttemptAt: null,
  lastCompletedAt: null,
  lastResult: 'idle',
  lastAction: 'none',
  lastError: ''
})
const driveConflictModalVisible = ref(false)
const driveConflictDetails = ref({
  localMeta: null,
  remoteMeta: null,
  summary: ''
})
const driveConflictResolver = ref(null)

let editor = null
let statusDismissTimer = null

const driveConfigured = computed(() => isDrivePersistenceConfigured())
const driveConnected = computed(() => isDriveConnected())
const driveStatusLabel = computed(() => {
  if (!driveConfigured.value) return 'Not configured'
  return driveConnected.value ? 'Connected' : 'Not connected'
})
const driveSyncResultLabel = computed(() => {
  const result = String(driveSyncStatus.value.lastResult || 'idle')
  if (result === 'in-progress') return 'Sync in progress'
  if (result === 'success') return 'Success'
  if (result === 'noop') return 'Already in sync'
  if (result === 'conflict-resolved') return 'Conflict resolved'
  if (result === 'cancelled') return 'Cancelled'
  if (result === 'failed') return 'Failed'
  return 'Idle'
})
const driveSyncResultClass = computed(() => {
  const result = String(driveSyncStatus.value.lastResult || 'idle')
  if (result === 'success' || result === 'noop' || result === 'conflict-resolved') return 'text-success'
  if (result === 'failed') return 'text-danger'
  if (result === 'cancelled') return 'text-warning'
  if (result === 'in-progress') return 'text-primary'
  return 'text-muted'
})
const persistedLastDriveSyncAt = computed(() => store.persistenceMeta?.lastDriveSyncAt || null)
const persistedLastSyncedRevision = computed(() => store.persistenceMeta?.lastSyncedRevision ?? null)
const driveFilesColumns = [
  {
    key: 'name',
    header: { text: 'Name' },
    class: 'col-12 col-xl-2'
  },
  {
    key: 'createdTime',
    header: { text: 'Created' },
    class: 'col-6 col-xl-2',
    value: (item) => formatDriveTimestamp(item.createdTime)
  },
  {
    key: 'modifiedTime',
    header: { text: 'Modified' },
    class: 'col-6 col-xl-2',
    value: (item) => formatDriveTimestamp(item.modifiedTime)
  },
  {
    key: 'kind',
    header: { text: 'Type' },
    class: 'col-6 col-xl-1'
  },
  {
    key: 'appProperties',
    header: { text: 'App properties' },
    class: 'col-12 col-xl-3',
    value: (item) => formatAppProperties(item.appProperties)
  },
  {
    key: 'actions',
    header: { text: 'Actions' },
    class: 'col-6 col-xl-2'
  }
]

function setStatus(message, type = 'secondary') {
  statusMessage.value = message
  statusType.value = type

  if (statusDismissTimer) {
    window.clearTimeout(statusDismissTimer)
    statusDismissTimer = null
  }

  const autoDismissDelayMs = type === 'danger' ? 9000 : 5000
  statusDismissTimer = window.setTimeout(() => {
    statusMessage.value = ''
    statusDismissTimer = null
  }, autoDismissDelayMs)
}

function dismissStatus() {
  statusMessage.value = ''
  if (statusDismissTimer) {
    window.clearTimeout(statusDismissTimer)
    statusDismissTimer = null
  }
}

function setDriveStatus(message, type = 'secondary') {
  setStatus(message, type)
}

function markDriveSyncStart() {
  driveSyncStatus.value = {
    ...driveSyncStatus.value,
    lastAttemptAt: new Date().toISOString(),
    lastResult: 'in-progress',
    lastError: ''
  }
}

function markDriveSyncResult(result, action, errorMessage = '') {
  driveSyncStatus.value = {
    ...driveSyncStatus.value,
    lastCompletedAt: new Date().toISOString(),
    lastResult: result,
    lastAction: action,
    lastError: errorMessage || ''
  }
}

function cloneForEditor(value) {
  return JSON.parse(JSON.stringify(value))
}

function isEnvelopeShape(payload) {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    payload.data &&
    typeof payload.data === 'object' &&
    !Array.isArray(payload.data)
  )
}

function validateAndNormalizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Root payload must be a JSON object.')
  }
  if (!Array.isArray(payload.accounts)) {
    throw new Error('Payload must include an accounts array.')
  }
  if (payload.accounts.length === 0) {
    throw new Error('At least one account is required.')
  }

  const defaultSettings = {
    startDate: new Date().toISOString().split('T')[0],
    startingBalance: 5000,
    weeklyReturn: 1,
    years: 4
  }

  const normalizedAccounts = payload.accounts.map((account, index) => ({
    ...account,
    id: Number(account?.id) || (index + 1),
    transactions: Array.isArray(account?.transactions) ? account.transactions : [],
    actuals: Array.isArray(account?.actuals) ? account.actuals : [],
    positions: Array.isArray(account?.positions) ? account.positions : [],
    sells: Array.isArray(account?.sells) ? account.sells : [],
    notes: Array.isArray(account?.notes) ? account.notes : [],
    positionMeta: Array.isArray(account?.positionMeta) ? account.positionMeta : [],
    settings: {
      ...defaultSettings,
      ...(account?.settings || {})
    }
  }))

  const { selectedAccountId: _selectedAccountId, lastUpdated: _lastUpdated, ...rest } = payload
  return {
    ...rest,
    accounts: normalizedAccounts
  }
}

function createEditor() {
  if (!editorHost.value) return
  editor = new JSONEditor(editorHost.value, {
    mode: 'view',
    modes: ['tree', 'code', 'text', 'view'],
    mainMenuBar: true,
    statusBar: true,
    onChange: () => {
      hasUnsavedChanges.value = true
      editorParseError.value = ''
    }
  })
  editor.set(cloneForEditor(createLocalEnvelopeForSync()))
  hasUnsavedChanges.value = false
}

function refreshFromStore() {
  if (!editor) return
  editor.set(cloneForEditor(createLocalEnvelopeForSync()))
  hasUnsavedChanges.value = false
  editorParseError.value = ''
  setStatus('Editor refreshed from persisted envelope state.', 'info')
}

function undoAllEditorChanges() {
  if (!editor) return
  editor.set(cloneForEditor(createLocalEnvelopeForSync()))
  hasUnsavedChanges.value = false
  editorParseError.value = ''
  setStatus('All unsaved JSON edits were undone.', 'info')
}

function downloadLocalCopy() {
  const envelope = createLocalEnvelopeForSync()
  downloadJsonFile(`omb-data-local-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, envelope)
}

async function reloadLocalEditor() {
  if (!editor) return

  if (hasUnsavedChanges.value) {
    const message = 'Reload local data into the editor? This will replace current unsaved editor changes.'
    const approved = store.confirm
      ? await new Promise(resolve => {
          store.confirm(message, () => resolve(true), () => resolve(false))
        })
      : window.confirm(message)
    if (!approved) return
  }

  refreshFromStore()
}

function openImportFilePicker() {
  importInput.value?.click()
}

function openDriveModal() {
  showDriveModal.value = true
  hasListedDriveFiles.value = false
}

function closeDriveModal() {
  showDriveModal.value = false
}

function formatDriveTimestamp(value) {
  return formatLocalTimestamp(value)
}

function formatLocalTimestamp(value) {
  if (!value) return 'n/a'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatAppProperties(properties) {
  if (!properties || typeof properties !== 'object') return '—'
  const entries = Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
  if (!entries.length) return '—'
  return entries.map(([key, value]) => `${key}=${value}`).join(' | ')
}

function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function createLocalEnvelopeForSync() {
  return {
    meta: store.persistenceMeta || {
      revision: 1,
      updatedAt: new Date().toISOString(),
      updatedByDevice: 'local-device',
      lastSyncedRevision: null,
      lastDriveSyncAt: null
    },
    data: cloneForEditor(store.db)
  }
}

function applyDriveSyncMeta(meta, fallbackAt = null) {
  const safeMeta = meta && typeof meta === 'object' ? meta : {}
  const syncedAt = safeMeta.lastDriveSyncAt || fallbackAt || null

  store.persistenceMeta = {
    ...(store.persistenceMeta || {}),
    ...safeMeta,
    lastDriveSyncAt: syncedAt
  }

  store.syncCenter.driveLastSuccessAt = syncedAt
}

function stampEnvelopeSyncMeta(envelope, syncedAt = new Date().toISOString()) {
  if (!envelope || typeof envelope !== 'object') return syncedAt
  if (!envelope.meta || typeof envelope.meta !== 'object') {
    envelope.meta = {}
  }
  envelope.meta.lastSyncedRevision = Number(envelope?.meta?.revision || 0) || null
  envelope.meta.lastDriveSyncAt = syncedAt
  return syncedAt
}

async function applyRemoteEnvelope(remoteEnvelope) {
  store.db = validateAndNormalizePayload(remoteEnvelope.data || {})
  store.ensureSelectedAccount()
  store.persistenceMeta = remoteEnvelope.meta
  store.applyPositionMetadataForActiveAccount()
  await store.saveChangesAndRecalculate()
  refreshFromStore()
}

function envelopeDiffers(localEnvelope, remoteEnvelope) {
  if (!localEnvelope || !remoteEnvelope) return true
  const localRevision = Number(localEnvelope?.meta?.revision || 0)
  const remoteRevision = Number(remoteEnvelope?.meta?.revision || 0)
  if (localRevision !== remoteRevision) return true

  return JSON.stringify(localEnvelope.data) !== JSON.stringify(remoteEnvelope.data)
}

function getEnvelopeSyncMeta(envelope) {
  return {
    revision: Number(envelope?.meta?.revision || 0),
    updatedAt: String(envelope?.meta?.updatedAt || ''),
    updatedAtMs: Number(new Date(envelope?.meta?.updatedAt || 0).getTime() || 0),
    updatedByDevice: String(envelope?.meta?.updatedByDevice || 'unknown-device'),
    dataSnapshot: JSON.stringify(envelope?.data || {})
  }
}

function determineSyncAction(localEnvelope, remoteEnvelope) {
  if (!remoteEnvelope) return 'push'
  if (!localEnvelope) return 'pull'

  const localMeta = getEnvelopeSyncMeta(localEnvelope)
  const remoteMeta = getEnvelopeSyncMeta(remoteEnvelope)

  if (localMeta.revision === remoteMeta.revision && localMeta.dataSnapshot === remoteMeta.dataSnapshot) {
    return 'noop'
  }

  if (localMeta.revision > remoteMeta.revision) return 'push'
  if (remoteMeta.revision > localMeta.revision) return 'pull'

  if (localMeta.updatedAtMs > remoteMeta.updatedAtMs) return 'push'
  if (remoteMeta.updatedAtMs > localMeta.updatedAtMs) return 'pull'

  return 'conflict'
}

function summarizeAccountCollectionDiff(localAccount, remoteAccount) {
  const collections = ['transactions', 'actuals', 'positions', 'sells', 'notes']
  const diffs = collections
    .map((key) => {
      const localCount = Array.isArray(localAccount?.[key]) ? localAccount[key].length : 0
      const remoteCount = Array.isArray(remoteAccount?.[key]) ? remoteAccount[key].length : 0
      if (localCount === remoteCount) return ''
      return `${key} ${localCount}→${remoteCount}`
    })
    .filter(Boolean)

  if (JSON.stringify(localAccount?.settings || {}) !== JSON.stringify(remoteAccount?.settings || {})) {
    diffs.unshift('settings changed')
  }
  if (String(localAccount?.name || '') !== String(remoteAccount?.name || '')) {
    diffs.unshift('name changed')
  }

  return diffs
}

function buildEnvelopeChangeSummary(localEnvelope, remoteEnvelope) {
  const localState = localEnvelope?.data || {}
  const remoteState = remoteEnvelope?.data || {}
  const lines = []

  const localAccounts = Array.isArray(localState.accounts) ? localState.accounts : []
  const remoteAccounts = Array.isArray(remoteState.accounts) ? remoteState.accounts : []

  lines.push(`Accounts: local ${localAccounts.length}, Drive ${remoteAccounts.length}`)

  const localById = new Map(localAccounts.map(account => [String(account?.id), account]))
  const remoteById = new Map(remoteAccounts.map(account => [String(account?.id), account]))
  const allIds = Array.from(new Set([...localById.keys(), ...remoteById.keys()])).sort((a, b) => Number(a) - Number(b))

  const onlyLocalIds = allIds.filter(id => localById.has(id) && !remoteById.has(id))
  const onlyRemoteIds = allIds.filter(id => remoteById.has(id) && !localById.has(id))

  if (onlyLocalIds.length) lines.push(`Only on local: ${onlyLocalIds.join(', ')}`)
  if (onlyRemoteIds.length) lines.push(`Only on Drive: ${onlyRemoteIds.join(', ')}`)

  const changedAccounts = []
  for (const id of allIds) {
    if (!localById.has(id) || !remoteById.has(id)) continue
    const localAccount = localById.get(id)
    const remoteAccount = remoteById.get(id)
    const accountDiffs = summarizeAccountCollectionDiff(localAccount, remoteAccount)
    if (accountDiffs.length) {
      changedAccounts.push(`Acct ${id}: ${accountDiffs.join(', ')}`)
    }
  }

  const maxAccountLines = 4
  if (changedAccounts.length) {
    lines.push(...changedAccounts.slice(0, maxAccountLines))
    if (changedAccounts.length > maxAccountLines) {
      lines.push(`...and ${changedAccounts.length - maxAccountLines} more account(s) with changes`)
    }
  }

  return lines.join('\n')
}

function isDriveAuthError(error) {
  const message = String(error?.message || '')
  return message.includes('401') || message.includes('UNAUTHENTICATED') || message.includes('Invalid Credentials')
}

async function runDriveOperationWithRetry(operation) {
  const repository = new DriveStateRepository()
  try {
    return await operation(repository)
  } catch (error) {
    if (!isDriveAuthError(error)) {
      throw error
    }

    await repository.disconnect()
    await repository.connect()
    return await operation(repository)
  }
}

async function connectDrive() {
  if (!isDrivePersistenceConfigured()) {
    setDriveStatus('Google Drive sync is not configured yet. Add VITE_GOOGLE_CLIENT_ID first.', 'warning')
    return
  }

  try {
    const repository = new DriveStateRepository()
    await repository.connect()

    const localEnvelope = createLocalEnvelopeForSync()
    const remoteEnvelope = await repository.findDriveEnvelope()

    if (!remoteEnvelope) {
      const syncAt = stampEnvelopeSyncMeta(localEnvelope)
      const savedEnvelope = await repository.save(localEnvelope)
      applyDriveSyncMeta(savedEnvelope?.meta || localEnvelope.meta, syncAt)
      setDriveStatus('Google Drive connected and initialized with this device data. Reloading the page…', 'success')
      window.setTimeout(() => {
        window.location.reload()
      }, 300)
      return
    }

    if (!envelopeDiffers(localEnvelope, remoteEnvelope)) {
      if (!remoteEnvelope?.meta?.lastDriveSyncAt || !remoteEnvelope?.meta?.lastSyncedRevision) {
        const syncAt = stampEnvelopeSyncMeta(remoteEnvelope)
        const savedEnvelope = await repository.save(remoteEnvelope)
        applyDriveSyncMeta(savedEnvelope?.meta || remoteEnvelope.meta, syncAt)
      } else {
      applyDriveSyncMeta(remoteEnvelope?.meta, remoteEnvelope?.meta?.lastDriveSyncAt || remoteEnvelope?.meta?.updatedAt || null)
      }
      setDriveStatus('Google Drive connected. Local and Drive data are already in sync. Reloading the page…', 'success')
      window.setTimeout(() => {
        window.location.reload()
      }, 300)
      return
    }

    const useLocalAsSource = await confirmDriveInitialSourceSelection()
    if (useLocalAsSource) {
      const syncAt = stampEnvelopeSyncMeta(localEnvelope)
      const savedEnvelope = await repository.save(localEnvelope)
      applyDriveSyncMeta(savedEnvelope?.meta || localEnvelope.meta, syncAt)
      setDriveStatus('Google Drive connected. This device data is now the synced source. Reloading the page…', 'success')
      window.setTimeout(() => {
        window.location.reload()
      }, 300)
      return
    }

    await applyRemoteEnvelope(remoteEnvelope)
    setDriveStatus('Google Drive connected. Drive data has been applied to this device.', 'success')
    window.setTimeout(() => {
      window.location.reload()
    }, 300)
  } catch (error) {
    const message = error?.message || 'Failed to connect to Google Drive.'
    setDriveStatus(message, 'danger')
  }
}

async function listDriveFiles(options = {}) {
  const silent = Boolean(options?.silent)
  if (!isDrivePersistenceConfigured()) {
    setDriveStatus('Google Drive sync is not configured yet. Add VITE_GOOGLE_CLIENT_ID first.', 'warning')
    return
  }

  driveFilesLoading.value = true
  driveFilesError.value = ''
  hasListedDriveFiles.value = false

  try {
    const { mainFiles, backupFiles } = await runDriveOperationWithRetry(async (repository) => {
      if (!driveConnected.value) {
        await repository.connect()
      }
      const [resolvedMainFiles, resolvedBackupFiles] = await Promise.all([
        repository.listFiles(),
        repository.listBackupFiles()
      ])
      return { mainFiles: resolvedMainFiles, backupFiles: resolvedBackupFiles }
    })

    const normalizedMainFiles = (mainFiles || []).map(file => ({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime,
      appProperties: file.appProperties || {},
      kind: 'Main data'
    }))

    const normalizedBackupFiles = (backupFiles || []).map(file => ({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime,
      appProperties: file.appProperties || {},
      kind: 'Backup'
    }))

    driveFiles.value = [...normalizedMainFiles, ...normalizedBackupFiles]
      .sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')))
    hasListedDriveFiles.value = true

    if (!silent) {
      setDriveStatus(`Drive file list refreshed (${driveFiles.value.length} file${driveFiles.value.length === 1 ? '' : 's'}).`, 'info')
    }
  } catch (error) {
    driveFilesError.value = error?.message || 'Failed to list Drive files.'
    if (!silent) {
      setDriveStatus(driveFilesError.value, 'danger')
    }
  } finally {
    driveFilesLoading.value = false
  }
}

async function exportSingleDriveFile(file) {
  if (!file?.id) return

  driveFileExportingId.value = file.id
  driveFilesError.value = ''

  try {
    const content = await runDriveOperationWithRetry(async (repository) => {
      if (!driveConnected.value) {
        await repository.connect()
      }
      return await repository.readFile(file.id)
    })
    downloadJsonFile(file.name || `drive-file-${file.id}.json`, content)
    setDriveStatus(`Exported ${file.name || 'selected file'}.`, 'success')
  } catch (error) {
    const message = error?.message || 'Failed to export the selected Drive file.'
    driveFilesError.value = message
    setDriveStatus(message, 'danger')
  } finally {
    driveFileExportingId.value = null
  }
}

function extractPayloadFromDriveFileContent(content) {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return content
  }
  throw new Error('Drive file content must be a JSON object.')
}

async function confirmLoadDriveFileToEditor(fileName) {
  const overwriteWarning = hasUnsavedChanges.value
    ? 'This will replace current unsaved editor changes.'
    : 'This will replace current editor content.'
  const message = `Load ${fileName || 'selected Drive file'} into the editor for review? ${overwriteWarning}`

  if (store.confirm) {
    return await new Promise(resolve => {
      store.confirm(message, () => resolve(true), () => resolve(false))
    })
  }

  return window.confirm(message)
}

async function loadDriveFileToEditor(file) {
  if (!file?.id || !editor) return

  const approved = await confirmLoadDriveFileToEditor(file.name)
  if (!approved) return

  driveFileLoadingToEditorId.value = file.id
  driveFilesError.value = ''

  try {
    const content = await runDriveOperationWithRetry(async (repository) => {
      if (!driveConnected.value) {
        await repository.connect()
      }
      return await repository.readFile(file.id)
    })

    const payload = extractPayloadFromDriveFileContent(content)
    editor.set(cloneForEditor(payload))
    hasUnsavedChanges.value = true
    editorParseError.value = ''
    closeDriveModal()
    setDriveStatus(`Loaded ${file.name || 'selected Drive file'} into the editor. Review and click Apply Changes to persist.`, 'info')
  } catch (error) {
    const message = error?.message || 'Failed to load the selected Drive file into the editor.'
    driveFilesError.value = message
    setDriveStatus(message, 'danger')
  } finally {
    driveFileLoadingToEditorId.value = null
  }
}

async function confirmDeleteSingleDriveFile(fileName) {
  const message = `Delete ${fileName || 'this Drive file'}? This cannot be undone.`

  if (store.confirm) {
    return await new Promise(resolve => {
      store.confirm(message, () => resolve(true), () => resolve(false))
    })
  }

  return window.confirm(message)
}

async function deleteSingleDriveFile(file) {
  if (!file?.id) return

  const approved = await confirmDeleteSingleDriveFile(file.name)
  if (!approved) return

  driveFileDeletingId.value = file.id
  driveFilesError.value = ''

  try {
    await runDriveOperationWithRetry(async (repository) => {
      if (!driveConnected.value) {
        await repository.connect()
      }
      await repository.deleteFile(file.id)
    })
    driveFiles.value = driveFiles.value.filter(existing => existing.id !== file.id)
    setDriveStatus(`Deleted ${file.name || 'selected Drive file'}.`, 'warning')
  } catch (error) {
    const message = error?.message || 'Failed to delete the selected Drive file.'
    driveFilesError.value = message
    setDriveStatus(message, 'danger')
  } finally {
    driveFileDeletingId.value = null
  }
}

async function confirmDeleteAllDriveFiles(fileCount) {
  const message = fileCount > 0
    ? `Delete all ${fileCount} file${fileCount === 1 ? '' : 's'} from Google Drive appDataFolder? This cannot be undone.`
    : 'Delete all Google Drive appDataFolder files for this app? This cannot be undone.'

  if (store.confirm) {
    return await new Promise(resolve => {
      store.confirm(message, () => resolve(true), () => resolve(false))
    })
  }

  return window.confirm(message)
}

async function deleteAllDriveFiles() {
  if (!isDrivePersistenceConfigured()) {
    setDriveStatus('Google Drive sync is not configured yet. Add VITE_GOOGLE_CLIENT_ID first.', 'warning')
    return
  }

  driveFilesDeletingAll.value = true
  driveFilesError.value = ''

  try {
    const { mainFiles, backupFiles } = await runDriveOperationWithRetry(async (repository) => {
      if (!driveConnected.value) {
        await repository.connect()
      }
      const [resolvedMainFiles, resolvedBackupFiles] = await Promise.all([
        repository.listFiles(),
        repository.listBackupFiles()
      ])
      return { mainFiles: resolvedMainFiles || [], backupFiles: resolvedBackupFiles || [] }
    })

    const filesToDelete = [...mainFiles, ...backupFiles]
    if (!filesToDelete.length) {
      setDriveStatus('No Drive files found to delete.', 'info')
      driveFiles.value = []
      return
    }

    const approved = await confirmDeleteAllDriveFiles(filesToDelete.length)
    if (!approved) return

    await runDriveOperationWithRetry(async (repository) => {
      for (const file of filesToDelete) {
        await repository.deleteFile(file.id)
      }
    })

    driveFiles.value = []
    setDriveStatus(`Deleted ${filesToDelete.length} Drive file${filesToDelete.length === 1 ? '' : 's'}.`, 'warning')
  } catch (error) {
    const message = error?.message || 'Failed to delete Drive files.'
    driveFilesError.value = message
    setDriveStatus(message, 'danger')
  } finally {
    driveFilesDeletingAll.value = false
  }
}

async function confirmDriveInitialSourceSelection() {
  const message = 'Drive already has data that differs from this device. Choose OK to keep this device data and overwrite Drive, or Cancel to use Drive data on this device.'

  if (store.confirm) {
    return await new Promise(resolve => {
      store.confirm(message, () => resolve(true), () => resolve(false))
    })
  }

  return window.confirm(message)
}

async function resolveDriveSyncConflict(localEnvelope, remoteEnvelope) {
  const localMeta = getEnvelopeSyncMeta(localEnvelope)
  const remoteMeta = getEnvelopeSyncMeta(remoteEnvelope)
  driveConflictDetails.value = {
    localMeta,
    remoteMeta,
    summary: buildEnvelopeChangeSummary(localEnvelope, remoteEnvelope)
  }

  return await new Promise(resolve => {
    driveConflictResolver.value = resolve
    driveConflictModalVisible.value = true
  })
}

function closeDriveConflictModal(choice = 'cancel') {
  driveConflictModalVisible.value = false
  const resolver = driveConflictResolver.value
  driveConflictResolver.value = null
  if (resolver) resolver(choice)
}

async function disconnectDrive() {
  try {
    const approved = await confirmDriveDisconnect()
    if (!approved) return

    const deletedFileCount = await runDriveOperationWithRetry(async (repository) => {
      if (!driveConnected.value) {
        await repository.connect()
      }
      const [mainFiles, backupFiles] = await Promise.all([
        repository.listFiles(),
        repository.listBackupFiles()
      ])
      const filesToDelete = [...(mainFiles || []), ...(backupFiles || [])]
      for (const file of filesToDelete) {
        await repository.deleteFile(file.id)
      }
      return filesToDelete.length
    })

    const repository = new DriveStateRepository()
    await repository.disconnect()

    store.persistenceMeta = {
      ...(store.persistenceMeta || {}),
      lastSyncedRevision: null,
      lastDriveSyncAt: null
    }
    store.syncCenter.driveLastSuccessAt = null
    store.syncCenter.driveLastAttemptAt = null
    store.syncCenter.driveLastResult = 'idle'
    store.syncCenter.driveLastError = ''
    await store.saveChanges()

    driveFiles.value = []
    const deletedText = deletedFileCount > 0
      ? ` Deleted ${deletedFileCount} Drive file${deletedFileCount === 1 ? '' : 's'}.`
      : ''
    setDriveStatus(`Google Drive disconnected.${deletedText} Reloading the page…`, 'warning')
    window.setTimeout(() => {
      window.location.reload()
    }, 300)
  } catch (error) {
    const message = error?.message || 'Failed to disconnect from Google Drive.'
    setDriveStatus(message, 'danger')
  }
}

async function syncDriveNow() {
  if (!isDrivePersistenceConfigured()) {
    setDriveStatus('Google Drive sync is not configured yet. Add VITE_GOOGLE_CLIENT_ID first.', 'warning')
    return
  }

  try {
    syncInProgress.value = true
    markDriveSyncStart()
    const localEnvelope = createLocalEnvelopeForSync()
    const remoteEnvelope = await runDriveOperationWithRetry(async (repository) => {
      if (!driveConnected.value) {
        await repository.connect()
      }
      return await repository.findDriveEnvelope()
    })
    const action = determineSyncAction(localEnvelope, remoteEnvelope)

    if (action === 'noop') {
      if (remoteEnvelope && (!remoteEnvelope?.meta?.lastDriveSyncAt || !remoteEnvelope?.meta?.lastSyncedRevision)) {
        const syncAt = stampEnvelopeSyncMeta(remoteEnvelope)
        const savedEnvelope = await runDriveOperationWithRetry(async (repository) => {
          return await repository.save(remoteEnvelope)
        })
        applyDriveSyncMeta(savedEnvelope?.meta || remoteEnvelope.meta, syncAt)
      } else {
        applyDriveSyncMeta(remoteEnvelope?.meta, remoteEnvelope?.meta?.lastDriveSyncAt || remoteEnvelope?.meta?.updatedAt || null)
      }
      setDriveStatus('Drive sync complete. Local and Drive are already in sync.', 'info')
      markDriveSyncResult('noop', 'no changes')
      await listDriveFiles({ silent: true })
      return
    }

    if (action === 'push') {
      const syncAt = stampEnvelopeSyncMeta(localEnvelope)
      const savedEnvelope = await runDriveOperationWithRetry(async (repository) => {
        return await repository.save(localEnvelope)
      })
      applyDriveSyncMeta(savedEnvelope?.meta || localEnvelope.meta, syncAt)
      setDriveStatus('Drive sync complete. Pushed local changes to Drive.', 'success')
      markDriveSyncResult('success', 'pushed local to Drive')
      await listDriveFiles({ silent: true })
      return
    }

    if (action === 'pull') {
      await applyRemoteEnvelope(remoteEnvelope)
      setDriveStatus('Drive sync complete. Pulled Drive changes to this device.', 'success')
      markDriveSyncResult('success', 'pulled Drive to local')
      await listDriveFiles({ silent: true })
      return
    }

    const conflictResolution = await resolveDriveSyncConflict(localEnvelope, remoteEnvelope)
    if (conflictResolution === 'local') {
      const syncAt = stampEnvelopeSyncMeta(localEnvelope)
      const savedEnvelope = await runDriveOperationWithRetry(async (repository) => {
        return await repository.save(localEnvelope)
      })
      applyDriveSyncMeta(savedEnvelope?.meta || localEnvelope.meta, syncAt)
      setDriveStatus('Drive sync conflict resolved. Local data was pushed to Drive.', 'warning')
      markDriveSyncResult('conflict-resolved', 'conflict resolved with local source')
      await listDriveFiles({ silent: true })
      return
    }

    if (conflictResolution === 'drive') {
      await applyRemoteEnvelope(remoteEnvelope)
      setDriveStatus('Drive sync conflict resolved. Drive data was applied to this device.', 'warning')
      markDriveSyncResult('conflict-resolved', 'conflict resolved with Drive source')
      await listDriveFiles({ silent: true })
      return
    }

    setDriveStatus('Drive sync cancelled. No changes were applied.', 'info')
    markDriveSyncResult('cancelled', 'conflict resolution cancelled')
  } catch (error) {
    const message = error?.message || 'Drive sync failed.'
    markDriveSyncResult('failed', 'sync failed', message)
    setDriveStatus(message, 'danger')
  } finally {
    syncInProgress.value = false
  }
}

async function confirmRiskySave() {
  const message = 'Apply JSON changes to live data? This can break projections/import logic if shape or values are invalid.'

  if (store.confirm) {
    return await new Promise(resolve => {
      store.confirm(message, () => resolve(true), () => resolve(false))
    })
  }

  return window.confirm(message)
}

async function confirmImportOverwrite() {
  const message = 'Importing will replace JSON in the editor only. Review and click Apply Changes to commit. Continue with import?'

  if (store.confirm) {
    return await new Promise(resolve => {
      store.confirm(message, () => resolve(true), () => resolve(false))
    })
  }

  return window.confirm(message)
}

async function confirmDriveDisconnect() {
  const message = 'Disconnecting will delete all appDataFolder files for this app in Google Drive and clear the browser connection token.\n\nLocal application data remains safe from this action.'

  if (store.confirm) {
    return await new Promise(resolve => {
      store.confirm(
        message,
        () => resolve(true),
        () => resolve(false),
        {
          confirmText: 'DELETE',
          cancelText: 'Cancel',
          confirmButtonClass: 'btn-danger',
          cancelButtonClass: 'btn-success',
          requiredInputText: 'DELETE DRIVE',
          requiredInputLabel: 'Type DELETE DRIVE to confirm',
          requiredInputPlaceholder: 'DELETE DRIVE'
        }
      )
    })
  }

  if (!window.confirm(message)) return false
  const typed = window.prompt('Type DELETE DRIVE to confirm this action.')
  return typed === 'DELETE DRIVE'
}

function applyNormalizedPayload(normalizedPayload) {
  store.db = normalizedPayload
  store.ensureSelectedAccount()
  store.applyPositionMetadataForActiveAccount()

  if (editor) {
    editor.set(cloneForEditor(createLocalEnvelopeForSync()))
  }

  hasUnsavedChanges.value = false
  editorParseError.value = ''
}

async function applyChanges() {
  if (!editor) return

  try {
    const approved = await confirmRiskySave()
    if (!approved) return

    const parsed = editor.get()
    const payload = isEnvelopeShape(parsed)
      ? parsed.data
      : parsed
    const normalized = validateAndNormalizePayload(payload)
    applyNormalizedPayload(normalized)
    await store.saveChangesAndRecalculate()
    setStatus('Changes applied and persisted.', 'success')
  } catch (error) {
    const message = error?.message || 'Failed to apply JSON changes.'
    editorParseError.value = message
    setStatus('Save failed. Review errors and try again.', 'danger')
  }
}

async function importJsonFile(event) {
  const file = event?.target?.files?.[0]
  if (!file) return
  if (!editor) return

  try {
    const approved = await confirmImportOverwrite()
    if (!approved) return

    const text = await file.text()
    const parsed = JSON.parse(text)
    if (isEnvelopeShape(parsed)) {
      const envelopeData = parsed.data
      validateAndNormalizePayload(envelopeData)
      editor.set(cloneForEditor({
        meta: parsed.meta || {
          revision: 1,
          updatedAt: new Date().toISOString(),
          updatedByDevice: 'local-device',
          lastSyncedRevision: null,
          lastDriveSyncAt: null
        },
        data: envelopeData
      }))
    } else {
      const normalized = validateAndNormalizePayload(parsed)
      editor.set(cloneForEditor({
        meta: store.persistenceMeta || {
          revision: 1,
          updatedAt: new Date().toISOString(),
          updatedByDevice: 'local-device',
          lastSyncedRevision: null,
          lastDriveSyncAt: null
        },
        data: normalized
      }))
    }
    hasUnsavedChanges.value = true
    editorParseError.value = ''
    setStatus('Import successful. JSON envelope loaded into editor. Review and click Apply Changes to persist.', 'info')
  } catch (error) {
    const message = error?.message || 'Failed to import JSON file.'
    editorParseError.value = message
    setStatus('Import failed. Check file format and try again.', 'danger')
  } finally {
    if (event?.target) {
      event.target.value = ''
    }
  }
}

onMounted(() => {
  createEditor()
})

watch(
  () => store.db,
  () => {
    if (!editor || hasUnsavedChanges.value) return
    editor.set(cloneForEditor(createLocalEnvelopeForSync()))
  },
  { deep: true }
)

onBeforeUnmount(() => {
  if (driveConflictResolver.value) {
    driveConflictResolver.value('cancel')
    driveConflictResolver.value = null
  }

  if (statusDismissTimer) {
    window.clearTimeout(statusDismissTimer)
    statusDismissTimer = null
  }

  if (editor) {
    editor.destroy()
    editor = null
  }
})
</script>

<template>
  <div v-if="statusMessage" class="position-fixed top-0 start-50 translate-middle-x p-3 data-manager-status-overlay">
    <div :class="`alert alert-${statusType} alert-dismissible fade show mb-0 shadow`" role="alert">
      {{ statusMessage }}
      <button type="button" class="btn-close" aria-label="Dismiss status" @click="dismissStatus"></button>
    </div>
  </div>

  <div class="container-fluid app-page-shell py-3">
    <div class="card">
      <div class="card-header">
        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <h4 class="mb-1">Data Manager</h4>
            <div class="small text-muted">
              Explore and edit application JSON directly. Use with caution — invalid data can impact projections, imports, and position workflows.
            </div>
          </div>
          <button
            class="btn btn-sm drive-sync-trigger"
            :class="driveConnected ? 'btn-outline-success' : 'btn-outline-secondary'"
            type="button"
            title="Open Google Drive sync controls, file list, and conflict resolution options"
            @click="openDriveModal"
          >
            <i class="bi bi-google me-1"></i>
            Drive sync
          </button>
        </div>
      </div>

      <div class="card-body">
        <div class="btn-toolbar flex-wrap gap-2 mb-3" role="toolbar" aria-label="Data manager actions">
          <div class="btn-group" role="group" aria-label="Load data actions">
            <button
              type="button"
              class="btn btn-outline-secondary dropdown-toggle"
              data-bs-toggle="dropdown"
              aria-expanded="false"
              title="Load local saved data into the editor or upload JSON from a file"
            >
              Load Data
            </button>
            <ul class="dropdown-menu">
              <li>
                <button type="button" class="dropdown-item" title="Replace editor contents with the currently saved local data envelope" @click="reloadLocalEditor">
                  Reload Local
                </button>
              </li>
              <li>
                <button type="button" class="dropdown-item" title="Load a JSON file into the editor for review before applying changes" @click="openImportFilePicker">
                  Upload from Files
                </button>
              </li>
            </ul>
          </div>

          <div class="btn-group" role="group" aria-label="Download actions">
            <button class="btn btn-outline-primary" title="Download the current saved local data envelope (meta + data)" @click="downloadLocalCopy">Download Backup</button>
          </div>

          <div v-if="hasUnsavedChanges" class="btn-group" role="group" aria-label="Editor changes actions">
            <button class="btn btn-outline-secondary" title="Discard editor edits and reload from saved local data" @click="undoAllEditorChanges">Undo All</button>
            <button class="btn btn-danger" title="Validate editor JSON and persist it to local storage (then mirror to Drive if connected)" @click="applyChanges">Apply Changes</button>
          </div>
        </div>

        <div v-if="editorParseError" class="alert alert-danger py-2">
          {{ editorParseError }}
        </div>

        <div class="editor-frame border rounded" ref="editorHost"></div>

        <input
          ref="importInput"
          type="file"
          accept=".json,application/json"
          class="d-none"
          @change="importJsonFile" />
      </div>
    </div>
  </div>

  <div
    v-if="showDriveModal"
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    @click.self="closeDriveModal"
  >
    <div class="modal-dialog modal-dialog-centered modal-xl drive-modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-google me-2"></i>
            Google Drive Sync
          </h5>
          <button type="button" class="btn-close" aria-label="Close" @click="closeDriveModal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-2">
            <strong>Status:</strong>
            <span class="ms-1" :class="driveConnected ? 'text-success' : 'text-muted'">{{ driveStatusLabel }}</span>
          </div>
          <div v-if="driveConfigured" class="small text-muted">
            {{ driveConnected
              ? 'Drive is authorized for this browser and ready to sync the appDataFolder state.'
              : 'Client ID is set and the app is ready for a Drive OAuth flow.'
            }}
          </div>
          <div v-else class="small text-muted">
            Set <code>VITE_GOOGLE_CLIENT_ID</code> to enable Drive sync. Until then the app remains in local-first mode.
          </div>
          <div class="drive-sync-status small mt-2 p-2 border rounded bg-light-subtle">
            <div>
              <strong>Last sync result:</strong>
              <span class="ms-1" :class="driveSyncResultClass">{{ driveSyncResultLabel }}</span>
            </div>
            <div><strong>Last Drive sync:</strong> {{ formatLocalTimestamp(persistedLastDriveSyncAt) }}</div>
            <div><strong>Last synced revision:</strong> {{ persistedLastSyncedRevision ?? 'n/a' }}</div>
            <div v-if="driveSyncStatus.lastError" class="text-danger">
              <strong>Last error:</strong> {{ driveSyncStatus.lastError }}
            </div>
          </div>

          <hr class="my-3" />
          <div class="d-flex align-items-center justify-content-between mb-2">
            <strong>Drive files</strong>
            <div class="d-flex gap-2">
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                :disabled="!driveConfigured || driveFilesLoading || driveFilesDeletingAll"
                @click="listDriveFiles"
              >
                {{ driveFilesLoading ? 'Loading…' : 'List files' }}
              </button>
              <button
                v-if="hasListedDriveFiles && driveFiles.length"
                type="button"
                class="btn btn-sm btn-outline-danger"
                :disabled="!driveConfigured || !driveConnected || driveFilesLoading || driveFilesDeletingAll"
                @click="deleteAllDriveFiles"
              >
                {{ driveFilesDeletingAll ? 'Deleting…' : 'Delete all files' }}
              </button>
            </div>
          </div>
          <div v-if="driveFilesError" class="small text-danger mb-2">
            {{ driveFilesError }}
          </div>
          <div v-if="driveFiles.length" class="drive-files-table small">
            <DataTable :items="driveFiles" :columns="driveFilesColumns" :striped="true">
              <template #name="{ item }">
                <div class="fw-semibold">{{ item.name }}</div>
                <div v-if="item.appProperties?.ombUpdatedByDevice || item.appProperties?.ombRevision" class="small text-muted">
                  <span v-if="item.appProperties?.ombUpdatedByDevice">Device: {{ item.appProperties.ombUpdatedByDevice }}</span>
                  <span v-if="item.appProperties?.ombUpdatedByDevice && item.appProperties?.ombRevision"> • </span>
                  <span v-if="item.appProperties?.ombRevision">Revision: {{ item.appProperties.ombRevision }}</span>
                </div>
              </template>

              <template #appProperties="{ item }">
                <div class="small text-muted drive-app-properties">{{ formatAppProperties(item.appProperties) }}</div>
              </template>

              <template #actions="{ item }">
                <div class="d-flex gap-1 justify-content-end">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary py-0 px-2"
                    title="Load file into editor"
                    :disabled="driveFileLoadingToEditorId === item.id || driveFilesLoading || driveFilesDeletingAll || driveFileDeletingId === item.id || driveFileExportingId === item.id"
                    @click.stop="loadDriveFileToEditor(item)"
                  >
                    <i class="bi bi-box-arrow-in-down"></i>
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-primary py-0 px-2"
                    title="Export file"
                    :disabled="driveFileExportingId === item.id || driveFilesLoading || driveFilesDeletingAll || driveFileDeletingId === item.id || driveFileLoadingToEditorId === item.id"
                    @click.stop="exportSingleDriveFile(item)"
                  >
                    <i class="bi bi-cloud-download"></i>
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-danger py-0 px-2"
                    title="Delete file"
                    :disabled="driveFileDeletingId === item.id || driveFilesLoading || driveFilesDeletingAll || driveFileExportingId === item.id || driveFileLoadingToEditorId === item.id"
                    @click.stop="deleteSingleDriveFile(item)"
                  >
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </template>
            </DataTable>
          </div>
          <div v-else-if="!driveFilesLoading" class="small text-muted">
            No file list loaded yet. Click <strong>List files</strong> to verify Drive contents.
          </div>
        </div>
        <div class="modal-footer">
          <button
            v-if="!driveConnected"
            type="button"
            class="btn btn-outline-primary"
            :disabled="!driveConfigured"
            @click="connectDrive"
          >
            Connect Drive
          </button>
          <button
            v-else
            type="button"
            class="btn btn-outline-danger"
            @click="disconnectDrive"
          >
            Disconnect
          </button>
          <button
            type="button"
            class="btn btn-outline-secondary"
            :disabled="!driveConfigured || !driveConnected || syncInProgress"
            @click="syncDriveNow"
          >
            {{ syncInProgress ? 'Syncing…' : 'Sync now' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div
    v-if="driveConflictModalVisible"
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    @click.self="closeDriveConflictModal('cancel')"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Drive sync conflict</h5>
          <button type="button" class="btn-close" aria-label="Close" @click="closeDriveConflictModal('cancel')"></button>
        </div>
        <div class="modal-body">
          <p class="small mb-2">Drive and local data differ and could not be auto-resolved.</p>
          <div class="small mb-2">
            <strong>Local:</strong>
            r{{ driveConflictDetails.localMeta?.revision || 0 }} •
            {{ driveConflictDetails.localMeta?.updatedAt || 'unknown-time' }} •
            {{ driveConflictDetails.localMeta?.updatedByDevice || 'unknown-device' }}
          </div>
          <div class="small mb-2">
            <strong>Drive:</strong>
            r{{ driveConflictDetails.remoteMeta?.revision || 0 }} •
            {{ driveConflictDetails.remoteMeta?.updatedAt || 'unknown-time' }} •
            {{ driveConflictDetails.remoteMeta?.updatedByDevice || 'unknown-device' }}
          </div>
          <div class="small">
            <strong>Summary of differences</strong>
            <pre class="mb-0 mt-1 conflict-summary">{{ driveConflictDetails.summary }}</pre>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" @click="closeDriveConflictModal('cancel')">
            Cancel
          </button>
          <button type="button" class="btn btn-outline-primary" @click="closeDriveConflictModal('drive')">
            Use Drive data
          </button>
          <button type="button" class="btn btn-primary" @click="closeDriveConflictModal('local')">
            Keep local data
          </button>
        </div>
      </div>
    </div>
  </div>
  <div v-if="showDriveModal" class="modal-backdrop fade show"></div>
  <div v-if="driveConflictModalVisible" class="modal-backdrop fade show"></div>
</template>

<style scoped>
.editor-frame {
  min-height: 65vh;
  background: white;
}

.drive-sync-trigger {
  white-space: nowrap;
}

.data-manager-status-overlay {
  z-index: 2000;
}

.drive-modal-dialog {
  max-width: min(1400px, 96vw);
}

.drive-files-table {
  max-height: 320px;
  overflow: hidden;
}

.drive-files-table :deep(.scrollable-window) {
  max-height: 300px;
}

.drive-app-properties {
  word-break: break-word;
}

.drive-files-table :deep(.col-xl-2) button {
  white-space: nowrap;
}

.drive-sync-status {
  line-height: 1.4;
}

.conflict-summary {
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 0.85rem;
}

:deep(.jsoneditor) {
  border: none;
}

:deep(.jsoneditor-outer) {
  min-height: 65vh;
}
</style>
