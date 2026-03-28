import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Submit from './pages/Submit'
import MyBriefs from './pages/MyBriefs'
import TeamView from './pages/TeamView'
import Admin from './pages/Admin'
import BriefView from './pages/BriefView'
import SharedBriefView from './pages/SharedBriefView'
import Territory from './pages/Territory'

/**
 * Landing route for `/` — waits for auth to resolve before redirecting.
 * This prevents React Router from stripping the hash fragment
 * (which contains the Supabase access token from magic link callbacks)
 * before Supabase can process it.
 */
function AuthCallback() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text-tertiary)',
        fontSize: 13,
      }}>
        Loading...
      </div>
    );
  }

  return <Navigate to={session ? '/submit' : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/submit" element={<ProtectedRoute><Submit /></ProtectedRoute>} />
      <Route path="/my-briefs" element={<ProtectedRoute><MyBriefs /></ProtectedRoute>} />
      <Route path="/territory" element={<ProtectedRoute><Territory /></ProtectedRoute>} />
      <Route path="/team-view" element={<ProtectedRoute requireRole="manager"><TeamView /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute requireRole="admin"><Admin /></ProtectedRoute>} />
      <Route path="/briefs/:run_id" element={<ProtectedRoute><BriefView /></ProtectedRoute>} />
      <Route path="/shared/:token" element={<SharedBriefView />} />
      <Route path="*" element={<AuthCallback />} />
    </Routes>
  )
}
