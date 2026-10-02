import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import './index.css'
import './design.css'
import App from './App.tsx'
import { initAuthMode } from './utils/auth'

// Learn whether the server runs authless before the first render, so no
// component briefly treats the user as logged out.
initAuthMode().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
