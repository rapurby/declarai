import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    // izinkan akses lewat domain publik (Railway) — tanpa ini Vite 5.4.14+
    // menolak request dengan Host selain localhost ("Blocked request")
    allowedHosts: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8000', changeOrigin: true, ws: true },
    }
  }
})
