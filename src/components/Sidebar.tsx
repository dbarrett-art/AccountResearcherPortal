import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Send, FileText, Users, Shield, LogOut, Map, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { path: '/submit', label: 'Submit', icon: Send },
  { path: '/my-briefs', label: 'My Briefs', icon: FileText },
  { path: '/territory', label: 'Territory', icon: Map },
  { path: '/team-view', label: 'Team View', icon: Users, role: 'manager' as const },
  { path: '/admin', label: 'Admin', icon: Shield, role: 'admin' as const },
];

export default function Sidebar() {
  const { realUserProfile, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const location = useLocation();
  const navigate = useNavigate();

  const visibleItems = navItems.filter((item) => {
    if (!item.role) return true;
    if (item.role === 'manager') return realUserProfile?.role === 'manager' || realUserProfile?.role === 'admin';
    if (item.role === 'admin') return realUserProfile?.role === 'admin';
    return false;
  });

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        padding: '16px 12px',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
      }}
    >
      <div style={{ marginBottom: 24, padding: '0 12px' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          Account Researcher
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
          Prospect Research
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {visibleItems.map((item) => {
          const active = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: active ? 'var(--bg-elevated)' : 'transparent',
                border: 'none',
                width: '100%',
                textAlign: 'left',
                transition: 'all 80ms',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 12,
          marginTop: 12,
        }}
      >
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '6px 12px',
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left' as const,
            transition: 'all 80ms',
            marginBottom: 8,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
        <div style={{ padding: '0 12px', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            {realUserProfile?.name || 'User'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>
            {realUserProfile?.email}
          </div>
        </div>
        <button
          onClick={signOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-secondary)',
            background: 'transparent',
            border: 'none',
            width: '100%',
            textAlign: 'left',
            transition: 'all 80ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
