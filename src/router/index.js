import { createRouter, createWebHistory } from 'vue-router'
import { auth } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { routes } from './routes'

const router = createRouter({
  history: createWebHistory(),
  routes
})

const getCurrentUser = () => {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, 
      user => {
        unsubscribe()
        resolve(user)
      },
      reject
    )
  })
}

router.beforeEach(async (to, from, next) => {
  console.log('Route guard triggered:', to.path)
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  
  try {
    const currentUser = await getCurrentUser()
    console.log('Auth state:', currentUser ? 'logged in' : 'logged out')

    if (requiresAuth && !currentUser) {
      console.log('Auth required, redirecting to login')
      next('/login')
    } else if (to.path === '/login' && currentUser) {
      console.log('Already logged in, redirecting to home')
      next('/')
    } else {
      console.log('Proceeding to:', to.path)
      next()
    }
  } catch (error) {
    console.error('Auth check failed:', error)
    next('/login')
  }
})

export default router