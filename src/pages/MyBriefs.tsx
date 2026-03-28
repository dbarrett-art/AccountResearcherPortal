import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import Banner from '../components/Banner';
import StatusBadge from '../components/StatusBadge';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { FileText, Table, RefreshCw, Eye } from 'lucide-react';

interface Run {
  id: string;
  company: string;
  created_at: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  summary: string | null;
  pdf_url: string | null;
  excel_url: string | null;
  error_message: string | null;
  brief_id: string | null;
}

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

export default function MyBriefs() {
  usePageTitle('My Briefs');
  const { session, userProfile } = useAuth();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthOk, setHealthOk] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    if (!userProfile) return;
    const { data } = await supabase
      .from('runs')
      .select('id, company, created_at, status, summary, pdf_url, excel_url, error_message, brief_id')
      .eq('user_id', userProfile.id)
      .order('created_at', { ascending: false });
    if (data) setRuns(data as Run[]);
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

  const handleRetry = async (runId: string) => {
    if (!session) return;
    setRetrying(runId);
    try {
      await fetch('https://go.accountresearch.workers.dev/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ run_id: runId }),
      });
    } catch { /* handled by realtime */ }
    setRetrying(null);
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
                <th style={thStyle}>Summary</th>
                <th style={{ ...thStyle, textAlign: 'center', width: 80 }}>Files</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 80ms' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500 }}>{run.company}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }} title={new Date(run.created_at).toLocaleString()}>
                    {relativeTime(run.created_at)}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusBadge status={run.status} />
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
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={run.summary || ''}>
                    {run.summary ? (run.summary.length > 72 ? run.summary.slice(0, 72) + '...' : run.summary) : '—'}
                  </td>
                  <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                      {run.status === 'complete' && run.brief_id && (
                        <button
                          onClick={() => navigate(`/briefs/${run.id}`)}
                          title="View brief"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '4px',
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                        >
                          <Eye size={15} />
                        </button>
                      )}
                      {run.pdf_url ? (
                        <a href={run.pdf_url} target="_blank" rel="noopener noreferrer" title="Download PDF">
                          <FileText size={16} style={{ color: 'var(--text-secondary)' }} />
                        </a>
                      ) : (
                        <FileText size={16} style={{ color: 'var(--text-disabled)' }} />
                      )}
                      {run.excel_url ? (
                        <a href={run.excel_url} target="_blank" rel="noopener noreferrer" title="Download Excel">
                          <Table size={16} style={{ color: 'var(--text-secondary)' }} />
                        </a>
                      ) : (
                        <Table size={16} style={{ color: 'var(--text-disabled)' }} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
