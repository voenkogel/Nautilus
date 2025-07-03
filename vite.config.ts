import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use default ports instead of importing config.json at build time
// The backend will be the single source of truth for configuration
const serverHost = 'localhost';
const serverPort = 3069;
const clientPort = 3070;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: clientPort,
    host: serverHost,
    strictPort: true, // Don't allow fallback ports
    proxy: {
      // Proxy API requests to the backend server
      '/api': {
        target: `http://${serverHost}:${serverPort}`,
        changeOrigin: true,
        secure: false,
        ws: true, // proxy websockets
      }
    },
    // Exclude config.json from Vite's watch list
    // See: https://vitejs.dev/config/server-options.html#server-watch
    watch: {
      ignored: ['**/config.json']
    }
  },
  // Configure build output
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Ensure assets are correctly included
    assetsInlineLimit: 0
  }
})
