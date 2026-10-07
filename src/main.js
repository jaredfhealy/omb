import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import * as bootstrap from 'bootstrap'

// Make bootstrap globally available
window.bootstrap = bootstrap

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)

// Mount our app
app.mount('#app')