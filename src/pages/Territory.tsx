import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, workerFetch } from '../lib/supabase';
import Layout from '../components/Layout';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { Target, Eye, Map as MapIcon, Clock, ChevronUp, ChevronDown, RotateCcw, Users, Filter, Send } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TerritoryRow {
  company: string;
  url: string | null;
  run_id: string;
  created_at: string;
  icp_score: string | null;
  trigger_count: number;
  contact_count: number;
  has_contacts: boolean;
  pdf_url: string | null;
  brief_id: string | null;
  user_id: string | null;
  user_email: string | null;
}

type SortKey = 'company' | 'icp_score' | 'trigger_count' | 'contact_count' | 'age';
type SortDir = 'asc' | 'desc';
type IcpFilter = 'all' | 'Strong' | 'Moderate' | 'Weak';
type FreshnessFilter = 'all' | 'fresh' | 'review' | 'stale';
type ContactFilter = 'all' | 'with' | 'without';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ICP_ORDER: Record<string, number> = { Strong: 0, Moderate: 1, Weak: 2 };
const ICP_COLORS: Record<string, { bg: string; text: string }> = {
  Strong:   { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e' },
  Moderate: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
  Weak:     { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444' },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function ageDays(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function freshnessLabel(days: number): { label: string; color: string; bg: string } {
  if (days > 90) return { label: `Stale — ${days}d`, color: 'var(--status-failed-text)', bg: 'rgba(220,38,38,0.1)' };
  if (days > 30) return { label: `Review — ${days}d`, color: 'var(--status-running-text)', bg: 'rgba(217,119,6,0.1)' };
  if (days < 1) return { label: 'Today', color: 'var(--text-tertiary)', bg: 'transparent' };
  return { label: `${days}d ago`, color: 'var(--text-tertiary)', bg: 'transparent' };
}

function freshnessCategory(days: number): 'fresh' | 'review' | 'stale' {
  if (days > 90) return 'stale';
  if (days > 30) return 'review';
  return 'fresh';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Territory() {
  usePageTitle('Territory');
  const { userProfile, session } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState<TerritoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamView, setTeamView] = useState(false);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('icp_score');
  const [sortDir, setSortDir] = useState<SortDir>('asc'); // asc for ICP means Strong first

  // Filters
  const [icpFilter, setIcpFilter] = useState<IcpFilter>('all');
  const [freshnessFilter, setFreshnessFilter] = useState<FreshnessFilter>('all');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');

  // Admin: user filter
  const [userFilter, setUserFilter] = useState<string>('all');
  const [allUsers, setAllUsers] = useState<{ id: string; email: string }[]>([]);

  // Re-run state
  const [rerunConfirm, setRerunConfirm] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState<string | null>(null);

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'manager';

  /* ---------------------------------------------------------------- */
  /*  Data loading                                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Fetch completed runs with brief data in one query
      let query = supabase
        .from('runs')
        .select('id, company, url, created_at, status, pdf_url, brief_id, user_id, briefs(pov_json, hooks_json)')
        .eq('status', 'complete')
        .order('created_at', { ascending: false });

      if (!teamView && userProfile) {
        query = query.eq('user_id', userProfile.id);
      }

      const { data } = await query;
      if (!data) { setRows([]); setLoading(false); return; }

      // Deduplicate by company — keep latest run per company
      const seen = new Map<string, any>();
      for (const run of data) {
        const key = run.company?.toLowerCase().trim();
        if (key && !seen.has(key)) seen.set(key, run);
      }

      // Build territory rows
      const entries: TerritoryRow[] = [];
      for (const run of seen.values()) {
        // briefs comes as object (single) or array depending on Supabase join
        const brief = Array.isArray(run.briefs) ? run.briefs[0] : run.briefs;
        const pov = brief?.pov_json;
        const hooks = brief?.hooks_json;

        const icpScore = pov?.icp_fit?.score || null;
        const triggerCount = pov?.why_now?.triggers?.length || 0;
        const contacts = hooks?.contacts || [];
        const contactCount = contacts.length;

        entries.push({
          company: run.company,
          url: run.url || null,
          run_id: run.id,
          created_at: run.created_at,
          icp_score: icpScore,
          trigger_count: triggerCount,
          contact_count: contactCount,
          has_contacts: contactCount > 0,
          pdf_url: run.pdf_url,
          brief_id: run.brief_id,
          user_id: run.user_id,
          user_email: null, // populated below for admin
        });
      }

      // For admin team view, fetch user emails
      if (teamView && isAdmin) {
        const userIds = [...new Set(entries.map(e => e.user_id).filter(Boolean))] as string[];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, email')
            .in('id', userIds);
          const emailMap = new Map((profiles || []).map(p => [p.id, p.email]));
          for (const entry of entries) {
            entry.user_email = emailMap.get(entry.user_id || '') || null;
          }
          setAllUsers(
            (profiles || []).map(p => ({ id: p.id, email: p.email }))
              .sort((a, b) => a.email.localeCompare(b.email))
          );
        }
      }

      setRows(entries);
      setLoading(false);
    }
    load();
  }, [userProfile, teamView]);

  /* ---------------------------------------------------------------- */
  /*  Filtering                                                        */
  /* ---------------------------------------------------------------- */

  const filtered = rows.filter(r => {
    if (icpFilter !== 'all' && r.icp_score !== icpFilter) return false;
    if (freshnessFilter !== 'all' && freshnessCategory(ageDays(r.created_at)) !== freshnessFilter) return false;
    if (contactFilter === 'with' && !r.has_contacts) return false;
    if (contactFilter === 'without' && r.has_contacts) return false;
    if (userFilter !== 'all' && r.user_id !== userFilter) return false;
    return true;
  });

  /* ---------------------------------------------------------------- */
  /*  Sorting                                                          */
  /* ---------------------------------------------------------------- */

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'company':
        cmp = a.company.localeCompare(b.company);
        break;
      case 'icp_score': {
        const aO = ICP_ORDER[a.icp_score || ''] ?? 3;
        const bO = ICP_ORDER[b.icp_score || ''] ?? 3;
        cmp = aO - bO;
        // Secondary: trigger count desc
        if (cmp === 0) cmp = b.trigger_count - a.trigger_count;
        break;
      }
      case 'trigger_count':
        cmp = a.trigger_count - b.trigger_count;
        break;
      case 'contact_count':
        cmp = a.contact_count - b.contact_count;
        break;
      case 'age':
        cmp = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        break;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  /* ---------------------------------------------------------------- */
  /*  Sort toggle handler                                              */
  /* ---------------------------------------------------------------- */

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      // Default directions that make sense per column
      setSortDir(key === 'company' ? 'asc' : key === 'age' ? 'asc' : 'asc');
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Re-run handler                                                   */
  /* ---------------------------------------------------------------- */

  async function handleRerun(row: TerritoryRow) {
    if (!session || !row.url) return;
    setRerunning(row.run_id);
    try {
      const res = await workerFetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: row.company,
          url: row.url,
          include_contacts: true,
          market: 'auto',
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
  }

  /* ---------------------------------------------------------------- */
  /*  Summary stats                                                    */
  /* ---------------------------------------------------------------- */

  const stats = {
    total: rows.length,
    strong: rows.filter(r => r.icp_score === 'Strong').length,
    moderate: rows.filter(r => r.icp_score === 'Moderate').length,
    stale: rows.filter(r => ageDays(r.created_at) > 90).length,
  };

  /* ---------------------------------------------------------------- */
  /*  Render helpers                                                   */
  /* ---------------------------------------------------------------- */

  const thStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
    padding: '10px 16px', textAlign: 'left', whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none',
  };

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp size={12} style={{ opacity: 0.2, marginLeft: 2 }} />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} style={{ marginLeft: 2, color: 'var(--accent)' }} />
      : <ChevronDown size={12} style={{ marginLeft: 2, color: 'var(--accent)' }} />;
  }

  function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
      <button onClick={onClick} style={{
        fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 4,
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'rgba(94,106,210,0.12)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        cursor: 'pointer', transition: 'all 100ms',
      }}>
        {label}
      </button>
    );
  }

  const hasActiveFilters = icpFilter !== 'all' || freshnessFilter !== 'all' || contactFilter !== 'all' || userFilter !== 'all';

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Layout>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MapIcon size={18} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Territory</h1>
          {!loading && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 4 }}>
              {filtered.length}{filtered.length !== rows.length ? ` / ${rows.length}` : ''} accounts
            </span>
          )}
        </div>
        {isAdmin && (
          <button onClick={() => setTeamView(v => !v)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, padding: '4px 12px', borderRadius: 4,
            background: teamView ? 'var(--accent)' : 'transparent',
            color: teamView ? '#fff' : 'var(--text-secondary)',
            border: teamView ? 'none' : '1px solid var(--border-strong)',
            cursor: 'pointer', transition: 'all 100ms',
          }}>
            <Users size={12} />
            {teamView ? 'All users' : 'My accounts'}
          </button>
        )}
      </div>

      {loading ? <TableSkeleton rows={6} cols={6} /> : rows.length === 0 ? (
        /* Empty state */
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <MapIcon size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>No briefs yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>Submit your first research request to build your territory.</div>
          <button
            onClick={() => navigate('/submit')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: '#fff', padding: '6px 14px',
              fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none',
              cursor: 'pointer', transition: 'background 120ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
          >
            <Send size={13} /> Submit request
          </button>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            <SummaryCard label="Total accounts" value={stats.total} color="var(--text-primary)" />
            <SummaryCard label="Strong ICP" value={stats.strong} color="#22c55e" />
            <SummaryCard label="Moderate ICP" value={stats.moderate} color="#f59e0b" />
            <SummaryCard label="Stale (90d+)" value={stats.stale} color="var(--status-failed-text)" />
          </div>

          {/* Filter bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12 }}>
            <Filter size={13} style={{ color: 'var(--text-tertiary)' }} />

            <FilterChip label="All ICP" active={icpFilter === 'all'} onClick={() => setIcpFilter('all')} />
            <FilterChip label="Strong" active={icpFilter === 'Strong'} onClick={() => setIcpFilter('Strong')} />
            <FilterChip label="Moderate" active={icpFilter === 'Moderate'} onClick={() => setIcpFilter('Moderate')} />
            <FilterChip label="Weak" active={icpFilter === 'Weak'} onClick={() => setIcpFilter('Weak')} />

            <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

            <FilterChip label="All ages" active={freshnessFilter === 'all'} onClick={() => setFreshnessFilter('all')} />
            <FilterChip label="Fresh" active={freshnessFilter === 'fresh'} onClick={() => setFreshnessFilter('fresh')} />
            <FilterChip label="Review" active={freshnessFilter === 'review'} onClick={() => setFreshnessFilter('review')} />
            <FilterChip label="Stale" active={freshnessFilter === 'stale'} onClick={() => setFreshnessFilter('stale')} />

            <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

            <FilterChip label="All" active={contactFilter === 'all'} onClick={() => setContactFilter('all')} />
            <FilterChip label="Has contacts" active={contactFilter === 'with'} onClick={() => setContactFilter('with')} />
            <FilterChip label="No contacts" active={contactFilter === 'without'} onClick={() => setContactFilter('without')} />

            {/* Admin: user filter */}
            {teamView && isAdmin && allUsers.length > 0 && (
              <>
                <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
                <select
                  value={userFilter}
                  onChange={e => setUserFilter(e.target.value)}
                  style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 4,
                    border: '1px solid var(--border)', background: 'var(--bg-surface)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  <option value="all">All users</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>
              </>
            )}

            {hasActiveFilters && (
              <button onClick={() => { setIcpFilter('all'); setFreshnessFilter('all'); setContactFilter('all'); setUserFilter('all'); }} style={{
                fontSize: 11, color: 'var(--accent)', background: 'transparent', border: 'none',
                cursor: 'pointer', textDecoration: 'underline', padding: '3px 4px',
              }}>
                Clear filters
              </button>
            )}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No accounts match the current filters.
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                      <th style={thStyle} onClick={() => toggleSort('company')}>
                        Company <SortIcon col="company" />
                      </th>
                      <th style={{ ...thStyle, textAlign: 'center' }} onClick={() => toggleSort('icp_score')}>
                        ICP Score <SortIcon col="icp_score" />
                      </th>
                      <th style={{ ...thStyle, textAlign: 'center' }} onClick={() => toggleSort('trigger_count')}>
                        Triggers <SortIcon col="trigger_count" />
                      </th>
                      <th style={{ ...thStyle, textAlign: 'center' }} onClick={() => toggleSort('contact_count')}>
                        Contacts <SortIcon col="contact_count" />
                      </th>
                      <th style={thStyle} onClick={() => toggleSort('age')}>
                        Age <SortIcon col="age" />
                      </th>
                      {teamView && isAdmin && <th style={{ ...thStyle, cursor: 'default' }}>User</th>}
                      <th style={{ ...thStyle, textAlign: 'center', cursor: 'default', width: 80 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(row => {
                      const icpColor = ICP_COLORS[row.icp_score || ''] || { bg: 'rgba(74,74,74,0.15)', text: 'var(--text-tertiary)' };
                      const age = ageDays(row.created_at);
                      const freshness = freshnessLabel(age);

                      return (
                        <tr key={row.run_id}
                          style={{ borderBottom: '1px solid var(--border)', transition: 'background 80ms' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          {/* Company */}
                          <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500 }}>
                            <span
                              style={{ cursor: 'pointer', transition: 'color 80ms' }}
                              onClick={() => navigate(`/briefs/${row.run_id}`)}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'inherit')}
                            >
                              {row.company}
                            </span>
                          </td>

                          {/* ICP Score */}
                          <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                            {row.icp_score ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 4,
                                background: icpColor.bg, color: icpColor.text,
                              }}>
                                <Target size={10} /> {row.icp_score}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>—</span>
                            )}
                          </td>

                          {/* Triggers */}
                          <td style={{ padding: '11px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
                            {row.trigger_count || '—'}
                          </td>

                          {/* Contacts */}
                          <td style={{ padding: '11px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
                            {row.contact_count || '—'}
                          </td>

                          {/* Age / Freshness */}
                          <td style={{ padding: '11px 16px' }}>
                            {age > 30 ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                fontSize: 11, fontWeight: 500, padding: '1px 6px', borderRadius: 3,
                                color: freshness.color, background: freshness.bg,
                              }}>
                                <Clock size={10} /> {freshness.label}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                {freshness.label}
                              </span>
                            )}
                          </td>

                          {/* User (admin team view) */}
                          {teamView && isAdmin && (
                            <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={row.user_email || ''}>
                              {row.user_email ? row.user_email.split('@')[0] : '—'}
                            </td>
                          )}

                          {/* Actions */}
                          <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                              <button
                                onClick={() => navigate(`/briefs/${row.run_id}`)}
                                title="View brief"
                                style={{
                                  background: 'transparent', border: 'none',
                                  color: 'var(--text-secondary)', cursor: 'pointer',
                                  padding: 4, borderRadius: 4,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                              >
                                <Eye size={14} />
                              </button>
                              {row.url && (
                                <button
                                  onClick={() => setRerunConfirm(row.run_id)}
                                  title="Re-run with fresh data"
                                  disabled={rerunning === row.run_id}
                                  style={{
                                    background: 'transparent', border: 'none',
                                    color: 'var(--text-tertiary)', cursor: 'pointer',
                                    padding: 4, borderRadius: 4,
                                    opacity: rerunning === row.run_id ? 0.4 : 1,
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                                >
                                  <RotateCcw size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Re-run confirmation modal */}
      {rerunConfirm && (() => {
        const row = rows.find(r => r.run_id === rerunConfirm);
        if (!row) return null;
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
          }} onClick={() => setRerunConfirm(null)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 24, width: 360,
            }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>Re-run with fresh data?</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
                This will re-run the pipeline for <strong>{row.company}</strong> without using cached data. This uses 1 credit.
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
                  onClick={() => handleRerun(row)}
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

/* ------------------------------------------------------------------ */
/*  Summary card sub-component                                         */
/* ------------------------------------------------------------------ */

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>
        {value}
      </div>
    </div>
  );
}
