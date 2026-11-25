import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { applyAccent } from './accent'
import App from './App'
import './index.css'

// Service worker: offline support, automatic updates in the background
registerSW({ immediate: true })

// מחילים את צבע ההדגשה לפני הציור הראשון, בלי הבהוב
applyAccent()

createRoot(document.getElementById('root')!).render(<App />)
