import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Submit from './pages/Submit'
import MyBriefs from './pages/MyBriefs'
import TeamView from './pages/TeamView'
import Admin from './pages/Admin'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/submit" element={<ProtectedRoute><Submit /></ProtectedRoute>} />
      <Route path="/my-briefs" element={<ProtectedRoute><MyBriefs /></ProtectedRoute>} />
      <Route path="/team-view" element={<ProtectedRoute requireRole="manager"><TeamView /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute requireRole="admin"><Admin /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/submit" replace />} />
    </Routes>
  )
}
