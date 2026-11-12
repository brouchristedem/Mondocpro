import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque/wght.css'
import '@fontsource-variable/instrument-sans/wght.css'
import App from './App'
import './styles.css'
createRoot(document.getElementById('root')!).render(<App />)

// application installable et utilisable hors connexion
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
