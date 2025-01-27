<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '@/firebase'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')

const login = async () => {
  try {
    let userObj = await signInWithEmailAndPassword(auth, email.value, password.value)
    console.log("User object", userObj)
    store.user = userObj.user
    router.push('/')
  } catch (e) {
    error.value = 'Invalid login credentials'
  }
}
</script>

<template>
  <nav id="appNav" class="navbar navbar-expand-sm navbar-light bg-light mb-3">
    <div class="container-fluid">
      <span class="navbar-brand">Operation More Bacon</span>
    </div>
  </nav>

  <div class="container mt-5">
    <div class="row justify-content-center">
      <div class="col-md-6">
        <div class="card">
          <div class="card-body">
            <h3 class="card-title">Login for More Bacon!</h3>
            <form @submit.prevent="login">
              <div class="mb-3">
                <label class="form-label">Email</label>
                <input type="email" class="form-control" v-model="email" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Password</label>
                <input type="password" class="form-control" v-model="password" required>
              </div>
              <div v-if="error" class="alert alert-danger">{{ error }}</div>
              <button type="submit" class="btn btn-primary">Login</button>
            </form>
            <div class="text-center mt-3">
              <router-link to="/signup">Need an account? Sign up</router-link>
              <br>
              <router-link to="/forgot-password">Forgot Password?</router-link>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>