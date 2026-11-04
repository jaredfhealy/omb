<script setup>
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import DataTable from '@/components/custom/DataTable.vue'

const store = useAppStore()

const editingCheckpoint = ref(null)
const editingIndex = ref(null)
const saveError = ref('')
const showSchwabImportModal = ref(false)
const schwabImportJson = ref('')
const schwabImportError = ref('')
const schwabScriptCopyStatus = ref('')
const schwabOverwriteWarnings = ref([])
const schwabExistingCheckpointWarnings = ref([])
const schwabConfirmRequired = ref(false)
const schwabPendingImportText = ref('')
const schwabPendingParsedPayload = ref(null)
const saveOverwriteWarnings = ref([])
const saveExistingCheckpointWarnings = ref([])
const saveConfirmRequired = ref(false)
const savePendingFingerprint = ref('')
const editingOriginalCheckpoint = ref(null)

const SCHWAB_EXTRACTION_SCRIPT = `(() => {
  const parseMoney = (raw) => {
    if (!raw) return null;
    const txt = String(raw).replace(/\\s+/g, " ").trim();
    const neg = txt.includes("(") && txt.includes(")");
    const cleaned = txt.replace(/[^\\d.-]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  };

  const findMoneyByPrefix = (prefix) => {
    const el = document.querySelector(\`[id^="\${prefix}"]\`);
    return { el, value: el ? parseMoney(el.textContent) : null };
  };

  const bodyText = document.body?.innerText || "";
  const asOfMatch =
    bodyText.match(/as of\\s+(\\d{4})[\\/-](\\d{2})[\\/-](\\d{2})/i) ||
    bodyText.match(/as of\\s+(\\d{2})[\\/-](\\d{2})[\\/-](\\d{4})/i);
  let asOfDate = null;
  if (asOfMatch) {
    if (asOfMatch[1].length === 4) asOfDate = \`\${asOfMatch[1]}-\${asOfMatch[2]}-\${asOfMatch[3]}\`;
    else asOfDate = \`\${asOfMatch[3]}-\${asOfMatch[1]}-\${asOfMatch[2]}\`;
  }

  const cashTotal = findMoneyByPrefix("valCashAndCashInvestmentTotal-");
  const cashOnHold = findMoneyByPrefix("valCashOnHold-");
  const cashSecuredPutRequirement = findMoneyByPrefix("valEquityPutRequirement-");
  const borrowing = findMoneyByPrefix("valborrowing-");
  const balanceSubjectToInterest = findMoneyByPrefix("valBalanceSubjectToInterest-");
  const marginEquity = findMoneyByPrefix("valMarginEquity-");
  const cashPlusBorrowingWithdraw = findMoneyByPrefix("valCashBorrowingWithdraw-");
  const cashAvailWithdraw = findMoneyByPrefix("valCashAndCashInvestmentWithdraw-");
  const cashAvailTrade = findMoneyByPrefix("valCashAndCashInvestment-");

  if (!cashTotal.el) {
    console.warn("Could not find Schwab balance DOM fields. Are you on the Schwab balance details page?");
    return null;
  }

  const marginUtilized = Math.max(0, borrowing.value ?? 0, balanceSubjectToInterest.value ?? 0);

  const result = {
    asOfDate,
    cashBalance: cashTotal.value,
    marginUtilized,
    cashOnHold: cashOnHold.value,
    cashSecuredPutRequirement: cashSecuredPutRequirement.value,
    borrowing: borrowing.value,
    balanceSubjectToInterest: balanceSubjectToInterest.value,
    marginEquity: marginEquity.value,
    cashPlusBorrowingWithdraw: cashPlusBorrowingWithdraw.value,
    cashAvailWithdraw: cashAvailWithdraw.value,
    cashAvailTrade: cashAvailTrade.value
  };

  window.__ombCheckpointExtract = result;
  console.log("Schwab checkpoint parse result:", result);
  return result;
})();`

const filteredCheckpoints = computed(() => {
  const checkpoints = Array.isArray(store.activeAccount?.cashCheckpoints)
    ? store.activeAccount.cashCheckpoints
    : []

  let items = checkpoints
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .sort((a, b) => {
      return String(b?.asOfDate || '').localeCompare(String(a?.asOfDate || ''))
    })

  return items
})

