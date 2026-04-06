import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { workerFetch } from '../lib/supabase';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { ChevronRight, FileText } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface RunEntry {
  id: string;
  company: string;
  url: string | null;
  created_at: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  summary: string | null;
  pdf_url: string | null;
  icp_score: string | null;
}

interface UserStats {
  run_count: number;
  strong_count: number;
  latest_run: string | null;
}

interface TreeNode {
  user: TeamUser;
  runs?: RunEntry[];
  reports?: TreeNode[];
  stats: UserStats;
}

interface TeamHierarchyResponse {
  me: TeamUser;
  tree: TreeNode[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');
}

/** Recursively count all runs in a subtree */
function countAllRuns(node: TreeNode): number {
  let count = node.runs?.length || 0;
  if (node.reports) {
    for (const r of node.reports) count += countAllRuns(r);
  }
  return count;
}

/** Recursively count Strong ICP runs in a subtree */
function countAllStrong(node: TreeNode): number {
  let count = node.stats.strong_count;
  if (node.reports) {
    for (const r of node.reports) count += countAllStrong(r);
  }
  return count;
}

/** Find latest run date across a subtree */
function latestRunDate(node: TreeNode): string | null {
  let latest = node.stats.latest_run;
  if (node.reports) {
    for (const r of node.reports) {
      const sub = latestRunDate(r);
      if (sub && (!latest || sub > latest)) latest = sub;
    }
  }
  return latest;
}

// ─── ICP Badge ──────────────────────────────────────────────────────────────

const icpColors: Record<string, { bg: string; text: string }> = {
  Strong: { bg: 'rgba(22,163,74,0.12)', text: '#16a34a' },
  Moderate: { bg: 'rgba(217,119,6,0.12)', text: '#d97706' },
  Weak: { bg: 'rgba(220,38,38,0.12)', text: '#dc2626' },
};

function IcpBadge({ score }: { score: string | null }) {
  if (!score) return <span style={{ color: 'var(--text-disabled)', fontSize: 12 }}>--</span>;
  const c = icpColors[score] || { bg: 'rgba(100,100,100,0.1)', text: 'var(--text-secondary)' };
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 4,
      fontSize: 11, fontWeight: 500, background: c.bg, color: c.text,
    }}>
      {score}
    </span>
  );
}

// ─── Chevron ────────────────────────────────────────────────────────────────

function ExpandChevron({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', padding: 2, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 150ms ease',
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
      }}
    >
      <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
    </button>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({ name, isManager }: { name: string; isManager: boolean }) {
  const bg = isManager ? 'rgba(139,92,246,0.18)' : 'rgba(59,130,246,0.15)';
  const color = isManager ? '#a78bfa' : '#60a5fa';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: bg, color, flexShrink: 0,
    }}>
      {initials(name)}
    </span>
  );
}

// ─── Brief Row (leaf) ───────────────────────────────────────────────────────

