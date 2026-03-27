import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import { Users, Activity, Heart, BarChart3, ExternalLink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Tab = 'users' | 'runs' | 'health' | 'credits';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  manager_id: string | null;
  credits_remaining: number;
}

interface RunRow {
  id: string;
  company: string;
  created_at: string;
  completed_at: string | null;
  status: 'queued' | 'running' | 'complete' | 'failed';
  error_message: string | null;
  pdf_url: string | null;
  gha_run_id: string | null;
  user_id: string;
  users?: { name: string; email: string };
}

interface CreditGrant {
  id: string;
  created_at: string;
  amount: number;
  note: string | null;
  granted_by: string;
  granted_to: string;
  granter?: { name: string };
  grantee?: { name: string };
}

function formatDuration(created: string, completed: string | null): string {
  if (!completed) return '—';
  const ms = new Date(completed).getTime() - new Date(created).getTime();
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return mins > 0 ? `${mins}m ${remainSecs}s` : `${remainSecs}s`;
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

// --- Tab: Users ---
function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [managers, setManagers] = useState<UserRow[]>([]);
  const [grantAmounts, setGrantAmounts] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('users').select('*').order('name');
      if (data) {
        setUsers(data as UserRow[]);
        setManagers((data as UserRow[]).filter((u) => u.role === 'manager' || u.role === 'admin'));
      }
    })();
  }, []);

  const updateRole = async (userId: string, role: string) => {
    await supabase.from('users').update({ role }).eq('id', userId);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
  };

  const updateManager = async (userId: string, managerId: string | null) => {
    await supabase.from('users').update({ manager_id: managerId || null }).eq('id', userId);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, manager_id: managerId } : u)));
  };

  const grantCredits = async (userId: string) => {
    const amount = grantAmounts[userId] || 0;
    if (amount < 1 || amount > 20) return;
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    await supabase.from('users').update({ credits_remaining: user.credits_remaining + amount }).eq('id', userId);
    await supabase.from('credit_grants').insert({ granted_to: userId, granted_by: userId, amount, note: 'Admin grant' });
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, credits_remaining: u.credits_remaining + amount } : u)));
    setGrantAmounts((prev) => ({ ...prev, [userId]: 0 }));
  };

  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 6,
    padding: '4px 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none',
  };

  return (
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
                  <input
                    type="number" min={1} max={20}
                    value={grantAmounts[u.id] || ''}
                    onChange={(e) => setGrantAmounts((prev) => ({ ...prev, [u.id]: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                    style={{ ...selectStyle, width: 56 }}
                  />
                  <button
                    onClick={() => grantCredits(u.id)}
                    style={{
                      background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)',
                      padding: '4px 10px', fontSize: 12, borderRadius: 6,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >
                    Grant
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Tab: Run Monitor ---
function RunMonitorTab() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('runs')
        .select('id, company, created_at, completed_at, status, error_message, pdf_url, gha_run_id, user_id, users(name, email)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (data) setRuns(data as unknown as RunRow[]);
    })();
  }, []);

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
              {['User', 'Company', 'Status', 'Submitted', 'Duration', 'PDF', 'GHA'].map((h) => (
                <th key={h} style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}
                style={{
                  borderBottom: '1px solid var(--border)',
                  borderLeft: r.status === 'failed' ? '2px solid var(--status-failed)' : 'none',
                  transition: 'background 80ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{r.users?.name || '—'}</td>
                <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500 }}>{r.company}</td>
                <td style={{ padding: '11px 16px' }} title={r.error_message || ''}><StatusBadge status={r.status} /></td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }} title={new Date(r.created_at).toLocaleString()}>
                  {relativeTime(r.created_at)}
                </td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {formatDuration(r.created_at, r.completed_at)}
                </td>
                <td style={{ padding: '11px 16px' }}>
                  {r.pdf_url ? <a href={r.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>PDF</a> : '—'}
                </td>
                <td style={{ padding: '11px 16px' }}>
                  {r.gha_run_id ? (
                    <a href={`https://github.com/dbarrett-art/prospect-research/actions/runs/${r.gha_run_id}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} style={{ color: 'var(--text-secondary)' }} />
                    </a>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Tab: Service Health ---
function HealthTab() {
  const [services, setServices] = useState<{ name: string; status: 'ok' | 'error' | 'pending'; checked: string }[]>([]);
  const [dailyRuns, setDailyRuns] = useState<{ date: string; count: number }[]>([]);

  useEffect(() => {
    // Check worker health
    (async () => {
      const checks = [
        { name: 'Cloudflare Worker', url: 'https://go.accountresearch.workers.dev/health' },
      ];

      type ServiceStatus = 'ok' | 'error' | 'pending';
      const results: { name: string; status: ServiceStatus; checked: string }[] = await Promise.all(
        checks.map(async (c) => {
          try {
            const res = await fetch(c.url);
            return { name: c.name, status: (res.ok ? 'ok' : 'error') as ServiceStatus, checked: new Date().toISOString() };
          } catch {
            return { name: c.name, status: 'error' as ServiceStatus, checked: new Date().toISOString() };
          }
        })
      );

      // Add static services we can't ping from browser
      results.push(
        { name: 'Supabase', status: 'ok', checked: new Date().toISOString() },
        { name: 'GitHub Actions', status: 'pending', checked: new Date().toISOString() },
        { name: 'Google Drive', status: 'pending', checked: new Date().toISOString() },
      );
      setServices(results);
    })();

    // Daily runs chart
    (async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from('runs')
        .select('created_at')
        .gte('created_at', since);
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((r: any) => {
          const d = r.created_at.slice(0, 10);
          counts[d] = (counts[d] || 0) + 1;
        });
        const chart = Object.entries(counts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count }));
        setDailyRuns(chart);
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
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(s.status) }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{s.status}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Last checked: {relativeTime(s.checked)}
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Runs per day (last 30 days)</h3>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dailyRuns}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="date" tick={{ fill: '#8b8b8b', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fill: '#8b8b8b', fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: '#e8e8e8' }}
              itemStyle={{ color: '#8b8b8b' }}
            />
            <Bar dataKey="count" fill="#5e6ad2" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// --- Tab: Credit Analytics ---
function CreditAnalyticsTab() {
  const [weekRuns, setWeekRuns] = useState(0);
  const [monthRuns, setMonthRuns] = useState(0);
  const [userCredits, setUserCredits] = useState<{ name: string; credits_remaining: number; runs: number }[]>([]);
  const [grants, setGrants] = useState<CreditGrant[]>([]);
  const [perUserChart, setPerUserChart] = useState<{ name: string; credits: number }[]>([]);

  useEffect(() => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    (async () => {
      // Week runs
      const { count: wc } = await supabase.from('runs').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo);
      setWeekRuns(wc || 0);

      // Month runs
      const { count: mc } = await supabase.from('runs').select('id', { count: 'exact', head: true }).gte('created_at', monthAgo);
      setMonthRuns(mc || 0);

      // Users + their run counts
      const { data: users } = await supabase.from('users').select('id, name, credits_remaining');
      const { data: runs } = await supabase.from('runs').select('user_id').gte('created_at', monthAgo);
      if (users) {
        const runCounts: Record<string, number> = {};
        (runs || []).forEach((r: any) => { runCounts[r.user_id] = (runCounts[r.user_id] || 0) + 1; });
        setUserCredits((users as any[]).map((u) => ({
          name: u.name,
          credits_remaining: u.credits_remaining,
          runs: runCounts[u.id] || 0,
        })));
        setPerUserChart((users as any[]).map((u) => ({
          name: u.name?.split(' ')[0] || 'Unknown',
          credits: runCounts[u.id] || 0,
        })).filter((x) => x.credits > 0));
      }

      // Grant history
      const { data: grantData } = await supabase
        .from('credit_grants')
        .select('id, created_at, amount, note, granted_by, granted_to')
        .order('created_at', { ascending: false })
        .limit(50);
      if (grantData) setGrants(grantData as CreditGrant[]);
    })();
  }, []);

  const statCard = (label: string, value: string) => (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, flex: 1 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );

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
          <div style={{ height: 200, marginBottom: 24 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perUserChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="name" tick={{ fill: '#8b8b8b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#8b8b8b', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="credits" fill="#5e6ad2" radius={[3, 3, 0, 0]} />
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
              <tr key={i}
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: u.credits_remaining === 0 ? 'rgba(217,119,6,0.06)' : 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = u.credits_remaining === 0 ? 'rgba(217,119,6,0.1)' : 'var(--bg-elevated)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = u.credits_remaining === 0 ? 'rgba(217,119,6,0.06)' : 'transparent')}
              >
                <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500 }}>{u.name}</td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: u.credits_remaining === 0 ? 'var(--status-running-text)' : 'var(--text-primary)' }}>
                  {u.credits_remaining}
                </td>
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
                  {['Amount', 'Note', 'Date'].map((h) => (
                    <th key={h} style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
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

// --- Main Admin Page ---
const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'runs', label: 'Run Monitor', icon: Activity },
  { id: 'health', label: 'Service Health', icon: Heart },
  { id: 'credits', label: 'Credit Analytics', icon: BarChart3 },
];

export default function Admin() {
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
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 500,
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'color 80ms',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'runs' && <RunMonitorTab />}
      {activeTab === 'health' && <HealthTab />}
      {activeTab === 'credits' && <CreditAnalyticsTab />}
    </Layout>
  );
}
