import { useState, useMemo } from 'react';
import { ChevronRight, X, ExternalLink } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DebugEvent {
  ts: string;
  elapsedMs: number;
  event: string;
  [key: string]: any;
}

interface DebugData {
  company: string;
  generatedAt: string;
  totalEvents: number;
  events: DebugEvent[];
}

type PostItStatus = 'survived' | 'discarded' | 'unused';

interface PostIt {
  id: string;
  title: string;
  subtitle: string;
  stage: string;
  status: PostItStatus;
  reason?: string;
  detail?: any;
  tier?: string;
  function?: string;
}

interface Column {
  id: string;
  title: string;
  inCount: number;
  survivedCount: number;
  discardedCount: number;
  unusedCount: number;
  postIts: PostIt[];
}

/* ------------------------------------------------------------------ */
/*  Extract post-its from debug events                                 */
/* ------------------------------------------------------------------ */

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function extractColumns(data: DebugData): Column[] {
  const events = data.events || [];
  const columns: Column[] = [];

  // --- Column 1: Sources Found ---
  const webSearchEvents = events.filter(e => e.event === 'm1:web_search');
  const newsFilteredEvent = events.find(e => e.event === 'm1:news_filtered');
  const sourceUsageEvent = events.find(e => e.event === 'm1:source_usage');

  if (webSearchEvents.length > 0 || newsFilteredEvent) {
    // Collect all unique URLs from web searches
    const allSources = new Map<string, { url: string; title: string; query: string }>();
    for (const ev of webSearchEvents) {
      for (const r of (ev.results || [])) {
        if (r.url && !allSources.has(r.url)) {
          allSources.set(r.url, { url: r.url, title: r.title || getDomain(r.url), query: ev.query });
        }
      }
    }

    // Build used/unused sets from source_usage
    const usedUrls = new Set<string>();
    const unusedUrls = new Set<string>();
    if (sourceUsageEvent) {
      for (const s of (sourceUsageEvent.usedSources || [])) {
        usedUrls.add(s.url);
      }
      for (const s of (sourceUsageEvent.unusedSources || [])) {
        unusedUrls.add(s.url);
      }
    }

    const sourcePostIts: PostIt[] = [];
    for (const [url, info] of allSources) {
      let status: PostItStatus = 'unused';
      if (usedUrls.has(url)) status = 'survived';
      else if (sourceUsageEvent) status = 'unused'; // explicitly not used
      // If no source_usage event, we can't determine — default to survived
      if (!sourceUsageEvent) status = 'survived';

      sourcePostIts.push({
        id: `src-${url}`,
        title: truncate(info.title, 45),
        subtitle: getDomain(url),
        stage: 'sources',
        status,
        reason: status === 'unused' ? 'Not cited in POV' : undefined,
        detail: { url, title: info.title, query: info.query },
      });
    }

    // Sort: survived first, then unused
    sourcePostIts.sort((a, b) => statusOrder(a.status) - statusOrder(b.status));

    const survived = sourcePostIts.filter(p => p.status === 'survived').length;
    const unused = sourcePostIts.filter(p => p.status === 'unused').length;

    columns.push({
      id: 'sources',
      title: 'Sources Found',
      inCount: sourcePostIts.length,
      survivedCount: survived,
      discardedCount: 0,
      unusedCount: unused,
      postIts: sourcePostIts,
    });
  }

  // --- Column 2: Distillation (source usage) ---
  if (sourceUsageEvent) {
    const used = (sourceUsageEvent.usedSources || []).map((s: any, i: number): PostIt => ({
      id: `dist-used-${i}`,
      title: truncate(s.title || getDomain(s.url), 45),
      subtitle: getDomain(s.url),
      stage: 'distillation',
      status: 'survived',
      detail: s,
    }));

    const unused = (sourceUsageEvent.unusedSources || []).map((s: any, i: number): PostIt => ({
      id: `dist-unused-${i}`,
      title: truncate(s.title || getDomain(s.url), 45),
      subtitle: getDomain(s.url),
      stage: 'distillation',
      status: 'unused',
      reason: 'Gathered but not cited',
      detail: s,
    }));

    const all = [...used, ...unused];

    columns.push({
      id: 'distillation',
      title: 'Distillation',
      inCount: sourceUsageEvent.totalSourcesFound || all.length,
      survivedCount: sourceUsageEvent.sourcesUsedInPov || used.length,
      discardedCount: 0,
      unusedCount: unused.length,
      postIts: all,
    });
  }

  // --- Column 3: Contacts Found (M2 matrix) ---
  const matrixSnapshots = events.filter(e => e.event === 'm2:matrix_snapshot');
  const formerSkipsM2 = events.find(e => e.event === 'm2:former_skips');
  const reconciliation = events.find(e => e.event === 'm2:contact_reconciliation');
  const gapsEvent = events.find(e => e.event === 'gaps:detected');

  if (matrixSnapshots.length > 0) {
    // Use the final snapshot if available, else the first
    const snapshot = matrixSnapshots.find(e => e.label === 'final') || matrixSnapshots[matrixSnapshots.length - 1];
    const summary = snapshot.summary || {};
    const contactPostIts: PostIt[] = [];

    const formerNames = new Set<string>();
    if (formerSkipsM2?.skipped) {
      for (const s of formerSkipsM2.skipped) {
        formerNames.add(s.name);
      }
    }

    const reconNames = new Map<string, string>();
    if (reconciliation?.deduped) {
      for (const d of reconciliation.deduped) {
        for (const rm of (d.removedFrom || [])) {
          reconNames.set(`${d.name}-${rm}`, `Deduped → kept in ${d.primary}`);
        }
      }
    }

    for (const [fn, tiers] of Object.entries(summary) as [string, any][]) {
      for (const [tier, contacts] of Object.entries(tiers) as [string, any[]][]) {
        for (const c of contacts) {
          contactPostIts.push({
            id: `contact-${fn}-${tier}-${c.name}`,
            title: c.name,
            subtitle: truncate(c.title || '', 40),
            stage: 'contacts',
            status: 'survived',
            tier,
            function: fn,
            detail: c,
          });
        }
      }
    }

    // Add former employee skips as discarded
    if (formerSkipsM2?.skipped) {
      for (const s of formerSkipsM2.skipped) {
        contactPostIts.push({
          id: `contact-former-${s.name}`,
          title: s.name,
          subtitle: truncate(s.title || '', 40),
          stage: 'contacts',
          status: 'discarded',
          reason: s.reason || 'Former employee',
          tier: s.tier,
          function: s.fn,
          detail: s,
        });
      }
    }

    contactPostIts.sort((a, b) => statusOrder(a.status) - statusOrder(b.status));

    const survived = contactPostIts.filter(p => p.status === 'survived').length;
    const discarded = contactPostIts.filter(p => p.status === 'discarded').length;

    columns.push({
      id: 'contacts',
      title: 'Contacts Found',
      inCount: survived + discarded,
      survivedCount: survived,
      discardedCount: discarded,
      unusedCount: 0,
      postIts: contactPostIts,
    });
  }

  // --- Column 4: Enrichment (M3) ---
  const m3Complete = events.find(e => e.event === 'm3:complete');
  if (m3Complete) {
    const enrichPostIts: PostIt[] = [];

    // Matched contacts
    for (let i = 0; i < (m3Complete.matched || 0); i++) {
      enrichPostIts.push({
        id: `enrich-match-${i}`,
        title: `Matched contact ${i + 1}`,
        subtitle: 'Apollo enriched',
        stage: 'enrichment',
        status: 'survived',
      });
    }

    // Unmatched contacts
    for (let i = 0; i < (m3Complete.unmatched || 0); i++) {
      enrichPostIts.push({
        id: `enrich-unmatch-${i}`,
        title: `Unmatched contact ${i + 1}`,
        subtitle: 'No Apollo match',
        stage: 'enrichment',
        status: 'unused',
        reason: 'No Apollo match found',
      });
    }

    columns.push({
      id: 'enrichment',
      title: 'Enrichment',
      inCount: (m3Complete.matched || 0) + (m3Complete.unmatched || 0),
      survivedCount: m3Complete.matched || 0,
      discardedCount: 0,
      unusedCount: m3Complete.unmatched || 0,
      postIts: enrichPostIts,
    });
  }

  // --- Column 5: Hooks (M4) ---
  const m4Complete = events.find(e => e.event === 'm4:complete');
  if (m4Complete) {
    const hookPostIts: PostIt[] = [];

    const hooksOut = m4Complete.contactsOut || 0;
    const hooksIn = m4Complete.contactsIn || 0;
    const formerCount = m4Complete.formerSkips || 0;

    for (let i = 0; i < hooksOut; i++) {
      hookPostIts.push({
        id: `hook-out-${i}`,
        title: `Hook generated ${i + 1}`,
        subtitle: 'Ready for brief',
        stage: 'hooks',
        status: 'survived',
      });
    }

    for (let i = 0; i < formerCount; i++) {
      hookPostIts.push({
        id: `hook-former-${i}`,
        title: `Former employee ${i + 1}`,
        subtitle: 'Dropped at M4',
        stage: 'hooks',
        status: 'discarded',
        reason: 'Former employee detected in hook research',
      });
    }

    const unhooked = hooksIn - hooksOut - formerCount;
    for (let i = 0; i < Math.max(0, unhooked); i++) {
      hookPostIts.push({
        id: `hook-none-${i}`,
        title: `No hook ${i + 1}`,
        subtitle: 'Dropped',
        stage: 'hooks',
        status: 'discarded',
        reason: 'No hook generated',
      });
    }

    columns.push({
      id: 'hooks',
      title: 'Hooks Generated',
      inCount: hooksIn,
      survivedCount: hooksOut,
      discardedCount: formerCount + Math.max(0, unhooked),
      unusedCount: 0,
      postIts: hookPostIts,
    });
  }

  // --- Add gaps as warnings to the last contact column ---
  if (gapsEvent?.gaps && columns.find(c => c.id === 'contacts')) {
    const contactCol = columns.find(c => c.id === 'contacts')!;
    for (const gap of gapsEvent.gaps) {
      contactCol.postIts.push({
        id: `gap-${gap}`,
        title: 'Gap',
        subtitle: truncate(gap, 50),
        stage: 'contacts',
        status: 'discarded',
        reason: gap,
      });
    }
  }

  return columns;
}

