import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import usePageTitle from '../hooks/usePageTitle';
import {
  ChevronDown, ChevronRight, Search, Upload, Clock, DollarSign,
  Cpu, Globe, Users, Zap, FileText, Layers, AlertTriangle, CheckCircle,
  XCircle, ArrowRight, Filter, Activity, LayoutGrid, StickyNote
} from 'lucide-react';
import PostItView from '../components/PostItView';

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

interface ModuleInfo {
  id: string;
  label: string;
  events: DebugEvent[];
  phases: { name: string; startMs: number; durationMs: number; meta: Record<string, any> }[];
  claudeCalls: { call: DebugEvent; response: DebugEvent | null }[];
  serpSearches: DebugEvent[];
  credits: Record<string, number>;
  durationMs: number;
}

/* ------------------------------------------------------------------ */
/*  Parser                                                             */
/* ------------------------------------------------------------------ */

function parseDebugData(data: DebugData): {
  modules: ModuleInfo[];
  totalDurationMs: number;
  totalCredits: Record<string, number>;
  estimatedCost: number;
  company: string;
  generatedAt: string;
  specialEvents: DebugEvent[];
} {
  const events = data.events || [];
  const moduleMap: Record<string, DebugEvent[]> = {};
  const specialEvents: DebugEvent[] = [];

  // Categorise events by module
  for (const ev of events) {
    const eName = ev.event || '';
    let mod = 'other';

    if (eName.startsWith('m1:') || eName.includes(':m1:') || ev.module === 'm1') mod = 'm1';
    else if (eName.startsWith('m2:') || eName.includes(':m2:') || ev.module === 'm2') mod = 'm2';
    else if (eName.startsWith('m3:') || eName.includes(':m3:') || ev.module === 'm3') mod = 'm3';
    else if (eName.startsWith('m4:') || eName.includes(':m4:') || ev.module === 'm4') mod = 'm4';
    else if (eName.startsWith('m6:') || eName.includes(':m6:') || ev.module === 'm6') mod = 'm6';
    else if (eName.startsWith('phase:') && eName.includes(':m1:')) mod = 'm1';
    else if (eName.startsWith('phase:') && eName.includes(':m2:')) mod = 'm2';
    else if (eName.startsWith('phase:') && eName.includes(':m3:')) mod = 'm3';
    else if (eName.startsWith('phase:') && eName.includes(':m4:')) mod = 'm4';
    else if (eName.startsWith('phase:') && eName.includes(':m6:')) mod = 'm6';
    else if (eName === 'claude:call' || eName === 'claude:response') {
      const callId = ev.callId || '';
      if (callId.startsWith('m1:')) mod = 'm1';
      else if (callId.startsWith('m2:')) mod = 'm2';
      else if (callId.startsWith('m3:')) mod = 'm3';
      else if (callId.startsWith('m4:')) mod = 'm4';
    } else if (eName.startsWith('credit:')) {
      // Attribute credits by reason or context
      const reason = (ev.reason || '').toLowerCase();
      if (reason.includes('m1') || reason.includes('phase 1') || reason.includes('phase 2') || reason.includes('icp') || reason.includes('pov') || reason.includes('jobs')) mod = 'm1';
      else if (reason.includes('m2') || reason.includes('step 1') || reason.includes('step 2') || reason.includes('step 4') || reason.includes('step 5') || reason.includes('calibration') || reason.includes('matrix')) mod = 'm2';
      else if (reason.includes('m3') || reason.includes('apollo') || reason.includes('enrichment')) mod = 'm3';
      else if (reason.includes('m4') || reason.includes('hook') || reason.includes('person research')) mod = 'm4';
    } else if (eName === 'gaps:detected' || eName.includes('former_skips') || eName.includes('reconciliation') || eName.includes('enforcement')) {
      mod = 'm2';
    }

    if (!moduleMap[mod]) moduleMap[mod] = [];
    moduleMap[mod].push(ev);

    // Track special events
    if (['m2:trim', 'm2:matrix_snapshot', 'm2:eb_enforcement', 'm2:contact_reconciliation', 'gaps:detected'].includes(eName) ||
        eName.includes('former_skips')) {
      specialEvents.push(ev);
    }
  }

  const MODULE_LABELS: Record<string, string> = {
    m1: 'M1 Company POV',
    m2: 'M2 Persona Discovery',
    m3: 'M3 Apollo Enrichment',
    m4: 'M4 Hook Generation',
    m6: 'M6 PDF Generation',
    other: 'Other',
  };

  const moduleOrder = ['m1', 'm2', 'm3', 'm4', 'm6', 'other'];
  const modules: ModuleInfo[] = [];
  const totalCredits: Record<string, number> = {};

  for (const modId of moduleOrder) {
    const modEvents = moduleMap[modId] || [];
    if (modEvents.length === 0 && modId === 'other') continue;

    // Extract phases
    const phaseStarts: Record<string, DebugEvent> = {};
    const phases: ModuleInfo['phases'] = [];
    for (const ev of modEvents) {
      if (ev.event.startsWith('phase:start:')) {
        phaseStarts[ev.event.replace('phase:start:', '')] = ev;
      } else if (ev.event.startsWith('phase:end:')) {
        const name = ev.event.replace('phase:end:', '');
        const start = phaseStarts[name];
        phases.push({
          name,
          startMs: start?.elapsedMs ?? ev.elapsedMs - (ev.durationMs || 0),
          durationMs: ev.durationMs || 0,
          meta: { ...ev },
        });
      }
    }

    // Extract Claude calls
    const claudeCallMap: Record<string, DebugEvent> = {};
    const claudeCalls: ModuleInfo['claudeCalls'] = [];
    for (const ev of modEvents) {
      if (ev.event === 'claude:call') {
        claudeCallMap[ev.callId] = ev;
      } else if (ev.event === 'claude:response') {
        const call = claudeCallMap[ev.callId];
        claudeCalls.push({ call: call || ev, response: ev });
        delete claudeCallMap[ev.callId];
      }
    }
    // Add calls without responses
    for (const callId of Object.keys(claudeCallMap)) {
      claudeCalls.push({ call: claudeCallMap[callId], response: null });
    }

    // Extract SERP searches
    const serpSearches = modEvents.filter(ev => ev.event === 'serp:search');

    // Extract credits
    const credits: Record<string, number> = {};
    for (const ev of modEvents) {
      if (ev.event.startsWith('credit:')) {
        const api = ev.event.replace('credit:', '');
        credits[api] = (credits[api] || 0) + (ev.amount || 0);
        totalCredits[api] = (totalCredits[api] || 0) + (ev.amount || 0);
      }
    }

    // Calculate duration
    const firstMs = modEvents.length > 0 ? modEvents[0].elapsedMs : 0;
    const lastMs = modEvents.length > 0 ? modEvents[modEvents.length - 1].elapsedMs : 0;
    const durationMs = lastMs - firstMs;

    modules.push({
      id: modId,
      label: MODULE_LABELS[modId] || modId,
      events: modEvents,
      phases,
      claudeCalls,
      serpSearches,
      credits,
      durationMs,
    });
  }

  // Estimated cost
  const costRates: Record<string, number> = {
    serpapi: 0.015, enrichlayer: 0.0264, apollo: 0.03, claude_opus: 0.25, claude_sonnet: 0.022,
  };
  let estimatedCost = 0;
  for (const [api, count] of Object.entries(totalCredits)) {
    estimatedCost += count * (costRates[api] || 0);
  }

  const totalDurationMs = events.length > 0 ? events[events.length - 1].elapsedMs : 0;

  return { modules, totalDurationMs, totalCredits, estimatedCost, company: data.company, generatedAt: data.generatedAt, specialEvents };
}

