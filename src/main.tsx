import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/app/fonts.css'
import '@/app/global.css'
import '@/components/components.css'
import App from '@/app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
