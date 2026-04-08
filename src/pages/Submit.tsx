import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStatus } from '../context/StatusContext';
import Layout from '../components/Layout';
import Banner from '../components/Banner';
import { supabase, workerFetch } from '../lib/supabase';
import usePageTitle from '../hooks/usePageTitle';
import useWindowWidth from '../hooks/useWindowWidth';

type BannerType = 'info' | 'warning' | 'error' | 'success';

interface BannerState {
  type: BannerType;
  msg: string;
  runId?: string;
}

function normaliseUrl(input: string): string {
  let u = input.trim().replace(/\s+/g, '');
  if (u.startsWith('http://')) {
    u = u.replace('http://', 'https://');
  } else if (!u.startsWith('https://')) {
    u = 'https://' + u;
  }
  return u.replace(/\/+$/, '');
}

function isValidUrl(input: string): boolean {
  try {
    new URL(normaliseUrl(input));
    return true;
  } catch {
    return false;
  }
}

export default function Submit() {
  usePageTitle('Submit');
  const { session, userProfile, refreshProfile } = useAuth();
  const { indicator } = useStatus();
  const isDown = indicator === 'major' || indicator === 'critical';
  const isMobile = useWindowWidth() <= 768;
  const LANGUAGES = [
    { code: 'auto', label: 'Auto-detect', flag: '\u{1F310}' },
    { code: 'en',   label: 'English',     flag: '\u{1F1EC}\u{1F1E7}' },
    { code: 'de',   label: 'German',      flag: '\u{1F1E9}\u{1F1EA}' },
    { code: 'fr',   label: 'French',      flag: '\u{1F1EB}\u{1F1F7}' },
    { code: 'es',   label: 'Spanish',     flag: '\u{1F1EA}\u{1F1F8}' },
    { code: 'it',   label: 'Italian',     flag: '\u{1F1EE}\u{1F1F9}' },
    { code: 'nl',   label: 'Dutch',       flag: '\u{1F1F3}\u{1F1F1}' },
    { code: 'pt',   label: 'Portuguese',  flag: '\u{1F1F5}\u{1F1F9}' },
    { code: 'ja',   label: 'Japanese',    flag: '\u{1F1EF}\u{1F1F5}' },
    { code: 'ko',   label: 'Korean',      flag: '\u{1F1F0}\u{1F1F7}' },
    { code: 'sv',   label: 'Swedish',     flag: '\u{1F1F8}\u{1F1EA}' },
    { code: 'no',   label: 'Norwegian',   flag: '\u{1F1F3}\u{1F1F4}' },
  ];

  const [company, setCompany] = useState('');
  const [url, setUrl] = useState('');
  const [market, setMarket] = useState('auto');
  const [includeContacts] = useState(true); // Always include contacts — M2 now ~$0.02 via Apollo
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [duplicate, setDuplicate] = useState<{ name: string; days: number; user: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { refreshProfile(); }, [refreshProfile]);

  const checkDuplicate = useCallback(async (name: string) => {
    if (name.length < 3) { setDuplicate(null); return; }
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    try {
      const { data } = await supabase
        .from('runs')
        .select('company, created_at, user_id, users!runs_user_id_fkey!inner(name)')
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
    } catch {
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
      const cutoff = new Date(Date.now() - 60 * 60000).toISOString();
      const { data } = await supabase
        .from('runs')
        .select('company, status')
        .eq('user_id', userProfile.id)
        .in('status', ['running', 'queued'])
        .gte('created_at', cutoff)
        .limit(1);
      if (data && data.length > 0) {
        const label = data[0].status === 'queued' ? 'queued' : 'in progress';
        setBanner({ type: 'info', msg: `You have a run ${label} for "${data[0].company}". Check My Briefs for updates.` });
      }
    })();
  }, [userProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    if (!session) return;

    const normalisedUrl = normaliseUrl(url);
    if (!isValidUrl(url)) {
      setBanner({ type: 'error', msg: 'Please enter a valid website URL' });
      return;
    }
    setUrl(normalisedUrl);

    setSubmitting(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await workerFetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, url: normalisedUrl, include_contacts: includeContacts, market }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 402) {
        setBanner({ type: 'error', msg: 'No credits remaining — contact your manager.' });
      } else if (res.status === 409) {
        setBanner({ type: 'warning', msg: 'A run for this company is already in progress.' });
      } else if (res.ok) {
        const data = await res.json();
        if (data.cached && !data.stale) {
          setBanner({
            type: 'info',
            msg: `Using cached brief (${data.age_days} days old).`,
            runId: data.run_id,
          });
        } else if (data.cached && data.stale) {
          setBanner({
            type: 'warning',
            msg: `Brief is ${data.age_days} days old. Submit again for a fresh run.`,
            runId: data.run_id,
          });
        } else if (data.status === 'queued') {
          setBanner({
            type: 'warning',
            msg: `You're #${data.queue_position || '?'} in the queue — estimated wait ~${data.estimated_wait_minutes || '?'} mins. We'll update you when your run starts.`,
          });
          setCompany('');
          setUrl('');
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

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 6,
    padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', width: '100%', outline: 'none',
  };

  return (
    <Layout>
      <div style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24 }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>New Research Request</h1>
          {!isMobile && (
            <span style={{ fontSize: 12, fontWeight: 500, color: creditsColor }}>
              {credits} credit{credits !== 1 ? 's' : ''} remaining
            </span>
          )}
        </div>

        {duplicate && (
          <Banner type="info" style={{ marginBottom: 16 }}>
            {duplicate.name} was researched {duplicate.days} day{duplicate.days !== 1 ? 's' : ''} ago by {duplicate.user}. View that brief in My Briefs or submit a fresh request.
          </Banner>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Company</label>
            <input
              type="text" required value={company} autoFocus
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Standard Chartered Bank"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Website</label>
            <input
              type="text" required value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. sc.com or www.sc.com"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            />
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              e.g. company.com or www.company.com — https:// added automatically
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Language</label>
            <select value={market} onChange={e => setMarket(e.target.value)} style={{
              background: 'var(--bg-input)', border: '1px solid var(--border-strong)',
              borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)',
              fontSize: 13, width: '100%', cursor: 'pointer', outline: 'none',
            }}>
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag}  {lang.label}
                </option>
              ))}
            </select>
            {market === 'auto' && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Language detected automatically from the company domain
              </div>
            )}
          </div>

          {/* Contacts always included — M2 now ~$0.02 via Apollo (was ~$6.37 with EnrichLayer) */}

          <button
            type="submit" disabled={submitting}
            style={{
              width: '100%', background: 'var(--accent)', color: '#fff',
              padding: isMobile ? '12px 14px' : '8px 14px',
              height: isMobile ? 48 : undefined,
              fontSize: isMobile ? 15 : 13, fontWeight: 500, borderRadius: 6, border: 'none',
              opacity: submitting ? 0.4 : 1, cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 120ms',
            }}
            onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = 'var(--accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
          >
            {submitting ? 'Submitting...' : 'Run Research'}
          </button>
          {isMobile && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: creditsColor }}>
                {credits} credit{credits !== 1 ? 's' : ''} remaining
              </span>
            </div>
          )}
          {isDown && (
            <p style={{ fontSize: 13, color: '#92400e', marginTop: 8 }}>
              {'\u26A0'} Anthropic API is currently experiencing issues. Your brief will be queued and will complete once the API recovers.
            </p>
          )}
        </form>

        {banner && (
          <div style={{ marginTop: 16 }}>
            <Banner type={banner.type}>
              {banner.msg}
              {banner.runId && (
                <div style={{ marginTop: 8 }}>
                  <a href={`#/briefs/${banner.runId}`}
                    style={{ color: 'inherit', textDecoration: 'underline', fontSize: 13 }}>
                    View Brief
                  </a>
                </div>
              )}
            </Banner>
          </div>
        )}
      </div>
    </Layout>
  );
}
