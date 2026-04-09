import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Send, FileText, LayoutGrid, Users, Settings } from 'lucide-react';

const tabs = [
  { path: '/submit', label: 'Submit', icon: Send },
  { path: '/my-briefs', label: 'Briefs', icon: FileText },
  { path: '/territory', label: 'Territory', icon: LayoutGrid },
  { path: '/team-view', label: 'Team', icon: Users, role: 'manager' as const },
  { path: '/admin', label: 'Admin', icon: Settings, role: 'admin' as const },
];

export default function BottomTabBar() {
  const { realUserProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const visibleTabs = tabs.filter((tab) => {
    if (!tab.role) return true;
    if (tab.role === 'manager') return realUserProfile?.role === 'manager' || realUserProfile?.role === 'admin';
    if (tab.role === 'admin') return realUserProfile?.role === 'admin';
    return false;
  });

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      height: 72,
      paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      background: 'var(--bg-app)',
      borderTop: '0.5px solid var(--border)',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'flex-start',
      paddingTop: 8,
    }}>
      {visibleTabs.map((tab) => {
        const active = location.pathname === tab.path ||
          (tab.path === '/my-briefs' && location.pathname.startsWith('/briefs/'));
        const Icon = tab.icon;
        const color = active ? '#6c47ff' : 'var(--text-tertiary)';

        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              background: 'none',
              border: 'none',
              padding: '4px 0',
              cursor: 'pointer',
              flex: 1,
              minWidth: 0,
            }}
          >
            <Icon size={22} color={color} />
            <span style={{
              fontSize: 10,
              fontWeight: 500,
              color,
              lineHeight: 1.2,
            }}>
              {tab.label}
            </span>
            {active && (
              <div style={{
                width: 20,
                height: 2,
                borderRadius: 2,
                background: '#6c47ff',
                marginTop: 2,
              }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
