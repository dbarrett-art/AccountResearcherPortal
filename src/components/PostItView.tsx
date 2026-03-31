import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, X, ExternalLink, Search } from 'lucide-react';

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

interface QueryGroup {
  category: string;
  query: string;
  results: { url: string; title: string; snippet?: string }[];
  keptCount: number;
  unusedCount: number;
  droppedCount: number;
}

/* ------------------------------------------------------------------ */
/*  Query categorisation — maps query strings to human-readable labels */
/* ------------------------------------------------------------------ */

function categoriseQuery(query: string): string {
  const q = query.toLowerCase();

  // Q1: Investor relations & strategic direction
  if ((q.includes('annual report') || q.includes('investor day') || q.includes('earnings call') || q.includes('capital markets day')) && q.includes('strategy'))
    return 'Investor relations';

  // Q2: Press releases & announcements
  if (q.includes('press release') || q.includes('newsroom') || (q.includes('announces') && (q.includes('appoints') || q.includes('launches') || q.includes('acquires'))))
    return 'Press releases';

  // Q3: Product scale & user metrics
  if ((q.includes('million users') || q.includes('million customers') || q.includes('million downloads') || q.includes('mau') || q.includes('dau') || q.includes('active users') || q.includes('transactions per') || q.includes('nps')) && (q.includes('app') || q.includes('platform') || q.includes('digital')))
    return 'Product scale';

  // Q4: Executive leadership & voices
  if ((q.includes('ceo') || q.includes('cto') || q.includes('cpo') || q.includes('cdo') || q.includes('chief design') || q.includes('vp product') || q.includes('vp design') || q.includes('head of design')) && (q.includes('interview') || q.includes('podcast') || q.includes('keynote') || q.includes('fireside') || q.includes('panel')))
    return 'Executive voices';

  // Q5: Design system & tooling — must check before generic design
  if (q.includes('design system') || q.includes('component library') || q.includes('design tokens') || q.includes('designops') || q.includes('penpot') || (q.includes('figma') && (q.includes('migration') || q.includes('enterprise') || q.includes('governance'))))
    return 'Design tooling';

  // Q9: Figma enterprise signals — check before generic figma
  if (q.includes('figma') && (q.includes('dev mode') || q.includes('variables') || q.includes('branching') || q.includes('analytics') || q.includes('enterprise') || q.includes('admin') || q.includes('sso') || q.includes('license')))
    return 'Figma signals';

  // Q6: Engineering blogs & developer content
  if (q.includes('engineering blog') || q.includes('tech blog') || (q.includes('frontend') && (q.includes('react') || q.includes('storybook'))) || q.includes('design engineering') || q.includes('dev.to'))
    return 'Engineering';

  // Q7: Multi-brand architecture
  if (q.includes('multi-brand') || q.includes('white-label') || q.includes('sub-brand') || q.includes('brand architecture') || q.includes('brand consolidation'))
    return 'Multi-brand';

  // Q8: Design friction & pain points
  if ((q.includes('design') || q.includes('ux') || q.includes('product')) && (q.includes('inconsistent') || q.includes('duplication') || q.includes('rework') || q.includes('handoff') || q.includes('bottleneck') || q.includes('fragmented')))
    return 'Design friction';

  // Q10: Leadership changes
  if ((q.includes('ceo') || q.includes('chief executive') || q.includes('cto') || q.includes('cpo') || q.includes('cdo')) && (q.includes('appointed') || q.includes('started') || q.includes('joined') || q.includes('replaced') || q.includes('new')))
    return 'Leadership';

  // Q11: Financial performance
  if ((q.includes('revenue') || q.includes('profit') || q.includes('growth') || q.includes('annual results') || q.includes('earnings')) && (q.includes('2024') || q.includes('2025') || q.includes('fy202')))
    return 'Financial';

  // Q12: Regulatory/compliance
  if (q.includes('regulator') || q.includes('fca') || q.includes('ecb') || q.includes('compliance') || q.includes('enforcement') || q.includes('dora') || q.includes('sanction'))
    return 'Regulatory';

  // Q13: Technology partnerships
  if (q.includes('partnered with') || q.includes('powered by') || q.includes('built on') || q.includes('integration with') || q.includes('migrated to'))
    return 'Partnerships';

  // Q14: Tech stack & architecture
  if (q.includes('microservices') || q.includes('tech stack') || q.includes('architecture') || q.includes('kubernetes') || q.includes('platform engineering'))
    return 'Tech stack';

  // Q15: Org restructuring & transformation
  if (q.includes('transformation') || q.includes('restructuring') || q.includes('reorganisation') || q.includes('new operating model') || q.includes('efficiency programme'))
    return 'Transformation';

  // Q16: Customer/user experience investment
  if ((q.includes('app') || q.includes('website') || q.includes('digital')) && (q.includes('redesign') || q.includes('relaunch') || q.includes('new look') || q.includes('user experience') || q.includes('accessibility') || q.includes('wcag')))
    return 'UX investment';

  // Design hiring (first query in intelligence — uses different format)
  if (q.includes('design') && (q.includes('hiring') || q.includes('designer') || q.includes('jobs')))
    return 'Design hiring';

  // Org structure queries (from getOrgStructure)
  if (q.includes('subsidiaries') || q.includes('business divisions') || q.includes('operating segments') || q.includes('headcount'))
    return 'Org structure';

  // --- Additional categories to reduce "Other" bucket ---

  // AI / machine learning investment
  if (q.includes('ai') || q.includes('machine learning') || q.includes('llm') || q.includes('generative') || q.includes('artificial intelligence') || q.includes('copilot'))
    return 'AI investment';

  // Acquisitions & M&A
  if (q.includes('acqui') || q.includes('merger') || q.includes('m&a') || q.includes('takeover') || q.includes('buyout'))
    return 'M&A activity';

  // Hiring / talent
  if (q.includes('hiring') || q.includes('recruit') || q.includes('talent') || q.includes('workforce') || q.includes('headcount'))
    return 'Hiring signals';

  // Product launches
  if (q.includes('launch') || q.includes('new product') || q.includes('new feature') || q.includes('release') || q.includes('beta'))
    return 'Product launches';

  // Sustainability / ESG
  if (q.includes('sustainability') || q.includes('esg') || q.includes('carbon') || q.includes('net zero') || q.includes('climate'))
    return 'Sustainability';

  // Cloud / infrastructure
  if (q.includes('cloud') || q.includes('aws') || q.includes('azure') || q.includes('gcp') || q.includes('infrastructure') || q.includes('saas'))
    return 'Cloud & infra';

  // Customer experience / CX
  if (q.includes('customer experience') || q.includes('cx') || q.includes('nps') || q.includes('customer satisfaction'))
    return 'Customer experience';

  // Mobile / app
  if (q.includes('mobile app') || q.includes('ios') || q.includes('android') || q.includes('react native') || q.includes('flutter'))
    return 'Mobile';

  // Security
  if (q.includes('security') || q.includes('cyber') || q.includes('zero trust') || q.includes('soc 2') || q.includes('iso 27001'))
    return 'Security';

  // Instead of "Other", use a truncated query text
  return '';
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

function truncateQuery(query: string, max: number): string {
  if (query.length <= max) return query;
  // Try to truncate at a word boundary
  const cut = query.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut) + '\u2026';
}

