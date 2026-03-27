import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type BannerType = 'info' | 'error' | 'success';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<{ type: BannerType; msg: string } | null>(null);
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate('/submit', { replace: true });
  }, [session, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    if (!email.endsWith('@figma.com')) {
      setBanner({ type: 'error', msg: 'Only @figma.com emails are allowed.' });
      return;
    }

    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setSending(false);

    if (error) {
      setBanner({ type: 'error', msg: error.message });
    } else {
      setBanner({ type: 'info', msg: `Check your email — magic link sent to ${email}` });
    }
  };

  const bannerStyles: Record<BannerType, { bg: string; border: string; color: string }> = {
    info: {
      bg: 'var(--accent-subtle)',
      border: 'rgba(94,106,210,0.2)',
      color: '#a5b4fc',
    },
    error: {
      bg: 'rgba(220,38,38,0.08)',
      border: 'rgba(220,38,38,0.2)',
      color: 'var(--status-failed-text)',
    },
    success: {
      bg: 'rgba(22,163,74,0.08)',
      border: 'rgba(22,163,74,0.2)',
      color: 'var(--status-complete-text)',
    },
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-app)',
      }}
    >
      <div
        style={{
          width: 380,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 32,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
          M4S Research
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
          Prospect research for Figma AEs
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '24px 0' }} />

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text-primary)',
              marginBottom: 6,
            }}
          >
            Email
          </label>
          <input
            type="email"
            placeholder="you@figma.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13,
              color: 'var(--text-primary)',
              width: '100%',
              outline: 'none',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
          />

          <button
            type="submit"
            disabled={sending}
            style={{
              width: '100%',
              marginTop: 12,
              background: 'var(--accent)',
              color: '#fff',
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 6,
              border: 'none',
              opacity: sending ? 0.4 : 1,
              cursor: sending ? 'not-allowed' : 'pointer',
              transition: 'background 120ms',
            }}
            onMouseEnter={(e) => {
              if (!sending) e.currentTarget.style.background = 'var(--accent-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--accent)';
            }}
          >
            {sending ? 'Sending...' : 'Send magic link'}
          </button>
        </form>

        {banner && (
          <div
            style={{
              marginTop: 16,
              padding: '10px 14px',
              borderRadius: 6,
              fontSize: 13,
              border: `1px solid ${bannerStyles[banner.type].border}`,
              background: bannerStyles[banner.type].bg,
              color: bannerStyles[banner.type].color,
            }}
          >
            {banner.msg}
          </div>
        )}
      </div>
    </div>
  );
}
