import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend target for the dev proxy (override with VITE_PROXY_TARGET, e.g. http://127.0.0.1:8010)
const backend = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
      },
      '/ogc': {
        target: backend,
        changeOrigin: true,
      },
    },
  },
})
