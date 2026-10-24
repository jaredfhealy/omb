<script setup>
import { computed, ref } from 'vue'

const message = ref('')
const isVisible = ref(false)
const callback = ref(null)
const cancelCallback = ref(null)
const confirmText = ref('OK')
const cancelText = ref('Cancel')
const confirmButtonClass = ref('btn-primary')
const cancelButtonClass = ref('btn-secondary')
const requiredInputText = ref('')
const requiredInputLabel = ref('')
const requiredInputPlaceholder = ref('')
const requiredInputValue = ref('')
const requiredInputCaseSensitive = ref(true)

const canConfirm = computed(() => {
  if (!requiredInputText.value) return true
  if (requiredInputCaseSensitive.value) {
    return requiredInputValue.value === requiredInputText.value
  }
  return requiredInputValue.value.toLowerCase() === requiredInputText.value.toLowerCase()
})

const show = (msg, cb, cancelCb = null, options = {}) => {
  const safeOptions = options || {}
  message.value = msg
  callback.value = cb
  cancelCallback.value = cancelCb
  confirmText.value = safeOptions.confirmText || 'OK'
  cancelText.value = safeOptions.cancelText || 'Cancel'
  confirmButtonClass.value = safeOptions.confirmButtonClass || 'btn-primary'
  cancelButtonClass.value = safeOptions.cancelButtonClass || 'btn-secondary'
  requiredInputText.value = String(safeOptions.requiredInputText || '')
  requiredInputLabel.value = String(safeOptions.requiredInputLabel || '')
  requiredInputPlaceholder.value = String(safeOptions.requiredInputPlaceholder || '')
  requiredInputCaseSensitive.value = safeOptions.requiredInputCaseSensitive !== false
  requiredInputValue.value = ''
  isVisible.value = true
}

const confirm = () => {
  if (!canConfirm.value) return
  if (callback.value) {
    callback.value()
  }
  reset(false)
}

const cancel = () => {
  reset(true)
}

const reset = (isCancelled = false) => {
  // If cancelled and we have a cancel callback, call it
  if (isCancelled && cancelCallback.value) {
    cancelCallback.value()
  }
  
  message.value = ''
  callback.value = null
  cancelCallback.value = null
  confirmText.value = 'OK'
  cancelText.value = 'Cancel'
  confirmButtonClass.value = 'btn-primary'
  cancelButtonClass.value = 'btn-secondary'
  requiredInputText.value = ''
  requiredInputLabel.value = ''
  requiredInputPlaceholder.value = ''
  requiredInputValue.value = ''
  requiredInputCaseSensitive.value = true
  isVisible.value = false
}

// Expose methods to parent
defineExpose({ show })
</script>

<template>
  <div class="modal" id="confirm-modal" tabindex="-1" :class="{ 'd-block': isVisible }" v-if="isVisible">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Confirm Action</h5>
          <button type="button" class="btn-close" @click="cancel"></button>
        </div>
        <div class="modal-body">
          <p class="confirm-message">{{ message }}</p>
          <div v-if="requiredInputText" class="mt-3">
            <label class="form-label mb-1">
              {{ requiredInputLabel || `Type "${requiredInputText}" to confirm` }}
            </label>
            <input
              v-model="requiredInputValue"
              type="text"
              class="form-control"
              :placeholder="requiredInputPlaceholder || requiredInputText"
            >
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn" :class="cancelButtonClass" @click="cancel">{{ cancelText }}</button>
          <button type="button" class="btn" :class="confirmButtonClass" :disabled="!canConfirm" @click="confirm">{{ confirmText }}</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>

<style scoped>
.confirm-delete-btn:hover,
.confirm-delete-btn:focus,
.confirm-delete-btn:active {
  background-color: var(--bs-secondary) !important;
  border-color: var(--bs-secondary) !important;
  color: #fff !important;
}

.confirm-message {
  white-space: pre-line;
}
</style>