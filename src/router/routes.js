export const routes = [
  {
    path: '/login',
    redirect: '/'
  },
  {
    path: '/signup',
    redirect: '/'
  },
  {
    path: '/forgot-password',
    redirect: '/'
  },
  {
    path: '/reporting',
    name: 'reporting',
    component: () => import('../views/Reporting.vue')
  },
  {
    path: '/trade-desk',
    name: 'TradeDeskLegacyRedirect',
    redirect: (to) => ({
      path: '/',
      query: {
        ...to.query,
        tab: 'trades'
      }
    })
  },
  {
    path: '/',
    name: 'Bacon',
    component: () => import('../views/Bacon.vue')
  },
  {
    path: '/summarizer',
    name: 'Summarizer',
    component: () => import('../views/tools/TransactionSummarizer.vue')
  },
  {
    path: '/data-manager',
    name: 'DataManager',
    component: () => import('../views/DataManager.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]