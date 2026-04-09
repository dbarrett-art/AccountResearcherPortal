import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import BottomTabBar from './BottomTabBar';
import MobileTopBar from './MobileTopBar';
import Banner from './Banner';
import StatusBanner from './StatusBanner';
import useWindowWidth from '../hooks/useWindowWidth';

const ROUTE_TITLES: Record<string, string> = {
  '/submit': 'Submit',
  '/my-briefs': 'My Briefs',
  '/territory': 'Territory',
  '/team-view': 'Team View',
  '/admin': 'Admin',
};

export default function Layout({ children, bgColor }: { children: React.ReactNode; bgColor?: string }) {
  const { authError, signOut, isImpersonating, userProfile, stopImpersonating } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const width = useWindowWidth();
  const isMobile = width <= 768;

  // Derive page title from route
  const pageTitle = ROUTE_TITLES[location.pathname]
    || (location.pathname.startsWith('/briefs/') ? 'Brief' : 'Account Researcher');

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: '100vh' }}>
      {!isMobile && <Sidebar />}
      {isMobile && <MobileTopBar title={pageTitle} />}
      <main
        style={{
          marginLeft: isMobile ? 0 : 220,
          flex: 1,
          padding: isMobile ? '16px 16px 80px' : '32px 40px',
          width: '100%',
          background: bgColor || 'var(--bg-app)',
          minHeight: isMobile ? undefined : '100vh',
        }}
      >
        {isImpersonating && (
          <div style={{
            background: '#f97316', color: 'white',
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderRadius: 8, marginBottom: 12,
          }}>
            <span>Viewing as {userProfile?.name} ({userProfile?.email}) — {userProfile?.role}</span>
            <button onClick={stopImpersonating} style={{
              background: 'white', color: '#f97316', border: 'none',
              borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontWeight: 600, fontSize: 12,
            }}>
              Exit
            </button>
          </div>
        )}
        <StatusBanner />
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
      {isMobile && <BottomTabBar />}
    </div>
  );
}
