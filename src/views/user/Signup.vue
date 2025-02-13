<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRouter } from 'vue-router'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/firebase'

const store = useAppStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

async function createUser(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    store.user = userCredential.user
    
    const newUserData = {
      accounts: [{
        id: 1,
        name: 'Default Account',
        transactions: [],
        actuals: [],
        positions: [],
        settings: {
          startDate: new Date().toISOString().split('T')[0],
          startingBalance: 5000,
          weeklyReturn: 1,
          years: 4
        }
      }],
      selectedAccountId: 1
    }
    
    await setDoc(doc(db, 'accounts', userCredential.user.uid), newUserData)
    
    store.db = newUserData
    return userCredential
  } catch (error) {
    console.error('Signup error:', error)
    throw new Error(error.message)
  }
}

const handleSubmit = async () => {
  error.value = ''
  loading.value = true
  
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    loading.value = false
    return
  }

  try {
    await createUser(email.value, password.value)
    router.push('/')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="row justify-content-center">
    <div class="col-md-6 col-lg-4">
      <div class="card mt-5">
        <div class="card-body">
          <h3 class="card-title text-center mb-4">Sign Up</h3>
          
          <div v-if="error" class="alert alert-danger">{{ error }}</div>
          
          <form @submit.prevent="handleSubmit">
            <div class="mb-3">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" v-model="email" required>
            </div>
            
            <div class="mb-3">
              <label class="form-label">Password</label>
              <input type="password" class="form-control" v-model="password" required>
            </div>
            
            <div class="mb-3">
              <label class="form-label">Confirm Password</label>
              <input type="password" class="form-control" v-model="confirmPassword" required>
            </div>
            
            <button type="submit" class="btn btn-primary w-100" :disabled="loading">Sign Up</button>
            
            <div class="text-center mt-3">
              <router-link to="/login">Already have an account? Login</router-link>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>