function extractQueryGroups(data: DebugData): { groups: QueryGroup[]; totalSources: number; hasWebSearch: boolean } {
  const events = data.events || [];
  const webSearchEvents = events.filter(e => e.event === 'm1:web_search');
  const sourceUsageEvent = events.find(e => e.event === 'm1:source_usage');

  if (webSearchEvents.length === 0) return { groups: [], totalSources: 0, hasWebSearch: false };

  // Build used/unused URL sets
  const usedUrls = new Set<string>();
  const gatheredUrls = new Set<string>(); // in distilled intel but not cited
  if (sourceUsageEvent) {
    for (const s of (sourceUsageEvent.usedSources || [])) usedUrls.add(s.url);
    for (const s of (sourceUsageEvent.unusedSources || [])) gatheredUrls.add(s.url);
  }

  // Group results by category
  const categoryMap = new Map<string, { query: string; results: Map<string, { url: string; title: string; snippet?: string }> }>();
  const allUrls = new Set<string>();

  for (const ev of webSearchEvents) {
    let cat = categoriseQuery(ev.query || '');
    // For uncategorised queries, use truncated query text as category name
    if (!cat) cat = truncateQuery(ev.query || 'Unknown query', 30);

    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { query: ev.query || '', results: new Map() });
    }
    const group = categoryMap.get(cat)!;
    for (const r of (ev.results || [])) {
      if (r.url && !group.results.has(r.url)) {
        group.results.set(r.url, { url: r.url, title: r.title || getDomain(r.url), snippet: r.snippet });
        allUrls.add(r.url);
      }
    }
  }

  const groups: QueryGroup[] = [];
  for (const [category, data] of categoryMap) {
    let kept = 0, unused = 0, dropped = 0;
    const results = Array.from(data.results.values());

    for (const r of results) {
      if (usedUrls.has(r.url)) kept++;
      else if (gatheredUrls.has(r.url)) unused++;
      else if (sourceUsageEvent) dropped++;
      else kept++; // no source_usage event — can't determine
    }

    groups.push({
      category,
      query: data.query,
      results,
      keptCount: kept,
      unusedCount: unused,
      droppedCount: dropped,
    });
  }

  // Sort: most results first, then alphabetical
  groups.sort((a, b) => b.results.length - a.results.length || a.category.localeCompare(b.category));

  return { groups, totalSources: allUrls.size, hasWebSearch: true };
}

