import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, workerFetch } from '../lib/supabase';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { Users, Activity, Heart, BarChart3, ExternalLink, Cpu, FileText, X, RefreshCw, Trash2, UserPlus, Check, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Tab = 'users' | 'runs' | 'health' | 'credits' | 'api-credits';

interface UserRow {
  id: string; name: string; email: string; role: string;
  manager_id: string | null; credits_remaining: number;
}

interface RunRow {
  id: string; company: string; url: string | null; created_at: string; completed_at: string | null;
  status: 'queued' | 'running' | 'complete' | 'failed';
  error_message: string | null; pdf_url: string | null; gha_run_id: string | null;
  user_id: string; users?: { name: string; email: string }; market: string | null;
}

const LANGUAGE_FLAGS: Record<string, string> = {
  de: '\u{1F1E9}\u{1F1EA}', fr: '\u{1F1EB}\u{1F1F7}', es: '\u{1F1EA}\u{1F1F8}',
  it: '\u{1F1EE}\u{1F1F9}', nl: '\u{1F1F3}\u{1F1F1}', pt: '\u{1F1F5}\u{1F1F9}',
  ja: '\u{1F1EF}\u{1F1F5}', ko: '\u{1F1F0}\u{1F1F7}', sv: '\u{1F1F8}\u{1F1EA}',
  no: '\u{1F1F3}\u{1F1F4}', da: '\u{1F1E9}\u{1F1F0}', fi: '\u{1F1EB}\u{1F1EE}',
};

function formatDuration(created: string, completed: string | null): string {
  if (!completed) return '—';
  const ms = new Date(completed).getTime() - new Date(created).getTime();
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  return mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;
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

function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 24, maxWidth: 360,
      }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)',
            padding: '6px 14px', fontSize: 13, borderRadius: 6,
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6,
          }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// --- Tab: Users ---
