import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, workerFetch } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { ArrowLeft, MessageSquare, FileText, Table, X, ChevronDown, ExternalLink, Send, Trash2, Target, Zap, TrendingUp, Wrench, Building2, Users, Briefcase, BookOpen, Link2, Share2, Sun, Moon, Globe, Layers, Handshake, Activity, Search, RefreshCw } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

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
  market: string | null;
  debug_events_url: string | null;
}

const LANGUAGE_FLAGS: Record<string, string> = {
  de: '\u{1F1E9}\u{1F1EA}', fr: '\u{1F1EB}\u{1F1F7}', es: '\u{1F1EA}\u{1F1F8}',
  it: '\u{1F1EE}\u{1F1F9}', nl: '\u{1F1F3}\u{1F1F1}', pt: '\u{1F1F5}\u{1F1F9}',
  ja: '\u{1F1EF}\u{1F1F5}', ko: '\u{1F1F0}\u{1F1F7}', sv: '\u{1F1F8}\u{1F1EA}',
  no: '\u{1F1F3}\u{1F1F4}', da: '\u{1F1E9}\u{1F1F0}', fi: '\u{1F1EB}\u{1F1EE}',
};
const LANGUAGE_NAMES: Record<string, string> = {
  de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', nl: 'Dutch',
  pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', sv: 'Swedish', no: 'Norwegian',
  da: 'Danish', fi: 'Finnish',
};

interface Brief {
  pov_json: Record<string, any> | null;
  personas_json: Record<string, any> | null;
  hooks_json: Record<string, any> | null;
  schema_version: number | null;
}

/* ------------------------------------------------------------------ */
/*  Utility components                                                 */
/* ------------------------------------------------------------------ */

function SectionRow({
  icon, title, count, defaultOpen = false, iconColor, children
}: {
  icon: React.ReactNode; title: string;
  count?: string; defaultOpen?: boolean;
  iconColor?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px', cursor: 'pointer', userSelect: 'none',
          background: 'var(--bg-surface)',
          borderRadius: 10,
          border: '0.5px solid var(--border)',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: iconColor || 'rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          {icon}
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1, letterSpacing: '-0.01em' }}>{title}</span>
        {count && (
          <span style={{
            fontSize: 12, color: 'var(--text-tertiary)',
            padding: '3px 10px', background: 'rgba(255,255,255,0.06)',
            borderRadius: 20
          }}>{count}</span>
        )}
        <ChevronDown size={14} style={{
          color: 'var(--text-tertiary)',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.18s', flexShrink: 0
        }} />
      </div>
      {open && <div style={{ padding: '12px 0 8px' }}>{children}</div>}
    </div>
  );
}


function CitedProse({ text, sources }: { text: string | undefined | null; sources?: any[] }) {
  if (!text) return null;
  const html = text.replace(/\[(\d+)\]/g, (_, n: string) => {
    const idx = parseInt(n, 10) - 1;
    const src = sources?.[idx];
    const url = src ? (typeof src === 'string' ? src : (src?.url || src?.source || '')) : '';
    if (url && url.startsWith('http')) {
      return `<sup><a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none;cursor:pointer">[${n}]</a></sup>`;
    }
    return `<sup><a href="#cite-${n}" style="color:var(--accent);text-decoration:none">[${n}]</a></sup>`;
  });
  return <p style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function CollapsibleProse({ text, maxLength = 320, sources }: { text: string; maxLength?: number; sources?: any[] }) {
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
      <CitedProse text={display} sources={sources} />
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
  const colors: Record<string, { bg: string; border: string; dot: string; text: string }> = {
    Strong:   { bg: 'linear-gradient(135deg, rgba(26,58,26,0.9), rgba(13,43,13,0.9))', border: '#4a9e4a', dot: '#4a9e4a', text: '#6fcf6f' },
    Moderate: { bg: 'linear-gradient(135deg, rgba(58,40,10,0.9), rgba(43,30,8,0.9))', border: '#9e6e2a', dot: '#9e6e2a', text: '#ef9f27' },
    Weak:     { bg: 'linear-gradient(135deg, rgba(58,20,20,0.9), rgba(43,15,15,0.9))', border: '#9e3a3a', dot: '#9e3a3a', text: '#f09595' },
  };
  const c = colors[score] || colors.Moderate;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 18px', borderRadius: 20,
      background: c.bg, border: `1px solid ${c.border}`,
    }}>
      <span style={{ fontSize: 10, color: c.dot }}>{'\u25CF'}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: c.text }}>
        {score} ICP
      </span>
    </div>
  );
}

function AgeBadge({ createdAt }: { createdAt: string | undefined }) {
  if (!createdAt) return null;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  const dateLabel = days < 1 ? 'Today' : days === 1 ? '1 day ago' : `${days}d ago`;

  if (days > 90) {
    return (
      <span title="This brief is stale — consider re-running" style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px',
        borderRadius: 4, fontSize: 12, fontWeight: 500,
        background: 'rgba(220,38,38,0.12)', color: 'var(--status-failed-text)',
      }}>
        Stale — {days} days old
      </span>
    );
  }
  if (days > 30) {
    return (
      <span title="This brief may need refreshing" style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px',
        borderRadius: 4, fontSize: 12, fontWeight: 500,
        background: 'rgba(217,119,6,0.15)', color: 'var(--status-running-text)',
      }}>
        Review — {days} days old
      </span>
    );
  }
  if (days >= 7) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
        borderRadius: 4, fontSize: 12, fontWeight: 500,
        background: 'rgba(74,74,74,0.3)', color: 'var(--text-secondary)',
      }}>
        {dateLabel}
      </span>
    );
  }
  // < 7 days: no badge
  return null;
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

