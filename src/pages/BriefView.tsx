import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { ArrowLeft, MessageSquare, FileText, Table, X, ChevronDown, ExternalLink, Send, Trash2, Target, Zap, TrendingUp, Wrench, Building2, Users, Briefcase, BookOpen, Link2, Share2 } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Run {
  id: string;
  company: string;
  url: string | null;
  created_at: string;
  status: string;
  pdf_url: string | null;
  excel_url: string | null;
  brief_id: string | null;
}

interface Brief {
  pov_json: Record<string, any> | null;
  personas_json: Record<string, any> | null;
  schema_version: number | null;
}

/* ------------------------------------------------------------------ */
/*  Utility components                                                 */
/* ------------------------------------------------------------------ */

const SECTION_ICONS: Record<string, React.ReactNode> = {
  'ICP FIT':            <Target size={14} />,
  'WHY NOW':            <Zap size={14} />,
  'WHY ANYTHING':       <TrendingUp size={14} />,
  'WHY FIGMA':          <Wrench size={14} />,
  'ABOUT':              <Building2 size={14} />,
  'KEY EXECUTIVES':     <Users size={14} />,
  'JOB SIGNALS':        <Briefcase size={14} />,
  'PROOF POINTS':       <BookOpen size={14} />,
  'SOURCES':            <Link2 size={14} />,
  'CONTACT MATRIX':     <Users size={14} />,
  'ORGANISATION STRUCTURE': <Building2 size={14} />,
};

function Section({ title, children, collapsible = false }: {
  title: string; children: React.ReactNode; collapsible?: boolean
}) {
  const [open, setOpen] = useState(!collapsible);
  const icon = SECTION_ICONS[title.toUpperCase()];
  return (
    <div style={{ marginBottom: 48 }}>
      <div onClick={collapsible ? () => setOpen(o => !o) : undefined} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: open ? 20 : 0, paddingBottom: 12,
        borderBottom: '1px solid var(--border)',
        cursor: collapsible ? 'pointer' : 'default', userSelect: 'none',
      }}>
        <div style={{ width: 3, height: 16, background: 'var(--accent)', borderRadius: 2, flexShrink: 0 }} />
        {icon && <span style={{ color: 'var(--accent)', display: 'flex' }}>{icon}</span>}
        <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                     textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, flex: 1 }}>
          {title}
        </h2>
        {collapsible && (
          <ChevronDown size={14} style={{ color: 'var(--text-tertiary)',
            transform: open ? 'rotate(180deg)' : 'none', transition: '150ms' }} />
        )}
      </div>
      {open && children}
    </div>
  );
}

/* Truncate to N chars at a word boundary */
function truncateToLine(text: string, maxChars = 120): string {
  if (!text || text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + '\u2026';
}

function CitedProse({ text }: { text: string | undefined | null }) {
  if (!text) return null;
  const html = text.replace(/\[(\d+)\]/g, (_, n: string) =>
    `<sup><a href="#cite-${n}" style="color:var(--accent);text-decoration:none">[${n}]</a></sup>`
  );
  return <p style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function CollapsibleProse({ text, maxLength = 320 }: { text: string; maxLength?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > maxLength;

  let display = text;
  if (isLong && !expanded) {
    const chunk = text.slice(0, maxLength + 50);
    const lastPeriod = chunk.lastIndexOf('. ');
    const lastNewline = chunk.lastIndexOf('\n');
    const cutPoint = Math.max(lastPeriod, lastNewline);
    display = cutPoint > 150
      ? text.slice(0, cutPoint + 1) + '\u2026'
      : text.slice(0, maxLength).trim() + '\u2026';
  }

  return (
    <div>
      <CitedProse text={display} />
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            fontSize: 12, color: 'var(--accent)', background: 'none',
            border: 'none', cursor: 'pointer', padding: '0 0 8px 0',
            display: 'block'
          }}
        >
          {expanded ? '\u2191 Show less' : '\u2193 Read more'}
        </button>
      )}
    </div>
  );
}

function IcpBadge({ score }: { score: string | undefined }) {
  if (!score) return null;
  const colors: Record<string, { bg: string; border: string; icon: string }> = {
    Strong:   { bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  icon: '#22c55e' },
    Moderate: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: '#f59e0b' },
    Weak:     { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  icon: '#ef4444' },
  };
  const c = colors[score] || colors.Moderate;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 8, padding: '8px 16px',
    }}>
      <Target size={18} style={{ color: c.icon }} />
      <span style={{ fontSize: 15, fontWeight: 700, color: c.icon }}>
        {score} ICP
      </span>
    </div>
  );
}

function AgeBadge({ createdAt }: { createdAt: string | undefined }) {
  if (!createdAt) return null;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  let color = 'var(--text-secondary)';
  let bg = 'rgba(74,74,74,0.3)';
  let tooltip = '';
  if (days > 90) { color = 'var(--status-failed-text)'; bg = 'rgba(220,38,38,0.12)'; tooltip = 'Consider refreshing this brief'; }
  else if (days > 30) { color = 'var(--status-running-text)'; bg = 'rgba(217,119,6,0.15)'; tooltip = 'Consider refreshing this brief'; }
  const label = days < 1 ? 'Today' : days === 1 ? '1 day ago' : `${days}d ago`;
  return (
    <span title={tooltip} style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
      borderRadius: 4, fontSize: 12, fontWeight: 500, background: bg, color,
    }}>
      {label}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    eb: { bg: 'rgba(220,38,38,0.12)', text: 'var(--status-failed-text)' },
    EB: { bg: 'rgba(220,38,38,0.12)', text: 'var(--status-failed-text)' },
    champion: { bg: 'rgba(94,106,210,0.12)', text: 'var(--accent)' },
    Champion: { bg: 'rgba(94,106,210,0.12)', text: 'var(--accent)' },
    coach: { bg: 'rgba(74,74,74,0.3)', text: 'var(--text-secondary)' },
    Coach: { bg: 'rgba(74,74,74,0.3)', text: 'var(--text-secondary)' },
  };
  const c = colors[tier] || colors.coach;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
      borderRadius: 4, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {tier}
    </span>
  );
}

