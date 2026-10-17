import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.tsx'
import { DialogProvider } from './components/ui/dialog/DialogProvider.tsx'
import { MessengerProvider } from './features/messenger/MessengerContext.tsx'
import './index.css'
import App from './App.tsx'
import { installEnterAsTab } from './lib/enterAsTab.ts'

installEnterAsTab()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DialogProvider>
          <MessengerProvider>
            <App />
          </MessengerProvider>
        </DialogProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
