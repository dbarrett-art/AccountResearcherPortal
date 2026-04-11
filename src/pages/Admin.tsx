import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, workerFetch, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import useWindowWidth from '../hooks/useWindowWidth';
import { useNavigate } from 'react-router-dom';
import { Users, Activity, Heart, BarChart3, ExternalLink, Cpu, FileText, X, RefreshCw, Trash2, UserPlus, Check, RotateCcw, Link, MessageSquare, Download, Mail, Eye, UserCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Tab = 'users' | 'runs' | 'health' | 'credits' | 'api-credits' | 'assign' | 'feedback' | 'prompts';

interface UserRow {
  id: string; name: string; email: string; role: string;
  manager_id: string | null; credits_remaining: number;
}

interface RunRow {
  id: string; company: string; url: string | null; created_at: string; started_at: string | null; completed_at: string | null;
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

function formatDuration(started: string | null, created: string, completed: string | null): string {
  if (!completed) return '—';
  const start = started || created;
  const ms = new Date(completed).getTime() - new Date(start).getTime();
  if (ms < 0) return '—';
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

function FreshnessBadge({ createdAt, status }: { createdAt: string; status: string }) {
  if (status !== 'complete') return null;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days > 90) {
    return (
      <span title={`${days} days old — stale`} style={{
        display: 'inline-flex', alignItems: 'center',
        fontSize: 10, fontWeight: 500, color: 'var(--status-failed-text)',
        background: 'rgba(220,38,38,0.1)', padding: '1px 5px', borderRadius: 3, marginLeft: 6,
      }}>
        Stale
      </span>
    );
  }
  if (days > 30) {
    return (
      <span title={`${days} days old — may need refresh`} style={{
        display: 'inline-flex', alignItems: 'center',
        fontSize: 10, fontWeight: 500, color: 'var(--status-running-text)',
        background: 'rgba(217,119,6,0.1)', padding: '1px 5px', borderRadius: 3, marginLeft: 6,
      }}>
        Review
      </span>
    );
  }
  return null;
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
  const { impersonate } = useAuth();
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
  const [inviteStates, setInviteStates] = useState<Record<string, 'loading' | 'success' | 'existing' | 'error'>>({});
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});

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

  const inviteUser = async (userId: string, email: string) => {
    setInviteStates(prev => ({ ...prev, [userId]: 'loading' }));
    try {
      const res = await workerFetch('/invite-user', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed');
      setInviteStates(prev => ({ ...prev, [userId]: data.existing_user ? 'existing' : 'success' }));
      setTimeout(() => setInviteStates(prev => { const n = { ...prev }; delete n[userId]; return n; }), 3000);
    } catch (err: any) {
      setInviteStates(prev => ({ ...prev, [userId]: 'error' }));
      setInviteErrors(prev => ({ ...prev, [userId]: err.message }));
      setTimeout(() => {
        setInviteStates(prev => { const n = { ...prev }; delete n[userId]; return n; });
        setInviteErrors(prev => { const n = { ...prev }; delete n[userId]; return n; });
      }, 3000);
    }
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
                    <button
                      onClick={() => inviteUser(u.id, u.email)}
                      disabled={inviteStates[u.id] === 'loading'}
                      title={inviteStates[u.id] === 'error' ? inviteErrors[u.id] : 'Send magic link invite'}
                      style={{
                        background: (inviteStates[u.id] === 'success' || inviteStates[u.id] === 'existing') ? 'rgba(34,197,94,0.15)' : inviteStates[u.id] === 'error' ? 'rgba(220,38,38,0.15)' : 'transparent',
                        color: (inviteStates[u.id] === 'success' || inviteStates[u.id] === 'existing') ? '#16a34a' : inviteStates[u.id] === 'error' ? '#dc2626' : 'var(--text-secondary)',
                        border: '1px solid var(--border-strong)',
                        padding: '4px 10px', fontSize: 12, borderRadius: 6,
                        display: 'inline-flex', alignItems: 'center', gap: 4, cursor: inviteStates[u.id] === 'loading' ? 'wait' : 'pointer',
                        opacity: inviteStates[u.id] === 'loading' ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => { if (!inviteStates[u.id]) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}}
                      onMouseLeave={(e) => { if (!inviteStates[u.id]) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}}
                    >
                      <Mail size={12} />
                      {inviteStates[u.id] === 'loading' ? 'Sending…' : inviteStates[u.id] === 'success' ? 'Invited ✓' : inviteStates[u.id] === 'existing' ? 'Link sent ✓' : inviteStates[u.id] === 'error' ? 'Failed' : 'Invite'}
                    </button>
                    {u.id !== adminId && (
                      <button
                        onClick={() => impersonate({
                          id: u.id, name: u.name, email: u.email,
                          role: u.role as 'ae' | 'manager' | 'admin',
                          credits_remaining: u.credits_remaining,
                          manager_id: u.manager_id,
                        })}
                        title={`View portal as ${u.name}`}
                        style={{
                          background: 'transparent', color: 'var(--text-secondary)',
                          border: '1px solid var(--border-strong)',
                          padding: '4px 10px', fontSize: 12, borderRadius: 6,
                          display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                      >
                        <Eye size={12} />
                        View as
                      </button>
                    )}
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

function CopyLogsButton({ logs }: { logs: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(logs);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title="Copy logs to clipboard"
      style={{
        background: 'transparent',
        border: '1px solid #374151',
        color: copied ? '#34D399' : '#9CA3AF',
        padding: '3px 10px',
        fontSize: 11,
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

interface QueueEntry {
  run_id: string; company: string; user_name: string; user_email: string;
  started_at?: string; queued_at?: string; queue_position?: number; estimated_wait_minutes?: number;
}

interface QueueState {
  max_concurrent: number;
  running: QueueEntry[];
  queued: QueueEntry[];
}

const MAX_CONCURRENT_DISPLAY = 2;

function RunMonitorTab() {
  const { session, userProfile } = useAuth();
  const navigate = useNavigate();
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
  const [retrying, setRetrying] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, { step: number; total: number; module: string | null; pct: number }>>({});
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [monitorUsers, setMonitorUsers] = useState<{ id: string; name: string; email: string }[]>([]);

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

  const handleRetry = async (run: RunRow) => {
    if (!session) return;
    setRetrying(run.id);
    try {
      const res = await workerFetch('/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: run.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Retry failed' }));
        alert(err.error || 'Retry failed');
      }
    } catch (err: any) {
      alert('Retry failed: ' + err.message);
    } finally {
      setRetrying(null);
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
      if (!res.ok) {
        setLogData({ logs: `Error ${res.status}: ${data.error || 'Unknown error'}` });
        return;
      }
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
        .select('id, company, url, created_at, started_at, completed_at, status, error_message, pdf_url, gha_run_id, user_id, market, users!runs_user_id_fkey(name, email)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (data) setRuns(data as unknown as RunRow[]);
      setLoading(false);
    })();
  }, []);

  // Fetch users for reassign dropdown
  useEffect(() => {
    if (userProfile?.role !== 'admin') return;
    (async () => {
      const { data } = await supabase.from('users').select('id, name, email').order('name');
      if (data) setMonitorUsers(data as { id: string; name: string; email: string }[]);
    })();
  }, [userProfile?.role]);

  const handleReassign = async (runId: string, newUserId: string) => {
    try {
      const res = await workerFetch(`/admin/reassign-run/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: newUserId }),
      });
      if (res.ok) {
        const newUser = monitorUsers.find(u => u.id === newUserId);
        setRuns(prev => prev.map(r => r.id === runId
          ? { ...r, user_id: newUserId, users: newUser ? { name: newUser.name, email: newUser.email } : r.users }
          : r
        ));
        setReassigning(null);
      }
    } catch (e) {
      console.error('Reassign failed:', e);
    }
  };

  // Close reassign dropdown on outside click
  const closeReassign = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (reassigning && !target.closest('[data-reassign-dropdown]')) {
      setReassigning(null);
    }
  }, [reassigning]);

  useEffect(() => {
    if (reassigning) {
      document.addEventListener('mousedown', closeReassign);
      return () => document.removeEventListener('mousedown', closeReassign);
    }
  }, [reassigning, closeReassign]);

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

  // Poll progress for running runs + queue state
  const runningIds = runs.filter(r => r.status === 'running').map(r => r.id).join(',');
  const hasQueued = runs.some(r => r.status === 'queued');
  useEffect(() => {
    if (!session) return;
    if (!runningIds && !hasQueued) return;
    const ids = runningIds ? runningIds.split(',') : [];
    const poll = async () => {
      const updates: Record<string, any> = {};
      await Promise.all([
        ...ids.map(async (id) => {
          try {
            const res = await workerFetch(`/progress/${id}`);
            if (res.ok) {
              const data = await res.json();
              if (data.progress) updates[id] = data.progress;
            }
          } catch { /* ignore */ }
        }),
        (async () => {
          try {
            const res = await workerFetch('/queue');
            if (res.ok) setQueueState(await res.json());
          } catch { /* ignore */ }
        })(),
      ]);
      if (Object.keys(updates).length > 0) {
        setProgressMap(prev => ({ ...prev, ...updates }));
      }
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [runningIds, hasQueued, session]);

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

  const queueRunningCount = queueState?.running.length ?? runs.filter(r => r.status === 'running').length;
  const queuedCount = queueState?.queued.length ?? runs.filter(r => r.status === 'queued').length;

  return (
    <>
      {/* Queue Status Panel */}
      {(queueRunningCount > 0 || queuedCount > 0) && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16,
          background: 'var(--bg-surface)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            GHA Runner Slots ({queueRunningCount}/{MAX_CONCURRENT_DISPLAY})
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: queuedCount > 0 ? 12 : 0 }}>
            {[0, 1].map(i => {
              const entry = queueState?.running[i];
              return (
                <div key={i} style={{
                  flex: 1, padding: '8px 12px', borderRadius: 6,
                  border: `1px solid ${entry ? 'var(--status-running)' : 'var(--border)'}`,
                  background: entry ? 'rgba(217,119,6,0.08)' : 'transparent',
                  opacity: entry ? 1 : 0.5,
                }}>
                  {entry ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{entry.company}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {entry.user_name} — {entry.started_at ? relativeTime(entry.started_at) : '—'}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Slot available</div>
                  )}
                </div>
              );
            })}
          </div>
          {queuedCount > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Queued ({queuedCount})
              </div>
              {(queueState?.queued || []).map((q) => (
                <div key={q.run_id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 0', fontSize: 12, color: 'var(--text-secondary)',
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'rgba(217,119,6,0.15)', color: 'var(--status-running-text)',
                    fontSize: 11, fontWeight: 600, flexShrink: 0,
                  }}>
                    {q.queue_position}
                  </span>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{q.company}</span>
                  <span>{q.user_name}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>~{q.estimated_wait_minutes}m wait</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                  <FreshnessBadge createdAt={r.created_at} status={r.status} />
                </td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {formatDuration(r.started_at, r.created_at, r.completed_at)}
                </td>
                <td style={{ padding: '11px 16px' }}>
                  {r.pdf_url ? <button
                    onClick={async (e) => {
                      const btn = e.currentTarget;
                      btn.disabled = true;
                      btn.textContent = '...';
                      try {
                        const res = await workerFetch(`/pdf/${r.id}`);
                        if (!res.ok) throw new Error();
                        const { signedUrl } = await res.json();
                        window.open(signedUrl, '_blank');
                      } catch { /* noop */ } finally { btn.disabled = false; btn.textContent = 'PDF'; }
                    }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 'inherit', fontFamily: 'inherit' }}
                  >PDF</button> : '—'}
                </td>
                <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                  {r.gha_run_id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <a href={`https://github.com/dbarrett-art/prospect-research/actions/runs/${r.gha_run_id}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} style={{ color: 'var(--text-secondary)' }} />
                      </a>
                      <button
                        onClick={() => fetchLogs(r.id)}
                        title="View GHA logs"
                        style={{
                          background: 'transparent', border: 'none',
                          color: 'var(--text-tertiary)', cursor: 'pointer',
                          padding: 4, borderRadius: 4, transition: '80ms',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                      >
                        <FileText size={13} />
                      </button>
                    </div>
                  ) : '—'}
                </td>
                {userProfile?.role === 'admin' && (
                  <td style={{ padding: '11px 8px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {r.status === 'complete' && (
                        <button
                          onClick={() => navigate(`/briefs/${r.id}`)}
                          title="View brief"
                          style={{
                            background: 'transparent', border: 'none',
                            color: 'var(--text-tertiary)', cursor: 'pointer',
                            padding: 4, borderRadius: 4, transition: '80ms',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                        >
                          <Eye size={13} />
                        </button>
                      )}
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
                        </>
                      )}
                      {r.status === 'failed' && (
                        <button
                          onClick={() => handleRetry(r)}
                          title="Retry failed run (no credit cost)"
                          disabled={retrying === r.id}
                          style={{
                            background: 'transparent', border: 'none',
                            color: 'var(--text-tertiary)', cursor: 'pointer',
                            padding: 4, borderRadius: 4, transition: '80ms',
                            opacity: retrying === r.id ? 0.4 : 1,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                        >
                          <RotateCcw size={13} style={retrying === r.id ? { animation: 'spin 1s linear infinite' } : undefined} />
                        </button>
                      )}
                      <div data-reassign-dropdown style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                          onClick={() => setReassigning(reassigning === r.id ? null : r.id)}
                          title="Reassign to different user"
                          style={{
                            background: 'transparent', border: 'none',
                            color: 'var(--text-tertiary)', cursor: 'pointer',
                            padding: 4, borderRadius: 4, transition: '80ms',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                        >
                          <UserCheck size={13} />
                        </button>
                        {reassigning === r.id && (
                          <div style={{
                            position: 'absolute', right: 0, top: '100%', zIndex: 50,
                            background: 'var(--bg-surface)', border: '1px solid var(--border)',
                            borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            minWidth: 180, padding: 4, maxHeight: 240, overflowY: 'auto',
                          }}>
                            {monitorUsers.map(u => (
                              <button
                                key={u.id}
                                onClick={() => handleReassign(r.id, u.id)}
                                style={{
                                  display: 'block', width: '100%', textAlign: 'left',
                                  padding: '6px 10px', background: u.id === r.user_id ? 'var(--bg-elevated)' : 'none',
                                  border: 'none', cursor: 'pointer', fontSize: 12,
                                  color: 'var(--text-primary)', borderRadius: 4,
                                  fontWeight: u.id === r.user_id ? 600 : 400,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                                onMouseLeave={e => (e.currentTarget.style.background = u.id === r.user_id ? 'var(--bg-elevated)' : 'none')}
                              >
                                {u.name || u.email}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
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
            background: '#0F1117', border: '1px solid #1F2937',
            borderRadius: 8, width: '80vw', maxWidth: 900, height: '70vh',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '14px 18px', borderBottom: '1px solid #1F2937',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: 500, color: '#E5E7EB' }}>GHA Logs — {logData?.company || 'Loading...'}</div>
                {logData?.gha_run_id && (
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
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
                    background: 'transparent', border: '1px solid #374151',
                    color: '#9CA3AF', padding: '3px 10px',
                    fontSize: 11, borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  ↻ Refresh
                </button>
                <CopyLogsButton logs={logData?.logs || ''} />
                {logData?.gha_url && (
                  <a href={logData.gha_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: 'var(--accent)' }}>
                    Open in GitHub
                  </a>
                )}
                <button onClick={() => setLogModal(null)} style={{
                  background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer',
                }}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={{
              flex: 1, overflowY: 'auto', padding: '12px 16px',
              background: '#0F1117', margin: 0,
            }}>
              {logsLoading ? (
                <div style={{ color: '#9CA3AF', fontSize: 12, fontFamily: 'monospace' }}>Loading logs...</div>
              ) : logData?.error ? (
                <div style={{ color: '#F87171', fontSize: 12, fontFamily: 'monospace' }}>{logData.error}</div>
              ) : logData?.logs ? (
                logData.logs.split('\n').map((line, i) => {
                  const m = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)/s);
                  const content = m ? m[2] : line;
                  let color = '#E5E7EB';
                  if (/\[Module|MODULE/.test(content)) color = '#60A5FA';
                  else if (/error|Error|failed|Failed/.test(content)) color = '#F87171';
                  else if (/✓|complete|Complete|success|Success/.test(content)) color = '#34D399';
                  else if (/\[jobs\]|\[articles\]/.test(content)) color = '#A78BFA';
                  if (m) {
                    return (
                      <div key={i} style={{ display: 'flex', gap: 12, lineHeight: 1.5 }}>
                        <span style={{
                          color: '#4B5563', fontSize: 10, fontFamily: 'monospace',
                          whiteSpace: 'nowrap', flexShrink: 0, paddingTop: 1,
                        }}>
                          {m[1].slice(11, 23)}
                        </span>
                        <span style={{
                          color, fontSize: 11, fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        }}>
                          {m[2]}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div key={i} style={{
                      color: content.trim() ? color : 'transparent',
                      fontSize: 11, fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap', lineHeight: 1.5,
                    }}>
                      {content || '\u00A0'}
                    </div>
                  );
                })
              ) : (
                <div style={{ color: '#9CA3AF', fontSize: 12, fontFamily: 'monospace' }}>No logs available</div>
              )}
            </div>
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
        const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
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
        const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/briefs`, {
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
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
  const [apolloUsage, setApolloUsage] = useState<{ credits_used: number; monthly_credit_limit: number; free_tier_limit?: number; percent_used: number; month: string } | null>(null);

  const fetchCredits = async () => {
    setLoading(true);
    try {
      const [creditsRes, apolloRes] = await Promise.all([
        workerFetch('/api-credits'),
        workerFetch('/apollo-usage'),
      ]);
      const data = await creditsRes.json();
      setCredits(data.credits || []);
      setFetchedAt(data.fetched_at || new Date().toISOString());
      try {
        const apolloData = await apolloRes.json();
        if (!apolloData.error) setApolloUsage(apolloData);
      } catch { /* apollo_usage table may not exist yet */ }
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
      {apolloUsage && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderLeft: `3px solid ${apolloUsage.percent_used >= 100 ? 'var(--status-failed)' : apolloUsage.percent_used >= 80 ? 'var(--status-running-text)' : 'var(--status-complete)'}`,
          borderRadius: 8, padding: 18, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: 'var(--bg-elevated)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, color: 'var(--accent)',
            }}>A</div>
            <div>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Apollo Enrichment Credits</span>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>Email lookup (bulk_match) — People Search is free</div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{apolloUsage.month}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: apolloUsage.percent_used >= 100 ? 'var(--status-failed)' : apolloUsage.percent_used >= 80 ? 'var(--status-running-text)' : 'var(--text-primary)' }}>
            {apolloUsage.credits_used} / {apolloUsage.monthly_credit_limit ?? apolloUsage.free_tier_limit} credits ({apolloUsage.percent_used}%)
          </div>
          <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4, transition: 'width 0.3s',
              width: `${Math.min(apolloUsage.percent_used, 100)}%`,
              background: apolloUsage.percent_used >= 100 ? 'var(--status-failed)' : apolloUsage.percent_used >= 80 ? 'var(--status-running-text)' : 'var(--accent)',
            }} />
          </div>
        </div>
      )}
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

// --- Tab: Assign Briefs ---
interface AssignRun {
  id: string;
  company: string;
  created_at: string;
  assigned_to: string | null;
  assigned_user_name: string | null;
}

function AssignBriefsTab() {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [runs, setRuns] = useState<AssignRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  if (userProfile?.role !== 'admin') return null;

  // Load users on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('users').select('id, name, email').order('name');
      if (data) setUsers(data as { id: string; name: string; email: string }[]);
    })();
  }, []);

  // Load completed runs when a user is selected
  useEffect(() => {
    if (!selectedUser) { setRuns([]); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('runs')
        .select('id, company, created_at, assigned_to')
        .eq('status', 'complete')
        .order('created_at', { ascending: false });

      if (data) {
        // Build a map of user names for assigned_to
        const userMap = new Map(users.map(u => [u.id, u.name]));
        setRuns((data as any[]).map(r => ({
          ...r,
          assigned_user_name: r.assigned_to ? (userMap.get(r.assigned_to) || 'Unknown') : null,
        })));
      }
      setLoading(false);
    })();
  }, [selectedUser, users]);

  const handleAssign = async (runId: string) => {
    setUpdating(runId);
    const res = await workerFetch('/assign-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: runId, user_id: selectedUser }),
    });
    if (res.ok) {
      setRuns(prev => prev.map(r => r.id === runId ? {
        ...r,
        assigned_to: selectedUser,
        assigned_user_name: users.find(u => u.id === selectedUser)?.name || 'Unknown',
      } : r));
    }
    setUpdating(null);
  };

  const handleUnassign = async (runId: string) => {
    setUpdating(runId);
    const res = await workerFetch('/assign-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: runId, user_id: null }),
    });
    if (res.ok) {
      setRuns(prev => prev.map(r => r.id === runId ? { ...r, assigned_to: null, assigned_user_name: null } : r));
    }
    setUpdating(null);
  };

  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 6,
    padding: '6px 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none',
  };

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
          Select user to assign briefs to
        </label>
        <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} style={{ ...selectStyle, minWidth: 280 }}>
          <option value="">Select a user</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
          ))}
        </select>
      </div>

      {selectedUser && loading && <TableSkeleton rows={4} cols={4} />}

      {selectedUser && !loading && runs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No completed runs found.
        </div>
      )}

      {selectedUser && !loading && runs.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {['Company', 'Run date', 'Assigned to', 'Action'].map(h => (
                  <th key={h} style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map(r => {
                const isAssignedToSelected = r.assigned_to === selectedUser;
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500 }}>{r.company}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {r.assigned_user_name || '\u2014'}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      {isAssignedToSelected ? (
                        <button
                          onClick={() => handleUnassign(r.id)}
                          disabled={updating === r.id}
                          style={{
                            background: 'transparent', border: '1px solid var(--border-strong)',
                            color: 'var(--text-secondary)', padding: '4px 12px',
                            fontSize: 12, borderRadius: 6, cursor: 'pointer',
                            opacity: updating === r.id ? 0.4 : 1,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--status-failed)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                          Unassign
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAssign(r.id)}
                          disabled={updating === r.id}
                          style={{
                            background: 'var(--accent)', border: 'none',
                            color: '#fff', padding: '4px 12px',
                            fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: 'pointer',
                            opacity: updating === r.id ? 0.4 : 1,
                          }}
                        >
                          Assign
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// --- Feedback Tab ---

const SECTION_LABELS: Record<string, string> = {
  about: 'About', why_anything: 'Why Anything', why_now: 'Why Now',
  why_figma: 'Why Figma', whitespace: 'Whitespace', value_pyramid: 'Value Pyramid',
  contact_matrix: 'Contact Matrix', research_deep_dive: 'Research Deep Dive',
};

// --- Tab: Prompts ---
const PROMPT_FILE_LABELS: Record<string, { label: string; path: string }> = {
  module1_system: { label: 'M1 System Prompt', path: 'prompts/module1_system.txt' },
  figma_expertise: { label: 'Figma Expertise', path: 'config/figma_expertise.md' },
  company_pov: { label: 'POV Framework', path: 'config/company_pov.md' },
  hook_research: { label: 'Hook Research', path: 'config/hook_research.md' },
  persona_discovery: { label: 'Persona Discovery', path: 'config/persona_discovery.md' },
};

function PromptsTab() {
  const [selectedFile, setSelectedFile] = useState<string>('module1_system');
  const [content, setContent] = useState('');
  const [loadedContent, setLoadedContent] = useState('');
  const [sha, setSha] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const loadFile = useCallback(async (filename: string) => {
    setLoading(true);
    setSaveStatus('idle');
    setErrorMsg('');
    try {
      const res = await workerFetch(`/admin/prompt/${filename}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      const data = await res.json();
      setContent(data.content);
      setLoadedContent(data.content);
      setSha(data.sha);
    } catch (err: any) {
      setErrorMsg(err.message);
      setContent('');
      setLoadedContent('');
      setSha('');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadFile(selectedFile); }, [selectedFile, loadFile]);

  const hasChanges = content !== loadedContent;

  const save = async () => {
    setSaveStatus('saving');
    setErrorMsg('');
    try {
      const res = await workerFetch(`/admin/prompt/${selectedFile}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, sha }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      const data = await res.json();
      setSha(data.sha);
      setLoadedContent(content);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMsg(err.message);
    }
  };

  const charCount = content.length;
  const tokenEst = Math.round(charCount / 4);
  const meta = PROMPT_FILE_LABELS[selectedFile];

  return (
    <>
      {/* File selector pills */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap',
      }}>
        {Object.entries(PROMPT_FILE_LABELS).map(([key, { label }]) => {
          const active = selectedFile === key;
          const dirty = active && hasChanges;
          return (
            <button key={key} onClick={() => { if (!active) setSelectedFile(key); }} style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 500,
              borderRadius: 20, border: 'none',
              background: active ? '#6c47ff' : 'var(--bg-elevated)',
              color: active ? '#fff' : 'var(--text-secondary)',
              cursor: active ? 'default' : 'pointer',
              transition: 'all 100ms',
              position: 'relative',
            }}>
              {label}
              {dirty && (
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: '#f59e0b', marginLeft: 6, verticalAlign: 'middle',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12,
        fontSize: 12, color: 'var(--text-secondary)',
      }}>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', opacity: 0.7 }}>{meta?.path}</span>
        <span>{charCount.toLocaleString()} chars</span>
        <span>~{tokenEst.toLocaleString()} tokens</span>
        <div style={{ flex: 1 }} />
        {hasChanges && (
          <button onClick={() => { setContent(loadedContent); setSaveStatus('idle'); }} style={{
            background: 'transparent', border: 'none', color: 'var(--text-secondary)',
            fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
          }}>
            Discard
          </button>
        )}
        <button onClick={save} disabled={saveStatus === 'saving' || !hasChanges} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: hasChanges ? 'var(--accent)' : 'var(--bg-elevated)',
          color: hasChanges ? '#fff' : 'var(--text-secondary)',
          border: 'none', padding: '6px 14px', borderRadius: 6,
          fontSize: 12, fontWeight: 500, cursor: hasChanges ? 'pointer' : 'default',
          opacity: saveStatus === 'saving' ? 0.7 : 1,
        }}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved \u2713' : 'Save'}
        </button>
      </div>

      {/* Error message */}
      {errorMsg && (
        <div style={{
          background: 'rgba(220,38,38,0.1)', color: '#dc2626',
          padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 12,
        }}>
          {errorMsg}
        </div>
      )}

      {/* Editor */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          Loading...
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%', minHeight: 'calc(100vh - 320px)',
            fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", "Consolas", monospace)',
            fontSize: 12, lineHeight: 1.6,
            padding: 16, border: '1px solid var(--border)',
            borderRadius: 8, background: 'var(--bg-surface)',
            color: 'var(--text-primary)', resize: 'vertical',
            outline: 'none', tabSize: 2,
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        />
      )}
    </>
  );
}

function FeedbackTab() {
  const [feedback, setFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await workerFetch('/feedback');
        if (res.ok) setFeedback(await res.json());
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  // Summary stats
  const totalWithFeedback = feedback.filter(f => f.section_feedback && Object.keys(f.section_feedback).length > 0).length;
  const avgOverall = feedback.filter(f => f.overall_score != null).reduce((sum, f, _, arr) => sum + f.overall_score / arr.length, 0);
  const avgRating = feedback.filter(f => f.rating != null).reduce((sum, f, _, arr) => sum + f.rating / arr.length, 0);

  // Most flagged section
  const sectionDownCounts: Record<string, number> = {};
  for (const f of feedback) {
    if (!f.section_feedback) continue;
    for (const [key, val] of Object.entries(f.section_feedback) as [string, any][]) {
      if (val?.score === -1) sectionDownCounts[key] = (sectionDownCounts[key] || 0) + 1;
    }
  }
  const mostFlagged = Object.entries(sectionDownCounts).sort((a, b) => b[1] - a[1])[0];

  const exportCsv = () => {
    const sectionKeys = Object.keys(SECTION_LABELS);
    const headers = ['run_id', 'company', 'ae_email', 'overall_score', 'overall_rating',
      ...sectionKeys.flatMap(k => [`${k}_score`, `${k}_comment`]),
      'comment', 'created_at'];
    const rows = feedback.map(f => {
      const sf = f.section_feedback || {};
      return [
        f.run_id, f.company, f.user_email, f.overall_score ?? '', f.rating ?? '',
        ...sectionKeys.flatMap(k => [sf[k]?.score ?? '', (sf[k]?.comment ?? '').replace(/"/g, '""')]),
        (f.comment ?? '').replace(/"/g, '""'), f.created_at,
      ].map(v => typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n')) ? `"${v}"` : v);
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `brief-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <TableSkeleton />;

  return (
    <>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Briefs with feedback', value: totalWithFeedback },
          { label: 'Avg overall score', value: avgOverall ? `${(avgOverall * 100).toFixed(0)}%` : '\u2014' },
          { label: 'Avg star rating', value: avgRating ? `${avgRating.toFixed(1)}/5` : '\u2014' },
          { label: 'Most flagged section', value: mostFlagged ? `${SECTION_LABELS[mostFlagged[0]] || mostFlagged[0]} (${mostFlagged[1]})` : '\u2014' },
        ].map(card => (
          <div key={card.label} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Export button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={exportCsv} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--accent)', color: '#fff', border: 'none',
          padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Feedback table */}
      {feedback.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No feedback submitted yet.</p>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {['Company', 'AE', 'Overall Score', 'Star Rating', 'Sections Rated', 'Date', ''].map(h => (
                  <th key={h} style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {feedback.map(f => {
                const sf = f.section_feedback || {};
                const rated = Object.values(sf).filter((v: any) => v?.score !== 0);
                const thumbsUp = (rated as any[]).filter(v => v?.score === 1).length;
                const isExpanded = expandedId === f.id;
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500 }}>{f.company}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{f.user_email}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>
                      {rated.length > 0 ? `${thumbsUp}/${rated.length}` : '\u2014'}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>
                      {f.rating ? `${f.rating}/5` : '\u2014'}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>{rated.length}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {new Date(f.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : f.id)}
                        style={{
                          background: 'transparent', border: '1px solid var(--border)',
                          padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {isExpanded ? 'Hide' : 'Details'}
                      </button>
                      {isExpanded && (
                        <div style={{
                          position: 'absolute', right: 40, marginTop: 8,
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          borderRadius: 8, padding: 16, minWidth: 320, zIndex: 20,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Section Feedback</div>
                          {Object.entries(SECTION_LABELS).map(([key, label]) => {
                            const sv = sf[key];
                            if (!sv || sv.score === 0) return null;
                            return (
                              <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12 }}>
                                <span style={{ width: 120, color: 'var(--text-secondary)' }}>{label}</span>
                                <span style={{ color: sv.score === 1 ? '#059669' : '#dc2626' }}>
                                  {sv.score === 1 ? '👍' : '👎'}
                                </span>
                                {sv.comment && <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{sv.comment}</span>}
                              </div>
                            );
                          })}
                          {f.comment && (
                            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                              <strong>Comment:</strong> {f.comment}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
  { id: 'assign', label: 'Assign Briefs', icon: Link },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  { id: 'prompts', label: 'Prompts', icon: FileText },
];

export default function Admin() {
  usePageTitle('Admin');
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const isMobile = useWindowWidth() <= 768;

  return (
    <Layout>
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Admin</h1>
      </div>

      {isMobile ? (
        /* ─── Mobile: horizontal scrollable pill tabs ─── */
        <div style={{
          display: 'flex', gap: 8, marginBottom: 24,
          overflowX: 'auto', whiteSpace: 'nowrap',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 4,
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
        }}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: '7px 14px', fontSize: 12, fontWeight: 500,
                borderRadius: 20, border: 'none', flexShrink: 0,
                background: active ? '#6c47ff' : 'var(--bg-elevated)',
                color: active ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer', transition: 'all 100ms',
              }}>
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : (
        /* ─── Desktop: underline tabs ─── */
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
      )}

      {activeTab === 'users' && <UsersTab adminId={userProfile?.id || ''} />}
      {activeTab === 'runs' && <RunMonitorTab />}
      {activeTab === 'health' && <HealthTab />}
      {activeTab === 'credits' && <CreditAnalyticsTab />}
      {activeTab === 'api-credits' && <ApiCreditsTab />}
      {activeTab === 'assign' && <AssignBriefsTab />}
      {activeTab === 'feedback' && <FeedbackTab />}
      {activeTab === 'prompts' && <PromptsTab />}
    </Layout>
  );
}