function BriefRow({ run, indent }: { run: RunEntry; indent: number }) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        paddingLeft: indent, paddingRight: 16, paddingTop: 8, paddingBottom: 8,
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 80ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={() => navigate(`/briefs/${run.id}`)}
    >
      <span style={{ fontSize: 13, fontWeight: 500, minWidth: 140 }}>{run.company}</span>
      <span style={{ flex: '0 0 auto' }}><StatusBadge status={run.status} /></span>
      <span style={{ flex: '0 0 auto' }}><IcpBadge score={run.icp_score} /></span>
      <span style={{
        flex: 1, fontSize: 12, color: 'var(--text-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {run.summary ? (run.summary.length > 60 ? run.summary.slice(0, 60) + '...' : run.summary) : ''}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
        {relativeTime(run.created_at)}
      </span>
      <span style={{ flexShrink: 0, width: 24, display: 'flex', justifyContent: 'center' }}>
        {run.pdf_url ? (
          <button
            title="Download PDF"
            onClick={async (e) => {
              e.stopPropagation();
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
            <FileText size={14} style={{ color: 'var(--text-secondary)' }} />
          </button>
        ) : (
          <FileText size={14} style={{ color: 'var(--text-disabled)' }} />
        )}
      </span>
    </div>
  );
}

// ─── User Row (expandable — AE or Manager) ──────────────────────────────────

function UserRow({
  node, indent, expanded, onToggle, allExpanded,
}: {
  node: TreeNode;
  indent: number;
  expanded: boolean;
  onToggle: () => void;
  allExpanded: boolean | null;
}) {
  const hasChildren = (node.reports && node.reports.length > 0) || (node.runs && node.runs.length > 0);
  const isManager = !!(node.reports && node.reports.length > 0);
  const totalRuns = countAllRuns(node);
  const totalStrong = countAllStrong(node);
  const latest = latestRunDate(node);

  // Track child expansion state
  const [childExpanded, setChildExpanded] = useState<Record<string, boolean>>({});

  // Respond to "expand all" / "collapse all"
  useEffect(() => {
    if (allExpanded === null) return;
    if (node.reports) {
      const next: Record<string, boolean> = {};
      for (const r of node.reports) next[r.user.id] = allExpanded;
      setChildExpanded(next);
    }
  }, [allExpanded, node.reports]);

  const toggleChild = useCallback((id: string) => {
    setChildExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div>
      {/* This user's row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingLeft: indent, paddingRight: 16, paddingTop: 10, paddingBottom: 10,
          borderBottom: '1px solid var(--border)',
          background: isManager && indent === 16 ? 'var(--bg-surface)' : 'transparent',
          cursor: hasChildren ? 'pointer' : 'default',
          transition: 'background 80ms',
        }}
        onClick={hasChildren ? onToggle : undefined}
        onMouseEnter={e => {
          if (hasChildren) e.currentTarget.style.background = 'var(--bg-elevated)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = isManager && indent === 16 ? 'var(--bg-surface)' : 'transparent';
        }}
      >
        <span style={{ width: 18, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          {hasChildren ? <ExpandChevron open={expanded} onClick={onToggle} /> : null}
        </span>
        <Avatar name={node.user.name} isManager={isManager} />
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
          {node.user.name}
          <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>
            {node.user.role === 'manager' ? 'Manager' : node.user.role === 'admin' ? 'Admin' : 'AE'}
          </span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
          <span>{totalRuns} brief{totalRuns !== 1 ? 's' : ''}</span>
          {totalStrong > 0 && (
            <span style={{ color: '#16a34a' }}>{totalStrong} Strong</span>
          )}
          {latest && (
            <span style={{ color: 'var(--text-tertiary)' }}>Last: {relativeTime(latest)}</span>
          )}
        </span>
      </div>

      {/* Expanded children */}
      {expanded && (
        <>
          {/* Sub-reports (manager has AE reports) */}
          {node.reports?.map(report => (
            <UserRow
              key={report.user.id}
              node={report}
              indent={indent + 24}
              expanded={!!childExpanded[report.user.id]}
              onToggle={() => toggleChild(report.user.id)}
              allExpanded={allExpanded}
            />
          ))}
          {/* Direct runs for this user (if they also have runs alongside reports) */}
          {node.runs?.map(run => (
            <BriefRow key={run.id} run={run} indent={indent + 48} />
          ))}
          {/* Empty state */}
          {!node.reports?.length && !node.runs?.length && (
            <div style={{
              paddingLeft: indent + 48, paddingTop: 12, paddingBottom: 12,
              fontSize: 12, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)',
            }}>
              {isManager ? 'No direct reports found' : 'No briefs yet'}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TeamView() {
  usePageTitle('Team View');
  const { userProfile } = useAuth();
  const [data, setData] = useState<TeamHierarchyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      try {
        const res = await workerFetch('/team-hierarchy');
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json: TeamHierarchyResponse = await res.json();
        setData(json);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load team hierarchy';
        setError(msg);
        console.warn('[TeamView] Failed to load hierarchy, falling back:', msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [userProfile]);

  const toggleNode = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    setAllExpanded(null); // clear bulk toggle when manually toggling
  }, []);

  const expandAll = useCallback(() => {
    if (!data) return;
    const next: Record<string, boolean> = {};
    for (const node of data.tree) {
      next[node.user.id] = true;
      if (node.reports) {
        for (const r of node.reports) next[r.user.id] = true;
      }
    }
    setExpanded(next);
    setAllExpanded(true);
  }, [data]);

  const collapseAll = useCallback(() => {
    setExpanded({});
    setAllExpanded(false);
  }, []);

  if (loading) {
    return <Layout><TableSkeleton rows={6} cols={4} /></Layout>;
  }

  if (error || !data) {
    return (
      <Layout>
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24 }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Team View</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          {error || 'No hierarchy data available.'}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Team View</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={expandAll}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Collapse all
          </button>
        </div>
      </div>

      {data.tree.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No team members found.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {data.tree.map(node => (
            <UserRow
              key={node.user.id}
              node={node}
              indent={16}
              expanded={!!expanded[node.user.id]}
              onToggle={() => toggleNode(node.user.id)}
              allExpanded={allExpanded}
            />
          ))}
        </div>
      )}
    </Layout>
  );
}