const columns = [
  {
    key: 'asOf',
    header: { text: 'As Of' },
    class: 'col-12 col-xl-2'
  },
  {
    key: 'cashBalance',
    header: { text: 'Cash Balance' },
    class: 'col-6 col-xl-2',
    value: (item) => store.currency(Number(item.cashBalance || 0))
  },
  {
    key: 'marginUtilized',
    header: { text: 'Margin Utilized' },
    class: 'col-6 col-xl-2',
    value: (item) => store.currency(Number(item.marginUtilized || 0))
  },
  {
    key: 'notes',
    header: { text: 'Notes' },
    class: 'col-12 col-xl-2'
  },
  {
    key: 'actions',
    header: { text: 'Actions' },
    class: 'col-6 col-xl-2'
  }
]

function openCreateModal() {
  saveError.value = ''
  clearSaveConfirmation()
  editingIndex.value = null
  editingCheckpoint.value = {
    asOfDate: new Date().toISOString().slice(0, 10),
    cashBalance: '',
    marginUtilized: 0,
    rawSnapshotText: '',
    notes: ''
  }
  editingOriginalCheckpoint.value = null
}

function openEditModal(checkpoint) {
  saveError.value = ''
  clearSaveConfirmation()
  editingIndex.value = checkpoint.originalIndex
  editingCheckpoint.value = {
    ...checkpoint,
    asOfDate: checkpoint?.asOfDate || new Date().toISOString().slice(0, 10),
    cashBalance: Number(checkpoint?.cashBalance || 0),
    marginUtilized: Number(checkpoint?.marginUtilized || 0),
    rawSnapshotText: checkpoint?.rawSnapshot
      ? JSON.stringify(checkpoint.rawSnapshot, null, 2)
      : '',
    notes: checkpoint?.notes || ''
  }
  editingOriginalCheckpoint.value = {
    asOfDate: checkpoint?.asOfDate || '',
    cashBalance: Number(checkpoint?.cashBalance || 0),
    marginUtilized: Number(checkpoint?.marginUtilized || 0),
    notes: checkpoint?.notes || '',
    rawSnapshotText: checkpoint?.rawSnapshot
      ? JSON.stringify(checkpoint.rawSnapshot, null, 2)
      : ''
  }
}

function closeModal() {
  closeSchwabImportModal()
  clearSaveConfirmation()
  editingCheckpoint.value = null
  editingOriginalCheckpoint.value = null
  editingIndex.value = null
  saveError.value = ''
}

function openSchwabImportModal() {
  if (!editingCheckpoint.value) return
  showSchwabImportModal.value = true
  schwabImportJson.value = ''
  schwabImportError.value = ''
  schwabScriptCopyStatus.value = ''
  schwabOverwriteWarnings.value = []
  schwabExistingCheckpointWarnings.value = []
  schwabConfirmRequired.value = false
  schwabPendingImportText.value = ''
  schwabPendingParsedPayload.value = null
}

function closeSchwabImportModal() {
  showSchwabImportModal.value = false
  schwabImportError.value = ''
  schwabOverwriteWarnings.value = []
  schwabExistingCheckpointWarnings.value = []
  schwabConfirmRequired.value = false
  schwabPendingImportText.value = ''
  schwabPendingParsedPayload.value = null
}

function formatDiffValue(value, field) {
  if (field === 'cashBalance' || field === 'marginUtilized') {
    const num = Number(value)
    return Number.isFinite(num) ? store.currency(num) : '—'
  }
  if (field === 'notes' || field === 'rawSnapshotText') {
    return String(value || '').trim() ? 'Present' : 'Empty'
  }
  return String(value ?? '')
}

function clearSaveConfirmation() {
  saveConfirmRequired.value = false
  saveOverwriteWarnings.value = []
  saveExistingCheckpointWarnings.value = []
  savePendingFingerprint.value = ''
}

