<script setup>
import { ref } from 'vue'
import { auth } from '@/firebase'
import { updatePassword } from 'firebase/auth'

const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref(false)

const handleSubmit = async () => {
  error.value = ''
  success.value = false
  
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }
  
  if (newPassword.value.length < 6) {
    error.value = 'Password must be at least 6 characters'
    return
  }

  try {
    const user = auth.currentUser
    if (!user) throw new Error('No user logged in')
    
    await updatePassword(user, newPassword.value)
    success.value = true
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (err) {
    console.error('Password update failed:', err)
    error.value = 'Failed to update password. You may need to sign out and back in.'
  }
}
</script>

<template>
  <div class="modal fade" id="changePasswordModal" tabindex="-1">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Change Password</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div v-if="error" class="alert alert-danger">{{ error }}</div>
          <div v-if="success" class="alert alert-success">Password updated successfully!</div>
          
          <form @submit.prevent="handleSubmit">
            <div class="mb-3">
              <label class="form-label">New Password</label>
              <input type="password" class="form-control" v-model="newPassword" required>
            </div>
            <div class="mb-3">
              <label class="form-label">Confirm Password</label>
              <input type="password" class="form-control" v-model="confirmPassword" required>
            </div>
            <div class="d-flex justify-content-end">
              <button type="button" class="btn btn-secondary me-2" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Update Password</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