const TRIGGER_COLOURS: Record<string, string> = {
  LEADERSHIP: '#8b5cf6', BUSINESS: '#3b82f6', MARKET: '#f59e0b',
  PRODUCT: '#10b981', COMPETITIVE: '#ef4444', REGULATORY: '#6366f1',
};

function TriggerCard({ trigger }: { trigger: any }) {
  const [copied, setCopied] = useState(false);
  const borderColor = TRIGGER_COLOURS[trigger?.type?.toUpperCase()] || 'var(--accent)';

  const copyText = () => {
    const text = `${trigger?.trigger || ''}${trigger?.evidence ? '\n\n' + trigger.evidence : ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{
      position: 'relative',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 8, padding: '14px 16px', marginBottom: 8,
    }}
    onMouseEnter={e => {
      const btn = e.currentTarget.querySelector('.copy-btn') as HTMLElement;
      if (btn) btn.style.opacity = '1';
    }}
    onMouseLeave={e => {
      const btn = e.currentTarget.querySelector('.copy-btn') as HTMLElement;
      if (btn && !copied) btn.style.opacity = '0';
    }}
    >
      <button
        className="copy-btn"
        onClick={copyText}
        style={{
          position: 'absolute', top: 10, right: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          color: copied ? 'var(--status-complete-text)' : 'var(--text-tertiary)',
          opacity: 0, transition: '80ms', padding: 4, fontSize: 14,
        }}
        title="Copy to clipboard"
      >
        {copied ? '\u2713' : '\u2398'}
      </button>

      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
                    lineHeight: 1.5, marginBottom: trigger?.evidence ? 8 : 0,
                    paddingRight: 32 }}>
        {trigger?.trigger}
      </div>

      {trigger?.evidence && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
                        marginBottom: 4 }}>
            {trigger.evidence.split('\n')[0]}
          </div>
          {trigger.evidence.split('\n')[1] && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4,
                          fontStyle: 'italic' }}>
              {trigger.evidence.split('\n').slice(1).join(' ')}
            </div>
          )}
        </div>
      )}

      {trigger?.source_url && (
        <a href={trigger.source_url} target="_blank" rel="noopener noreferrer"
           style={{ fontSize: 11, color: 'var(--accent)', display: 'inline-block', marginTop: 4 }}>
          Source \u2197
        </a>
      )}

      {trigger?.type && (
        <div style={{
          display: 'inline-block',
          marginTop: 8,
          fontSize: 10, fontWeight: 600,
          color: 'var(--text-tertiary)',
          background: 'var(--bg-elevated)',
          borderRadius: 3,
          padding: '2px 6px',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          {trigger.type}
        </div>
      )}
    </div>
  );
}

const PRODUCT_COLOURS: Record<string, { bg: string; text: string }> = {
  'figma design':  { bg: 'rgba(94,106,210,0.15)',  text: '#818cf8' },
  'figjam':        { bg: 'rgba(245,158,11,0.15)',   text: '#f59e0b' },
  'dev mode':      { bg: 'rgba(16,185,129,0.15)',   text: '#10b981' },
  'code connect':  { bg: 'rgba(16,185,129,0.15)',   text: '#10b981' },
  'figma make':    { bg: 'rgba(168,85,247,0.15)',   text: '#a855f7' },
  'mcp server':    { bg: 'rgba(20,184,166,0.15)',   text: '#14b8a6' },
  'figma ai':      { bg: 'rgba(251,146,60,0.15)',   text: '#fb923c' },
  'enterprise':    { bg: 'rgba(99,102,241,0.15)',   text: '#6366f1' },
  'slides':        { bg: 'rgba(236,72,153,0.15)',   text: '#ec4899' },
};

function CopyableProductCard({ product }: { product: any }) {
  const [copied, setCopied] = useState(false);

  const copyText = () => {
    const text = `${product?.product || ''}: ${product?.relevance || ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{
      position: 'relative',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 16px', marginBottom: 8,
    }}
    onMouseEnter={e => {
      const btn = e.currentTarget.querySelector('.copy-btn') as HTMLElement;
      if (btn) btn.style.opacity = '1';
    }}
    onMouseLeave={e => {
      const btn = e.currentTarget.querySelector('.copy-btn') as HTMLElement;
      if (btn && !copied) btn.style.opacity = '0';
    }}
    >
      <button
        className="copy-btn"
        onClick={copyText}
        style={{
          position: 'absolute', top: 10, right: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          color: copied ? 'var(--status-complete-text)' : 'var(--text-tertiary)',
          opacity: 0, transition: '80ms', padding: 4, fontSize: 14,
        }}
        title="Copy to clipboard"
      >
        {copied ? '\u2713' : '\u2398'}
      </button>
      {(() => {
        const name = product?.product || '';
        const key = Object.keys(PRODUCT_COLOURS).find(k => name.toLowerCase().includes(k));
        const colour = key ? PRODUCT_COLOURS[key] : { bg: 'rgba(94,106,210,0.15)', text: '#818cf8' };
        return (
          <div style={{ display: 'inline-block', background: colour.bg, color: colour.text,
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                        marginBottom: 8, letterSpacing: '0.02em' }}>
            {name}
          </div>
        );
      })()}
      <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.9 }}>{product?.relevance}</div>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | null | undefined)[][] }) {
  if (!rows?.length) return null;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
            {headers.map((h, i) => (
              <th key={i} style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', padding: '10px 16px', textAlign: 'left' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}
              style={{ borderBottom: '1px solid var(--border)', transition: 'background 80ms' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '10px 16px', fontSize: 13, color: j === 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {cell || '\u2014'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Contact Matrix                                                     */
/* ------------------------------------------------------------------ */

const FUNCTIONS = ['design', 'engineering', 'product'] as const;
const FUNCTION_LABELS: Record<string, string> = { design: 'Design', engineering: 'Engineering', product: 'Product' };
const TIERS = ['eb', 'champion', 'coach'] as const;

function ContactRow({ contact }: { contact: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
          borderBottom: '1px solid var(--border)', cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <TierBadge tier={contact?.tier || 'coach'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{contact?.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{contact?.title}</div>
        </div>
        {contact?.email && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
            {contact.email}
          </div>
        )}
        <ChevronDown size={14} style={{
          color: 'var(--text-tertiary)', flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'none', transition: '120ms',
        }} />
      </div>
      {expanded && (
        <div style={{ padding: '12px 0 16px 0', borderBottom: '1px solid var(--border)' }}>
          {contact?.hook && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>HOOK</div>
              <div style={{ fontSize: 13 }}>{contact.hook}</div>
            </div>
          )}
          {contact?.briefing_bullets?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>BRIEFING</div>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {contact.briefing_bullets.map((b: string, i: number) => (
                  <li key={i} style={{ fontSize: 13, marginBottom: 2 }}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {contact?.recommended_angle && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>ANGLE</div>
              <div style={{ fontSize: 13 }}>{contact.recommended_angle}</div>
            </div>
          )}
          {contact?.url && (
            <a href={contact.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)', marginTop: 8 }}>
              LinkedIn <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}
    </>
  );
}

function ContactMatrix({ personas }: { personas: any }) {
  const [activeTab, setActiveTab] = useState<string>('design');
  const matrix = personas?.matrix;
  if (!matrix) return null;

  // Find first tab that has contacts
  const availableTabs = FUNCTIONS.filter(f => {
    const fn = matrix?.[f];
    if (!fn) return false;
    return TIERS.some(t => fn?.[t]?.length > 0);
  });

  const currentTab = availableTabs.includes(activeTab as any) ? activeTab : availableTabs[0] || 'design';
  const currentContacts: any[] = [];
  const fnData = matrix?.[currentTab];
  if (fnData) {
    for (const tier of TIERS) {
      const contacts = fnData?.[tier];
      if (Array.isArray(contacts)) {
        for (const c of contacts) currentContacts.push({ ...c, tier });
      }
    }
  }

  const rfm = personas?.recommended_first_move;

  return (
    <Section title="Contact Matrix">
      {rfm && (
        <div style={{
          background: 'var(--accent-subtle)', border: '1px solid rgba(94,106,210,0.2)',
          borderRadius: 8, padding: 16, marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', marginBottom: 8 }}>
            RECOMMENDED FIRST MOVE
          </div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>
            {rfm.contact_name} {rfm.title ? `\u2014 ${rfm.title}` : ''}
          </div>
          {rfm.angle && <div style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: 13 }}>{rfm.angle}</div>}
          {rfm.rationale && <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{rfm.rationale}</div>}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        {FUNCTIONS.map(f => {
          const count = TIERS.reduce((n, t) => n + (matrix?.[f]?.[t]?.length || 0), 0);
          if (count === 0) return null;
          const active = f === currentTab;
          return (
            <button key={f} onClick={() => setActiveTab(f)} style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 500, border: 'none',
              background: 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, cursor: 'pointer', transition: 'all 80ms',
            }}>
              {FUNCTION_LABELS[f] || f} ({count})
            </button>
          );
        })}
      </div>

      {/* Contact list */}
      {currentContacts.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '16px 0' }}>No contacts in this function.</div>
      ) : (
        currentContacts.map((c, i) => <ContactRow key={c?.url || c?.name || i} contact={c} />)
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  About section with markdown rendering                              */
/* ------------------------------------------------------------------ */

function AboutMarkdown({ text }: { text: string | undefined | null }) {
  if (!text) return null;
  // If it contains ## headings, render structured
  if (text.includes('##')) {
    const lines = text.split('\n');
    const html: string[] = [];
    let inList = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('## ')) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push(`<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin:16px 0 8px 0">${trimmed.replace('## ', '')}</div>`);
      } else if (trimmed.startsWith('- ')) {
        if (!inList) { html.push('<ul style="padding-left:20px;margin:0">'); inList = true; }
        html.push(`<li style="font-size:13px;margin-bottom:2px">${trimmed.replace('- ', '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`);
      } else if (trimmed) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push(`<p style="font-size:13px;margin:4px 0">${trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`);
      }
    }
    if (inList) html.push('</ul>');
    return <div dangerouslySetInnerHTML={{ __html: html.join('') }} />;
  }
  return <CitedProse text={text} />;
}

/* ------------------------------------------------------------------ */
/*  Job Signals section                                                */
/* ------------------------------------------------------------------ */

const SIGNAL_CATEGORY_COLOURS: Record<string, string> = {
  figma:            '#22c55e',
  design_maturity:  '#6366f1',
  handoff:          '#10b981',
  product_investment: '#3b82f6',
  ai_investment:    '#f59e0b',
  velocity:         '#f59e0b',
  org:              '#8b5cf6',
  tooling:          '#64748b',
};

function JobSignalsSection({ signals, extracted }: { signals: any; extracted?: any }) {
  // Use extracted signals (new three-tier format) when available
  const hasExtracted = extracted && (extracted.signals?.length > 0 || extracted.roles?.length > 0 || extracted.strategic_articles?.length > 0);

  // Fall back to legacy format
  const design = signals?.design_tool_signals || [];
  const other = signals?.other_signals || [];
  const gaps = signals?.gaps_noted;
  const synthesis = signals?.strategic_synthesis;

  if (!hasExtracted && design.length === 0 && other.length === 0 && !gaps) return null;

  return (
    <Section title="Job Signals">
      {/* Strategic synthesis */}
      {synthesis && (
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 16, padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
          {synthesis}
        </div>
      )}

      {/* Extracted signals — role summary pills */}
      {hasExtracted && extracted.roles?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {extracted.roles.map((r: any) => (
            <div key={r.role} style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 20,
              background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}>
              {r.role} <span style={{ color: 'var(--text-tertiary)' }}>×{r.count}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
            {extracted.total_jobs} postings analysed
          </div>
        </div>
      )}

      {/* Extracted signals — signal cards with category colours */}
      {hasExtracted && extracted.signals?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {extracted.signals.map((s: any, i: number) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px', borderRadius: 6,
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderLeft: `3px solid ${SIGNAL_CATEGORY_COLOURS[s.category] || 'var(--accent)'}`,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {s.signal}
                </div>
                {s.jobs?.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                    Jobs: {s.jobs.slice(0, 3).join(', ')}{s.jobs.length > 3 ? ` +${s.jobs.length - 3} more` : ''}
                  </div>
                )}
                {s.articles?.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Articles: {s.articles.slice(0, 2).join(', ')}{s.articles.length > 2 ? ` +${s.articles.length - 2} more` : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Strategic articles */}
      {hasExtracted && extracted.strategic_articles?.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>STRATEGIC ARTICLES</div>
          {extracted.strategic_articles.map((a: any, i: number) => (
            <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                {a.title}
                {a.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: 'var(--accent)', fontSize: 11 }}>
                    View <ExternalLink size={10} style={{ display: 'inline' }} />
                  </a>
                )}
              </div>
              {a.snippet && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{a.snippet}</div>}
              {a.source && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{a.source}</div>}
            </div>
          ))}
        </>
      )}

      {/* Legacy design tool signals (still rendered when present) */}
      {design.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, marginTop: hasExtracted ? 16 : 0 }}>DESIGN TOOL SIGNALS</div>
          {design.map((s: any, i: number) => (
            <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>
                {s?.role_title}
                {s?.link && (
                  <a href={s.link} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: 'var(--accent)', fontSize: 12 }}>
                    View <ExternalLink size={10} style={{ display: 'inline' }} />
                  </a>
                )}
              </div>
              {s?.evidence_snippets?.length > 0 && (
                <ul style={{ paddingLeft: 20, margin: '4px 0 0 0' }}>
                  {s.evidence_snippets.map((e: string, j: number) => (
                    <li key={j} style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{e}"</li>
                  ))}
                </ul>
              )}
              {s?.why_relevant && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{s.why_relevant}</div>}
            </div>
          ))}
        </>
      )}
      {other.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, marginTop: design.length > 0 || hasExtracted ? 16 : 0 }}>OTHER SIGNALS</div>
          {other.map((s: any, i: number) => (
            <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{s?.role_title}</div>
              {s?.signal && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{s.signal}</div>}
            </div>
          ))}
        </>
      )}
      {gaps && <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 12 }}>{gaps}</div>}

      {/* Empty state with manual search link */}
      {!hasExtracted && design.length === 0 && other.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          No design or product job postings found in search results.
          <div style={{ marginTop: 6, fontSize: 12 }}>
            Search manually: <a
              href={`https://www.linkedin.com/jobs/search/?keywords=designer`}
              target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--accent)' }}
            >LinkedIn Jobs</a>
          </div>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main BriefView page                                                */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_PROMPTS = [
  "What's the strongest angle for this account?",
  "Who should I contact first and why?",
  "Draft a cold email to the Head of Design",
  "What are the key triggers to reference on the call?",
  "Summarise the ICP fit in 2 sentences",
  "What objections should I prepare for?",
];

/* ------------------------------------------------------------------ */
/*  Source filtering                                                    */
/* ------------------------------------------------------------------ */

const NOISE_PATTERNS = [
  // Weather
  /weather/i, /storm/i, /thunder/i, /hail/i, /tornado/i,
  /hurricane/i, /lightning/i, /forecast/i, /meteorolog/i,
  // Product recalls
  /recall/i, /safety.issue/i, /burn.hazard/i, /cpsc\.gov/i,
  // Stock price / market noise
  /shares.gap/i, /gap.down/i, /gap.up/i, /instant.alert/i,
  /marketbeat\.com/i,
  // AGM / governance boilerplate
  /annual.general.meeting/i, /notice.convening/i, /agm/i,
];

const isNoisySource = (url: string, title?: string) => {
  const combined = `${url} ${title || ''}`;
  return NOISE_PATTERNS.some(p => p.test(combined));
};

/* ------------------------------------------------------------------ */
/*  Value Pyramid                                                      */
/* ------------------------------------------------------------------ */

function ValuePyramid({ pyramid }: { pyramid: any }) {
  if (!pyramid) return null;
  const { strategic, operational, tactical } = pyramid;
  if (!strategic && !operational?.length && !tactical?.length) return null;

  return (
    <Section title="Value Pyramid">
      {/* Strategic — top of pyramid */}
      {strategic && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(94,106,210,0.12), rgba(168,85,247,0.08))',
          border: '1px solid rgba(94,106,210,0.25)', borderRadius: 10,
          padding: '18px 20px', marginBottom: 16, textAlign: 'center',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)',
                        letterSpacing: '0.1em', marginBottom: 8 }}>STRATEGIC</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                        lineHeight: 1.5, marginBottom: 6 }}>{strategic.headline}</div>
          {strategic.detail && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{strategic.detail}</div>
          )}
        </div>
      )}

      {/* Operational — middle */}
      {operational?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: 10, marginBottom: 16 }}>
          {operational.map((op: any, i: number) => (
            <div key={i} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '14px 16px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b',
                            letterSpacing: '0.1em', marginBottom: 6 }}>OPERATIONAL</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{op.area}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{op.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tactical — base */}
      {tactical?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tactical.map((t: any, i: number) => (
            <div key={i} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '10px 14px', flex: '1 1 200px', minWidth: 200,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981',
                            letterSpacing: '0.1em', marginBottom: 4 }}>TACTICAL</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{t.feature}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{t.use_case}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Run History                                                        */
/* ------------------------------------------------------------------ */

function RunHistory({ currentRunId, company }: { currentRunId: string; company: string }) {
  const [runs, setRuns] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!company) return;
    supabase
      .from('runs')
      .select('id, created_at, status, brief_id')
      .ilike('company', company)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data && data.length > 1) setRuns(data);
      });
  }, [company]);

  if (runs.length < 2) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
        RUN HISTORY ({runs.length} runs)
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {runs.map((r) => {
          const active = r.id === currentRunId;
          const date = new Date(r.created_at);
          return (
            <button key={r.id} onClick={() => navigate(`/briefs/${r.id}`)} style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 4,
              background: active ? 'var(--accent)' : 'var(--bg-surface)',
              color: active ? '#fff' : 'var(--text-secondary)',
              border: active ? 'none' : '1px solid var(--border)',
              cursor: active ? 'default' : 'pointer',
            }}>
              {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Feedback Panel                                                     */
/* ------------------------------------------------------------------ */

function FeedbackPanel({ runId, session }: { runId: string; session: any }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [usefulness, setUsefulness] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);
    try {
      await fetch(`https://go.accountresearch.workers.dev/feedback/${runId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ rating, accuracy_rating: accuracy, usefulness_rating: usefulness, comment: comment || null }),
      });
      setSubmitted(true);
    } catch { /* silent */ }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '14px 18px', marginBottom: 32 }}>
        <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 500 }}>Thanks for your feedback!</div>
      </div>
    );
  }

  const StarRow = ({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', width: 90 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange(n)} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 2,
            color: value && n <= value ? '#f59e0b' : 'var(--text-tertiary)',
          }}>{value && n <= value ? '\u2605' : '\u2606'}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: 32 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'none', border: '1px solid var(--border)', borderRadius: 6,
        padding: '8px 14px', fontSize: 12, color: 'var(--text-secondary)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {open ? '\u25B2' : '\u25BC'} Rate this brief
      </button>
      {open && (
        <div style={{ marginTop: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <StarRow label="Overall" value={rating} onChange={setRating} />
          <StarRow label="Accuracy" value={accuracy} onChange={setAccuracy} />
          <StarRow label="Usefulness" value={usefulness} onChange={setUsefulness} />
          <textarea
            value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Optional comment..."
            style={{
              width: '100%', minHeight: 60, marginTop: 8, padding: 10, fontSize: 13,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-primary)', resize: 'vertical',
            }}
          />
          <button onClick={handleSubmit} disabled={!rating || submitting} style={{
            marginTop: 8, background: rating ? 'var(--accent)' : 'var(--bg-elevated)',
            color: rating ? '#fff' : 'var(--text-tertiary)',
            border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13,
            fontWeight: 500, cursor: rating ? 'pointer' : 'default',
          }}>
            {submitting ? 'Sending...' : 'Submit feedback'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Brief content (reordered sections)                                 */
/* ------------------------------------------------------------------ */

function BriefContent({ pov, personas, runId, session }: { pov: any; personas: any; runId?: string; session?: any }) {
  const [showAllSources, setShowAllSources] = useState(false);

  const strongestAngle = pov?.why_figma?.strongest_angle;
  const topTrigger = pov?.why_now?.triggers?.[0]?.trigger;
  const rfm = personas?.recommended_first_move;
  const topContact = rfm ? { name: rfm.contact_name, title: rfm.title } : null;

  const allSources = pov?.sources_used || [];
  const cleanSources = allSources.filter((s: any) => {
    const url = typeof s === 'string' ? s : (s?.url || s?.source || '');
    const title = typeof s === 'string' ? '' : (s?.title || s?.what_it_provided || '');
    if (url.length > 200) return false;
    return !isNoisySource(url, title);
  });
  const MAX_VISIBLE = 15;
  const visibleSources = showAllSources ? cleanSources : cleanSources.slice(0, MAX_VISIBLE);
  const hiddenCount = cleanSources.length - MAX_VISIBLE;

  return (
    <>
      {/* 1. Quick Summary card */}
      {(strongestAngle || topTrigger || topContact) && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 24,
          display: 'grid',
          gridTemplateColumns: topContact ? '1fr 1fr' : '1fr',
          gap: '12px 24px',
        }}>
          <div style={{ gridColumn: '1 / -1', fontSize: 11, fontWeight: 600,
                        color: 'var(--text-tertiary)', letterSpacing: '0.06em',
                        marginBottom: 4 }}>
            QUICK SUMMARY
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {strongestAngle && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>
                  STRONGEST ANGLE
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  {truncateToLine(strongestAngle, 120)}
                </div>
              </div>
            )}
            {topTrigger && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>
                  TOP TRIGGER
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  {truncateToLine(topTrigger, 120)}
                </div>
              </div>
            )}
          </div>

          {topContact && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>
                  LEAD CONTACT
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                  {topContact.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {topContact.title}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Research Gaps — amber warning banner */}
      {pov?.research_gaps && (
        <details style={{
          background: 'rgba(217,119,6,0.08)',
          border: '1px solid rgba(217,119,6,0.2)',
          borderRadius: 6,
          marginBottom: 24,
          cursor: 'pointer',
        }}>
          <summary style={{
            padding: '10px 14px',
            fontSize: 13,
            color: 'var(--status-running-text)',
            fontWeight: 500,
            listStyle: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            userSelect: 'none',
          }}>
            <span>{'\u26A0'}</span>
            <span>Research gaps — review before your call</span>
            <span style={{ marginLeft: 'auto', fontSize: 11,
                           color: 'var(--text-tertiary)' }}>click to expand</span>
          </summary>
          <div style={{ padding: '0 14px 12px 14px', fontSize: 13,
                        color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {Array.isArray(pov.research_gaps) ? (
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {pov.research_gaps.map((gap: string, i: number) => (
                  <li key={i} style={{ marginBottom: 4 }}>{gap}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0 }}>{pov.research_gaps}</p>
            )}
          </div>
        </details>
      )}

      {/* 3. About */}
      {pov?.about && (
        <Section title="About" collapsible>
          {pov.about.who_they_are && (
            <CitedProse text={pov.about.who_they_are} />
          )}
          <AboutMarkdown text={pov.about.what_they_do} />
          {pov.about.how_they_make_money && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>REVENUE MODEL</div>
              <CitedProse text={pov.about.how_they_make_money} />
            </div>
          )}

          {/* Digital products */}
          {pov?.digital_products?.length > 0 && (
            <DataTable
              headers={['Product', 'Description']}
              rows={pov.digital_products.map((p: any) => [p?.product, p?.description])}
            />
          )}

          {/* Technology partnerships */}
          {pov?.technology_partnerships?.length > 0 && (
            <DataTable
              headers={['Partner', 'Details']}
              rows={pov.technology_partnerships.map((p: any) => [p?.partner, p?.details])}
            />
          )}

          {/* Executives — stacked card layout */}
          {pov?.executives?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>KEY EXECUTIVES</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {pov.executives.map((exec: any, i: number) => (
                  <div key={i} style={{
                    padding: '12px 0',
                    borderBottom: i < pov.executives.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'grid',
                    gridTemplateColumns: '180px 1fr',
                    gap: '0 16px',
                    alignItems: 'start',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {exec?.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {exec?.title}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {exec?.significance || exec?.relevance || exec?.description || '\u2014'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Org Structure */}
      {pov?.org_structure && pov.org_structure.structure_type !== 'simple' && (
        <Section title="Organisation Structure" collapsible>
          {pov.org_structure.structure_summary && (
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>{pov.org_structure.structure_summary}</p>
          )}
          {pov.org_structure.divisions?.length > 0 && (
            <DataTable
              headers={['Division', 'Description', 'Headcount']}
              rows={pov.org_structure.divisions.map((d: any) => [
                d?.name,
                d?.description,
                d?.estimated_headcount || (d?.headcount_est ? `~${d.headcount_est.toLocaleString()}` : null),
              ])}
            />
          )}
        </Section>
      )}

      {/* 4. ICP Fit */}
      <Section title="ICP Fit">
        <CitedProse text={pov?.icp_fit?.rationale} />
      </Section>

      {/* 5. Why Anything */}
      {pov?.why_anything && (
        <Section title="Why Anything" collapsible>
          {pov.why_anything.corporate_strategy && (
            <div style={{
              background: 'rgba(94,106,210,0.06)', border: '1px solid rgba(94,106,210,0.15)',
              borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', marginBottom: 4 }}>
                CORPORATE STRATEGY
              </div>
              <div style={{ fontSize: 13 }}>{pov.why_anything.corporate_strategy}</div>
            </div>
          )}
          {pov.why_anything.strategic_objectives?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>STRATEGIC OBJECTIVES</div>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {pov.why_anything.strategic_objectives.map((obj: string, i: number) => (
                  <li key={i} style={{ fontSize: 13, marginBottom: 4, lineHeight: 1.6 }}>{obj}</li>
                ))}
              </ul>
            </div>
          )}
          {pov.why_anything.macro_forces && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>MACRO FORCES</div>
              <CitedProse text={pov.why_anything.macro_forces} />
            </div>
          )}
          {pov.why_anything.narrative && (
            <CollapsibleProse text={pov.why_anything.narrative} />
          )}
        </Section>
      )}

      {/* 6. Why Now */}
      {pov?.why_now && (
        <Section title="Why Now">
          {pov.why_now.urgency_rationale && (
            <CollapsibleProse text={pov.why_now.urgency_rationale} />
          )}
          {pov.why_now.triggers?.map((t: any, i: number) => (
            <TriggerCard key={i} trigger={t} />
          ))}
        </Section>
      )}

      {/* 7. Why Figma */}
      {pov?.why_figma && (
        <Section title="Why Figma">
          {pov.why_figma.strongest_angle && (
            <div style={{
              background: 'var(--accent-subtle)', border: '1px solid rgba(94,106,210,0.2)',
              borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', marginBottom: 4 }}>
                STRONGEST ANGLE
              </div>
              <CollapsibleProse text={pov.why_figma.strongest_angle} maxLength={200} />
            </div>
          )}
          {pov.why_figma.rationale && (
            <CollapsibleProse text={pov.why_figma.rationale} />
          )}
          {pov.why_figma.primary_products?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {pov.why_figma.primary_products.map((p: any, i: number) => (
                <CopyableProductCard key={i} product={p} />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Value Pyramid */}
      <ValuePyramid pyramid={pov?.value_pyramid} />

      {/* 8. Job Signals */}
      <JobSignalsSection signals={pov?.job_signals} extracted={pov?.job_signals_extracted} />

      {/* 9. Proof Points */}
      {pov?.proof_points?.length > 0 && (
        <Section title="Proof Points">
          {pov.proof_points.map((pp: any, i: number) => (
            <div key={i} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '12px 16px', marginBottom: 8,
            }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{pp?.reference}</div>
              {pp?.quote_or_stat && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 4 }}>
                  "{pp.quote_or_stat}"
                </div>
              )}
              {pp?.why_relevant && (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{pp.why_relevant}</div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Contact Matrix */}
      {personas && <ContactMatrix personas={personas} />}

      {/* Feedback */}
      {runId && session && <FeedbackPanel runId={runId} session={session} />}

      {/* 10. Sources */}
      {cleanSources.length > 0 && (
        <Section title="Sources">
          <div style={{ margin: 0 }}>
            {visibleSources.map((s: any, i: number) => {
              const url = typeof s === 'string' ? s : (s?.url || s?.source || '');
              const title = typeof s === 'string' ? '' : (s?.title || s?.what_it_provided || '');
              return (
                <div key={i} id={`cite-${i + 1}`} style={{ fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-tertiary)', marginRight: 6 }}>[{i + 1}]</span>
                  {url.startsWith('http') ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                      {title || url}
                    </a>
                  ) : (
                    <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{url}</span>
                  )}
                  {title && url.startsWith('http') ? null : (title && (
                    <span style={{ color: 'var(--text-tertiary)' }}> — {title}</span>
                  ))}
                </div>
              );
            })}
          </div>
          {!showAllSources && hiddenCount > 0 && (
            <button
              onClick={() => setShowAllSources(true)}
              style={{ fontSize: 12, color: 'var(--accent)', background: 'none',
                       border: 'none', cursor: 'pointer', padding: '8px 0' }}
            >
              + {hiddenCount} more sources
            </button>
          )}
        </Section>
      )}
    </>
  );
}

export default function BriefView() {
  const { run_id } = useParams<{ run_id: string }>();
  const navigate = useNavigate();
  const { session, userProfile } = useAuth();
  usePageTitle('Brief');

  const [run, setRun] = useState<Run | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'loading' | 'copied'>('idle');

  const handleShare = async () => {
    if (!session || shareStatus === 'loading') return;
    setShareStatus('loading');
    try {
      const res = await fetch(
        `https://go.accountresearch.workers.dev/share/${run_id}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }
      );
      const data = await res.json();
      const shareUrl = `${window.location.origin}/shared/${data.token}`;
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
    } catch {
      setShareStatus('idle');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(
        `https://go.accountresearch.workers.dev/run/${run_id}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }));
        alert(err.error || 'Delete failed');
        return;
      }
      navigate('/my-briefs');
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!run_id) return;
    let cancelled = false;

    async function load() {
      // Fetch run
      const { data: runData, error: runErr } = await supabase
        .from('runs')
        .select('id, company, url, created_at, status, pdf_url, excel_url, brief_id')
        .eq('id', run_id)
        .single();

      if (cancelled) return;
      if (runErr || !runData) {
        setError('Run not found.');
        setLoading(false);
        return;
      }
      setRun(runData as Run);

      // Fetch brief if brief_id exists
      if (runData.brief_id) {
        const { data: briefData } = await supabase
          .from('briefs')
          .select('pov_json, personas_json, schema_version')
          .eq('id', runData.brief_id)
          .single();
        if (!cancelled && briefData) {
          setBrief(briefData as Brief);
        }
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [run_id]);

  const pov = brief?.pov_json;
  const personas = brief?.personas_json;

  const sendMessage = async (content: string) => {
    if (!content.trim() || streaming) return;

    const userMessage: ChatMessage = { role: 'user', content };
    const newMessages = [...chatMessages, userMessage];
    setChatMessages(newMessages);
    setChatInput('');
    setStreaming(true);

    const assistantMessage: ChatMessage = { role: 'assistant', content: '' };
    setChatMessages([...newMessages, assistantMessage]);

    try {
      const res = await fetch('https://go.accountresearch.workers.dev/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          run_id,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                assistantContent += parsed.delta.text;
                setChatMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                  return updated;
                });
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      }
    } catch (err: any) {
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `Sorry, something went wrong: ${err.message}. Please try again.`
        };
        return updated;
      });
    } finally {
      setStreaming(false);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Adjust main content when chat panel is open
  const mainStyle: React.CSSProperties = {
    maxWidth: 720,
    margin: '0 auto',
    paddingBottom: 64,
    transition: 'margin-right 200ms ease',
    ...(chatOpen ? { marginRight: 380 } : {}),
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: '32px 0' }}>
          <TableSkeleton rows={8} cols={1} />
        </div>
      </Layout>
    );
  }

  if (error || !run) {
    return (
      <Layout>
        <div style={{ padding: '32px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
          {error || 'Run not found.'}
          <button onClick={() => navigate('/my-briefs')} style={{
            marginLeft: 12, background: 'none', border: 'none', color: 'var(--accent)',
            cursor: 'pointer', fontSize: 13,
          }}>
            Back to My Briefs
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={mainStyle}>
        {/* Back link */}
        <button onClick={() => navigate('/my-briefs')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 20,
        }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
        >
          <ArrowLeft size={14} /> My Briefs
        </button>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
              {pov?.company_name || run.company}
            </h1>
            {run.url && (
              <a href={run.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                {run.url} <ExternalLink size={12} />
              </a>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={handleShare} disabled={shareStatus === 'loading'} style={{
              background: 'transparent', color: shareStatus === 'copied' ? 'var(--status-complete-text)' : 'var(--text-secondary)',
              padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6,
              border: '1px solid var(--border-strong)',
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              transition: 'all 120ms',
            }}>
              <Share2 size={14} /> {shareStatus === 'copied' ? 'Link copied!' : 'Share'}
            </button>
            <button onClick={() => setChatOpen(true)} style={{
              background: 'var(--accent)', color: '#fff', padding: '6px 14px',
              fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              transition: 'background 120ms',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
            >
              <MessageSquare size={14} /> Chat
            </button>
            {run.pdf_url && (
              <a href={run.pdf_url} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6,
                border: '1px solid var(--border-strong)', color: 'var(--text-secondary)',
                textDecoration: 'none', transition: 'all 120ms',
              }}>
                <FileText size={14} /> PDF
              </a>
            )}
            {run.excel_url && (
              <a href={run.excel_url} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6,
                border: '1px solid var(--border-strong)', color: 'var(--text-secondary)',
                textDecoration: 'none', transition: 'all 120ms',
              }}>
                <Table size={14} /> Excel
              </a>
            )}
            {userProfile?.role === 'admin' && (
              <>
                {!deleteConfirm ? (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--text-tertiary)',
                      padding: '6px 12px', fontSize: 13, borderRadius: 6,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--status-failed)';
                      e.currentTarget.style.color = 'var(--status-failed)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border-strong)';
                      e.currentTarget.style.color = 'var(--text-tertiary)';
                    }}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--status-running-text)' }}>
                      Delete permanently?
                    </span>
                    <button onClick={handleDelete} disabled={deleting} style={{
                      background: 'var(--status-failed)', border: 'none', color: '#fff',
                      padding: '4px 12px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                      fontWeight: 500, opacity: deleting ? 0.6 : 1,
                    }}>{deleting ? 'Deleting...' : 'Yes, delete'}</button>
                    <button onClick={() => setDeleteConfirm(false)} style={{
                      background: 'transparent', border: '1px solid var(--border-strong)',
                      color: 'var(--text-secondary)', padding: '4px 10px',
                      fontSize: 12, borderRadius: 4, cursor: 'pointer',
                    }}>Cancel</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <IcpBadge score={pov?.icp_fit?.score} />
          <AgeBadge createdAt={run.created_at} />
        </div>

        {/* Run history */}
        <RunHistory currentRunId={run_id || ''} company={run.company} />

        {/* Old schema warning */}
        {brief && !brief.schema_version && (
          <div style={{
            background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)',
            borderRadius: 6, padding: '10px 14px', marginBottom: 20,
            fontSize: 13, color: 'var(--status-running-text)',
          }}>
            This brief was generated with an earlier pipeline version — some sections may be missing.
            {run.pdf_url && (
              <a href={run.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', marginLeft: 8 }}>
                Download full PDF <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </a>
            )}
          </div>
        )}

        {/* No brief data fallback */}
        {!pov && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Brief data not yet available
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
              The structured brief will appear here once the pipeline completes with JSON storage enabled.
            </div>
            {run.pdf_url && (
              <a href={run.pdf_url} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 6,
                background: 'var(--accent)', color: '#fff', textDecoration: 'none',
              }}>
                <FileText size={14} /> Download PDF
              </a>
            )}
          </div>
        )}

        {/* ============ Brief content sections ============ */}
        {pov && (
          <BriefContent pov={pov} personas={personas} runId={run_id} session={session} />
        )}
      </div>

      {/* Chat panel */}
      {chatOpen && (
        <div style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 380,
          background: 'var(--bg-sidebar)',
          borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          zIndex: 100,
          animation: 'slideIn 150ms ease-out',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>Chat</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                {pov?.company_name || run.company}
              </div>
            </div>
            <button onClick={() => setChatOpen(false)} style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              cursor: 'pointer', padding: 4, borderRadius: 4,
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
            {chatMessages.length === 0 ? (
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                  Ask anything about this brief
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SUGGESTED_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(prompt)}
                      style={{
                        textAlign: 'left', background: 'var(--bg-surface)',
                        border: '1px solid var(--border)', borderRadius: 6,
                        padding: '8px 12px', fontSize: 13, color: 'var(--text-secondary)',
                        cursor: 'pointer', transition: 'all 80ms',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'var(--bg-elevated)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'var(--bg-surface)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 16, lineHeight: 1.5 }}>
                  Answers are based on this brief only — verify critical facts before your meeting.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {chatMessages.map((msg, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    gap: 8,
                  }}>
                    <div style={{
                      maxWidth: '85%',
                      padding: '8px 12px',
                      borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)',
                      border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                      {streaming && i === chatMessages.length - 1 && msg.role === 'assistant' && (
                        <span style={{
                          display: 'inline-block', width: 2, height: 14,
                          background: 'var(--text-secondary)', marginLeft: 2,
                          animation: 'pulse-dot 1s ease-in-out infinite',
                          verticalAlign: 'text-bottom',
                        }} />
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(chatInput);
                  }
                }}
                placeholder="Ask about this brief..."
                disabled={streaming}
                rows={2}
                style={{
                  flex: 1, background: 'var(--bg-input)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 6, padding: '8px 12px',
                  fontSize: 13, color: 'var(--text-primary)',
                  resize: 'none', outline: 'none', fontFamily: 'inherit',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-strong)'}
              />
              <button
                onClick={() => sendMessage(chatInput)}
                disabled={!chatInput.trim() || streaming}
                style={{
                  background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 6, padding: '0 14px',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  opacity: (!chatInput.trim() || streaming) ? 0.4 : 1,
                  alignSelf: 'flex-end', height: 36,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {streaming ? '...' : <Send size={14} />}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
              Enter to send &middot; Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </Layout>
  );
}