function UsersTab({ adminId }: { adminId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [managers, setManagers] = useState<UserRow[]>([]);
  const [grantAmounts, setGrantAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{ msg: string; action: () => void } | null>(null);

  // Add user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('ae');
  const [newCredits, setNewCredits] = useState(5);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; message: string } | null>(null);

  const createUser = async () => {
    if (!newEmail.trim()) return;
    setCreating(true);
    setCreateResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-user', {
        body: {
          email: newEmail.trim(),
          name: newName.trim() || undefined,
          role: newRole,
          credits: newCredits,
        },
      });
      if (fnError) {
        setCreateResult({ ok: false, message: fnError.message });
      } else if (!data?.success) {
        setCreateResult({ ok: false, message: data?.error || 'Unknown error' });
      } else {
        setCreateResult({ ok: true, message: `Invite sent to ${data.user.email}` });
        // Add to local list
        setUsers((prev) => [...prev, {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          credits_remaining: data.user.credits,
          manager_id: null,
        }]);
        // Reset form
        setNewEmail('');
        setNewName('');
        setNewRole('ae');
        setNewCredits(5);
        setTimeout(() => setCreateResult(null), 4000);
      }
    } catch (err: any) {
      setCreateResult({ ok: false, message: err.message });
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('users').select('*').order('name');
      if (data) {
        setUsers(data as UserRow[]);
        setManagers((data as UserRow[]).filter((u) => u.role === 'manager' || u.role === 'admin'));
      }
      setLoading(false);
    })();
  }, []);

  const updateRole = (userId: string, role: string) => {
    const user = users.find(u => u.id === userId);
    setConfirm({
      msg: `Change ${user?.name}'s role to ${role}?`,
      action: async () => {
        await supabase.from('users').update({ role }).eq('id', userId);
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
        setConfirm(null);
      },
    });
  };

  const updateManager = (userId: string, managerId: string | null) => {
    const user = users.find(u => u.id === userId);
    const mgr = managers.find(m => m.id === managerId);
    setConfirm({
      msg: `Set ${user?.name}'s manager to ${mgr?.name || 'none'}?`,
      action: async () => {
        await supabase.from('users').update({ manager_id: managerId || null }).eq('id', userId);
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, manager_id: managerId } : u)));
        setConfirm(null);
      },
    });
  };

  const grantCredits = (userId: string) => {
    const amount = grantAmounts[userId] || 0;
    if (amount < 1 || amount > 20) return;
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    setConfirm({
      msg: `Grant ${amount} credit${amount > 1 ? 's' : ''} to ${user.name}?`,
      action: async () => {
        await supabase.from('users').update({ credits_remaining: user.credits_remaining + amount }).eq('id', userId);
        await supabase.from('credit_grants').insert({ granted_to: userId, granted_by: adminId, amount, note: 'Admin grant' });
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, credits_remaining: u.credits_remaining + amount } : u)));
        setGrantAmounts((prev) => ({ ...prev, [userId]: 0 }));
        setConfirm(null);
      },
    });
  };

  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 6,
    padding: '4px 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none',
  };

  if (loading) return <TableSkeleton rows={4} cols={6} />;

  return (
    <>
      {confirm && <ConfirmDialog message={confirm.msg} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />}

      {/* Add User */}
      <div style={{ marginBottom: 20 }}>
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: '#fff', border: 'none',
              padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            <UserPlus size={14} /> Add User
          </button>
        ) : (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Add User</div>
              <button onClick={() => { setShowAddForm(false); setCreateResult(null); }} style={{
                background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
              }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Email *</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@company.com"
                  style={{
                    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-strong)',
                    borderRadius: 6, padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Full Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Jane Doe"
                  style={{
                    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-strong)',
                    borderRadius: 6, padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  style={{
                    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-strong)',
                    borderRadius: 6, padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                >
                  <option value="ae">AE</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Credits</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={newCredits}
                  onChange={(e) => setNewCredits(parseInt(e.target.value) || 0)}
                  style={{
                    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-strong)',
                    borderRadius: 6, padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={createUser}
                disabled={creating || !newEmail.trim()}
                style={{
                  background: creating || !newEmail.trim() ? 'var(--bg-elevated)' : 'var(--accent)',
                  color: creating || !newEmail.trim() ? 'var(--text-tertiary)' : '#fff',
                  border: 'none', padding: '7px 16px', fontSize: 13,
                  fontWeight: 500, borderRadius: 6, cursor: creating ? 'wait' : 'pointer',
                }}
              >
                {creating ? 'Creating...' : 'Create User'}
              </button>
              {createResult && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 13,
                  color: createResult.ok ? 'var(--status-complete-text)' : 'var(--status-failed)',
                }}>
                  {createResult.ok && <Check size={14} />}
                  {createResult.message}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
              {['Name', 'Email', 'Role', 'Manager', 'Credits', 'Actions'].map((h) => (
                <th key={h} style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500 }}>{u.name}</td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{u.email}</td>
                <td style={{ padding: '11px 16px' }}>
                  <select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} style={selectStyle}>
                    <option value="ae">AE</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td style={{ padding: '11px 16px' }}>
                  <select value={u.manager_id || ''} onChange={(e) => updateManager(u.id, e.target.value || null)} style={selectStyle}>
                    <option value="">None</option>
                    {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </td>
                <td style={{ padding: '11px 16px', fontSize: 13 }}>{u.credits_remaining}</td>
                <td style={{ padding: '11px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="number" min={1} max={20}
                      value={grantAmounts[u.id] || ''}
                      onChange={(e) => setGrantAmounts((prev) => ({ ...prev, [u.id]: parseInt(e.target.value) || 0 }))}
                      placeholder="0" style={{ ...selectStyle, width: 56 }}
                    />
                    <button onClick={() => grantCredits(u.id)} style={{
                      background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)',
                      padding: '4px 10px', fontSize: 12, borderRadius: 6,
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >Grant</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Tab: Run Monitor ---
interface LogData {
  company?: string;
  gha_run_id?: string;
  job_name?: string;
  job_status?: string;
  conclusion?: string;
  started_at?: string;
  completed_at?: string;
  gha_url?: string;
  logs?: string;
  error?: string;
}

function RunMonitorTab() {
  const { session, userProfile } = useAuth();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [logModal, setLogModal] = useState<string | null>(null);
  const [logData, setLogData] = useState<LogData | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [rerunConfirm, setRerunConfirm] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState<string | null>(null);
  const [rerenderingPdf, setRerenderingPdf] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, { step: number; total: number; module: string | null; pct: number }>>({});

  const handleRerun = async (run: RunRow) => {
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

  const handleRegeneratePdf = async (runId: string) => {
    setRerenderingPdf(runId);
    try {
      const res = await workerFetch(`/regenerate-pdf/${runId}`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Re-render failed' }));
        alert(err.error || 'Re-render failed');
      }
    } catch (err: any) {
      alert('Re-render failed: ' + err.message);
    } finally {
      setRerenderingPdf(null);
    }
  };

  const handleDelete = async (runId: string) => {
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

  const fetchLogs = async (runId: string) => {
    setLogModal(runId);
    setLogsLoading(true);
    setLogData(null);
    try {
      const res = await workerFetch(`/gha-logs?run_id=${runId}`);
      const data = await res.json();
      setLogData(data);
    } catch (err: any) {
      setLogData({ logs: `Error loading logs: ${err.message}` });
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('runs')
        .select('id, company, url, created_at, completed_at, status, error_message, pdf_url, gha_run_id, user_id, market, users(name, email)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (data) setRuns(data as unknown as RunRow[]);
      setLoading(false);
    })();
  }, []);

  // Realtime for run monitor
  useEffect(() => {
    const channel = supabase
      .channel('admin-runs')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'runs',
      }, (payload) => {
        setRuns((prev) =>
          prev.map((r) => (r.id === (payload.new as RunRow).id ? { ...r, ...payload.new } as RunRow : r))
        );
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'runs',
      }, (payload) => {
        setRuns((prev) => [payload.new as RunRow, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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

  const filtered = runs.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (dateFrom && new Date(r.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(r.created_at) > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });

  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 6,
    padding: '6px 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none',
  };

  if (loading) return <TableSkeleton rows={6} cols={7} />;

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="all">All statuses</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="complete">Complete</option>
          <option value="failed">Failed</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={selectStyle} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={selectStyle} />
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
              {['User', 'Company', 'Status', 'Submitted', 'Duration', 'PDF', 'GHA', ...(userProfile?.role === 'admin' ? [''] : [])].map((h) => (
                <th key={h} style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} style={{
                borderBottom: '1px solid var(--border)',
                borderLeft: r.status === 'failed' ? '2px solid var(--status-failed)' : 'none',
                transition: 'background 80ms',
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{r.users?.name || '—'}</td>
                <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500 }}>
                  {r.company}
                  {r.market && r.market !== 'en' && r.market !== 'auto' && LANGUAGE_FLAGS[r.market] && (
                    <span title={r.market.toUpperCase()} style={{ marginLeft: 6, fontSize: 14 }}>
                      {LANGUAGE_FLAGS[r.market]}
                    </span>
                  )}
                </td>
                <td style={{ padding: '11px 16px' }} title={r.error_message || ''}>
                  <StatusBadge status={r.status} />
                  {r.status === 'running' && progressMap[r.id] && (
                    <div style={{ marginTop: 6, minWidth: 140 }}>
                      <ProgressBar {...progressMap[r.id]} />
                    </div>
                  )}
                </td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }} title={new Date(r.created_at).toLocaleString()}>
                  {relativeTime(r.created_at)}
                </td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {formatDuration(r.created_at, r.completed_at)}
                </td>
                <td style={{ padding: '11px 16px' }}>
                  {r.pdf_url ? <a href={r.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>PDF</a> : '—'}
                </td>
                <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                  {r.gha_run_id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <a href={`https://github.com/dbarrett-art/prospect-research/actions/runs/${r.gha_run_id}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} style={{ color: 'var(--text-secondary)' }} />
                      </a>
                      {(r.status === 'failed' || r.status === 'running') && (
                        <button onClick={() => fetchLogs(r.id)} style={{
                          background: 'transparent',
                          color: r.status === 'failed' ? 'var(--status-failed)' : 'var(--status-running-text)',
                          border: `1px solid ${r.status === 'failed' ? 'var(--status-failed)' : 'var(--status-running-text)'}`,
                          padding: '2px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                        }}>
                          <FileText size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                          Logs
                        </button>
                      )}
                    </div>
                  ) : '—'}
                </td>
                {userProfile?.role === 'admin' && (
                  <td style={{ padding: '11px 8px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {r.status === 'complete' && r.url && (
                        <>
                          <button
                            onClick={() => setRerunConfirm(r.id)}
                            title="Re-run with fresh data"
                            disabled={rerunning === r.id}
                            style={{
                              background: 'transparent', border: 'none',
                              color: 'var(--text-tertiary)', cursor: 'pointer',
                              padding: 4, borderRadius: 4, transition: '80ms',
                              opacity: rerunning === r.id ? 0.4 : 1,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                          >
                            <RotateCcw size={13} />
                          </button>
                          <button
                            onClick={() => handleRegeneratePdf(r.id)}
                            title="Re-render PDF from cached data"
                            disabled={rerenderingPdf === r.id}
                            style={{
                              background: 'transparent', border: 'none',
                              color: 'var(--text-tertiary)', cursor: 'pointer',
                              padding: 4, borderRadius: 4, transition: '80ms',
                              opacity: rerenderingPdf === r.id ? 0.4 : 1,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                          >
                            <RefreshCw size={13} style={rerenderingPdf === r.id ? { animation: 'spin 1s linear infinite' } : undefined} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setDeleteConfirm(r.id)}
                        title="Delete run"
                        style={{
                          background: 'transparent', border: 'none',
                          color: 'var(--text-tertiary)', cursor: 'pointer',
                          padding: 4, borderRadius: 4, transition: '80ms',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--status-failed)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* GHA Log Modal */}
      {logModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }} onClick={() => setLogModal(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, width: '80vw', maxWidth: 900, height: '70vh',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '14px 18px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: 500 }}>GHA Logs — {logData?.company || 'Loading...'}</div>
                {logData?.gha_run_id && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Run {logData.gha_run_id} ·{' '}
                    {logData.job_status === 'in_progress'
                      ? '\u{1F7E1} Running'
                      : logData.conclusion === 'failure'
                      ? '\u{1F534} Failed'
                      : logData.conclusion === 'success'
                      ? '\u{1F7E2} Succeeded'
                      : logData.conclusion || logData.job_status || 'unknown'}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => fetchLogs(logModal!)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border-strong)',
                    color: 'var(--text-secondary)', padding: '3px 10px',
                    fontSize: 11, borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  ↻ Refresh
                </button>
                {logData?.gha_url && (
                  <a href={logData.gha_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: 'var(--accent)' }}>
                    Open in GitHub
                  </a>
                )}
                <button onClick={() => setLogModal(null)} style={{
                  background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
                }}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <pre style={{
              flex: 1, overflowY: 'auto', padding: '16px 18px',
              fontSize: 12, fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-secondary)', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              background: 'var(--bg-app)', margin: 0,
            }}>
              {logsLoading ? 'Loading logs...' : (logData?.error || logData?.logs || 'No logs available')}
            </pre>
          </div>
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
              This will permanently delete the run record, brief data, and any uploaded PDF/Excel files.
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
    </>
  );
}

// --- Tab: Service Health ---
function HealthTab() {
  type ServiceStatus = 'ok' | 'error' | 'pending';
  const [services, setServices] = useState<{ name: string; status: ServiceStatus; checked: string; message?: string }[]>([]);
  const [dailyRuns, setDailyRuns] = useState<{ date: string; count: number }[]>([]);

  useEffect(() => {
    (async () => {
      const results: { name: string; status: ServiceStatus; checked: string; message?: string }[] = [];
      const now = new Date().toISOString();

      // Cloudflare Worker
      try {
        const res = await fetch('https://go.accountresearch.workers.dev/health');
        const data = res.ok ? await res.json() : null;
        results.push({ name: 'Cloudflare Worker', status: res.ok ? 'ok' : 'error', checked: now, message: data?.status || `HTTP ${res.status}` });
      } catch (e: any) {
        results.push({ name: 'Cloudflare Worker', status: 'error', checked: now, message: e.message });
      }

      // Supabase REST
      try {
        const sbUrl = 'https://yeraphdhllaylogqiqht.supabase.co';
        const sbAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcmFwaGRobGxheWxvZ3FpcWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDY4NjQsImV4cCI6MjA5MDA4Mjg2NH0.5ZIIIoYU3-4ZoGX448LMyuKfu4ncmIUVwyNDImEsVTY';
        const res = await fetch(`${sbUrl}/rest/v1/`, {
          headers: { 'apikey': sbAnon, 'Authorization': `Bearer ${sbAnon}` },
        });
        results.push({ name: 'Supabase', status: res.status < 500 ? 'ok' : 'error', checked: now, message: res.status < 500 ? 'Connected' : `HTTP ${res.status}` });
      } catch (e: any) {
        results.push({ name: 'Supabase', status: 'error', checked: now, message: e.message });
      }

      // GitHub Actions — use public status API (no rate limit)
      try {
        const res = await fetch('https://www.githubstatus.com/api/v2/status.json');
        const data = await res.json();
        const indicator = data?.status?.indicator;
        if (indicator === 'none') {
          results.push({ name: 'GitHub Actions', status: 'ok', checked: now, message: 'All systems operational' });
        } else {
          results.push({ name: 'GitHub Actions', status: indicator === 'critical' ? 'error' : 'pending', checked: now, message: data?.status?.description || 'Degraded' });
        }
      } catch {
        results.push({ name: 'GitHub Actions', status: 'pending', checked: now, message: 'Unable to check' });
      }

      // Supabase Storage — check briefs bucket
      try {
        const sbUrl = 'https://yeraphdhllaylogqiqht.supabase.co';
        const sbAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcmFwaGRobGxheWxvZ3FpcWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDY4NjQsImV4cCI6MjA5MDA4Mjg2NH0.5ZIIIoYU3-4ZoGX448LMyuKfu4ncmIUVwyNDImEsVTY';
        const res = await fetch(`${sbUrl}/storage/v1/bucket/briefs`, {
          headers: { 'apikey': sbAnon, 'Authorization': `Bearer ${sbAnon}` },
        });
        results.push({ name: 'Supabase Storage', status: res.ok ? 'ok' : 'error', checked: now, message: res.ok ? 'briefs bucket accessible' : `HTTP ${res.status}` });
      } catch (e: any) {
        results.push({ name: 'Supabase Storage', status: 'error', checked: now, message: e.message });
      }

      setServices(results);
    })();

    // Daily runs chart
    (async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase.from('runs').select('created_at').gte('created_at', since);
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((r: any) => { counts[r.created_at.slice(0, 10)] = (counts[r.created_at.slice(0, 10)] || 0) + 1; });
        setDailyRuns(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })));
      }
    })();
  }, []);

  const dotColor = (s: string) => s === 'ok' ? 'var(--status-complete)' : s === 'error' ? 'var(--status-failed)' : 'var(--status-queued)';

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {services.map((s) => (
          <div key={s.name} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Heart size={16} style={{ color: 'var(--text-secondary)' }} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(s.status), display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{s.status}</span>
            </div>
            {s.message && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{s.message}</div>}
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Last checked: {relativeTime(s.checked)}</div>
          </div>
        ))}
      </div>

      {dailyRuns.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Runs per day (last 30 days)</h3>
          <div style={{ height: 240, background: 'var(--bg-app)', borderRadius: 8, padding: '8px 0' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyRuns} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-primary)' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </>
  );
}

// --- Tab: Credit Analytics ---
function CreditAnalyticsTab() {
  const [weekRuns, setWeekRuns] = useState(0);
  const [monthRuns, setMonthRuns] = useState(0);
  const [userCredits, setUserCredits] = useState<{ name: string; credits_remaining: number; runs: number }[]>([]);
  const [grants, setGrants] = useState<{ id: string; created_at: string; amount: number; note: string | null; granter_name: string; grantee_name: string }[]>([]);
  const [perUserChart, setPerUserChart] = useState<{ name: string; credits: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    (async () => {
      const { count: wc } = await supabase.from('runs').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo);
      setWeekRuns(wc || 0);

      const { count: mc } = await supabase.from('runs').select('id', { count: 'exact', head: true }).gte('created_at', monthAgo);
      setMonthRuns(mc || 0);

      const { data: users } = await supabase.from('users').select('id, name, credits_remaining');
      const { data: runs } = await supabase.from('runs').select('user_id').gte('created_at', monthAgo);

      if (users) {
        const runCounts: Record<string, number> = {};
        (runs || []).forEach((r: any) => { runCounts[r.user_id] = (runCounts[r.user_id] || 0) + 1; });
        const userMap = new Map((users as any[]).map(u => [u.id, u.name]));

        setUserCredits((users as any[]).map((u) => ({
          name: u.name, credits_remaining: u.credits_remaining, runs: runCounts[u.id] || 0,
        })));
        setPerUserChart((users as any[]).map((u) => ({
          name: u.name?.split(' ')[0] || 'Unknown', credits: runCounts[u.id] || 0,
        })).filter((x) => x.credits > 0));

        // Grant history with resolved names
        const { data: grantData } = await supabase
          .from('credit_grants')
          .select('id, created_at, amount, note, granted_by, granted_to')
          .order('created_at', { ascending: false })
          .limit(50);
        if (grantData) {
          setGrants((grantData as any[]).map(g => ({
            ...g,
            granter_name: userMap.get(g.granted_by) || 'Unknown',
            grantee_name: userMap.get(g.granted_to) || 'Unknown',
          })));
        }
      }
      setLoading(false);
    })();
  }, []);

  const statCard = (label: string, value: string) => (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, flex: 1 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );

  if (loading) return <TableSkeleton rows={4} cols={3} />;

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {statCard('Runs this week', String(weekRuns))}
        {statCard('Runs this month', String(monthRuns))}
        {statCard('Est. cost (month)', `$${(monthRuns * 0.5).toFixed(2)}`)}
      </div>

      {perUserChart.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Credits consumed per user (30d)</h3>
          <div style={{ height: 200, marginBottom: 24, background: 'var(--bg-app)', borderRadius: 8, padding: '8px 0' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perUserChart} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-primary)' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="credits" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>User Credits</h3>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
              {['User', 'Credits Remaining', 'Runs This Month'].map((h) => (
                <th key={h} style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {userCredits.map((u, i) => (
              <tr key={i} style={{
                borderBottom: '1px solid var(--border)',
                background: u.credits_remaining === 0 ? 'rgba(217,119,6,0.06)' : 'transparent',
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = u.credits_remaining === 0 ? 'rgba(217,119,6,0.1)' : 'var(--bg-elevated)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = u.credits_remaining === 0 ? 'rgba(217,119,6,0.06)' : 'transparent')}
              >
                <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500 }}>{u.name}</td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: u.credits_remaining === 0 ? 'var(--status-running-text)' : 'var(--text-primary)' }}>{u.credits_remaining}</td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{u.runs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {grants.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Grant History</h3>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Granted By', 'Granted To', 'Amount', 'Note', 'Date'].map((h) => (
                    <th key={h} style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{g.granter_name}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{g.grantee_name}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500 }}>+{g.amount}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{g.note || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{relativeTime(g.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// --- Tab: API Credits ---
interface CreditInfo {
  service: string;
  remaining?: number | string;
  used?: number;
  plan?: string;
  resets?: string;
  status?: string;
  note?: string;
  error?: string;
}

function ApiCreditsTab() {
  const [credits, setCredits] = useState<CreditInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState('');

  const fetchCredits = async () => {
    setLoading(true);
    try {
      const res = await workerFetch('/api-credits');
      const data = await res.json();
      setCredits(data.credits || []);
      setFetchedAt(data.fetched_at || new Date().toISOString());
    } catch (err: any) {
      setCredits([{ service: 'Error', error: err.message }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCredits(); }, []);

  const cardColor = (remaining: number | string | undefined): string => {
    if (typeof remaining !== 'number') return 'var(--border)';
    if (remaining < 100) return 'var(--status-failed)';
    if (remaining < 500) return 'var(--status-running-text)';
    return 'var(--status-complete)';
  };

  const serviceIcon = (name: string) => {
    const icons: Record<string, string> = { SerpAPI: 'S', EnrichLayer: 'E', Apollo: 'A', Anthropic: 'C' };
    return icons[name] || '?';
  };

  if (loading) return <TableSkeleton rows={2} cols={2} />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Last fetched: {fetchedAt ? relativeTime(fetchedAt) : '—'}
        </div>
        <button onClick={fetchCredits} style={{
          background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)',
          padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {credits.map((c) => (
          <div key={c.service} style={{
            background: 'var(--bg-surface)',
            border: `1px solid ${c.error ? 'var(--status-failed)' : 'var(--border)'}`,
            borderLeft: `3px solid ${cardColor(c.remaining)}`,
            borderRadius: 8, padding: 18,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, background: 'var(--bg-elevated)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, color: 'var(--accent)',
              }}>
                {serviceIcon(c.service)}
              </div>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{c.service}</span>
            </div>

            {c.error ? (
              <div style={{ fontSize: 12, color: 'var(--status-failed)' }}>{c.error}</div>
            ) : (
              <>
                {c.remaining !== undefined && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Remaining</div>
                    <div style={{
                      fontSize: 22, fontWeight: 600,
                      color: typeof c.remaining === 'number' && c.remaining < 100 ? 'var(--status-failed)' :
                             typeof c.remaining === 'number' && c.remaining < 500 ? 'var(--status-running-text)' :
                             'var(--text-primary)',
                    }}>
                      {typeof c.remaining === 'number' ? c.remaining.toLocaleString() : c.remaining}
                    </div>
                  </div>
                )}
                {c.used !== undefined && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Used: {typeof c.used === 'number' ? c.used.toLocaleString() : c.used}
                  </div>
                )}
                {c.status && (
                  <div style={{ fontSize: 12, color: c.status === 'Key valid' ? 'var(--status-complete-text)' : 'var(--status-failed)', marginBottom: 4 }}>
                    {c.status}
                  </div>
                )}
                {c.plan && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Plan: {c.plan}</div>
                )}
                {c.resets && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Resets: {new Date(c.resets).toLocaleDateString()}</div>
                )}
                {c.note && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{c.note}</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// --- Main Admin Page ---
const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'runs', label: 'Run Monitor', icon: Activity },
  { id: 'health', label: 'Service Health', icon: Heart },
  { id: 'credits', label: 'Credit Analytics', icon: BarChart3 },
  { id: 'api-credits', label: 'API Credits', icon: Cpu },
];

export default function Admin() {
  usePageTitle('Admin');
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('users');

  return (
    <Layout>
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Admin</h1>
      </div>

      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 24, display: 'flex' }}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '10px 16px', fontSize: 13, fontWeight: 500,
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: 'transparent', border: 'none',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6, transition: 'color 80ms',
            }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <Icon size={14} />{tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'users' && <UsersTab adminId={userProfile?.id || ''} />}
      {activeTab === 'runs' && <RunMonitorTab />}
      {activeTab === 'health' && <HealthTab />}
      {activeTab === 'credits' && <CreditAnalyticsTab />}
      {activeTab === 'api-credits' && <ApiCreditsTab />}
    </Layout>
  );
}
