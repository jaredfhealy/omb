import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueFire, VueFireAuth } from 'vuefire'
import App from './App.vue'
import router from './router'
import { app as firebaseApp } from './firebase'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import * as bootstrap from 'bootstrap'

// Make bootstrap globally available
window.bootstrap = bootstrap

const pinia = createPinia()
const app = createApp(App)

// Order matters!
app.use(pinia)  // First
app.use(router) // Then router
app.use(VueFire, {
  firebaseApp,
  modules: [
    VueFireAuth({
      wait: true  // Wait for auth to complete before mounting
    })
  ]
})

// Mount our app
app.mount('#app')