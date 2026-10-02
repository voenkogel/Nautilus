import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Container overrides are available while Vite evaluates its configuration.
function getEnvVar(key: string, fallback: string | number): string {
  return (process.env[key] ?? String(fallback)).replace(/['"]+/g, '')
}

const serverHost = getEnvVar('NAUTILUS_HOST', 'localhost')
const serverPort = Number(getEnvVar('NAUTILUS_SERVER_PORT', 3069))
const clientPort = Number(getEnvVar('NAUTILUS_CLIENT_PORT', 3070))

export default defineConfig({
  // Relative asset URLs so the app works under any sub-path (e.g. Home Assistant ingress).
  base: './',
  plugins: [react()],
  server: {
    port: clientPort,
    host: serverHost,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.NAUTILUS_API_TARGET || `http://${serverHost}:${serverPort}`,
        changeOrigin: true,
        secure: false,
        ws: true,
      }
    },
    watch: {
      usePolling: process.env.NAUTILUS_WATCH_POLLING === 'true',
      interval: 200,
      ignored: ['**/config.json']
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    assetsInlineLimit: 0,
    sourcemap: true
  }
})
