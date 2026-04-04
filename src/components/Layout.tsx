import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import Banner from './Banner';

export default function Layout({ children, bgColor }: { children: React.ReactNode; bgColor?: string }) {
  const { authError, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <MobileNav />
      <main
        style={{
          marginLeft: 220,
          flex: 1,
          padding: '32px 40px',
          width: '100%',
          background: bgColor || 'var(--bg-app)',
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
