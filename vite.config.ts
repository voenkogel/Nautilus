import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { appConfig } from './src/config/appConfig'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: appConfig.client.port,
    strictPort: true, // Don't allow fallback ports
  }
})
