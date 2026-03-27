import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import { FileText, Table } from 'lucide-react';

interface UserEntry {
  id: string;
  name: string;
  email: string;
}

interface Run {
  id: string;
  company: string;
  created_at: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  summary: string | null;
  pdf_url: string | null;
  excel_url: string | null;
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

export default function TeamView() {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      let query;
      if (userProfile.role === 'admin') {
        query = supabase.from('users').select('id, name, email').order('name');
      } else {
        query = supabase.from('users').select('id, name, email').eq('manager_id', userProfile.id).order('name');
      }
      const { data } = await query;
      if (data && data.length > 0) {
        setUsers(data as UserEntry[]);
        setSelectedUserId(data[0].id);
      }
      setLoading(false);
    })();
  }, [userProfile]);

  const fetchRuns = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('runs')
      .select('id, company, created_at, status, summary, pdf_url, excel_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (data) setRuns(data as Run[]);
  }, []);

  useEffect(() => {
    if (selectedUserId) fetchRuns(selectedUserId);
  }, [selectedUserId, fetchRuns]);

  // Realtime
  useEffect(() => {
    if (!selectedUserId) return;
    const channel = supabase
      .channel('team-runs')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'runs',
        filter: `user_id=eq.${selectedUserId}`,
      }, (payload) => {
        setRuns((prev) =>
          prev.map((r) => (r.id === (payload.new as Run).id ? { ...r, ...payload.new } as Run : r))
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedUserId]);

  if (loading) {
    return <Layout><div style={{ color: 'var(--text-tertiary)', padding: 40 }}>Loading...</div></Layout>;
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

          {runs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No briefs for this user.
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>Company</th>
                    <th style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>Submitted</th>
                    <th style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>Status</th>
                    <th style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>Summary</th>
                    <th style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'center', width: 80 }}>Files</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 80ms' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{run.company}</td>
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
                            <a href={run.pdf_url} target="_blank" rel="noopener noreferrer"><FileText size={16} style={{ color: 'var(--text-secondary)' }} /></a>
                          ) : (
                            <FileText size={16} style={{ color: 'var(--text-disabled)' }} />
                          )}
                          {run.excel_url ? (
                            <a href={run.excel_url} target="_blank" rel="noopener noreferrer"><Table size={16} style={{ color: 'var(--text-secondary)' }} /></a>
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
        </>
      )}
    </Layout>
  );
}