watch(schwabImportJson, (value) => {
  if (!schwabConfirmRequired.value) return
  const normalized = String(value || '').trim()
  if (normalized === schwabPendingImportText.value) return
  schwabConfirmRequired.value = false
  schwabOverwriteWarnings.value = []
  schwabExistingCheckpointWarnings.value = []
  schwabPendingImportText.value = ''
  schwabPendingParsedPayload.value = null
})

watch(editingCheckpoint, () => {
  if (!saveConfirmRequired.value) return
  clearSaveConfirmation()
}, { deep: true })

async function copySchwabExtractionScript() {
  schwabScriptCopyStatus.value = ''
  try {
    await navigator.clipboard.writeText(SCHWAB_EXTRACTION_SCRIPT)
    schwabScriptCopyStatus.value = 'Copied script to clipboard.'
  } catch (error) {
    schwabScriptCopyStatus.value = 'Copy failed. You can still select and copy manually from this modal.'
  }
}

function applySchwabImportJson() {
  schwabImportError.value = ''
  const importText = String(schwabImportJson.value || '').trim()
  if (!importText) {
    schwabImportError.value = 'Paste Schwab JSON first.'
    return
  }

  let payload
  if (schwabConfirmRequired.value && schwabPendingImportText.value === importText && schwabPendingParsedPayload.value) {
    payload = schwabPendingParsedPayload.value
  } else {
    schwabOverwriteWarnings.value = []
    schwabExistingCheckpointWarnings.value = []
    schwabConfirmRequired.value = false
    schwabPendingImportText.value = ''
    schwabPendingParsedPayload.value = null

    let parsed
    try {
      parsed = JSON.parse(importText)
    } catch (error) {
      schwabImportError.value = 'Pasted value must be valid JSON.'
      return
    }

    payload = parsed?.checkpoint && typeof parsed.checkpoint === 'object'
      ? parsed.checkpoint
      : parsed

    const asOfDate = String(payload?.asOfDate || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      schwabImportError.value = 'asOfDate is required and must be YYYY-MM-DD.'
      return
    }

    const cashBalance = Number(payload?.cashBalance)
    if (!Number.isFinite(cashBalance)) {
      schwabImportError.value = 'cashBalance must be a valid number.'
      return
    }

    const marginUtilized = payload?.marginUtilized === undefined || payload?.marginUtilized === null
      ? 0
      : Number(payload.marginUtilized)
    if (!Number.isFinite(marginUtilized) || marginUtilized < 0) {
      schwabImportError.value = 'marginUtilized must be a non-negative number.'
      return
    }

    const nextValues = {
      asOfDate,
      cashBalance: Math.round(cashBalance * 100) / 100,
      marginUtilized: Math.round(marginUtilized * 100) / 100,
      notes: '',
      rawSnapshotText: JSON.stringify({ ...payload }, null, 2)
    }
    const currentValues = {
      asOfDate: String(editingCheckpoint.value?.asOfDate || ''),
      cashBalance: Number(editingCheckpoint.value?.cashBalance || 0),
      marginUtilized: Number(editingCheckpoint.value?.marginUtilized || 0),
      notes: String(editingCheckpoint.value?.notes || ''),
      rawSnapshotText: String(editingCheckpoint.value?.rawSnapshotText || '')
    }

    const fieldsToCompare = ['asOfDate', 'cashBalance', 'marginUtilized']
    const fieldLabels = {
      asOfDate: 'As-of Date',
      cashBalance: 'Cash Balance',
      marginUtilized: 'Margin Utilized',
      notes: 'Notes',
      rawSnapshotText: 'Snapshot JSON'
    }

    const warnings = fieldsToCompare
      .filter((field) => {
        if (field === 'cashBalance' || field === 'marginUtilized') {
          return Math.round(Number(currentValues[field]) * 100) / 100 !== Math.round(Number(nextValues[field]) * 100) / 100
        }
        return String(currentValues[field] || '') !== String(nextValues[field] || '')
      })
      .map((field) => ({
        field,
        label: fieldLabels[field] || field,
        from: formatDiffValue(currentValues[field], field),
        to: formatDiffValue(nextValues[field], field)
      }))

    const existingSavedCheckpoint = (Array.isArray(store.activeAccount?.cashCheckpoints) ? store.activeAccount.cashCheckpoints : [])
      .find((checkpoint, idx) => {
        const sameDate = String(checkpoint?.asOfDate || '') === asOfDate
        if (!sameDate) return false
        if (editingIndex.value === null) return true
        return idx !== editingIndex.value
      })

    const existingWarnings = []
    if (existingSavedCheckpoint) {
      const existingCash = Number(existingSavedCheckpoint?.cashBalance || 0)
      const existingMargin = Number(existingSavedCheckpoint?.marginUtilized || 0)
      if (Math.round(existingCash * 100) / 100 !== nextValues.cashBalance) {
        existingWarnings.push(`Cash Balance: ${store.currency(existingCash)} -> ${store.currency(nextValues.cashBalance)}`)
      }
      if (Math.round(existingMargin * 100) / 100 !== nextValues.marginUtilized) {
        existingWarnings.push(`Margin Utilized: ${store.currency(existingMargin)} -> ${store.currency(nextValues.marginUtilized)}`)
      }
      if (String(existingSavedCheckpoint?.notes || '').trim() !== '') {
        existingWarnings.push('Notes: existing saved notes will be replaced with blank notes.')
      }
    }

    if (warnings.length > 0 || existingWarnings.length > 0) {
      schwabOverwriteWarnings.value = warnings
      schwabExistingCheckpointWarnings.value = existingWarnings
      schwabConfirmRequired.value = true
      schwabPendingImportText.value = importText
      schwabPendingParsedPayload.value = payload
      return
    }
  }

  const asOfDate = String(payload?.asOfDate || '').trim()
  const cashBalance = Number(payload?.cashBalance)
  const marginUtilized = payload?.marginUtilized === undefined || payload?.marginUtilized === null
    ? 0
    : Number(payload.marginUtilized)
  const rawSnapshot = { ...payload }

  editingCheckpoint.value.asOfDate = asOfDate
  editingCheckpoint.value.cashBalance = Math.round(cashBalance * 100) / 100
  editingCheckpoint.value.marginUtilized = Math.round(marginUtilized * 100) / 100
  editingCheckpoint.value.notes = ''
  editingCheckpoint.value.rawSnapshotText = JSON.stringify(rawSnapshot, null, 2)

  closeSchwabImportModal()
}

