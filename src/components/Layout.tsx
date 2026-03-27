import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import Banner from './Banner';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { authError, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main
        style={{
          marginLeft: 220,
          flex: 1,
          padding: '32px 40px',
          maxWidth: 960 + 80,
          background: 'var(--bg-app)',
          minHeight: '100vh',
        }}
      >
        {authError && (
          <Banner type="error" style={{ marginBottom: 16 }}>
            {authError}{' '}
            <button
              onClick={() => { signOut(); navigate('/login'); }}
              style={{
                background: 'transparent', border: 'none', color: 'inherit',
                textDecoration: 'underline', cursor: 'pointer', fontSize: 13,
                padding: 0, fontFamily: 'inherit',
              }}
            >
              Re-authenticate
            </button>
          </Banner>
        )}
        {children}
      </main>
    </div>
  );
}
