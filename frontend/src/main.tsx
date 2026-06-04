import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RegionProvider } from './lib/RegionContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RegionProvider>
      <App />
    </RegionProvider>
  </StrictMode>,
)