/* ------------------------------------------------------------------ */
/*  Utility                                                            */
/* ------------------------------------------------------------------ */

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
}

function fmtBytes(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 100000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1000).toFixed(0)}K`;
}

/* ------------------------------------------------------------------ */
/*  Collapsible                                                        */
/* ------------------------------------------------------------------ */

function Collapsible({ title, badge, defaultOpen = false, children, titleStyle }: {
  title: string;
  badge?: string | number | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
  titleStyle?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, textAlign: 'left',
          ...titleStyle,
        }}
      >
        <Icon size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{title}</span>
        {badge != null && (
          <span style={{
            fontSize: 11, padding: '1px 6px', borderRadius: 4,
            background: 'var(--accent-subtle)', color: 'var(--accent)',
          }}>{badge}</span>
        )}
      </button>
      {open && <div style={{ paddingLeft: 20, paddingBottom: 8 }}>{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Claude Call View                                                    */
/* ------------------------------------------------------------------ */

function ClaudeCallView({ call, response }: { call: DebugEvent; response: DebugEvent | null }) {
  const success = response?.success;
  const duration = response?.durationMs;

  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 8, padding: 12, marginBottom: 8,
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Cpu size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
          {call.purpose || call.callId}
        </span>
        <span style={{
          fontSize: 11, padding: '1px 6px', borderRadius: 4,
          background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
        }}>{call.model}</span>
        {duration != null && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
            {fmtMs(duration)}
          </span>
        )}
        {success === true && <CheckCircle size={14} style={{ color: 'var(--status-complete)' }} />}
        {success === false && <XCircle size={14} style={{ color: 'var(--status-failed)' }} />}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
        <span>System: {fmtBytes(call.systemPromptLength || 0)} chars</span>
        <span>User: {fmtBytes(call.userMessageLength || 0)} chars</span>
        {response?.rawLength && <span>Response: {fmtBytes(response.rawLength)} chars</span>}
      </div>

      {call.systemPrompt && (
        <Collapsible title="System Prompt" badge={fmtBytes(call.systemPrompt.length)}>
          <pre style={{
            fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', maxHeight: 300, overflow: 'auto',
            background: 'var(--bg-input)', padding: 8, borderRadius: 6,
            fontFamily: 'var(--font-mono)',
          }}>{call.systemPrompt}</pre>
        </Collapsible>
      )}

      {call.userMessage && (
        <Collapsible title="User Message" badge={fmtBytes(call.userMessage.length)}>
          <pre style={{
            fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', maxHeight: 300, overflow: 'auto',
            background: 'var(--bg-input)', padding: 8, borderRadius: 6,
            fontFamily: 'var(--font-mono)',
          }}>{call.userMessage}</pre>
        </Collapsible>
      )}

      {response?.raw && (
        <Collapsible title="Response" badge={fmtBytes(response.raw.length)}>
          <pre style={{
            fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', maxHeight: 300, overflow: 'auto',
            background: 'var(--bg-input)', padding: 8, borderRadius: 6,
            fontFamily: 'var(--font-mono)',
          }}>{typeof response.raw === 'string' ? response.raw : JSON.stringify(response.raw, null, 2)}</pre>
        </Collapsible>
      )}

      {response?.parsed && (
        <Collapsible title="Parsed Output">
          <pre style={{
            fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', maxHeight: 300, overflow: 'auto',
            background: 'var(--bg-input)', padding: 8, borderRadius: 6,
            fontFamily: 'var(--font-mono)',
          }}>{JSON.stringify(response.parsed, null, 2)}</pre>
        </Collapsible>
      )}

      {response?.error && (
        <div style={{ marginTop: 8, padding: 8, background: 'rgba(220,38,38,0.1)', borderRadius: 6, fontSize: 12, color: 'var(--status-failed-text)' }}>
          Error: {response.error}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SERP Search View                                                   */
/* ------------------------------------------------------------------ */

function SerpSearchView({ ev }: { ev: DebugEvent }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 8, padding: 12, marginBottom: 8,
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Globe size={14} style={{ color: '#d97706' }} />
        <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-primary)' }}>
          {ev.purpose || 'SERP Search'}
        </span>
        <span style={{
          fontSize: 11, padding: '1px 6px', borderRadius: 4,
          background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
        }}>{ev.resultsCount ?? 0} results</span>
      </div>

      <div style={{
        fontSize: 12, color: 'var(--text-secondary)', padding: 6, background: 'var(--bg-input)',
        borderRadius: 4, fontFamily: 'var(--font-mono)', marginBottom: 6, wordBreak: 'break-word',
      }}>
        {ev.query}
      </div>

      {ev.results && ev.results.length > 0 && (
        <Collapsible title="Results" badge={ev.results.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ev.results.slice(0, 20).map((r: any, i: number) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.title}</div>
                {r.snippet && <div style={{ marginTop: 1 }}>{r.snippet.slice(0, 150)}</div>}
                {r.url && <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>{r.url}</div>}
              </div>
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Phase Bar                                                          */
/* ------------------------------------------------------------------ */

function PhaseBar({ phases, totalMs }: { phases: ModuleInfo['phases']; totalMs: number }) {
  if (phases.length === 0) return null;
  const colors = ['#5e6ad2', '#d97706', '#16a34a', '#dc2626', '#8b5cf6', '#ec4899'];

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Phases
      </div>
      <div style={{ display: 'flex', gap: 2, height: 20, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-input)' }}>
        {phases.map((p, i) => {
          const pct = totalMs > 0 ? Math.max(2, (p.durationMs / totalMs) * 100) : 0;
          return (
            <div
              key={p.name}
              title={`${p.name}: ${fmtMs(p.durationMs)}`}
              style={{
                width: `${pct}%`, background: colors[i % colors.length], borderRadius: 2,
                minWidth: 4, position: 'relative', cursor: 'default',
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
        {phases.map((p, i) => (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length] }} />
            <span style={{ color: 'var(--text-secondary)' }}>{p.name.split(':').pop()}</span>
            <span style={{ color: 'var(--text-tertiary)' }}>{fmtMs(p.durationMs)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Special Event Views (M2-specific)                                  */
/* ------------------------------------------------------------------ */

function TrimView({ ev }: { ev: DebugEvent }) {
  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Filter size={14} style={{ color: '#d97706' }} />
        <span style={{ fontWeight: 500, fontSize: 13 }}>Contact Trim</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {ev.before} → {ev.after} ({ev.droppedCount} dropped)
        </span>
      </div>
      {ev.dropped && ev.dropped.length > 0 && (
        <Collapsible title="Dropped contacts" badge={ev.droppedCount}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {ev.dropped.map((c: any, i: number) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {c.name} — {c.title} ({c.fn})
              </div>
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

function MatrixSnapshotView({ ev }: { ev: DebugEvent }) {
  const summary = ev.summary || {};
  const fns = Object.keys(summary);

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Layers size={14} style={{ color: '#8b5cf6' }} />
        <span style={{ fontWeight: 500, fontSize: 13 }}>Matrix Snapshot</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{ev.label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fns.length}, 1fr)`, gap: 8 }}>
        {fns.map(fn => {
          const data = summary[fn] || {};
          return (
            <div key={fn} style={{ background: 'var(--bg-input)', borderRadius: 6, padding: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'capitalize' }}>{fn}</div>
              {['eb', 'champion', 'coach'].map(tier => {
                const contacts = data[tier] || [];
                if (contacts.length === 0) return null;
                return (
                  <div key={tier} style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
                      {tier} ({contacts.length})
                    </div>
                    {contacts.map((c: any, i: number) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {c.name}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EnforcementView({ ev }: { ev: DebugEvent }) {
  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid rgba(220,38,38,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <AlertTriangle size={14} style={{ color: '#d97706' }} />
        <span style={{ fontWeight: 500, fontSize: 13 }}>EB Enforcement</span>
        {ev.employeeCount && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{ev.employeeCount.toLocaleString()} employees</span>}
      </div>
      {ev.corrections && ev.corrections.map((c: any, i: number) => (
        <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
          <strong>{c.name}</strong> ({c.title}): {c.from} → {c.to}
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.reason}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Module Detail                                                      */
/* ------------------------------------------------------------------ */

function ModuleDetail({ mod, totalMs }: { mod: ModuleInfo; totalMs: number }) {
  const specialTypes: Record<string, (ev: DebugEvent) => React.ReactNode> = {
    'm2:trim': (ev) => <TrimView ev={ev} />,
    'm2:matrix_snapshot': (ev) => <MatrixSnapshotView ev={ev} />,
    'm2:eb_enforcement': (ev) => <EnforcementView ev={ev} />,
  };

  const specials = mod.events.filter(ev => specialTypes[ev.event]);
  const formerSkips = mod.events.filter(ev => ev.event.includes('former_skips'));
  const gaps = mod.events.filter(ev => ev.event === 'gaps:detected');
  const reconciliation = mod.events.filter(ev => ev.event === 'm2:contact_reconciliation');

  return (
    <div>
      <PhaseBar phases={mod.phases} totalMs={totalMs} />

      {mod.claudeCalls.length > 0 && (
        <Collapsible title="Claude Calls" badge={mod.claudeCalls.length} defaultOpen={mod.claudeCalls.length <= 3}>
          {mod.claudeCalls.map((cc, i) => (
            <ClaudeCallView key={i} call={cc.call} response={cc.response} />
          ))}
        </Collapsible>
      )}

      {mod.serpSearches.length > 0 && (
        <Collapsible title="SERP Searches" badge={mod.serpSearches.length}>
          {mod.serpSearches.map((s, i) => (
            <SerpSearchView key={i} ev={s} />
          ))}
        </Collapsible>
      )}

      {specials.length > 0 && specials.map((ev, i) => (
        <div key={i}>{specialTypes[ev.event]?.(ev)}</div>
      ))}

      {reconciliation.length > 0 && (
        <Collapsible title="Contact Reconciliation" badge={reconciliation.length}>
          {reconciliation.map((ev, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {ev.deduped?.map((d: any, j: number) => (
                <div key={j}>
                  <strong>{d.name}</strong>: kept {d.primary}, removed from {d.removedFrom?.join(', ')}
                </div>
              ))}
            </div>
          ))}
        </Collapsible>
      )}

      {formerSkips.length > 0 && (
        <Collapsible title="Former Employee Skips" badge={formerSkips.reduce((n: number, ev: DebugEvent) => n + (ev.skipped?.length || 0), 0)}>
          {formerSkips.flatMap((ev: DebugEvent) => ev.skipped || []).map((s: any, i: number) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {s.name} — {s.title} ({s.tier})
            </div>
          ))}
        </Collapsible>
      )}

      {gaps.length > 0 && (
        <Collapsible title="Gaps Detected" badge={gaps.reduce((n: number, ev: DebugEvent) => n + (ev.gaps?.length || 0), 0)}>
          {gaps.flatMap((ev: DebugEvent) => ev.gaps || []).map((g: string, i: number) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--status-running-text)' }}>
              {g}
            </div>
          ))}
        </Collapsible>
      )}

      {/* Raw events fallback */}
      <Collapsible title="All Events" badge={mod.events.length}>
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {mod.events.map((ev, i) => (
            <div key={i} style={{
              fontSize: 11, padding: '3px 0', borderBottom: '1px solid var(--border)',
              display: 'flex', gap: 8, color: 'var(--text-secondary)',
            }}>
              <span style={{ color: 'var(--text-tertiary)', minWidth: 55, fontFamily: 'var(--font-mono)' }}>
                {fmtMs(ev.elapsedMs)}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{ev.event}</span>
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pipeline Card (overview)                                           */
/* ------------------------------------------------------------------ */

function PipelineCard({ mod, selected, onClick, totalMs }: {
  mod: ModuleInfo; selected: boolean; onClick: () => void; totalMs: number;
}) {
  const icons: Record<string, any> = {
    m1: FileText, m2: Users, m3: Zap, m4: Activity, m6: FileText, other: Layers,
  };
  const Icon = icons[mod.id] || Layers;
  const pct = totalMs > 0 ? Math.round((mod.durationMs / totalMs) * 100) : 0;
  const creditCount = Object.values(mod.credits).reduce((a, b) => a + b, 0);

  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? 'var(--accent-subtle)' : 'var(--bg-surface)',
        border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 8, padding: 12, cursor: 'pointer', textAlign: 'left',
        transition: 'all 100ms', width: '100%',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon size={16} style={{ color: selected ? 'var(--accent)' : 'var(--text-secondary)' }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{mod.label}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
        <span><Clock size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> {fmtMs(mod.durationMs)}</span>
        <span>{mod.events.length} events</span>
        {mod.claudeCalls.length > 0 && <span>{mod.claudeCalls.length} Claude</span>}
        {mod.serpSearches.length > 0 && <span>{mod.serpSearches.length} SERP</span>}
        {creditCount > 0 && <span>{creditCount} credits</span>}
      </div>
      {/* Mini progress bar */}
      <div style={{ marginTop: 6, height: 3, background: 'var(--bg-input)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: selected ? 'var(--accent)' : 'var(--text-tertiary)', borderRadius: 2, minWidth: 2 }} />
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Data Flow                                                          */
/* ------------------------------------------------------------------ */

function DataFlowBar({ modules }: { modules: ModuleInfo[] }) {
  const modIds = modules.map(m => m.id).filter(id => id !== 'other');
  if (modIds.length < 2) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 0', justifyContent: 'center', flexWrap: 'wrap' }}>
      {modIds.map((id, i) => (
        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
          }}>{id.toUpperCase()}</span>
          {i < modIds.length - 1 && <ArrowRight size={12} style={{ color: 'var(--text-tertiary)' }} />}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  File Drop Zone                                                     */
/* ------------------------------------------------------------------ */

function FileDropZone({ onData }: { onData: (data: DebugData) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.events && Array.isArray(data.events)) {
          onData(data);
        } else {
          alert('Invalid debug events JSON — expected { events: [...] }');
        }
      } catch {
        alert('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
  }, [onData]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-strong)'}`,
        borderRadius: 12, padding: 40, textAlign: 'center', cursor: 'pointer',
        background: dragging ? 'var(--accent-subtle)' : 'var(--bg-surface)',
        transition: 'all 150ms',
      }}
    >
      <Upload size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
        Drop a debug events JSON here
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        or click to browse
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function PipelineDebug() {
  const { run_id } = useParams<{ run_id?: string }>();
  const [rawData, setRawData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [runCompany, setRunCompany] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'modules' | 'postit'>('modules');

  usePageTitle(rawData ? `Debug: ${rawData.company}` : 'Pipeline Debug');

  // Fetch from Supabase if run_id is provided
  useEffect(() => {
    if (!run_id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // First get the debug_events_url from the run
      const { data: runData, error: runErr } = await supabase
        .from('runs')
        .select('company, debug_events_url')
        .eq('id', run_id)
        .single();

      if (cancelled) return;

      if (runErr || !runData) {
        setError('Run not found');
        setLoading(false);
        return;
      }

      setRunCompany(runData.company);

      if (!runData.debug_events_url) {
        setError('No debug data available for this run. Try dropping a local debug JSON file.');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(runData.debug_events_url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setRawData(data);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(`Failed to load debug data: ${err.message}`);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [run_id]);

  const parsed = useMemo(() => rawData ? parseDebugData(rawData) : null, [rawData]);

  // Search filter
  const filteredModules = useMemo(() => {
    if (!parsed || !searchQuery.trim()) return parsed?.modules || [];
    const q = searchQuery.toLowerCase();
    return parsed.modules.map(mod => ({
      ...mod,
      events: mod.events.filter(ev => JSON.stringify(ev).toLowerCase().includes(q)),
    })).filter(mod => mod.events.length > 0);
  }, [parsed, searchQuery]);

  const selectedMod = filteredModules.find(m => m.id === selectedModule) || filteredModules[0] || null;

  // Auto-select first module
  useEffect(() => {
    if (filteredModules.length > 0 && !selectedModule) {
      setSelectedModule(filteredModules[0].id);
    }
  }, [filteredModules, selectedModule]);

  const content = run_id ? (
    <Layout>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        {renderInner()}
      </div>
    </Layout>
  ) : (
    <Layout>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        {renderInner()}
      </div>
    </Layout>
  );

  function renderInner() {
    // Loading state
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
          Loading debug data...
        </div>
      );
    }

    // No data yet — show drop zone (+ error if applicable)
    if (!rawData) {
      return (
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
            Pipeline Debug {runCompany ? `— ${runCompany}` : ''}
          </h1>
          {error && (
            <div style={{
              padding: 12, marginBottom: 16, borderRadius: 8,
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
              fontSize: 13, color: 'var(--status-failed-text)',
            }}>
              {error}
            </div>
          )}
          <FileDropZone onData={(data) => { setRawData(data); setError(null); }} />
        </div>
      );
    }

    // Data loaded — render visualiser
    return (
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              Pipeline Debug — {parsed?.company}
            </h1>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {parsed?.generatedAt ? new Date(parsed.generatedAt).toLocaleString() : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* View toggle */}
            <div style={{
              display: 'flex', borderRadius: 6, overflow: 'hidden',
              border: '1px solid var(--border)',
            }}>
              <button
                onClick={() => setViewMode('modules')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 12px', fontSize: 12, fontWeight: 500,
                  background: viewMode === 'modules' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                  color: viewMode === 'modules' ? 'var(--accent)' : 'var(--text-secondary)',
                  border: 'none', borderRight: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                <LayoutGrid size={13} /> Modules
              </button>
              <button
                onClick={() => setViewMode('postit')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 12px', fontSize: 12, fontWeight: 500,
                  background: viewMode === 'postit' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                  color: viewMode === 'postit' ? 'var(--accent)' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                <StickyNote size={13} /> Pipeline Flow
              </button>
            </div>

            <button
              onClick={() => { setRawData(null); setSelectedModule(null); setSearchQuery(''); setError(null); }}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              Load different file
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16,
        }}>
          {[
            { icon: Clock, label: 'Duration', value: fmtMs(parsed?.totalDurationMs || 0) },
            { icon: DollarSign, label: 'Est. Cost', value: `$${(parsed?.estimatedCost || 0).toFixed(2)}` },
            { icon: Activity, label: 'Events', value: String(rawData.totalEvents || rawData.events.length) },
            { icon: Cpu, label: 'Claude Calls', value: String(parsed?.modules.reduce((n, m) => n + m.claudeCalls.length, 0) || 0) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Icon size={14} style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Data flow */}
        {parsed && <DataFlowBar modules={parsed.modules} />}

        {viewMode === 'postit' && rawData ? (
          <PostItView data={rawData} />
        ) : (
          <>
            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '8px 8px 8px 30px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-input)',
                  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  fontFamily: 'var(--font)',
                }}
              />
            </div>

            {/* Module cards + detail panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
              {/* Left: module cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredModules.map(mod => (
                  <PipelineCard
                    key={mod.id}
                    mod={mod}
                    selected={selectedMod?.id === mod.id}
                    onClick={() => setSelectedModule(mod.id)}
                    totalMs={parsed?.totalDurationMs || 1}
                  />
                ))}

                {/* Credit summary */}
                {parsed && Object.keys(parsed.totalCredits).length > 0 && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Credit Summary
                    </div>
                    {Object.entries(parsed.totalCredits).map(([api, count]) => (
                      <div key={api} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>
                        <span>{api}</span>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* File drop fallback */}
                <div style={{ marginTop: 8 }}>
                  <FileDropZone onData={(data) => { setRawData(data); setError(null); setSelectedModule(null); setSearchQuery(''); }} />
                </div>
              </div>

              {/* Right: detail panel */}
              <div style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 16, minHeight: 400,
              }}>
                {selectedMod ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedMod.label}</h2>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {fmtMs(selectedMod.durationMs)} · {selectedMod.events.length} events
                      </span>
                    </div>
                    <ModuleDetail mod={selectedMod} totalMs={parsed?.totalDurationMs || 1} />
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
                    Select a module to view details
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return content;
}
