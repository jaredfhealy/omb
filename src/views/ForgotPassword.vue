<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const email = ref('')
const error = ref('')
const success = ref(false)

const handleSubmit = async () => {
  error.value = ''
  success.value = false
  
  try {
    await store.sendPasswordReset(email.value)
    success.value = true
    email.value = ''
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <nav id="appNav" class="navbar navbar-expand-sm navbar-darg bg-primary mb-3">
    <div class="container-fluid">
      <span class="navbar-brand">Operation More Bacon</span>
    </div>
  </nav>

  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-6 col-lg-4">
        <div class="card mt-5">
          <div class="card-body">
            <h3 class="card-title text-center mb-4">Reset Password</h3>
            
            <div v-if="error" class="alert alert-danger">{{ error }}</div>
            <div v-if="success" class="alert alert-success">
              Password reset email sent! Check your inbox for further instructions.
            </div>
            
            <form @submit.prevent="handleSubmit">
              <div class="mb-3">
                <label class="form-label">Email</label>
                <input type="email" class="form-control" v-model="email" required>
              </div>
              
              <button type="submit" class="btn btn-primary w-100">Send Reset Link</button>
              
              <div class="text-center mt-3">
                <router-link to="/login">Back to Login</router-link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>