function statusOrder(s: PostItStatus): number {
  return s === 'survived' ? 0 : s === 'unused' ? 1 : 2;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/* ------------------------------------------------------------------ */
/*  Colour helpers                                                     */
/* ------------------------------------------------------------------ */

function statusBg(status: PostItStatus, tier?: string): string {
  if (status === 'discarded') return 'rgba(220, 38, 38, 0.12)';
  if (status === 'unused') return 'rgba(217, 119, 6, 0.12)';
  // Survived — colour by tier if contact
  if (tier === 'eb') return 'rgba(13, 148, 136, 0.15)';
  if (tier === 'champion') return 'rgba(59, 130, 246, 0.15)';
  if (tier === 'coach') return 'rgba(217, 119, 6, 0.12)';
  return 'rgba(16, 185, 129, 0.12)'; // default survived green
}

function statusBorder(status: PostItStatus, tier?: string): string {
  if (status === 'discarded') return 'rgba(220, 38, 38, 0.25)';
  if (status === 'unused') return 'rgba(217, 119, 6, 0.25)';
  if (tier === 'eb') return 'rgba(13, 148, 136, 0.3)';
  if (tier === 'champion') return 'rgba(59, 130, 246, 0.3)';
  if (tier === 'coach') return 'rgba(217, 119, 6, 0.25)';
  return 'rgba(16, 185, 129, 0.25)';
}

function statusDot(status: PostItStatus): string {
  if (status === 'discarded') return '#dc2626';
  if (status === 'unused') return '#d97706';
  return '#10b981';
}

/* ------------------------------------------------------------------ */
/*  Seeded random for consistent tilt                                  */
/* ------------------------------------------------------------------ */

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return ((h & 0x7fffffff) % 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/*  PostIt Card                                                        */
/* ------------------------------------------------------------------ */

function PostItCard({ postIt, onClick }: { postIt: PostIt; onClick: () => void }) {
  const tilt = (seededRandom(postIt.id) - 0.5) * 4; // ±2 degrees
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={postIt.reason || postIt.subtitle}
      style={{
        width: 130,
        minHeight: 72,
        padding: '8px 10px',
        borderRadius: 4,
        fontSize: 11,
        lineHeight: 1.35,
        background: statusBg(postIt.status, postIt.tier),
        border: `1px solid ${statusBorder(postIt.status, postIt.tier)}`,
        transform: `rotate(${hovered ? 0 : tilt}deg) ${hovered ? 'scale(1.05)' : ''}`,
        boxShadow: hovered
          ? '2px 4px 12px rgba(0,0,0,0.15)'
          : '1px 2px 4px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s',
        position: 'relative',
        textDecoration: postIt.status === 'discarded' ? 'line-through' : 'none',
        opacity: postIt.status === 'discarded' ? 0.7 : 1,
      }}
    >
      {/* Status dot */}
      <div style={{
        position: 'absolute', top: 6, right: 6,
        width: 6, height: 6, borderRadius: '50%',
        background: statusDot(postIt.status),
      }} />

      <div style={{
        fontWeight: 500, marginBottom: 3,
        color: 'var(--text-primary)',
        textDecoration: postIt.status === 'discarded' ? 'line-through' : 'none',
        paddingRight: 10,
      }}>
        {postIt.title}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.85 }}>
        {postIt.subtitle}
      </div>
      {postIt.tier && postIt.status !== 'discarded' && (
        <div style={{
          marginTop: 4, fontSize: 9, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.05em',
          color: postIt.tier === 'eb' ? '#0d9488' : postIt.tier === 'champion' ? '#3b82f6' : '#d97706',
        }}>
          {postIt.tier}
        </div>
      )}
      {postIt.status === 'discarded' && postIt.reason && (
        <div style={{
          marginTop: 4, fontSize: 9, color: '#dc2626', fontWeight: 500,
          textDecoration: 'none',
        }}>
          ✕ {truncate(postIt.reason, 35)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail Panel (click-to-expand)                                     */
/* ------------------------------------------------------------------ */

function DetailPanel({ postIt, onClose }: { postIt: PostIt; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
      background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
      zIndex: 100, padding: 20, overflowY: 'auto',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: statusDot(postIt.status),
          }} />
          <span style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            color: statusDot(postIt.status), letterSpacing: '0.05em',
          }}>
            {postIt.status}
          </span>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-tertiary)', padding: 4,
        }}>
          <X size={18} />
        </button>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
        {postIt.title}
      </h3>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        {postIt.subtitle}
      </div>

      {postIt.tier && (
        <div style={{
          display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px',
          borderRadius: 4, marginBottom: 12, textTransform: 'uppercase',
          background: statusBg('survived', postIt.tier),
          color: postIt.tier === 'eb' ? '#0d9488' : postIt.tier === 'champion' ? '#3b82f6' : '#d97706',
        }}>
          {postIt.tier} — {postIt.function}
        </div>
      )}

      {postIt.reason && (
        <div style={{
          padding: 10, borderRadius: 6, marginBottom: 12,
          background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.15)',
          fontSize: 12, color: '#dc2626',
        }}>
          {postIt.reason}
        </div>
      )}

      {postIt.detail?.url && (
        <a
          href={postIt.detail.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--accent)', marginBottom: 12,
            textDecoration: 'none',
          }}
        >
          <ExternalLink size={12} /> {postIt.detail.url}
        </a>
      )}

      {postIt.detail?.query && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>
            Search Query
          </div>
          <div style={{
            fontSize: 12, padding: 8, background: 'var(--bg-input)',
            borderRadius: 4, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
          }}>
            {postIt.detail.query}
          </div>
        </div>
      )}

      {postIt.detail && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>
            Raw Data
          </div>
          <pre style={{
            fontSize: 11, padding: 8, background: 'var(--bg-input)',
            borderRadius: 4, fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', maxHeight: 400, overflow: 'auto',
          }}>
            {JSON.stringify(postIt.detail, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Column Arrow                                                       */
/* ------------------------------------------------------------------ */

function ColumnArrow() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 24, alignSelf: 'stretch', paddingTop: 60,
    }}>
      <ChevronRight size={20} style={{ color: 'var(--text-tertiary)', opacity: 0.5 }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Column Component                                                   */
/* ------------------------------------------------------------------ */

const MAX_VISIBLE = 20;

function ColumnView({ column, onClickPostIt }: {
  column: Column;
  onClickPostIt: (p: PostIt) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? column.postIts : column.postIts.slice(0, MAX_VISIBLE);
  const hidden = column.postIts.length - MAX_VISIBLE;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      minWidth: 150, maxWidth: 170,
    }}>
      {/* Header */}
      <div style={{
        fontWeight: 600, fontSize: 13, color: 'var(--text-primary)',
        marginBottom: 2,
      }}>
        {column.title}
      </div>

      {/* Stats badge */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap',
        fontSize: 10, marginBottom: 6,
      }}>
        <span style={{
          padding: '2px 6px', borderRadius: 4,
          background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
        }}>
          {column.inCount} in
        </span>
        {column.survivedCount > 0 && (
          <span style={{
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(16,185,129,0.1)', color: '#10b981',
          }}>
            {column.survivedCount} kept
          </span>
        )}
        {column.discardedCount > 0 && (
          <span style={{
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(220,38,38,0.1)', color: '#dc2626',
          }}>
            {column.discardedCount} dropped
          </span>
        )}
        {column.unusedCount > 0 && (
          <span style={{
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(217,119,6,0.1)', color: '#d97706',
          }}>
            {column.unusedCount} unused
          </span>
        )}
      </div>

      {/* Post-its */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(p => (
          <PostItCard key={p.id} postIt={p} onClick={() => onClickPostIt(p)} />
        ))}
        {!showAll && hidden > 0 && (
          <button
            onClick={() => setShowAll(true)}
            style={{
              padding: '6px 10px', borderRadius: 4, fontSize: 11,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Show {hidden} more…
          </button>
        )}
        {showAll && hidden > 0 && (
          <button
            onClick={() => setShowAll(false)}
            style={{
              padding: '6px 10px', borderRadius: 4, fontSize: 11,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Show fewer
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Legend                                                              */
/* ------------------------------------------------------------------ */

function Legend() {
  const items = [
    { label: 'Survived / Used', color: 'rgba(16,185,129,0.12)', dot: '#10b981' },
    { label: 'Gathered / Unused', color: 'rgba(217,119,6,0.12)', dot: '#d97706' },
    { label: 'Discarded', color: 'rgba(220,38,38,0.12)', dot: '#dc2626' },
    { label: 'EB', color: 'rgba(13,148,136,0.15)', dot: '#0d9488' },
    { label: 'Champion', color: 'rgba(59,130,246,0.15)', dot: '#3b82f6' },
  ];

  return (
    <div style={{
      display: 'flex', gap: 16, padding: '8px 0', flexWrap: 'wrap',
    }}>
      {items.map(({ label, color, dot }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <div style={{
            width: 24, height: 16, borderRadius: 3,
            background: color, border: `1px solid ${dot}33`,
          }} />
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: dot,
          }} />
          <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <div style={{
      textAlign: 'center', padding: 60, color: 'var(--text-tertiary)',
    }}>
      <div style={{ fontSize: 14, marginBottom: 8 }}>No pipeline flow data available</div>
      <div style={{ fontSize: 12 }}>
        This debug file doesn't contain web search, source usage, or contact events.
        Try a more recent run with <code style={{ fontFamily: 'var(--font-mono)' }}>--debug</code>.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main PostItView                                                    */
/* ------------------------------------------------------------------ */

export default function PostItView({ data }: { data: DebugData }) {
  const columns = useMemo(() => extractColumns(data), [data]);
  const [selectedPostIt, setSelectedPostIt] = useState<PostIt | null>(null);

  if (columns.length === 0) return <EmptyState />;

  return (
    <div>
      <Legend />

      {/* Horizontal scrollable column layout */}
      <div style={{
        display: 'flex', gap: 0, overflowX: 'auto',
        padding: '16px 0', minHeight: 300,
      }}>
        {columns.map((col, i) => (
          <div key={col.id} style={{ display: 'flex' }}>
            {i > 0 && <ColumnArrow />}
            <ColumnView column={col} onClickPostIt={setSelectedPostIt} />
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {selectedPostIt && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelectedPostIt(null)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.2)', zIndex: 99,
            }}
          />
          <DetailPanel postIt={selectedPostIt} onClose={() => setSelectedPostIt(null)} />
        </>
      )}
    </div>
  );
}
