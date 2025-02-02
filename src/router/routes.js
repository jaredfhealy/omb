export const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/signup',
    name: 'Signup',
    component: () => import('../views/Signup.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: () => import('../views/ForgotPassword.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/reporting',
    name: 'reporting',
    component: () => import('../views/ReportingView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/',
    name: 'Bacon',
    component: () => import('../views/Bacon.vue'),
    meta: { requiresAuth: true }
  }
]