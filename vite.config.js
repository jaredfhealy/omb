import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    hmr: false
  },
  build: {
    minify: 'terser',
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue'],
          'vendor-ecosystem': ['vue-router', 'pinia'],
          'vendor-firebase-core': ['firebase/app', 'firebase/auth'],
          'vendor-firebase-store': ['firebase/firestore'],
          'vendor-bootstrap': ['bootstrap']
        },
        chunkFileNames: (chunkInfo) => {
          const prefix = 'assets/'
          const suffix = '.[hash].js'
          return `${prefix}${chunkInfo.name}${suffix}`
        }
      }
    }
  },
  publicDir: 'public'
})