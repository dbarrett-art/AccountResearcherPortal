import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, workerFetch } from '../lib/supabase';
import Layout from '../components/Layout';
import Banner from '../components/Banner';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { FileText, RefreshCw, Eye, Clock, Trash2, RotateCcw } from 'lucide-react';

interface Run {
  id: string;
  company: string;
  url: string | null;
  created_at: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  summary: string | null;
  pdf_url: string | null;
  error_message: string | null;
  brief_id: string | null;
  icp_score: string | null;
  market: string | null;
  queued_at: string | null;
  queue_position: number | null;
}

const LANGUAGE_FLAGS: Record<string, string> = {
  de: '\u{1F1E9}\u{1F1EA}', fr: '\u{1F1EB}\u{1F1F7}', es: '\u{1F1EA}\u{1F1F8}',
  it: '\u{1F1EE}\u{1F1F9}', nl: '\u{1F1F3}\u{1F1F1}', pt: '\u{1F1F5}\u{1F1F9}',
  ja: '\u{1F1EF}\u{1F1F5}', ko: '\u{1F1F0}\u{1F1F7}', sv: '\u{1F1F8}\u{1F1EA}',
  no: '\u{1F1F3}\u{1F1F4}', da: '\u{1F1E9}\u{1F1F0}', fi: '\u{1F1EB}\u{1F1EE}',
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function FreshnessBadge({ createdAt, status }: { createdAt: string; status: string }) {
  if (status !== 'complete') return null;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days > 90) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 11, fontWeight: 500, color: 'var(--status-failed-text)',
        background: 'rgba(220,38,38,0.1)', padding: '1px 6px', borderRadius: 3, marginLeft: 6,
      }}>
        <Clock size={10} /> Stale — {days}d old
      </span>
    );
  }
  if (days > 30) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 11, fontWeight: 500, color: 'var(--status-running-text)',
        background: 'rgba(217,119,6,0.1)', padding: '1px 6px', borderRadius: 3, marginLeft: 6,
      }}>
        <Clock size={10} /> Review — {days}d old
      </span>
    );
  }
  // <= 30 days: no badge
  return null;
}

const icpColors: Record<string, { bg: string; text: string }> = {
  Strong: { bg: 'rgba(22,163,74,0.12)', text: '#16a34a' },
  Moderate: { bg: 'rgba(217,119,6,0.12)', text: '#d97706' },
  Weak: { bg: 'rgba(220,38,38,0.10)', text: '#dc2626' },
};

function IcpBadge({ score }: { score: string | null }) {
  if (!score) return <span style={{ color: 'var(--text-disabled)', fontSize: 12 }}>—</span>;
  const c = icpColors[score] || { bg: 'rgba(100,100,100,0.1)', text: 'var(--text-secondary)' };
  return (
    <span style={{
      display: 'inline-block', fontSize: 12, fontWeight: 600,
      padding: '2px 8px', borderRadius: 4,
      background: c.bg, color: c.text,
    }}>
      {score}
    </span>
  );
}

