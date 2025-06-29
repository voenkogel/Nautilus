import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import configData from './config.json'
import type { AppConfig } from './src/types/config'

const appConfig = configData as AppConfig

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: appConfig.client.port,
    strictPort: true, // Don't allow fallback ports
  }
})
