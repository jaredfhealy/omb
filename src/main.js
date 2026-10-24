import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './styles/app-layout.css'
import * as bootstrap from 'bootstrap'

// Make bootstrap globally available
window.bootstrap = bootstrap

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register('./sw.js?v=20261021').catch(error => {
        console.warn('Service worker registration failed.', error)
      })
      return
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.unregister()))
    } catch (error) {
      console.warn('Service worker cleanup failed in development mode.', error)
    }
  })
}

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)

// Mount our app
app.mount('#app')