import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Helper to get env vars for both dev and build
function getEnvVar(key: string, fallback: string | number): string {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
    return (import.meta as any).env[key].replace(/['"]+/g, '')
  }
  return String(fallback)
}

const serverHost = getEnvVar('NAUTILUS_HOST', 'localhost')
const serverPort = Number(getEnvVar('NAUTILUS_SERVER_PORT', 3069))
const clientPort = Number(getEnvVar('NAUTILUS_CLIENT_PORT', 3070))

export default defineConfig({
  plugins: [react()],
  server: {
    port: clientPort,
    host: serverHost,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://${serverHost}:${serverPort}`,
        changeOrigin: true,
        secure: false,
        ws: true,
      }
    },
    watch: {
      ignored: ['**/config.json']
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    assetsInlineLimit: 0
  }
})
