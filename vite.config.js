import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_PUBLIC_BASE_PATH || '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    minify: 'terser',
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue'],
          'vendor-ecosystem': ['vue-router', 'pinia'],
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