export const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/user/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/signup',
    name: 'Signup',
    component: () => import('../views/user/Signup.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: () => import('../views/user/ForgotPassword.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/reporting',
    name: 'reporting',
    component: () => import('../views/Reporting.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/',
    name: 'Bacon',
    component: () => import('../views/Bacon.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/summarizer',
    name: 'Summarizer',
    component: () => import('../views/tools/TransactionSummarizer.vue'),
    meta: { requiresAuth: true }
  }
]