async function saveCheckpoint() {
  if (!editingCheckpoint.value) return

  const asOfDate = String(editingCheckpoint.value.asOfDate || '').trim()
  const cashBalance = Number(editingCheckpoint.value.cashBalance)
  const marginUtilized = Number(editingCheckpoint.value.marginUtilized || 0)
  const rawSnapshotText = String(editingCheckpoint.value.rawSnapshotText || '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    saveError.value = 'As-of date is required and must be valid.'
    return
  }
  if (!Number.isFinite(cashBalance)) {
    saveError.value = 'Cash balance must be a valid number.'
    return
  }
  if (!Number.isFinite(marginUtilized) || marginUtilized < 0) {
    saveError.value = 'Margin utilized must be a non-negative number.'
    return
  }
  let rawSnapshot = null
  if (rawSnapshotText.length > 0) {
    try {
      rawSnapshot = JSON.parse(rawSnapshotText)
    } catch (error) {
      saveError.value = 'Raw snapshot must be valid JSON.'
      return
    }
  }

  const checkpoint = {
    ...editingCheckpoint.value,
    asOfDate,
    cashBalance: Math.round(cashBalance * 100) / 100,
    marginUtilized: Math.round(marginUtilized * 100) / 100,
    rawSnapshot
  }

  const pendingFingerprint = JSON.stringify({
    asOfDate: checkpoint.asOfDate,
    cashBalance: checkpoint.cashBalance,
    marginUtilized: checkpoint.marginUtilized,
    notes: String(checkpoint.notes || ''),
    rawSnapshotText: rawSnapshotText
  })

  if (!(saveConfirmRequired.value && savePendingFingerprint.value === pendingFingerprint)) {
    saveError.value = ''
    saveOverwriteWarnings.value = []
    saveExistingCheckpointWarnings.value = []
    saveConfirmRequired.value = false
    savePendingFingerprint.value = ''

    const fieldLabels = {
      asOfDate: 'As-of Date',
      cashBalance: 'Cash Balance',
      marginUtilized: 'Margin Utilized',
      notes: 'Notes',
      rawSnapshotText: 'Snapshot JSON'
    }
    const original = editingOriginalCheckpoint.value
    if (original) {
      const currentValues = {
        asOfDate: String(original.asOfDate || ''),
        cashBalance: Number(original.cashBalance || 0),
        marginUtilized: Number(original.marginUtilized || 0),
        notes: String(original.notes || ''),
        rawSnapshotText: String(original.rawSnapshotText || '')
      }
      const nextValues = {
        asOfDate: checkpoint.asOfDate,
        cashBalance: checkpoint.cashBalance,
        marginUtilized: checkpoint.marginUtilized,
        notes: String(checkpoint.notes || ''),
        rawSnapshotText
      }
      const fieldsToCompare = ['asOfDate', 'cashBalance', 'marginUtilized']
      saveOverwriteWarnings.value = fieldsToCompare
        .filter((field) => {
          if (field === 'cashBalance' || field === 'marginUtilized') {
            return Math.round(Number(currentValues[field]) * 100) / 100 !== Math.round(Number(nextValues[field]) * 100) / 100
          }
          return String(currentValues[field] || '') !== String(nextValues[field] || '')
        })
        .map((field) => ({
          field,
          label: fieldLabels[field] || field,
          from: formatDiffValue(currentValues[field], field),
          to: formatDiffValue(nextValues[field], field)
        }))
    }

    const existingSavedCheckpoint = (Array.isArray(store.activeAccount?.cashCheckpoints) ? store.activeAccount.cashCheckpoints : [])
      .find((savedCheckpoint, idx) => {
        const sameDate = String(savedCheckpoint?.asOfDate || '') === checkpoint.asOfDate
        if (!sameDate) return false
        if (editingIndex.value === null) return true
        return idx !== editingIndex.value
      })

    if (existingSavedCheckpoint) {
      const existingCash = Number(existingSavedCheckpoint?.cashBalance || 0)
      const existingMargin = Number(existingSavedCheckpoint?.marginUtilized || 0)
      if (Math.round(existingCash * 100) / 100 !== checkpoint.cashBalance) {
        saveExistingCheckpointWarnings.value.push(`Cash Balance: ${store.currency(existingCash)} -> ${store.currency(checkpoint.cashBalance)}`)
      }
      if (Math.round(existingMargin * 100) / 100 !== checkpoint.marginUtilized) {
        saveExistingCheckpointWarnings.value.push(`Margin Utilized: ${store.currency(existingMargin)} -> ${store.currency(checkpoint.marginUtilized)}`)
      }
    }

    if (saveOverwriteWarnings.value.length > 0 || saveExistingCheckpointWarnings.value.length > 0) {
      saveConfirmRequired.value = true
      savePendingFingerprint.value = pendingFingerprint
      return
    }
  }

  if (!Array.isArray(store.activeAccount.cashCheckpoints)) {
    store.activeAccount.cashCheckpoints = []
  }

  if (editingIndex.value === null) {
    store.activeAccount.cashCheckpoints.push(checkpoint)
  } else {
    store.activeAccount.cashCheckpoints.splice(editingIndex.value, 1, checkpoint)
  }

  await store.saveChangesAndRecalculate()
  clearSaveConfirmation()
  closeModal()
}