function extractColumns(data: DebugData): Column[] {
  const events = data.events || [];
  const columns: Column[] = [];

  // --- Sources + Distillation handled separately (via QueryGroups) ---
  // We still need to add placeholder columns for the arrow layout
  const webSearchEvents = events.filter(e => e.event === 'm1:web_search');
  const newsFilteredEvent = events.find(e => e.event === 'm1:news_filtered');
  const sourceUsageEvent = events.find(e => e.event === 'm1:source_usage');

  // For legacy runs without web_search events, fall back to old behaviour
  if (webSearchEvents.length === 0 && (newsFilteredEvent || sourceUsageEvent)) {
    // Legacy Sources column from news_filtered
    if (newsFilteredEvent) {
      const sourcePostIts: PostIt[] = [];
      const kept = newsFilteredEvent.kept || [];
      const removed = newsFilteredEvent.removed || [];

      for (const s of kept) {
        sourcePostIts.push({
          id: `src-kept-${s.url || s.title}`,
          title: truncate(s.title || '', 45),
          subtitle: s.url ? getDomain(s.url) : '',
          stage: 'sources',
          status: 'survived',
          detail: s,
        });
      }
      for (const s of removed) {
        sourcePostIts.push({
          id: `src-rm-${s.url || s.title}`,
          title: truncate(s.title || '', 45),
          subtitle: s.url ? getDomain(s.url) : '',
          stage: 'sources',
          status: 'discarded',
          reason: s.reason || 'Filtered',
          detail: s,
        });
      }

      columns.push({
        id: 'sources',
        title: 'Sources Found',
        inCount: sourcePostIts.length,
        survivedCount: kept.length,
        discardedCount: removed.length,
        unusedCount: 0,
        postIts: sourcePostIts,
      });
    }

    // Legacy Distillation column
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

      columns.push({
        id: 'distillation',
        title: 'Distillation',
        inCount: sourceUsageEvent.totalSourcesFound || (used.length + unused.length),
        survivedCount: sourceUsageEvent.sourcesUsedInPov || used.length,
        discardedCount: 0,
        unusedCount: unused.length,
        postIts: [...used, ...unused],
      });
    }
  }

  // --- Column 3: Contacts Found (M2 matrix) ---
  const matrixSnapshots = events.filter(e => e.event === 'm2:matrix_snapshot');
  const formerSkipsM2 = events.find(e => e.event === 'm2:former_skips');
  const gapsEvent = events.find(e => e.event === 'gaps:detected');

  if (matrixSnapshots.length > 0) {
    const snapshot = matrixSnapshots.find(e => e.label === 'final') || matrixSnapshots[matrixSnapshots.length - 1];
    const summary = snapshot.summary || {};
    const contactPostIts: PostIt[] = [];

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

    for (let i = 0; i < (m3Complete.matched || 0); i++) {
      enrichPostIts.push({
        id: `enrich-match-${i}`,
        title: `Matched contact ${i + 1}`,
        subtitle: 'Apollo enriched',
        stage: 'enrichment',
        status: 'survived',
      });
    }

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
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

/* ------------------------------------------------------------------ */
/*  Colour helpers                                                     */
/* ------------------------------------------------------------------ */

function statusBg(status: PostItStatus, tier?: string): string {
  if (status === 'discarded') return 'rgba(220, 38, 38, 0.12)';
  if (status === 'unused') return 'rgba(217, 119, 6, 0.12)';
  if (tier === 'eb') return 'rgba(13, 148, 136, 0.15)';
  if (tier === 'champion') return 'rgba(59, 130, 246, 0.15)';
  if (tier === 'coach') return 'rgba(217, 119, 6, 0.12)';
  return 'rgba(16, 185, 129, 0.12)';
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
/*  Source status helper                                                */
/* ------------------------------------------------------------------ */

function sourceStatusColor(url: string, usedUrls: Set<string>, gatheredUrls: Set<string>, hasSourceUsage: boolean): PostItStatus {
  if (!hasSourceUsage) return 'survived';
  if (usedUrls.has(url)) return 'survived';
  if (gatheredUrls.has(url)) return 'unused';
  return 'discarded';
}

/* ------------------------------------------------------------------ */
/*  Level 1: Compact Query Category Card                               */
/* ------------------------------------------------------------------ */

function QueryCategoryCard({ group, isExpanded, onToggle, usedUrls, gatheredUrls, hasSourceUsage, onClickSource, sonnetDecisions, opusDecisions }: {
  group: QueryGroup;
  isExpanded: boolean;
  onToggle: () => void;
  usedUrls: Set<string>;
  gatheredUrls: Set<string>;
  hasSourceUsage: boolean;
  onClickSource: (postIt: PostIt) => void;
  sonnetDecisions: Map<string, { decision: string; reasoning: string; droppedBy?: string }>;
  opusDecisions: Map<string, { decision: string; reasoning: string; used_in_sections?: string[] }>;
}) {
  const total = group.results.length;
  const barTotal = Math.max(1, total);
  const citedPct = (group.keptCount / barTotal) * 100;
  const gatheredPct = (group.unusedCount / barTotal) * 100;
  const droppedPct = (group.droppedCount / barTotal) * 100;

  // Build stats string
  const parts: string[] = [];
  if (group.keptCount > 0) parts.push(`${group.keptCount} cited`);
  if (group.unusedCount > 0) parts.push(`${group.unusedCount} gathered`);
  if (group.droppedCount > 0) parts.push(`${group.droppedCount} dropped`);

  return (
    <div style={{
      borderRadius: 6,
      border: `1px solid ${isExpanded ? 'var(--accent, #3b82f6)' : 'var(--border)'}`,
      background: 'var(--bg-surface)',
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      {/* Level 1: Compact header — always visible */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* Title row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
        }}>
          <Search size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-primary)',
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {group.category}
          </span>
          <span style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            flexShrink: 0,
            fontWeight: 500,
          }}>
            {total}
          </span>
          {isExpanded
            ? <ChevronDown size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            : <ChevronRight size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          }
        </div>

        {/* Horizontal ratio bar */}
        <div style={{
          width: '100%',
          height: 4,
          borderRadius: 2,
          background: 'var(--bg-elevated)',
          overflow: 'hidden',
          display: 'flex',
        }}>
          {citedPct > 0 && (
            <div style={{ width: `${citedPct}%`, height: '100%', background: '#10b981' }} />
          )}
          {gatheredPct > 0 && (
            <div style={{ width: `${gatheredPct}%`, height: '100%', background: '#d97706' }} />
          )}
          {droppedPct > 0 && (
            <div style={{ width: `${droppedPct}%`, height: '100%', background: 'rgba(220,38,38,0.5)' }} />
          )}
        </div>

        {/* Stats text */}
        <div style={{
          fontSize: 9,
          color: 'var(--text-tertiary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {parts.length > 0 ? parts.join(' \u00b7 ') : `${total} results`}
        </div>
      </button>

      {/* Level 2: Expanded source list (accordion) */}
      {isExpanded && (
        <div style={{
          padding: '0 10px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          borderTop: '1px solid var(--border)',
          paddingTop: 8,
        }}>
          {/* Query text */}
          <div style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)',
            padding: '0 2px 4px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {truncate(group.query, 80)}
          </div>

          {/* Individual source post-its */}
          {group.results.map((r, i) => {
            const st = sourceStatusColor(r.url, usedUrls, gatheredUrls, hasSourceUsage);
            const tiltR = (seededRandom(`${group.category}-${i}`) - 0.5) * 3;
            const sonnetD = sonnetDecisions.get(r.url);
            const opusD = opusDecisions.get(r.url);
            // Pick the most relevant reasoning for this source's status
            const reasoning = st === 'discarded' ? sonnetD?.reasoning
              : st === 'unused' ? opusD?.reasoning
              : undefined;
            const usedInSections = st === 'survived' ? opusD?.used_in_sections : undefined;
            return (
              <div
                key={r.url}
                onClick={(e) => {
                  e.stopPropagation();
                  onClickSource({
                    id: `src-${r.url}`,
                    title: truncate(r.title, 45),
                    subtitle: getDomain(r.url),
                    stage: 'sources',
                    status: st,
                    reason: st === 'survived' ? undefined : st === 'unused' ? 'Gathered but not cited in POV' : 'Not in distilled intelligence',
                    detail: {
                      url: r.url, title: r.title, query: group.query, snippet: r.snippet, category: group.category,
                      sonnetReasoning: sonnetD?.reasoning, sonnetDroppedBy: sonnetD?.droppedBy,
                      opusReasoning: opusD?.reasoning, opusUsedInSections: opusD?.used_in_sections,
                    },
                  });
                }}
                style={{
                  padding: '6px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  lineHeight: 1.3,
                  background: st === 'survived' ? 'rgba(16,185,129,0.1)' : st === 'unused' ? 'rgba(217,119,6,0.08)' : 'rgba(220,38,38,0.06)',
                  border: `1px solid ${st === 'survived' ? 'rgba(16,185,129,0.2)' : st === 'unused' ? 'rgba(217,119,6,0.15)' : 'rgba(220,38,38,0.12)'}`,
                  cursor: 'pointer',
                  transform: `rotate(${tiltR}deg)`,
                  opacity: st === 'discarded' ? 0.65 : 1,
                  textDecoration: st === 'discarded' ? 'line-through' : 'none',
                  transition: 'transform 0.12s',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                }}
              >
                <div style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                  background: st === 'survived' ? '#10b981' : st === 'unused' ? '#d97706' : '#dc2626',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {r.title}
                  </div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 9 }}>
                    {getDomain(r.url)}
                  </div>
                  {reasoning && (
                    <div style={{
                      fontSize: 9, fontStyle: 'italic',
                      color: 'var(--text-tertiary)',
                      marginTop: 2, lineHeight: 1.3,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden', textDecoration: 'none',
                    }}>
                      {reasoning}
                    </div>
                  )}
                  {usedInSections && usedInSections.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                      {usedInSections.map((s: string) => (
                        <span key={s} style={{
                          fontSize: 8, padding: '1px 4px', borderRadius: 3,
                          background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 500,
                        }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sources Grid — compact overview with accordion                     */
/* ------------------------------------------------------------------ */

function SourcesGrid({ data, onClickSource }: {
  data: DebugData;
  onClickSource: (postIt: PostIt) => void;
}) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const events = data.events || [];
  const sourceUsageEvent = events.find(e => e.event === 'm1:source_usage');

  const usedUrls = useMemo(() => {
    const s = new Set<string>();
    if (sourceUsageEvent) for (const src of (sourceUsageEvent.usedSources || [])) s.add(src.url);
    return s;
  }, [sourceUsageEvent]);

  const gatheredUrls = useMemo(() => {
    const s = new Set<string>();
    if (sourceUsageEvent) for (const src of (sourceUsageEvent.unusedSources || [])) s.add(src.url);
    return s;
  }, [sourceUsageEvent]);

  // Decision reasoning lookup maps
  const sonnetDecisions = useMemo(() => {
    const m = new Map<string, { decision: string; reasoning: string; droppedBy?: string }>();
    const ev = events.find(e => e.event === 'm1:distillation_decisions');
    if (ev?.decisions) {
      for (const d of ev.decisions) if (d.url) m.set(d.url, d);
    }
    return m;
  }, [events]);

  const opusDecisions = useMemo(() => {
    const m = new Map<string, { decision: string; reasoning: string; used_in_sections?: string[] }>();
    const ev = events.find(e => e.event === 'm1:source_decisions');
    if (ev?.decisions) {
      for (const d of ev.decisions) if (d.url) m.set(d.url, d);
    }
    return m;
  }, [events]);

  const { groups, totalSources } = useMemo(() => extractQueryGroups(data), [data]);

  const totalKept = groups.reduce((n, g) => n + g.keptCount, 0);
  const totalGathered = groups.reduce((n, g) => n + g.unusedCount, 0);
  const totalDropped = groups.reduce((n, g) => n + g.droppedCount, 0);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 320,
      maxWidth: 480,
      flex: '1 1 50%',
    }}>
      {/* Section header */}
      <div style={{
        fontWeight: 600, fontSize: 13, color: 'var(--text-primary)',
      }}>
        Sources Found
      </div>

      {/* Summary stats */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10, marginBottom: 2,
      }}>
        <span style={{
          padding: '2px 6px', borderRadius: 4,
          background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
        }}>
          {totalSources} sources across {groups.length} queries
        </span>
        {totalKept > 0 && (
          <span style={{
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(16,185,129,0.1)', color: '#10b981',
          }}>
            {totalKept} cited
          </span>
        )}
        {totalGathered > 0 && (
          <span style={{
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(217,119,6,0.1)', color: '#d97706',
          }}>
            {totalGathered} gathered
          </span>
        )}
        {totalDropped > 0 && (
          <span style={{
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(220,38,38,0.08)', color: '#dc2626',
          }}>
            {totalDropped} dropped
          </span>
        )}
      </div>

      {/* Query group cards — 2-column grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 6,
      }}>
        {groups.map(g => (
          <QueryCategoryCard
            key={g.category}
            group={g}
            isExpanded={expandedCategory === g.category}
            onToggle={() => setExpandedCategory(expandedCategory === g.category ? null : g.category)}
            usedUrls={usedUrls}
            gatheredUrls={gatheredUrls}
            hasSourceUsage={!!sourceUsageEvent}
            onClickSource={onClickSource}
            sonnetDecisions={sonnetDecisions}
            opusDecisions={opusDecisions}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Distillation Funnel — compact bars only                            */
/* ------------------------------------------------------------------ */

function DistillationFunnel({ data }: {
  data: DebugData;
}) {
  const events = data.events || [];
  const sourceUsageEvent = events.find(e => e.event === 'm1:source_usage');
  const distillationDecisions = events.find(e => e.event === 'm1:distillation_decisions');

  if (!sourceUsageEvent) return null;

  const totalFound = sourceUsageEvent.totalSourcesFound || 0;
  const used = sourceUsageEvent.usedSources || [];
  const unused = sourceUsageEvent.unusedSources || [];
  const usedCount = sourceUsageEvent.sourcesUsedInPov || used.length;
  const gatheredCount = unused.length;

  // Aggregate drop reasons from distillation decisions
  const dropReasons: Record<string, number> = distillationDecisions?.dropReasons || {};

  // Funnel widths (relative to 100%)
  const maxWidth = 120;
  const usedWidth = totalFound > 0 ? Math.max(20, (usedCount / totalFound) * maxWidth) : maxWidth;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 120,
      maxWidth: 140,
    }}>
      <div style={{
        fontWeight: 600, fontSize: 13, color: 'var(--text-primary)',
      }}>
        Distillation
      </div>

      {/* Funnel visualisation */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: 'center',
        padding: '8px 0',
      }}>
        {/* Bar: total found */}
        <div style={{
          width: maxWidth,
          height: 20,
          borderRadius: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-secondary)',
        }}>
          {totalFound} found
        </div>

        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>&darr;</div>

        {/* Bar: gathered (in distilled intel) */}
        <div style={{
          width: Math.max(40, ((usedCount + gatheredCount) / Math.max(1, totalFound)) * maxWidth),
          height: 20,
          borderRadius: 4,
          background: 'rgba(217,119,6,0.12)',
          border: '1px solid rgba(217,119,6,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 600,
          color: '#d97706',
        }}>
          {usedCount + gatheredCount} gathered
        </div>

        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>&darr;</div>

        {/* Bar: cited in POV */}
        <div style={{
          width: usedWidth,
          height: 20,
          borderRadius: 4,
          background: 'rgba(16,185,129,0.15)',
          border: '1px solid rgba(16,185,129,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 600,
          color: '#10b981',
        }}>
          {usedCount} cited
        </div>
      </div>

      {/* Unused sources (collapsed by default) */}
      {unused.length > 0 && <UnusedSourcesList unused={unused} />}

      {/* Drop reason breakdown from distillation decisions */}
      {Object.keys(dropReasons).length > 0 && (
        <div style={{
          fontSize: 10, color: 'var(--text-tertiary)',
          display: 'flex', flexDirection: 'column', gap: 2,
          padding: '4px 0',
        }}>
          <div style={{ fontWeight: 600, fontSize: 9, textTransform: 'uppercase', marginBottom: 1 }}>
            Dropped by
          </div>
          {Object.entries(dropReasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
            <div key={reason} style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              <span>{reason}</span>
              <span style={{ fontWeight: 600 }}>{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UnusedSourcesList({ unused }: {
  unused: any[];
}) {
  const [showUnused, setShowUnused] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowUnused(!showUnused)}
        style={{
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 10,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {showUnused ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {unused.length} unused
      </button>
      {showUnused && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {unused.map((s: any, i: number) => (
            <div
              key={s.url || i}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 10,
                background: 'rgba(217,119,6,0.06)',
                border: '1px solid rgba(217,119,6,0.12)',
                opacity: 0.75,
              }}
            >
              <div style={{
                fontWeight: 500, color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {truncate(s.title || getDomain(s.url), 40)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                {getDomain(s.url)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  PostIt Card (for contact/enrichment/hook columns)                  */
/* ------------------------------------------------------------------ */

function PostItCard({ postIt, onClick }: { postIt: PostIt; onClick: () => void }) {
  const tilt = (seededRandom(postIt.id) - 0.5) * 4;
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
          {'\u2715'} {truncate(postIt.reason, 35)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail Panel (Level 3: click-to-expand)                            */
/* ------------------------------------------------------------------ */

function DetailPanel({ postIt, onClose, sourceUsageEvent }: { postIt: PostIt; onClose: () => void; sourceUsageEvent?: any }) {
  // Find which POV section cited this source
  const citedInSections: string[] = [];
  if (postIt.detail?.url && sourceUsageEvent?.usedSources) {
    const match = sourceUsageEvent.usedSources.find((s: any) => s.url === postIt.detail.url);
    if (match?.sections) {
      citedInSections.push(...match.sections);
    } else if (match?.section) {
      citedInSections.push(match.section);
    }
  }

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
          {postIt.tier} {'\u2014'} {postIt.function}
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

      {/* Decision reasoning from Sonnet (distillation) and/or Opus (POV inclusion) */}
      {(postIt.detail?.sonnetReasoning || postIt.detail?.opusReasoning) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase' }}>
            Decision reasoning
          </div>
          {postIt.detail.sonnetReasoning && (
            <div style={{ fontSize: 12, padding: 8, background: 'var(--bg-input)', borderRadius: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)' }}>
                Sonnet (distillation){postIt.detail.sonnetDroppedBy ? ` \u2014 ${postIt.detail.sonnetDroppedBy}` : ''}:
              </span>{' '}
              {postIt.detail.sonnetReasoning}
            </div>
          )}
          {postIt.detail.opusReasoning && (
            <div style={{ fontSize: 12, padding: 8, background: 'var(--bg-input)', borderRadius: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)' }}>
                Opus (POV generation):
              </span>{' '}
              {postIt.detail.opusReasoning}
            </div>
          )}
        </div>
      )}

      {/* Opus used_in_sections for cited sources */}
      {postIt.detail?.opusUsedInSections?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>
            Used in POV Sections
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {postIt.detail.opusUsedInSections.map((section: string, i: number) => (
              <span key={i} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 500,
              }}>
                {section}
              </span>
            ))}
          </div>
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

      {postIt.detail?.snippet && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>
            Snippet
          </div>
          <div style={{
            fontSize: 12, padding: 8, background: 'var(--bg-input)',
            borderRadius: 4, color: 'var(--text-secondary)', fontStyle: 'italic',
          }}>
            {postIt.detail.snippet}
          </div>
        </div>
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

      {postIt.detail?.category && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>
            Query Category
          </div>
          <div style={{
            fontSize: 12, padding: '4px 8px', background: 'var(--bg-input)',
            borderRadius: 4, color: 'var(--text-secondary)', display: 'inline-block',
          }}>
            {postIt.detail.category}
          </div>
        </div>
      )}

      {citedInSections.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>
            Cited in POV Section
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {citedInSections.map((section, i) => (
              <span key={i} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 500,
              }}>
                {section}
              </span>
            ))}
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
/*  Column Component (for contacts, enrichment, hooks)                 */
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
            Show {hidden} more{'\u2026'}
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
    { label: 'Cited in POV', color: 'rgba(16,185,129,0.12)', dot: '#10b981' },
    { label: 'Gathered / Unused', color: 'rgba(217,119,6,0.12)', dot: '#d97706' },
    { label: 'Dropped', color: 'rgba(220,38,38,0.12)', dot: '#dc2626' },
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
  const { hasWebSearch } = useMemo(() => extractQueryGroups(data), [data]);
  const columns = useMemo(() => extractColumns(data), [data]);
  const [selectedPostIt, setSelectedPostIt] = useState<PostIt | null>(null);

  // Get source usage event for detail panel
  const sourceUsageEvent = useMemo(() => {
    return (data.events || []).find(e => e.event === 'm1:source_usage');
  }, [data]);

  // Check if there's any data at all
  const hasLegacySources = columns.some(c => c.id === 'sources' || c.id === 'distillation');
  if (!hasWebSearch && !hasLegacySources && columns.length === 0) return <EmptyState />;

  return (
    <div>
      <Legend />

      {/* Horizontal scrollable column layout */}
      <div style={{
        display: 'flex', gap: 0, overflowX: 'auto',
        padding: '16px 0', minHeight: 300,
        alignItems: 'flex-start',
      }}>
        {/* Sources grid — new grouped layout for runs with web_search events */}
        {hasWebSearch && (
          <>
            <SourcesGrid data={data} onClickSource={setSelectedPostIt} />
            <ColumnArrow />
            <DistillationFunnel data={data} />
          </>
        )}

        {/* Remaining columns (contacts, enrichment, hooks — or legacy sources/distillation) */}
        {columns.map((col, i) => (
          <div key={col.id} style={{ display: 'flex' }}>
            {(i > 0 || hasWebSearch) && <ColumnArrow />}
            <ColumnView column={col} onClickPostIt={setSelectedPostIt} />
          </div>
        ))}

        {/* Fallback note for legacy runs */}
        {!hasWebSearch && hasLegacySources && (
          <div style={{
            padding: '8px 12px', marginLeft: 16, fontSize: 11,
            color: 'var(--text-tertiary)', maxWidth: 200,
            background: 'var(--bg-elevated)', borderRadius: 6,
            alignSelf: 'flex-start',
          }}>
            Web search detail not available for this run {'\u2014'} run with latest pipeline for full query-level breakdown.
          </div>
        )}
      </div>

      {/* Detail panel (Level 3) */}
      {selectedPostIt && (
        <>
          <div
            onClick={() => setSelectedPostIt(null)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.2)', zIndex: 99,
            }}
          />
          <DetailPanel postIt={selectedPostIt} onClose={() => setSelectedPostIt(null)} sourceUsageEvent={sourceUsageEvent} />
        </>
      )}
    </div>
  );
}