const TRIGGER_STYLES: Record<string, { bg: string; border: string; typeColor: string }> = {
  BUSINESS:    { bg: 'rgba(55,138,221,0.08)',   border: 'rgba(55,138,221,0.22)',   typeColor: '#85b7eb' },
  LEADERSHIP:  { bg: 'rgba(127,119,221,0.08)',  border: 'rgba(127,119,221,0.25)',  typeColor: '#afa9ec' },
  MARKET:      { bg: 'rgba(186,117,23,0.08)',   border: 'rgba(186,117,23,0.25)',   typeColor: '#ef9f27' },
  COMPETITIVE: { bg: 'rgba(228,75,74,0.08)',    border: 'rgba(228,75,74,0.22)',    typeColor: '#f09595' },
  PRODUCT:     { bg: 'rgba(29,158,117,0.08)',   border: 'rgba(29,158,117,0.22)',   typeColor: '#5dcaa5' },
  REGULATORY:  { bg: 'rgba(99,102,241,0.08)',   border: 'rgba(99,102,241,0.22)',   typeColor: '#a5b4fc' },
};

function TriggerCard({ trigger }: { trigger: any }) {
  const [copied, setCopied] = useState(false);
  const cat = (trigger?.category || trigger?.type || 'BUSINESS').toUpperCase();
  const style = TRIGGER_STYLES[cat] || TRIGGER_STYLES.BUSINESS;

  const copyText = () => {
    const text = `${trigger?.trigger || ''}${trigger?.evidence ? '\n\n' + trigger.evidence : ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{
      position: 'relative',
      background: style.bg,
      border: `1px solid ${style.border}`,
      borderRadius: 12,
      padding: '16px 18px', marginBottom: 10,
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

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: style.typeColor, marginBottom: 6 }}>
        {cat}
      </div>

      <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.65, fontWeight: 500, marginBottom: trigger?.evidence ? 6 : 0, paddingRight: 32 }}>
        {trigger?.trigger}
      </div>

      {trigger?.evidence && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          {trigger.evidence}
        </div>
      )}

      {trigger?.source_url && (
        <a href={trigger.source_url} target="_blank" rel="noopener noreferrer"
           style={{ fontSize: 11, color: 'var(--accent)', display: 'inline-block', marginTop: 4 }}>
          Source {'\u2197'}
        </a>
      )}
    </div>
  );
}

const PRODUCT_CHIP_COLOURS: Record<string, { bg: string; color: string }> = {
  'figma design':  { bg: 'rgba(55,138,221,0.2)',  color: '#85b7eb' },
  'dev mode':      { bg: 'rgba(55,138,221,0.2)',  color: '#85b7eb' },
  'code connect':  { bg: 'rgba(55,138,221,0.2)',  color: '#85b7eb' },
  'mcp server':    { bg: 'rgba(29,158,117,0.2)',  color: '#5dcaa5' },
  'governance':    { bg: 'rgba(127,119,221,0.2)', color: '#afa9ec' },
  'figjam':        { bg: 'rgba(186,117,23,0.2)',  color: '#ef9f27' },
  'figma make':    { bg: 'rgba(168,85,247,0.2)',  color: '#ddd6fe' },
  'slides':        { bg: 'rgba(228,75,74,0.15)',  color: '#f09595' },
  'figma ai':      { bg: 'rgba(251,146,60,0.15)', color: '#fb923c' },
  'enterprise':    { bg: 'rgba(99,102,241,0.15)', color: '#a5b4fc' },
};

function CopyableProductCard({ product }: { product: any }) {
  const [copied, setCopied] = useState(false);

  const copyText = () => {
    const text = `${product?.product || ''}: ${product?.relevance || ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const name = product?.product || '';
  const chipKey = Object.keys(PRODUCT_CHIP_COLOURS).find(k => name.toLowerCase().includes(k));
  const chipStyle = chipKey ? PRODUCT_CHIP_COLOURS[chipKey] : { bg: 'rgba(255,255,255,0.1)', color: '#a8a69e' };

  return (
    <div style={{
      position: 'relative',
      background: 'rgba(255,255,255,0.03)',
      border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '16px 18px', marginBottom: 8,
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
      <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, marginBottom: 10, background: chipStyle.bg, color: chipStyle.color }}>
        {name}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{product?.relevance}</div>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | null | undefined)[][] }) {
  if (!rows?.length) return null;
  return (
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                textAlign: 'left',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: 'var(--text-tertiary)',
                padding: '0 0 10px', paddingRight: i < headers.length - 1 ? 20 : 0,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '10px 0',
                  paddingRight: j < row.length - 1 ? 20 : 0,
                  borderBottom: i < rows.length - 1 ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
                  color: j === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: j === 0 ? 500 : 400,
                  verticalAlign: 'top', lineHeight: 1.6,
                }}>{cell || '\u2014'}</td>
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
  const presenceLevel = contact?.public_presence?.presence_level || contact?.presence_level;
  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
          borderBottom: expanded ? 'none' : '1px solid var(--border)', cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <TierBadge tier={contact?.tier || 'coach'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{contact?.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{contact?.title}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {contact?.departure_signal && (
            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 500 }}>Departed</span>
          )}
          {presenceLevel && presenceLevel !== 'none' && (
            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>{presenceLevel}</span>
          )}
        </div>
        <ChevronDown size={14} style={{
          color: 'var(--text-tertiary)', flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'none', transition: '120ms',
        }} />
      </div>
      {expanded && (
        <div style={{ padding: '12px 16px 16px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 8px 8px' }}>
          {/* Outreach context — primary content with purple left border */}
          {contact?.outreach_context && (
            <div style={{
              borderLeft: '3px solid #6366f1', paddingLeft: 12, fontStyle: 'italic',
              fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)', marginBottom: 16,
            }}>
              {contact.outreach_context}
            </div>
          )}

          {/* Briefing bullets */}
          {contact?.briefing_bullets?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, letterSpacing: '0.5px' }}>BRIEFING</div>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {contact.briefing_bullets.map((b: string, i: number) => (
                  <li key={i} style={{ fontSize: 13, marginBottom: 4, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Urgency triggers */}
          {contact?.urgency_triggers?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, letterSpacing: '0.5px' }}>URGENCY</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {contact.urgency_triggers.map((t: string, i: number) => (
                  <span key={i} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Recommended angle */}
          {contact?.recommended_angle && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, letterSpacing: '0.5px' }}>ANGLE</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{contact.recommended_angle}</div>
            </div>
          )}

          {/* Footer: email, presence, LinkedIn */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {contact?.email && (
              <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>{contact.email}</span>
            )}
            {presenceLevel && (
              <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>{presenceLevel} presence</span>
            )}
            {contact?.departure_signal && (
              <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Departed</span>
            )}
            {contact?.url && (
              <a href={contact.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)' }}>
                LinkedIn <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ContactMatrix({ personas, hooksData }: { personas: any; hooksData?: any }) {
  const [activeTab, setActiveTab] = useState<string>('design');
  const matrix = personas?.matrix;
  if (!matrix) return null;

  // Build a lookup from hooks contacts by name (case-insensitive)
  const hooksLookup = new Map<string, any>();
  if (hooksData?.contacts) {
    for (const hc of hooksData.contacts) {
      if (hc?.name) hooksLookup.set(hc.name.toLowerCase(), hc);
    }
  }

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
        for (const c of contacts) {
          // Merge hooks data into contact (hooks fields take priority for enriched fields)
          const hookContact = c?.name ? hooksLookup.get(c.name.toLowerCase()) : null;
          currentContacts.push({ ...c, ...hookContact, tier });
        }
      }
    }
  }

  const rfm = hooksData?.recommended_first_move || personas?.recommended_first_move;

  const totalContacts = FUNCTIONS.reduce((n, f) => n + TIERS.reduce((m, t) => m + (matrix?.[f]?.[t]?.length || 0), 0), 0);

  return (
    <SectionRow icon={<Users size={11} style={{ color: '#888780' }} />} title="Contact Matrix" count={totalContacts > 0 ? `${totalContacts} contacts` : undefined} iconColor="rgba(255,255,255,0.07)">
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
    </SectionRow>
  );
}

/* ------------------------------------------------------------------ */
/*  About section with markdown rendering                              */
/* ------------------------------------------------------------------ */

function AboutMarkdown({ text, sources }: { text: string | undefined | null; sources?: any[] }) {
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
  return <CitedProse text={text} sources={sources} />;
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

  const signalCount = (hasExtracted ? (extracted.signals?.length || 0) : 0) + design.length + other.length;
  if (!hasExtracted && design.length === 0 && other.length === 0 && !gaps) return null;

  return (
    <SectionRow icon={<Briefcase size={11} style={{ color: '#888780' }} />} title="Job Signals" count={signalCount > 0 ? `${signalCount} signals` : undefined} iconColor="rgba(55,138,221,0.12)">
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
    </SectionRow>
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

function VPCollapsibleRow({ label, children, defaultOpen = false }: { label: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 6 }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
        <div style={{ flex: 1 }}>{label}</div>
      </div>
      {open && <div style={{ paddingLeft: 18, paddingTop: 6, paddingBottom: 4 }}>{children}</div>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: 11, color: copied ? '#10b981' : 'var(--text-secondary)', opacity: 0.7 }}
      title="Copy talk track"
    >{copied ? '\u2713' : '\u{1f4cb}'}</button>
  );
}

function TalkTrack({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 4 }}>
      <div style={{ borderLeft: '2px solid #A855F7', paddingLeft: 8, fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5, flex: 1 }}>{text}</div>
      <CopyButton text={text} />
    </div>
  );
}

function ValuePyramid({ pyramid }: { pyramid: any }) {
  if (!pyramid) return null;
  const objectives = pyramid.corporate_objectives || [];
  const strategies = pyramid.business_strategies || [];
  const initiatives = pyramid.targeted_initiatives || [];
  if (!objectives.length && !strategies.length && !initiatives.length) return null;

  const totalItems = objectives.length + strategies.length + initiatives.length;

  const figmaColors: Record<string, string> = {
    'Enterprise': '#5E6AD2', 'Dev Mode': '#10b981', 'FigJam': '#f59e0b',
    'Make': '#ec4899', 'Governance+': '#8b5cf6',
  };

  return (
    <SectionRow icon={<Layers size={11} style={{ color: '#888780' }} />} title="Value Pyramid" count={`${totalItems} items`} iconColor="rgba(127,119,221,0.18)">
      {/* Layer 1: Corporate Objectives — widest */}
      <div style={{
        maxWidth: '100%', margin: '0 auto 14px',
        background: 'linear-gradient(135deg, rgba(94,106,210,0.10), rgba(168,85,247,0.06))',
        border: '1px solid rgba(94,106,210,0.20)', borderRadius: 10, padding: '14px 18px',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#5E6AD2', letterSpacing: '0.1em', marginBottom: 10 }}>
          CORPORATE OBJECTIVES <span style={{ background: 'rgba(94,106,210,0.15)', padding: '1px 6px', borderRadius: 8, fontSize: 9, marginLeft: 6 }}>{objectives.length}</span>
        </div>
        {objectives.map((o: any, i: number) => (
          <VPCollapsibleRow key={i} label={
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{o.objective}</span>
              {o.source && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{o.source}</span>}
            </div>
          }>
            <TalkTrack text={o.talk_track} />
            {o.kpis?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {o.kpis.map((k: string, ki: number) => (
                  <span key={ki} style={{ fontSize: 11, background: 'rgba(94,106,210,0.10)', color: '#5E6AD2', padding: '2px 8px', borderRadius: 4 }}>{k}</span>
                ))}
              </div>
            )}
          </VPCollapsibleRow>
        ))}
      </div>

      {/* Layer 2: Business Strategies — 92% width */}
      <div style={{
        maxWidth: '92%', margin: '0 auto 14px',
        background: 'rgba(245,158,11,0.06)',
        border: '1px solid rgba(245,158,11,0.18)', borderRadius: 10, padding: '14px 18px',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', letterSpacing: '0.1em', marginBottom: 10 }}>
          BUSINESS STRATEGIES <span style={{ background: 'rgba(245,158,11,0.12)', padding: '1px 6px', borderRadius: 8, fontSize: 9, marginLeft: 6 }}>{strategies.length}</span>
        </div>
        {strategies.map((s: any, i: number) => (
          <VPCollapsibleRow key={i} label={
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{s.strategy}</span>
              {s.linked_objective && <span style={{ fontSize: 10, background: 'rgba(94,106,210,0.10)', color: '#5E6AD2', padding: '1px 6px', borderRadius: 4 }}>{s.linked_objective}</span>}
            </div>
          }>
            <TalkTrack text={s.talk_track} />
            {s.evidence && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{s.evidence}</div>}
            {s.source_url && <a href={s.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--accent)' }}>{s.source_url}</a>}
          </VPCollapsibleRow>
        ))}
      </div>

      {/* Layer 3: Targeted Initiatives — 84% width */}
      <div style={{
        maxWidth: '84%', margin: '0 auto 14px',
        background: 'rgba(16,185,129,0.06)',
        border: '1px solid rgba(16,185,129,0.18)', borderRadius: 10, padding: '14px 18px',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', letterSpacing: '0.1em', marginBottom: 10 }}>
          TARGETED INITIATIVES <span style={{ background: 'rgba(16,185,129,0.12)', padding: '1px 6px', borderRadius: 8, fontSize: 9, marginLeft: 6 }}>{initiatives.length}</span>
        </div>
        {initiatives.map((ti: any, i: number) => (
          <VPCollapsibleRow key={i} label={
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{ti.initiative}</span>
              {ti.figma_relevance && (
                <span style={{ fontSize: 10, fontWeight: 600, background: (figmaColors[ti.figma_relevance] || '#7c3aed') + '18', color: figmaColors[ti.figma_relevance] || '#7c3aed', padding: '1px 6px', borderRadius: 4 }}>{ti.figma_relevance}</span>
              )}
            </div>
          }>
            <TalkTrack text={ti.talk_track} />
            {ti.digital_product_implication && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{ti.digital_product_implication}</div>}
            {ti.source_url && <a href={ti.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--accent)' }}>{ti.source_url}</a>}
          </VPCollapsibleRow>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', marginTop: 8 }}>
        Key Challenges, Required Capabilities, and How Figma Can Help are discovered during customer conversations.
      </div>
    </SectionRow>
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

function FeedbackPanel({ runId }: { runId: string }) {
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
      await workerFetch(`/feedback/${runId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
/*  Research Deep Dive                                                 */
/* ------------------------------------------------------------------ */

function ResearchDeepDive({ intel }: { intel: string }) {
  // Strip source decisions metadata if present
  const cleanIntel = intel.split('---SOURCE_DECISIONS_START---')[0].trim();
  // Split on ## headings (skip the preamble before first ##)
  const rawSections = cleanIntel.split(/^## /m).filter(Boolean);
  // First chunk is often the title/header before any ## — skip if it doesn't start with a number
  const sections = rawSections.filter(s => /^\d+\./.test(s.trim()));

  if (sections.length === 0) return null;

  return (
    <SectionRow
      icon={<Search size={11} style={{ color: '#c084fc' }} />}
      title="Research Deep Dive"
      count={`${sections.length} sections`}
      iconColor="rgba(168,85,247,0.18)"
    >
      {sections.map((section, i) => {
        const lines = section.split('\n');
        const heading = lines[0].trim();
        const body = lines.slice(1).join('\n').trim();
        return <DeepDiveSubsection key={i} heading={heading} body={body} />;
      })}
    </SectionRow>
  );
}

function DeepDiveSubsection({ heading, body }: { heading: string; body: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', cursor: 'pointer', userSelect: 'none',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 8,
          border: '0.5px solid var(--border)',
        }}
      >
        <ChevronDown size={12} style={{
          color: 'var(--text-tertiary)',
          transform: open ? 'rotate(180deg)' : 'rotate(-90deg)',
          transition: 'transform 0.18s', flexShrink: 0
        }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
          {heading}
        </span>
      </div>
      {open && (
        <div style={{ padding: '12px 14px 8px', fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <IntelMarkdown text={body} />
        </div>
      )}
    </div>
  );
}

function IntelMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ### subheading
    if (line.startsWith('### ')) {
      elements.push(
        <div key={i} style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
          textTransform: 'uppercase', letterSpacing: '0.03em',
          marginTop: elements.length > 0 ? 16 : 0, marginBottom: 6,
        }}>
          {line.replace(/^### /, '')}
        </div>
      );
      i++;
      continue;
    }

    // Pain quote: > *"..."*
    if (/^>\s*\*"/.test(line)) {
      // Look for [SOURCE: url] in the preceding line
      const prevLine = i > 0 ? lines[i - 1] : '';
      const srcMatch = prevLine.match(/\[SOURCE:\s*(https?:\/\/[^\]]+)\]/);
      const quoteText = line
        .replace(/^>\s*\*"?/, '')
        .replace(/"?\*\s*$/, '')
        .trim();
      elements.push(
        <div key={i} style={{
          borderLeft: '3px solid #a855f7',
          padding: '10px 14px',
          margin: '8px 0',
          background: 'rgba(168,85,247,0.06)',
          borderRadius: '0 6px 6px 0',
        }}>
          <div style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
            &ldquo;{quoteText}&rdquo;
          </div>
          {srcMatch && (
            <a
              href={srcMatch[1]}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, display: 'block', textDecoration: 'none' }}
            >
              {new URL(srcMatch[1]).hostname} &rarr;
            </a>
          )}
        </div>
      );
      i++;
      continue;
    }

    // [SOURCE: url] line — render as small linked citation
    const sourceMatch = line.match(/^\[SOURCE:\s*(https?:\/\/[^\]]+)\]\s*(.*)/);
    if (sourceMatch) {
      const url = sourceMatch[1];
      const rest = sourceMatch[2].trim();
      // If next line is a quote, skip rendering the source separately (handled by quote block above)
      if (i + 1 < lines.length && /^>\s*\*"/.test(lines[i + 1])) {
        i++;
        continue;
      }
      let hostname = url;
      try { hostname = new URL(url).hostname; } catch {}
      elements.push(
        <div key={i} style={{ marginBottom: 4 }}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', marginRight: 6 }}
          >
            [{hostname}]
          </a>
          {rest && <IntelInline text={rest} />}
        </div>
      );
      i++;
      continue;
    }

    // Inline [SOURCE: url] within a paragraph line
    if (line.includes('[SOURCE:') && !line.startsWith('[SOURCE:')) {
      elements.push(<div key={i} style={{ marginBottom: 4 }}><IntelInline text={line} /></div>);
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === '') { i++; continue; }

    // Bullet list items
    if (/^\s*[-•]\s/.test(line)) {
      const bullets: string[] = [];
      while (i < lines.length && /^\s*[-•]\s/.test(lines[i])) {
        bullets.push(lines[i].replace(/^\s*[-•]\s*/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} style={{ paddingLeft: 20, margin: '4px 0' }}>
          {bullets.map((b, j) => (
            <li key={j} style={{ marginBottom: 2, fontSize: 13 }}><IntelInline text={b} /></li>
          ))}
        </ul>
      );
      continue;
    }

    // Regular paragraph
    elements.push(<div key={i} style={{ marginBottom: 4 }}><IntelInline text={line} /></div>);
    i++;
  }

  return <>{elements}</>;
}

/** Renders inline markdown: **bold**, [SOURCE: url] inline */
function IntelInline({ text }: { text: string }) {
  // Split on **bold** and [SOURCE: url] patterns
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Find next **bold** or [SOURCE: url]
    const boldIdx = remaining.indexOf('**');
    const srcIdx = remaining.indexOf('[SOURCE:');
    const nextIdx = Math.min(
      boldIdx >= 0 ? boldIdx : Infinity,
      srcIdx >= 0 ? srcIdx : Infinity
    );

    if (nextIdx === Infinity) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    // Text before the match
    if (nextIdx > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, nextIdx)}</span>);
    }

    if (nextIdx === boldIdx) {
      const closeIdx = remaining.indexOf('**', boldIdx + 2);
      if (closeIdx > boldIdx) {
        parts.push(
          <strong key={key++} style={{ color: 'var(--text-primary)' }}>
            {remaining.slice(boldIdx + 2, closeIdx)}
          </strong>
        );
        remaining = remaining.slice(closeIdx + 2);
      } else {
        parts.push(<span key={key++}>{remaining.slice(boldIdx, boldIdx + 2)}</span>);
        remaining = remaining.slice(boldIdx + 2);
      }
    } else {
      const closeIdx = remaining.indexOf(']', srcIdx);
      if (closeIdx > srcIdx) {
        const urlMatch = remaining.slice(srcIdx, closeIdx + 1).match(/\[SOURCE:\s*(https?:\/\/[^\]]+)\]/);
        if (urlMatch) {
          let hostname = urlMatch[1];
          try { hostname = new URL(urlMatch[1]).hostname; } catch {}
          parts.push(
            <a key={key++} href={urlMatch[1]} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
            >[{hostname}]</a>
          );
        }
        remaining = remaining.slice(closeIdx + 1);
      } else {
        parts.push(<span key={key++}>{remaining.slice(srcIdx, srcIdx + 8)}</span>);
        remaining = remaining.slice(srcIdx + 8);
      }
    }
  }

  return <>{parts}</>;
}

/* ------------------------------------------------------------------ */
/*  Brief content (reordered sections)                                 */
/* ------------------------------------------------------------------ */

function BriefContent({ pov, personas, hooksData, runId, session }: { pov: any; personas: any; hooksData?: any; runId?: string; session?: any }) {
  const [showAllSources, setShowAllSources] = useState(false);

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

  const triggers = pov?.why_now?.triggers || [];
  const divisions = pov?.org_structure?.divisions || [];
  const proofPoints = pov?.proof_points || [];
  const digitalProducts = pov?.digital_products || [];
  const techPartners = pov?.technology_partnerships || [];
  const executives = pov?.executives || [];
  const products = pov?.why_figma?.primary_products || [];

  return (
    <>
      {/* 1. Research Gaps — amber warning banner */}
      {pov?.research_gaps && (
        <details style={{
          background: 'rgba(217,119,6,0.08)',
          border: '1px solid rgba(217,119,6,0.2)',
          borderRadius: 6,
          marginBottom: 12,
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

      {/* 2. ICP Fit */}
      <SectionRow icon={<Target size={11} style={{ color: '#6fcf6f' }} />} title="ICP Fit" count={pov?.icp_fit?.score || undefined} iconColor="rgba(99,153,34,0.18)">
        <CitedProse text={pov?.icp_fit?.rationale} sources={allSources} />
      </SectionRow>

      {/* 4. About */}
      {pov?.about && (
        <SectionRow icon={<Building2 size={11} style={{ color: '#888780' }} />} title="About" iconColor="rgba(255,255,255,0.07)">
          {pov.about.who_they_are && (
            <CitedProse text={pov.about.who_they_are} sources={allSources} />
          )}
          <AboutMarkdown text={pov.about.what_they_do} sources={allSources} />
          {pov.about.how_they_make_money && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>REVENUE MODEL</div>
              <CitedProse text={pov.about.how_they_make_money} sources={allSources} />
            </div>
          )}
        </SectionRow>
      )}

      {/* 5. Organisation Structure */}
      {pov?.org_structure && pov.org_structure.structure_type !== 'simple' && (
        <SectionRow icon={<Building2 size={11} style={{ color: '#888780' }} />} title="Organisation Structure" count={divisions.length > 0 ? `${divisions.length} divisions` : undefined} iconColor="rgba(255,255,255,0.07)">
          {pov.org_structure.structure_summary && (
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>{pov.org_structure.structure_summary}</p>
          )}
          {divisions.length > 0 && (
            <DataTable
              headers={['Division', 'Description', 'Headcount']}
              rows={divisions.map((d: any) => [
                d?.name,
                d?.description,
                d?.estimated_headcount || (d?.headcount_est ? `~${d.headcount_est.toLocaleString()}` : null),
              ])}
            />
          )}
        </SectionRow>
      )}

      {/* 6. Why Anything */}
      {pov?.why_anything && (
        <SectionRow icon={<TrendingUp size={11} style={{ color: '#ef9f27' }} />} title="Why Anything" count={pov.why_anything.strategic_objectives?.length ? `${pov.why_anything.strategic_objectives.length} objectives` : undefined} iconColor="rgba(186,117,23,0.18)">
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
              <CitedProse text={pov.why_anything.macro_forces} sources={allSources} />
            </div>
          )}
          {pov.why_anything.narrative && (
            <CollapsibleProse text={pov.why_anything.narrative} sources={allSources} />
          )}
        </SectionRow>
      )}

      {/* 6. Why Now */}
      {triggers.length > 0 && (
        <SectionRow icon={<Zap size={11} style={{ color: '#85b7eb' }} />} title="Why Now" count={`${triggers.length} triggers`} iconColor="rgba(55,138,221,0.18)">
          {pov?.why_now?.urgency_rationale && (
            <CollapsibleProse text={pov.why_now.urgency_rationale} sources={allSources} />
          )}
          {triggers.map((t: any, i: number) => (
            <TriggerCard key={i} trigger={t} />
          ))}
        </SectionRow>
      )}

      {/* 8. Why Figma */}
      {pov?.why_figma && (
        <SectionRow icon={<Wrench size={11} style={{ color: '#afa9ec' }} />} title="Why Figma" count={products.length > 0 ? `${products.length} products` : undefined} iconColor="rgba(127,119,221,0.18)">
          {pov.why_figma.strongest_angle && (
            <div style={{
              background: 'var(--accent-subtle)', border: '1px solid rgba(94,106,210,0.2)',
              borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', marginBottom: 4 }}>
                STRONGEST ANGLE
              </div>
              <CollapsibleProse text={pov.why_figma.strongest_angle} maxLength={200} sources={allSources} />
            </div>
          )}
          {pov.why_figma.rationale && (
            <CollapsibleProse text={pov.why_figma.rationale} sources={allSources} />
          )}
          {products.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {products.map((p: any, i: number) => (
                <CopyableProductCard key={i} product={p} />
              ))}
            </div>
          )}

          {/* Design Infrastructure */}
          {pov.why_figma.design_infrastructure && (() => {
            const di = pov.why_figma.design_infrastructure;
            const hasContent = (di.named_systems?.length > 0) || (di.confirmed_tools?.length > 0) || di.design_team_size || di.handoff_approach || di.multi_brand_complexity;
            if (!hasContent) return null;
            return (
              <div style={{ marginTop: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Design Infrastructure</div>

                {di.named_systems?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Named Systems</div>
                    {di.named_systems.map((sys: any, i: number) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '8px 0', borderBottom: i < di.named_systems.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                        <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{sys.name}</span></div>
                        <div style={{ color: 'var(--text-secondary)' }}>{sys.scope}</div>
                        <div style={{ color: 'var(--text-tertiary)' }}>{sys.maturity}</div>
                      </div>
                    ))}
                  </div>
                )}

                {di.confirmed_tools?.length > 0 && (
                  <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {di.confirmed_tools.map((tool: string, i: number) => (
                      <span key={i} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(127,119,221,0.12)', color: 'var(--accent)', fontWeight: 500 }}>{tool}</span>
                    ))}
                  </div>
                )}

                {di.design_team_size && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}><strong>Team size:</strong> {di.design_team_size}</div>
                )}
                {di.handoff_approach && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}><strong>Handoff:</strong> {di.handoff_approach}</div>
                )}
                {di.multi_brand_complexity && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}><strong>Multi-brand:</strong> {di.multi_brand_complexity}</div>
                )}
              </div>
            );
          })()}

          {/* Pain Signals */}
          {pov.why_figma.pain_signals?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Pain Signals</div>
              {pov.why_figma.pain_signals.map((ps: any, i: number) => (
                <div key={i} style={{ borderLeft: '3px solid #a855f7', background: 'rgba(168,85,247,0.06)', borderRadius: '0 8px 8px 0', padding: '10px 14px', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-primary)', lineHeight: 1.6 }}>"{ps.quote}"</div>
                  {ps.speaker && <div style={{ fontSize: 11, fontWeight: 500, color: '#a855f7', marginTop: 4 }}>{ps.speaker}</div>}
                  {ps.relevance && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{ps.relevance}</div>}
                  {ps.source && (
                    <a href={ps.source} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4, display: 'inline-block' }}>Source</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionRow>
      )}

      {/* 9. Value Pyramid */}
      {pov?.value_pyramid && <ValuePyramid pyramid={pov.value_pyramid} />}

      {/* 10. Job Signals */}
      <JobSignalsSection signals={pov?.job_signals} extracted={pov?.job_signals_extracted} />

      {/* 11. Digital Products */}
      {digitalProducts.length > 0 && (
        <SectionRow icon={<Globe size={11} style={{ color: '#888780' }} />} title="Digital Products" count={`${digitalProducts.length} products`} iconColor="rgba(29,158,117,0.15)">
          <DataTable
            headers={['Product', 'Description']}
            rows={digitalProducts.map((p: any) => [p?.product, p?.description])}
          />
        </SectionRow>
      )}

      {/* 12. Contact Matrix */}
      {personas && <ContactMatrix personas={personas} hooksData={hooksData} />}

      {/* 13. Research Deep Dive */}
      {pov?.distilled_intel && <ResearchDeepDive intel={pov.distilled_intel} />}

      {/* 14. Key Executives */}
      {executives.length > 0 && (
        <SectionRow icon={<Users size={11} style={{ color: '#888780' }} />} title="Key Executives" count={`${executives.length} found`} iconColor="rgba(255,255,255,0.07)">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {executives.map((exec: any, i: number) => (
              <div key={i} style={{
                padding: '12px 0',
                borderBottom: i < executives.length - 1 ? '1px solid var(--border)' : 'none',
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
        </SectionRow>
      )}

      {/* 15. Technology Partnerships */}
      {techPartners.length > 0 && (
        <SectionRow icon={<Handshake size={11} style={{ color: '#888780' }} />} title="Technology Partnerships" count={`${techPartners.length} partners`} iconColor="rgba(255,255,255,0.07)">
          <DataTable
            headers={['Partner', 'Details']}
            rows={techPartners.map((p: any) => [p?.partner, p?.details])}
          />
        </SectionRow>
      )}

      {/* 16. Proof Points */}
      {proofPoints.length > 0 && (
        <SectionRow icon={<BookOpen size={11} style={{ color: '#888780' }} />} title="Proof Points" count={`${proofPoints.length} found`} iconColor="rgba(186,117,23,0.12)">
          {proofPoints.map((pp: any, i: number) => (
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
        </SectionRow>
      )}

      {/* 17. Sources */}
      {cleanSources.length > 0 && (
        <SectionRow icon={<Link2 size={11} style={{ color: '#888780' }} />} title="Sources" count={`${cleanSources.length} sources`} iconColor="rgba(255,255,255,0.07)">
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
        </SectionRow>
      )}

      {/* 18. Feedback */}
      {runId && session && <FeedbackPanel runId={runId} />}
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
  const [runningEnglish, setRunningEnglish] = useState(false);
  const [englishSubmitted, setEnglishSubmitted] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [rerenderDone, setRerenderDone] = useState(false);

  const { theme, toggle: toggleTheme } = useTheme();

  const handleRunInEnglish = async () => {
    if (!session || !run) return;
    setRunningEnglish(true);
    try {
      await workerFetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: run.company,
          url: run.url,
          market: 'en',
        }),
      });
      setEnglishSubmitted(true);
    } catch { /* ignore */ }
    finally { setRunningEnglish(false); }
  };

  const handleShare = async () => {
    if (!session || shareStatus === 'loading') return;
    setShareStatus('loading');
    try {
      const res = await workerFetch(`/share/${run_id}`, { method: 'POST' });
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
      const res = await workerFetch(`/run/${run_id}`, { method: 'DELETE' });
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
  const handleRegeneratePdf = async () => {
    if (!session || !run) return;
    setRerendering(true);
    try {
      const res = await workerFetch(`/regenerate-pdf/${run.id}`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Re-render failed' }));
        alert(err.error || 'Re-render failed');
        return;
      }
      setRerenderDone(true);
      setTimeout(() => setRerenderDone(false), 3000);
    } catch (err: any) {
      alert('Re-render failed: ' + err.message);
    } finally {
      setRerendering(false);
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
        .select('id, company, url, created_at, status, pdf_url, excel_url, brief_id, market, debug_events_url')
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
          .select('pov_json, personas_json, hooks_json, schema_version')
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
  const hooksData = brief?.hooks_json;

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
      const res = await workerFetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    maxWidth: 960,
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
            {run.market && run.market !== 'en' && run.market !== 'auto' && LANGUAGE_FLAGS[run.market] && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)',
                             display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                {LANGUAGE_FLAGS[run.market]} {LANGUAGE_NAMES[run.market] || run.market} brief
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={toggleTheme} style={{
              width: 30, height: 30, borderRadius: 7,
              border: '0.5px solid var(--border-strong)',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
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
                <FileText size={14} /> {run.market && run.market !== 'en' && run.market !== 'auto' && LANGUAGE_FLAGS[run.market]
                  ? `${LANGUAGE_FLAGS[run.market]} PDF` : 'PDF'}
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
            {run.debug_events_url && (
              <a href={`/AccountResearcherPortal/debug/${run.id}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6,
                border: '1px solid var(--border-strong)', color: 'var(--text-secondary)',
                textDecoration: 'none', transition: 'all 120ms',
              }}>
                <Activity size={14} /> Debug
              </a>
            )}
            {run.market && run.market !== 'en' && run.market !== 'auto' && !englishSubmitted && (
              <button onClick={handleRunInEnglish} disabled={runningEnglish} style={{
                background: 'transparent', border: '1px solid var(--border-strong)',
                color: 'var(--text-tertiary)', padding: '6px 12px',
                fontSize: 12, borderRadius: 6, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {'\u{1F1EC}\u{1F1E7}'} {runningEnglish ? 'Submitting\u2026' : 'Also run in English'}
              </button>
            )}
            {englishSubmitted && (
              <span style={{ fontSize: 12, color: 'var(--status-complete-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {'\u{1F1EC}\u{1F1E7}'} English run submitted
              </span>
            )}
            {userProfile?.role === 'admin' && run.status === 'complete' && (
              <button
                onClick={handleRegeneratePdf}
                disabled={rerendering || rerenderDone}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-strong)',
                  color: rerenderDone ? 'var(--status-complete-text)' : 'var(--text-tertiary)',
                  padding: '6px 12px', fontSize: 13, borderRadius: 6,
                  cursor: rerendering || rerenderDone ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: rerendering ? 0.6 : 1,
                }}
                onMouseEnter={e => { if (!rerendering && !rerenderDone) e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={e => { if (!rerenderDone) e.currentTarget.style.color = 'var(--text-tertiary)'; }}
              >
                <RefreshCw size={14} style={rerendering ? { animation: 'spin 1s linear infinite' } : undefined} />
                {rerendering ? 'Re-rendering\u2026' : rerenderDone ? 'Dispatched!' : 'Re-render PDF'}
              </button>
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
          <BriefContent pov={pov} personas={personas} hooksData={hooksData} runId={run_id} session={session} />
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