export default function MyBriefs() {
  usePageTitle('My Briefs');
  const { session, userProfile } = useAuth();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthOk, setHealthOk] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, { step: number; total: number; module: string | null; pct: number }>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [rerunConfirm, setRerunConfirm] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    if (!userProfile) return;
    const { data, error } = await supabase
      .from('runs')
      .select('id, company, url, created_at, status, summary, pdf_url, error_message, brief_id, market, queued_at, queue_position, briefs!brief_id(pov_json->icp_fit->score)')
      .or(`user_id.eq.${userProfile.id},assigned_to.eq.${userProfile.id}`)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('MyBriefs fetch error:', error);
      setLoading(false);
      return;
    }
    if (data) {
      // Extract icp_score from joined briefs data
      const mapped = data.map((row: any) => ({
        ...row,
        icp_score: row.briefs?.score ?? null,
        briefs: undefined,
      })) as Run[];
      setRuns(mapped);
    }
    setLoading(false);
  }, [userProfile]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  useEffect(() => {
    fetch('https://go.accountresearch.workers.dev/health')
      .then((r) => setHealthOk(r.ok))
      .catch(() => setHealthOk(false));
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!userProfile) return;
    const channel = supabase
      .channel('my-runs')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'runs',
        filter: `user_id=eq.${userProfile.id}`,
      }, (payload) => {
        setRuns((prev) =>
          prev.map((r) => (r.id === (payload.new as Run).id ? { ...r, ...payload.new } as Run : r))
        );
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'runs',
        filter: `user_id=eq.${userProfile.id}`,
      }, (payload) => {
        setRuns((prev) => [payload.new as Run, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userProfile]);

  // Poll progress for running runs
  const runningIds = runs.filter(r => r.status === 'running').map(r => r.id).join(',');
  useEffect(() => {
    if (!runningIds || !session) return;
    const ids = runningIds.split(',');
    const poll = async () => {
      const updates: Record<string, any> = {};
      await Promise.all(ids.map(async (id) => {
        try {
          const res = await workerFetch(`/progress/${id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.progress) updates[id] = data.progress;
          }
        } catch { /* ignore */ }
      }));
      if (Object.keys(updates).length > 0) {
        setProgressMap(prev => ({ ...prev, ...updates }));
      }
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [runningIds, session]);

  const handleRetry = async (runId: string) => {
    if (!session) return;
    setRetrying(runId);
    try {
      await workerFetch('/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      });
    } catch { /* handled by realtime */ }
    setRetrying(null);
  };

  const handleDelete = async (runId: string) => {
    if (!session) return;
    try {
      const res = await workerFetch(`/run/${runId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }));
        alert(err.error || 'Delete failed');
        return;
      }
      setRuns(prev => prev.filter(r => r.id !== runId));
      setDeleteConfirm(null);
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleRerun = async (run: Run) => {
    if (!session || !run.url) return;
    setRerunning(run.id);
    try {
      const res = await workerFetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: run.company,
          url: run.url,
          include_contacts: true,
          market: run.market || 'auto',
          fresh: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Re-run failed' }));
        alert(err.error || 'Re-run failed');
      }
      setRerunConfirm(null);
    } catch (err: any) {
      alert('Re-run failed: ' + err.message);
    } finally {
      setRerunning(null);
    }
  };

  const thStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left',
  };

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>My Briefs</h1>
          {!loading && runs.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 4 }}>
              {runs.length} brief{runs.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {!healthOk && (
        <Banner type="error" style={{ marginBottom: 16 }}>
          Worker health check failed — runs may be delayed.
        </Banner>
      )}

      {loading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : runs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <FileText size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>No briefs yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>Submit your first research request to get started.</div>
          <button
            onClick={() => navigate('/submit')}
            style={{ background: 'var(--accent)', color: '#fff', padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none', transition: 'background 120ms' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          >
            Submit request
          </button>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Submitted</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>ICP Fit</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 80ms' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500 }}>
                    {run.company}
                    {run.market && run.market !== 'en' && run.market !== 'auto' && LANGUAGE_FLAGS[run.market] && (
                      <span title={run.market.toUpperCase()} style={{ marginLeft: 6, fontSize: 14 }}>
                        {LANGUAGE_FLAGS[run.market]}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }} title={new Date(run.created_at).toLocaleString()}>
                    {relativeTime(run.created_at)}
                    <FreshnessBadge createdAt={run.created_at} status={run.status} />
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusBadge status={run.status} />
                      {run.status === 'queued' && run.queued_at && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          Position #{run.queue_position || '?'}
                        </span>
                      )}
                      {run.status === 'failed' && (
                        <button
                          onClick={() => handleRetry(run.id)}
                          disabled={retrying === run.id}
                          title={run.error_message || 'Retry this run'}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)',
                            padding: '2px 8px', fontSize: 12, borderRadius: 6, opacity: retrying === run.id ? 0.4 : 1,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                          <RefreshCw size={12} />
                          Retry
                        </button>
                      )}
                    </div>
                    {run.status === 'running' && progressMap[run.id] && (
                      <div style={{ marginTop: 6, minWidth: 140 }}>
                        <ProgressBar {...progressMap[run.id]} />
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <IcpBadge score={run.icp_score} />
                  </td>
                  <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                      {run.status === 'complete' && run.brief_id && (
                        <button
                          onClick={() => navigate(`/briefs/${run.id}`)}
                          title="View brief"
                          className="action-btn"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 36, height: 36, borderRadius: 8,
                            background: 'transparent', border: '0.5px solid var(--border-strong)',
                            color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 100ms',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                          <Eye size={18} />
                        </button>
                      )}
                      {run.pdf_url ? (
                        <button
                          title="Download PDF"
                          onClick={async (e) => {
                            e.preventDefault();
                            const btn = e.currentTarget;
                            btn.disabled = true;
                            try {
                              const res = await workerFetch(`/pdf/${run.id}`);
                              if (!res.ok) throw new Error();
                              const { signedUrl } = await res.json();
                              window.open(signedUrl, '_blank');
                            } catch { /* noop */ } finally { btn.disabled = false; }
                          }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 36, height: 36, borderRadius: 8,
                            background: 'transparent', border: '0.5px solid var(--border-strong)',
                            color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 100ms',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                          <FileText size={18} />
                        </button>
                      ) : (
                        <span title="PDF not available" style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 36, height: 36, borderRadius: 8,
                          border: '0.5px solid var(--border)', opacity: 0.3,
                        }}>
                          <FileText size={18} style={{ color: 'var(--text-disabled)' }} />
                        </span>
                      )}
                      {userProfile?.role === 'admin' && run.status === 'complete' && run.url && (
                        <button
                          onClick={() => setRerunConfirm(run.id)}
                          title="Re-run with fresh data"
                          disabled={rerunning === run.id}
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 36, height: 36, borderRadius: 8,
                            background: 'transparent', border: '0.5px solid var(--border-strong)',
                            color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 100ms',
                            opacity: rerunning === run.id ? 0.3 : 1,
                            pointerEvents: rerunning === run.id ? 'none' : 'auto',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                          <RotateCcw size={18} />
                        </button>
                      )}
                      {userProfile?.role === 'admin' && (
                        <button
                          onClick={() => setDeleteConfirm(run.id)}
                          title="Delete run"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 36, height: 36, borderRadius: 8,
                            background: 'transparent', border: '0.5px solid var(--border-strong)',
                            color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 100ms',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.12)'; e.currentTarget.style.color = '#dc2626'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 300,
        }} onClick={() => setDeleteConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 24, width: 360,
          }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Delete this brief?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
              This will permanently delete the run record, brief data, and any uploaded PDF files.
              This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  background: 'transparent', border: '1px solid var(--border-strong)',
                  color: 'var(--text-secondary)', padding: '6px 14px',
                  fontSize: 13, borderRadius: 6, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  background: 'var(--status-failed)', border: 'none',
                  color: '#fff', padding: '6px 14px',
                  fontSize: 13, borderRadius: 6, cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-run confirmation modal */}
      {rerunConfirm && (() => {
        const run = runs.find(r => r.id === rerunConfirm);
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300,
          }} onClick={() => setRerunConfirm(null)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 24, width: 360,
            }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>Re-run with fresh data?</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
                This will re-run the pipeline for <strong>{run?.company}</strong> without using cached data. This uses 1 credit.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setRerunConfirm(null)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border-strong)',
                    color: 'var(--text-secondary)', padding: '6px 14px',
                    fontSize: 13, borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => run && handleRerun(run)}
                  disabled={rerunning === rerunConfirm}
                  style={{
                    background: 'var(--accent)', border: 'none',
                    color: '#fff', padding: '6px 14px',
                    fontSize: 13, borderRadius: 6, cursor: 'pointer',
                    fontWeight: 500,
                    opacity: rerunning === rerunConfirm ? 0.4 : 1,
                  }}
                >
                  {rerunning === rerunConfirm ? 'Submitting...' : 'Re-run'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
}
