import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Send, FileText, Map, Shield } from 'lucide-react';

const items = [
  { path: '/submit', label: 'Submit', icon: Send },
  { path: '/my-briefs', label: 'Briefs', icon: FileText },
  { path: '/territory', label: 'Territory', icon: Map },
  { path: '/admin', label: 'Admin', icon: Shield, role: 'admin' as const },
];

export default function MobileNav() {
  const { userProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const visibleItems = items.filter((item) => {
    if (!item.role) return true;
    return userProfile?.role === item.role;
  });

  return (
    <nav className="mobile-nav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--bg-sidebar)', borderTop: '1px solid var(--border)',
      display: 'none', justifyContent: 'space-around', alignItems: 'center',
      height: 56, zIndex: 200, padding: '0 8px',
    }}>
      {visibleItems.map((item) => {
        const active = location.pathname.startsWith(item.path);
        const Icon = item.icon;
        return (
          <button key={item.path} onClick={() => navigate(item.path)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', padding: '4px 12px',
            color: active ? 'var(--accent)' : 'var(--text-tertiary)',
            fontSize: 10, fontWeight: 500,
          }}>
            <Icon size={20} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
