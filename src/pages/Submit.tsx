import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';

type BannerType = 'info' | 'warning' | 'error' | 'success';

const bannerStyles: Record<BannerType, { bg: string; border: string; color: string }> = {
  info: { bg: 'var(--accent-subtle)', border: 'rgba(94,106,210,0.2)', color: '#a5b4fc' },
  warning: { bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.2)', color: 'var(--status-running-text)' },
  error: { bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)', color: 'var(--status-failed-text)' },
  success: { bg: 'rgba(22,163,74,0.08)', border: 'rgba(22,163,74,0.2)', color: 'var(--status-complete-text)' },
};

function Banner({ type, children }: { type: BannerType; children: React.ReactNode }) {
  const s = bannerStyles[type];
  return (
    <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 6, fontSize: 13, border: `1px solid ${s.border}`, background: s.bg, color: s.color }}>
      {children}
    </div>
  );
}

export default function Submit() {
  const { session, userProfile, refreshProfile } = useAuth();
  const [company, setCompany] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: BannerType; msg: string } | null>(null);
  const [duplicate, setDuplicate] = useState<{ name: string; days: number; user: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const checkDuplicate = useCallback(async (name: string) => {
    if (name.length < 3) { setDuplicate(null); return; }
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data } = await supabase
      .from('runs')
      .select('company, created_at, user_id, users!inner(name)')
      .eq('status', 'complete')
      .ilike('company', name)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const run = data[0] as any;
      const days = Math.floor((Date.now() - new Date(run.created_at).getTime()) / 86400000);
      setDuplicate({ name: run.company, days, user: run.users?.name || 'someone' });
    } else {
      setDuplicate(null);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkDuplicate(company), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [company, checkDuplicate]);

  // Check for in-progress run on mount
  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      const cutoff = new Date(Date.now() - 10 * 60000).toISOString();
      const { data } = await supabase
        .from('runs')
        .select('company')
        .eq('user_id', userProfile.id)
        .eq('status', 'running')
        .gte('created_at', cutoff)
        .limit(1);
      if (data && data.length > 0) {
        setBanner({ type: 'info', msg: `You have a run in progress for "${data[0].company}". Check My Briefs for updates.` });
      }
    })();
  }, [userProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    if (!session) return;

    setSubmitting(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch('https://go.accountresearch.workers.dev/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ company, url }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 402) {
        setBanner({ type: 'error', msg: 'No credits remaining — contact your manager.' });
      } else if (res.status === 409) {
        setBanner({ type: 'warning', msg: 'A run for this company is already in progress.' });
      } else if (res.ok) {
        const data = await res.json();
        if (data.cached && data.age_days < 7) {
          setBanner({ type: 'info', msg: `Using cached brief (${data.age_days} days old).` });
        } else if (data.cached && data.stale) {
          setBanner({ type: 'warning', msg: `Brief is ${data.age_days} days old. Submit again for a fresh run.` });
        } else {
          setBanner({ type: 'success', msg: 'Research running — usually ~5 minutes. Check My Briefs for updates.' });
          setCompany('');
          setUrl('');
        }
        refreshProfile();
      } else {
        const text = await res.text();
        setBanner({ type: 'error', msg: text || `Error ${res.status}` });
      }
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        setBanner({ type: 'warning', msg: 'Still working... check My Briefs for updates.' });
      } else {
        setBanner({ type: 'error', msg: err.message || 'Network error' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const credits = userProfile?.credits_remaining ?? 0;
  const creditsColor = credits <= 1 ? 'var(--status-running-text)' : 'var(--status-complete-text)';

  return (
    <Layout>
      <div style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24 }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>New Research Request</h1>
          <span style={{ fontSize: 12, fontWeight: 500, color: creditsColor }}>
            {credits} credit{credits !== 1 ? 's' : ''} remaining
          </span>
        </div>

        {duplicate && (
          <Banner type="info">
            {duplicate.name} was researched {duplicate.days} day{duplicate.days !== 1 ? 's' : ''} ago by {duplicate.user}. View that brief in My Briefs or submit a fresh request.
          </Banner>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: duplicate ? 16 : 0 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Company</label>
            <input
              type="text"
              required
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Standard Chartered Bank"
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 6,
                padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', width: '100%', outline: 'none',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Website</label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://sc.com"
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 6,
                padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', width: '100%', outline: 'none',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%', background: 'var(--accent)', color: '#fff', padding: '8px 14px',
              fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none',
              opacity: submitting ? 0.4 : 1, cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 120ms',
            }}
            onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = 'var(--accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
          >
            {submitting ? 'Submitting...' : 'Run Research'}
          </button>
        </form>

        {banner && <Banner type={banner.type}>{banner.msg}</Banner>}
      </div>
    </Layout>
  );
}
