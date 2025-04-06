import { createRouter, createWebHistory } from 'vue-router'
import { auth } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { routes } from './routes'

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Wait for Firebase auth to initialize before router starts navigation guards
let authReady = false
let initialAuthUser = null

// Set up auth state listener just for initial auth state
onAuthStateChanged(auth, (user) => {
  initialAuthUser = user
  authReady = true
})

router.beforeEach(async (to, from, next) => {
  // Wait for Firebase auth to be ready before proceeding
  if (!authReady) {
    // Wait for the auth state to be determined
    await new Promise(resolve => {
      const checkAuthReady = () => {
        if (authReady) {
          resolve()
        } else {
          setTimeout(checkAuthReady, 50)
        }
      }
      checkAuthReady()
    })
  }
  
  const currentUser = auth.currentUser
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  
  // Special case for summarizer - it's accessible without requiresAuth
  if (to.path === '/summarizer') {
    // Allow access to summarizer even if not logged in
    next()
    return
  }
  
  // For other routes, apply normal authentication rules
  if (requiresAuth && !currentUser) {
    next('/login')
  } else if (to.path === '/login' && currentUser) {
    next('/')
  } else {
    next()
  }
})

export default router