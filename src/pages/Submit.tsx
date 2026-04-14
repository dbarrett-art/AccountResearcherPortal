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
  const [toast, setToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [duplicate, setDuplicate] = useState<{ name: string; days: number; user: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Credit request modal state
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState(5);
  const [creditReason, setCreditReason] = useState('');
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [creditResult, setCreditResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [unratedBriefs, setUnratedBriefs] = useState<{ run_id: string; company: string; created_at: string }[]>([]);
  const [unratedLoading, setUnratedLoading] = useState(false);

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
        setBanner({ type: 'error', msg: 'No credits remaining.' });
        openCreditModal();
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
          setBanner({ type: 'success', msg: 'Research submitted! Check My Briefs for updates.' });
          setCompany('');
          setUrl('');
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          setToast(true);
          toastTimerRef.current = setTimeout(() => setToast(false), 8000);
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

  const openCreditModal = async () => {
    setCreditModalOpen(true);
    setCreditResult(null);
    setCreditAmount(5);
    setCreditReason('');
    setUnratedBriefs([]);
    setUnratedLoading(true);
    try {
      const res = await workerFetch('/unrated-briefs');
      if (res.ok) {
        const data = await res.json();
        if (data.unrated_count > 0) {
          setUnratedBriefs(data.unrated_briefs);
        }
      }
    } catch { /* fail-open: show the form */ }
    setUnratedLoading(false);
  };

  const handleCreditSubmit = async () => {
    setCreditSubmitting(true);
    setCreditResult(null);
    try {
      const res = await workerFetch('/request-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: creditAmount, reason: creditReason || undefined }),
      });
      if (res.status === 422) {
        const data = await res.json();
        if (data.error === 'rate_briefs_first') {
          setUnratedBriefs(data.unrated_briefs || []);
          return;
        }
      }
      if (res.ok) {
        setCreditResult({ type: 'success', msg: 'Request submitted — your manager will be notified.' });
      } else {
        const text = await res.text();
        setCreditResult({ type: 'error', msg: text || `Error ${res.status}` });
      }
    } catch (err: any) {
      setCreditResult({ type: 'error', msg: err.message || 'Network error' });
    } finally {
      setCreditSubmitting(false);
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
              {credits <= 2 && (
                <button onClick={openCreditModal} style={{
                  background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, marginLeft: 8, padding: 0, textDecoration: 'underline',
                }}>Request more</button>
              )}
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
                {credits <= 2 && (
                  <button onClick={openCreditModal} style={{
                    background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer',
                    fontSize: 12, fontWeight: 500, marginLeft: 8, padding: 0, textDecoration: 'underline',
                  }}>Request more</button>
                )}
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

      {/* ── Credit Request Modal ── */}
      {creditModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setCreditModalOpen(false)}>
          <div style={{
            background: 'var(--bg-primary)', borderRadius: 12, padding: 24,
            width: '100%', maxWidth: 440, maxHeight: '80vh', overflow: 'auto',
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Request Credits</h2>
              <button onClick={() => setCreditModalOpen(false)} style={{
                background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
                color: 'var(--text-secondary)', lineHeight: 1,
              }}>{'\u00D7'}</button>
            </div>

            {unratedLoading ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                Checking brief ratings...
              </div>
            ) : unratedBriefs.length > 0 ? (
              /* ── Blocking state: unrated briefs ── */
              <div>
                <div style={{
                  background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)',
                  borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text-primary)',
                }}>
                  Rate your completed briefs before requesting more credits.
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
                  {unratedBriefs.length} unrated brief{unratedBriefs.length > 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unratedBriefs.map(b => (
                    <a key={b.run_id} href={`#/briefs/${b.run_id}`}
                      onClick={() => setCreditModalOpen(false)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 12px', borderRadius: 6, fontSize: 13,
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        color: 'var(--text-primary)', textDecoration: 'none',
                        transition: 'border-color 120ms',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <span style={{ fontWeight: 500 }}>{b.company}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {new Date(b.created_at).toLocaleDateString()}
                      </span>
                    </a>
                  ))}
                </div>
                <button onClick={() => { setCreditModalOpen(false); setTimeout(() => openCreditModal(), 300); }} style={{
                  width: '100%', marginTop: 16, padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', cursor: 'pointer',
                }}>Refresh</button>
              </div>
            ) : creditResult?.type === 'success' ? (
              /* ── Success state ── */
              <div>
                <div style={{
                  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                  borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)',
                }}>
                  {creditResult.msg}
                </div>
                <button onClick={() => setCreditModalOpen(false)} style={{
                  width: '100%', marginTop: 16, padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                }}>Done</button>
              </div>
            ) : (
              /* ── Credit request form ── */
              <div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>How many credits?</label>
                  <input type="number" min={1} max={50} value={creditAmount}
                    onChange={e => setCreditAmount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    style={{
                      ...inputStyle, width: 80,
                    }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Reason (optional)</label>
                  <textarea value={creditReason} onChange={e => setCreditReason(e.target.value)}
                    placeholder="e.g. Preparing for QBR next week"
                    rows={3}
                    style={{
                      ...inputStyle, resize: 'vertical',
                    }} />
                </div>
                {creditResult?.type === 'error' && (
                  <div style={{
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13, color: '#dc2626',
                  }}>
                    {creditResult.msg}
                  </div>
                )}
                <button onClick={handleCreditSubmit} disabled={creditSubmitting} style={{
                  width: '100%', padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff',
                  cursor: creditSubmitting ? 'not-allowed' : 'pointer',
                  opacity: creditSubmitting ? 0.5 : 1,
                }}>
                  {creditSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── Post-submit toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
          background: 'var(--bg-elevated)', color: 'var(--text-primary)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: '14px 18px', maxWidth: 340,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Research submitted!</div>
            This typically takes around 15 minutes — possibly longer if the system is busy. Check back later to view your brief.
          </div>
          <button onClick={() => { setToast(false); if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }} style={{
            background: 'none', border: 'none', color: 'var(--text-tertiary)',
            cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0,
          }}>{'\u00D7'}</button>
        </div>
      )}
    </Layout>
  );
}
