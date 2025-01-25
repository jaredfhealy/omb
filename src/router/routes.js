export const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    name: 'Bacon',
    component: () => import('../views/Bacon.vue'),
    meta: { requiresAuth: true }
  }
]