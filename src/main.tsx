import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import App from './App'

// Handle GitHub Pages SPA redirect
const path = new URLSearchParams(window.location.search).get('path');
if (path) window.history.replaceState(null, '', path);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename="/AccountResearcherPortal">
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
