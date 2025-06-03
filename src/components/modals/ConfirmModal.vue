<script setup>
import { ref } from 'vue'

const message = ref('')
const isVisible = ref(false)
const callback = ref(null)
const cancelCallback = ref(null)

const show = (msg, cb, cancelCb = null) => {
  message.value = msg
  callback.value = cb
  cancelCallback.value = cancelCb
  isVisible.value = true
}

const confirm = () => {
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
          <p>{{ message }}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="cancel">Cancel</button>
          <button type="button" class="btn btn-primary" @click="confirm">OK</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </div>
</template>