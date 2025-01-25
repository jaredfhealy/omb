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

// Create the vue app with dependencies
const app = createApp(App)
  .use(VueFire, {
    firebaseApp,
    modules: [
      VueFireAuth({
        wait: true  // Wait for auth to complete before mounting
      })
    ]
  })
  .use(pinia)
  .use(router)

// Mount our app
app.mount('#app')