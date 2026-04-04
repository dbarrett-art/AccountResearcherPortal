import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, workerFetch } from '../lib/supabase';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { FileText } from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UserEntry { id: string; name: string; email: string; }
interface Run {
  id: string; company: string; created_at: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  summary: string | null; pdf_url: string | null;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TeamView() {
  usePageTitle('Team View');
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      const query = userProfile.role === 'admin'
        ? supabase.from('users').select('id, name, email').order('name')
        : supabase.from('users').select('id, name, email').eq('manager_id', userProfile.id).order('name');
      const { data } = await query;
      if (data && data.length > 0) {
        setUsers(data as UserEntry[]);
        setSelectedUserId(data[0].id);
      }
      setLoading(false);
    })();
  }, [userProfile]);

  const fetchRuns = useCallback(async (userId: string) => {
    setRunsLoading(true);
    const { data } = await supabase
      .from('runs')
      .select('id, company, created_at, status, summary, pdf_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (data) setRuns(data as Run[]);
    setRunsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedUserId) fetchRuns(selectedUserId);
  }, [selectedUserId, fetchRuns]);

  // Realtime — properly cleanup on user switch
  useEffect(() => {
    if (!selectedUserId) return;

    // Remove previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`team-runs-${selectedUserId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'runs',
        filter: `user_id=eq.${selectedUserId}`,
      }, (payload) => {
        setRuns((prev) =>
          prev.map((r) => (r.id === (payload.new as Run).id ? { ...r, ...payload.new } as Run : r))
        );
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'runs',
        filter: `user_id=eq.${selectedUserId}`,
      }, (payload) => {
        setRuns((prev) => [payload.new as Run, ...prev]);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [selectedUserId]);

  const thStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left',
  };

  if (loading) {
    return <Layout><TableSkeleton rows={4} cols={5} /></Layout>;
  }

  return (
    <Layout>
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Team View</h1>
      </div>

      {users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No team members found.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 20 }}>
            <select
              value={selectedUserId || ''}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 6,
                padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', minWidth: 240,
              }}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>

          {runsLoading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : runs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No briefs for this user.
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
                      <td style={{ padding: '11px 16px' }}><StatusBadge status={run.status} /></td>
                      <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={run.summary || ''}>
                        {run.summary ? (run.summary.length > 72 ? run.summary.slice(0, 72) + '...' : run.summary) : '—'}
                      </td>
                      <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
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
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                            >
                              <FileText size={16} style={{ color: 'var(--text-secondary)' }} />
                            </button>
                          ) : (
                            <FileText size={16} style={{ color: 'var(--text-disabled)' }} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
