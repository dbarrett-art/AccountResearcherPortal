import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import App from './App'

// GitHub Pages SPA routing fix
// When 404.html redirects here with ?path=..., restore the correct URL
// before React Router initialises so it sees the right path
const redirectPath = new URLSearchParams(window.location.search).get('path');
if (redirectPath) {
  window.history.replaceState(
    null,
    '',
    '/AccountResearcherPortal' + decodeURIComponent(redirectPath)
  );
}

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
