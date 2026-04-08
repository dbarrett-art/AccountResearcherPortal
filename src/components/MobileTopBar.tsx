import { useState, useRef, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

function getInitials(name: string | undefined | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('') || '?';
}

export default function MobileTopBar({ title }: { title: string }) {
  const { userProfile, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close sheet on outside tap
  useEffect(() => {
    if (!sheetOpen) return;
    const handler = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setSheetOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sheetOpen]);

  return (
    <>
      <div style={{
        height: 52,
        borderBottom: '0.5px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        background: 'var(--bg-app)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={toggleTheme}
            title={isDark ? 'Light mode' : 'Dark mode'}
            style={{
              width: 32,
              height: 32,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        <button
          onClick={() => setSheetOpen(true)}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#6c47ff',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {getInitials(userProfile?.name)}
        </button>
        </div>
      </div>

      {/* Sign-out bottom sheet */}
      {sheetOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div
            ref={sheetRef}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: '16px 16px 0 0',
              width: '100%',
              maxWidth: 480,
              padding: '20px 20px calc(20px + max(env(safe-area-inset-bottom), 8px))',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
              {userProfile?.name || 'User'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {userProfile?.email}
            </div>
            <button
              onClick={() => { setSheetOpen(false); signOut(); }}
              style={{
                width: '100%',
                padding: '12px 0',
                fontSize: 14,
                fontWeight: 500,
                color: '#dc2626',
                background: 'transparent',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
            <button
              onClick={() => setSheetOpen(false)}
              style={{
                width: '100%',
                padding: '12px 0',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