function deleteCheckpoint(checkpoint) {
  if (!store.confirm) return
  const summary = `${checkpoint.asOfDate}`
  store.confirm(
    `Delete checkpoint ${summary} for ${store.currency(Number(checkpoint.cashBalance || 0))}?`,
    async () => {
      store.activeAccount.cashCheckpoints.splice(checkpoint.originalIndex, 1)
      await store.saveChangesAndRecalculate()
    }
  )
}
</script>

<template>
  <DataTable
    :items="filteredCheckpoints"
    :columns="columns"
    :striped="true"
  >
    <template #table-controls>
      <div class="d-flex flex-wrap align-items-center justify-content-between w-100">
        <div class="d-flex align-items-center">
          <button class="btn btn-primary me-2" :class="store.isBelowXL ? 'btn-sm' : ''" @click="openCreateModal">
            <i class="bi bi-plus"></i> New
          </button>
        </div>
      </div>
    </template>

    <template #asOf="{ item }">
      <div>{{ item.asOfDate }}</div>
    </template>

    <template #notes="{ item }">
      <span class="text-muted">{{ item.notes || '—' }}</span>
    </template>

    <template #actions="{ item }">
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-primary" @click="openEditModal(item)">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" @click="deleteCheckpoint(item)">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </template>

    <template #empty>
      <div class="text-center py-5">
        <p class="text-muted mb-2">No cash checkpoints found.</p>
      </div>
    </template>
  </DataTable>

  <div class="modal" tabindex="-1" :class="{ 'd-block': editingCheckpoint !== null }" v-if="editingCheckpoint">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ editingIndex === null ? 'Add Cash Checkpoint' : 'Edit Cash Checkpoint' }}</h5>
          <button type="button" class="btn-close" @click="closeModal"></button>
        </div>
        <div class="modal-body">
          <div class="text-danger mb-3" v-if="saveError">{{ saveError }}</div>
          <div
            class="alert alert-warning py-2"
            v-if="saveConfirmRequired && (saveOverwriteWarnings.length > 0 || saveExistingCheckpointWarnings.length > 0)"
          >
            <div class="fw-semibold mb-1">Saving will overwrite values:</div>
            <ul class="mb-1 ps-3" v-if="saveOverwriteWarnings.length > 0">
              <li v-for="warning in saveOverwriteWarnings" :key="warning.field">
                {{ warning.label }}: {{ warning.from }} -> {{ warning.to }}
              </li>
            </ul>
            <ul class="mb-0 ps-3" v-if="saveExistingCheckpointWarnings.length > 0">
              <li v-for="warning in saveExistingCheckpointWarnings" :key="warning">
                {{ warning }}
              </li>
            </ul>
            <div class="small mt-1">Click confirm below to apply these changes.</div>
          </div>
          <div class="mb-3 p-3 border rounded bg-light-subtle">
            <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between">
              <div class="fw-semibold">Import from Schwab extraction JSON</div>
              <button type="button" class="btn btn-sm btn-outline-primary" @click="openSchwabImportModal">
                Open Import Helper
              </button>
            </div>
            <div class="small text-muted mt-2">
              Use the import helper to copy/run the extraction script on Schwab and paste the JSON output here for validation and auto-fill.
            </div>
          </div>
          <details class="mb-3">
            <summary class="small fw-semibold">Field definitions</summary>
            <div class="small text-muted mt-2">
              <div><strong>As-of Date</strong>: Date Schwab balance snapshot applies to.</div>
              <div><strong>Cash Balance</strong>: Schwab “Cash &amp; Cash Investments Total” (cash, money market, bank deposit accounts, and net credit/debit balances).</div>
              <div><strong>Margin Utilized</strong>: Confirmed borrowed principal currently used (debt). Prefer confirmed debt indicators (for example, Borrowing or Balance Subject to Interest), not collateral hold values.</div>
              <div><strong>Notes</strong>: Optional plain-text context (left blank by importer).</div>
              <div><strong>Raw Snapshot JSON</strong>: Full extracted payload retained for future audit/reference.</div>
              <hr class="my-2">
              <div><strong>Cash + Borrowing</strong>: Maximum potentially withdrawable amount including eligible margin borrowing capacity; this is capacity, not automatically debt used.</div>
              <div><strong>SMA (Special Memorandum Account)</strong>: A Regulation T bookkeeping figure preserving excess equity/buying power history; not cash balance.</div>
              <div><strong>Cash on Hold</strong>: Temporary hold/restriction on cash (for example transfers, reinvestment, trading activity, pledged asset impacts). Usually encumbered cash, not margin debt principal.</div>
              <div><strong>Cash Secured Put Requirement</strong>: Cash collateral required for open CSP obligations; collateral lock, not borrowing by itself.</div>
              <div><strong>Balance Subject to Interest</strong>: Amount currently accruing margin interest (strong indicator of active margin borrowing).</div>
              <div><strong>Margin Equity</strong>: Schwab margin equity metric used in margin calculations; not equivalent to free cash.</div>
            </div>
          </details>
          <div class="mb-3">
            <label class="form-label">As-of Date</label>
            <input type="date" class="form-control" v-model="editingCheckpoint.asOfDate">
          </div>
          <div class="mb-3">
            <label class="form-label">Cash Balance</label>
            <input type="number" step="0.01" class="form-control" v-model.number="editingCheckpoint.cashBalance">
          </div>
          <div class="mb-3">
            <label class="form-label">Margin Utilized</label>
            <input type="number" step="0.01" min="0" class="form-control" v-model.number="editingCheckpoint.marginUtilized">
          </div>
          <div class="mb-0">
            <label class="form-label">Notes</label>
            <textarea class="form-control" rows="3" v-model="editingCheckpoint.notes"></textarea>
          </div>
          <div class="mt-3 mb-0">
            <label class="form-label">Raw Snapshot JSON (import-helper managed)</label>
            <textarea
              class="form-control font-monospace"
              rows="6"
              v-model="editingCheckpoint.rawSnapshotText"
              disabled
            ></textarea>
            <div class="form-text">
              This field is read-only and populated by the Schwab import helper.
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="closeModal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="saveCheckpoint">
            {{ saveConfirmRequired ? 'Confirm Save Changes' : 'Save changes' }}
          </button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>

  <div class="modal" tabindex="-1" :class="{ 'd-block': showSchwabImportModal }" v-if="showSchwabImportModal">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Schwab Extraction Import Helper</h5>
          <button type="button" class="btn-close" @click="closeSchwabImportModal"></button>
        </div>
        <div class="modal-body">
          <div class="small text-muted mb-3">
            1) In Schwab, select the target checkpoint date and click <strong>Search</strong> so balances for that date are loaded.<br>
            2) Click <strong>Copy Extraction Script</strong>.<br>
            3) Run the script in the Schwab balance details page console.<br>
            4) Copy JSON output and paste below.<br>
            5) Click <strong>Validate &amp; Auto Fill</strong> (notes remain blank by design).
          </div>
          <div class="d-flex flex-wrap gap-2 mb-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="copySchwabExtractionScript">
              Copy Extraction Script
            </button>
            <span class="small text-muted align-self-center" v-if="schwabScriptCopyStatus">{{ schwabScriptCopyStatus }}</span>
          </div>
          <details class="mb-3">
            <summary class="small">Show extraction script</summary>
            <textarea class="form-control font-monospace mt-2" rows="10" readonly :value="SCHWAB_EXTRACTION_SCRIPT"></textarea>
          </details>
          <div class="text-danger mb-2" v-if="schwabImportError">{{ schwabImportError }}</div>
          <div
            class="alert alert-warning py-2"
            v-if="schwabConfirmRequired && (schwabOverwriteWarnings.length > 0 || schwabExistingCheckpointWarnings.length > 0)"
          >
            <div class="fw-semibold mb-1">Import will overwrite values:</div>
            <ul class="mb-1 ps-3" v-if="schwabOverwriteWarnings.length > 0">
              <li v-for="warning in schwabOverwriteWarnings" :key="warning.field">
                {{ warning.label }}: {{ warning.from }} -> {{ warning.to }}
              </li>
            </ul>
            <ul class="mb-0 ps-3" v-if="schwabExistingCheckpointWarnings.length > 0">
              <li v-for="warning in schwabExistingCheckpointWarnings" :key="warning">
                {{ warning }}
              </li>
            </ul>
            <div class="small mt-1">Click confirm below to apply these changes.</div>
          </div>
          <label class="form-label">Pasted Schwab JSON</label>
          <textarea class="form-control font-monospace" rows="10" v-model="schwabImportJson" placeholder='Paste flat object with fields like asOfDate, cashBalance, marginUtilized, cashOnHold, borrowing, etc.'></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="closeSchwabImportModal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="applySchwabImportJson">
            {{ schwabConfirmRequired ? 'Confirm Overwrite & Auto Fill' : 'Validate & Auto Fill' }}
          </button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>
