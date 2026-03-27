import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Props {
  children: React.ReactNode;
  requireRole?: 'manager' | 'admin';
}

export default function ProtectedRoute({ children, requireRole }: Props) {
  const { session, userProfile, loading } = useAuth();

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

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (requireRole) {
    const allowed = requireRole === 'manager'
      ? userProfile?.role === 'manager' || userProfile?.role === 'admin'
      : userProfile?.role === 'admin';
    if (!allowed) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
