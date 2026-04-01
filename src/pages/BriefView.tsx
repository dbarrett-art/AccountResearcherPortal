import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, workerFetch } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { ArrowLeft, MessageSquare, FileText, Table, X, ChevronDown, ExternalLink, Send, Trash2, Activity, Share2, RefreshCw } from 'lucide-react';

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

interface Brief {
  pov_json: Record<string, any> | null;
  personas_json: Record<string, any> | null;
  hooks_json: Record<string, any> | null;
  value_pyramid: Record<string, any> | null;
  schema_version: number | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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

const SUGGESTED_PROMPTS = [
  "What's the strongest angle for this account?",
  "Who should I contact first and why?",
  "Draft a cold email to the Head of Design",
  "What are the key triggers to reference on the call?",
  "Summarise the ICP fit in 2 sentences",
  "What objections should I prepare for?",
];

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/* ------------------------------------------------------------------ */

const FONTS = {
  serif: "'Newsreader', Georgia, serif",
  sans: "'DM Sans', system-ui, sans-serif",
};

const COLORS = {
  bg: '#fdfcfa',
  border: '#f0ede8',
  borderLight: '#f5f3ef',
  faint: '#a8a29e',
  body: '#44403c',
  secondary: '#57534e',
  tertiary: '#78716c',
  purple: '#7c3aed',
};

const SECTION_ACCENTS: Record<string, string> = {
  icp: '#059669',
  about: '#6366f1',
  whyAnything: '#ca8a04',
  whyNow: '#dc2626',
  whyFigma: '#7c3aed',
  researchDeepDive: '#0891b2',
  valuePyramid: '#059669',
  jobSignals: '#4361ee',
  digitalProducts: '#0891b2',
  contacts: '#059669',
  keyExecutives: '#059669',
  techPartners: '#4361ee',
};

const TRIGGER_COLORS: Record<string, { border: string; text: string }> = {
  BUSINESS:    { border: '#4361ee', text: '#2b3a8e' },
  LEADERSHIP:  { border: '#7c3aed', text: '#5521a6' },
  REGULATORY:  { border: '#dc2626', text: '#991b1b' },
  COMPETITIVE: { border: '#ca8a04', text: '#854d0e' },
  MARKET:      { border: '#ca8a04', text: '#854d0e' },
  PRODUCT:     { border: '#059669', text: '#065f46' },
};

const SIGNAL_CATEGORY_COLOURS: Record<string, string> = {
  // Title case
  'Design Infrastructure': '#8b5cf6',
  'Design Hiring':         '#0ea5e9',
  'Product Velocity':      '#10b981',
  'Design Maturity':       '#ca8a04',
  'AI/Automation':         '#ef4444',
  'AI / Automation':       '#ef4444',
  'Platform/Systems':      '#6366f1',
  'Platform / Systems':    '#6366f1',
  // Snake case (as produced by current pipeline)
  'figma':                 '#7c3aed',
  'design_system':         '#8b5cf6',
  'design_infrastructure': '#8b5cf6',
  'design_hiring':         '#0ea5e9',
  'product_velocity':      '#10b981',
  'design_maturity':       '#ca8a04',
  'ai_automation':         '#ef4444',
  'platform_systems':      '#6366f1',
  'hiring':                '#0ea5e9',
  'tooling':               '#7c3aed',
  'ai':                    '#ef4444',
  'product':               '#10b981',
};

function formatCategory(cat: string): string {
  return cat
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  eb: { bg: '#ecfdf5', text: '#065f46' },
  EB: { bg: '#ecfdf5', text: '#065f46' },
  champion: { bg: '#eef2ff', text: '#3730a3' },
  Champion: { bg: '#eef2ff', text: '#3730a3' },
  coach: { bg: '#f5f5f0', text: '#78716c' },
  Coach: { bg: '#f5f5f0', text: '#78716c' },
};

/* ------------------------------------------------------------------ */
/*  Source filtering                                                    */
/* ------------------------------------------------------------------ */

const NOISE_PATTERNS = [
  /weather/i, /storm/i, /thunder/i, /hail/i, /tornado/i,
  /hurricane/i, /lightning/i, /forecast/i, /meteorolog/i,
  /recall/i, /safety.issue/i, /burn.hazard/i, /cpsc\.gov/i,
  /shares.gap/i, /gap.down/i, /gap.up/i, /instant.alert/i,
  /marketbeat\.com/i,
  /annual.general.meeting/i, /notice.convening/i, /agm/i,
];

const isNoisySource = (url: string, title?: string) => {
  const combined = `${url} ${title || ''}`;
  return NOISE_PATTERNS.some(p => p.test(combined));
};

/* ------------------------------------------------------------------ */
/*  Shared components: Section, ItemChevron, Trunc, DataRow            */
/* ------------------------------------------------------------------ */

function Section({
  title, accent, badge, count, defaultOpen = false, children,
}: {
  title: string;
  accent: string;
  badge?: React.ReactNode;
  count?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 0', cursor: 'pointer', userSelect: 'none',
          background: 'transparent',
          borderRadius: 0,
          border: 'none',
          borderBottom: `1px solid ${COLORS.border}`,
          borderLeft: `4px solid ${accent}`,
          paddingLeft: 14,
        }}
      >
        <span style={{
          fontFamily: FONTS.serif, fontSize: 16, fontWeight: 500,
          color: COLORS.body, flex: 1,
        }}>
          {title}
        </span>
        {badge}
        {count && (
          <span style={{
            fontSize: 12, color: COLORS.tertiary,
            padding: '3px 10px', background: '#f5f5f0',
            borderRadius: 20, fontFamily: FONTS.sans,
          }}>
            {count}
          </span>
        )}
        <ChevronDown size={16} style={{
          color: COLORS.faint,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.18s', flexShrink: 0,
        }} />
      </div>
      {open && (
        <div style={{ padding: '12px 18px 16px', background: 'transparent' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ItemChevron({
  open, onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 22, height: 22, borderRadius: 5,
        background: open ? '#eef2ff' : '#f5f5f0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
        transition: 'background 0.15s',
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" style={{
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform 0.18s',
      }}>
        <path d="M2 3.5L5 6.5L8 3.5" stroke={open ? '#4361ee' : '#78716c'} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Trunc({
  children, lines = 2, expanded, onToggle,
}: {
  children: React.ReactNode;
  lines?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsTrunc, setNeedsTrunc] = useState(false);

  useEffect(() => {
    if (contentRef.current) {
      const lineHeight = parseFloat(getComputedStyle(contentRef.current).lineHeight) || 20;
      setNeedsTrunc(contentRef.current.scrollHeight > lineHeight * lines + 4);
    }
  }, [children, lines]);

  return (
    <div>
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div
          ref={contentRef}
          style={{
            maxHeight: expanded || !needsTrunc ? 'none' : `${lines * 1.65}em`,
            overflow: 'hidden',
            lineHeight: 1.65,
          }}
        >
          {children}
        </div>
        {!expanded && needsTrunc && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '2em',
            background: `linear-gradient(transparent, ${COLORS.bg})`,
          }} />
        )}
      </div>
      {needsTrunc && (
        <button
          onClick={onToggle}
          style={{
            fontSize: 13, color: COLORS.purple, background: 'none',
            border: 'none', cursor: 'pointer', padding: '4px 0',
            fontFamily: FONTS.sans, fontWeight: 500,
          }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

function DataRow({
  accent, title, subtitle, children,
}: {
  accent: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', gap: 16, padding: '14px 0',
      borderBottom: `1px solid ${COLORS.borderLight}`,
      borderLeft: `3px solid ${accent}`,
      paddingLeft: 14,
    }}>
      <div style={{ width: 180, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.body, fontFamily: FONTS.sans }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: COLORS.tertiary, fontFamily: FONTS.sans, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ flex: 1, fontSize: 14, color: COLORS.secondary, lineHeight: 1.65, fontFamily: FONTS.sans }}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Utility: inline markdown + cited prose                             */
/* ------------------------------------------------------------------ */

function IntelInline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
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

    if (nextIdx > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, nextIdx)}</span>);
    }

    if (nextIdx === boldIdx) {
      const closeIdx = remaining.indexOf('**', boldIdx + 2);
      if (closeIdx > boldIdx) {
        parts.push(<strong key={key++} style={{ color: COLORS.body }}>{remaining.slice(boldIdx + 2, closeIdx)}</strong>);
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
              style={{ fontSize: 11, color: COLORS.purple, textDecoration: 'none' }}
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

function CitedProse({ text, sources }: { text: string | undefined | null; sources?: any[] }) {
  if (!text) return null;
  const html = text.replace(/\[(\d+)\]/g, (_, n: string) => {
    const idx = parseInt(n, 10) - 1;
    const src = sources?.[idx];
    const url = src ? (typeof src === 'string' ? src : (src?.url || src?.source || '')) : '';
    if (url && url.startsWith('http')) {
      return `<sup><a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer" style="color:${COLORS.purple};text-decoration:none;cursor:pointer">[${n}]</a></sup>`;
    }
    return `<sup style="color:${COLORS.faint}">[${n}]</sup>`;
  });
  return (
    <p style={{
      fontSize: 15, lineHeight: 1.75, color: COLORS.body,
      fontFamily: FONTS.sans, margin: 0,
    }} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/* ------------------------------------------------------------------ */
/*  Intel markdown renderer (for Research Deep Dive)                   */
/* ------------------------------------------------------------------ */

function IntelMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ') && !line.startsWith('### ')) {
      elements.push(
        <div key={i} style={{
          fontSize: 14, fontWeight: 700, color: COLORS.body,
          textTransform: 'uppercase', letterSpacing: '0.04em',
          marginTop: elements.length > 0 ? 20 : 0, marginBottom: 8,
          fontFamily: FONTS.sans,
        }}>
          {line.replace(/^## /, '')}
        </div>
      );
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      elements.push(
        <div key={i} style={{
          fontSize: 13, fontWeight: 600, color: COLORS.body,
          textTransform: 'uppercase', letterSpacing: '0.03em',
          marginTop: elements.length > 0 ? 16 : 0, marginBottom: 6,
          fontFamily: FONTS.sans,
        }}>
          {line.replace(/^### /, '')}
        </div>
      );
      i++;
      continue;
    }

    if (/^>\s*\*"/.test(line)) {
      const prevLine = i > 0 ? lines[i - 1] : '';
      const srcMatch = prevLine.match(/\[SOURCE:\s*(https?:\/\/[^\]]+)\]/);
      const quoteText = line.replace(/^>\s*\*"?/, '').replace(/"?\*\s*$/, '').trim();
      elements.push(
        <div key={i} style={{
          borderLeft: `3px solid ${COLORS.purple}`,
          padding: '10px 14px', margin: '8px 0',
          borderRadius: '0 6px 6px 0',
        }}>
          <div style={{ fontStyle: 'italic', fontSize: 14, color: COLORS.body, lineHeight: 1.6, fontFamily: FONTS.serif }}>
            &ldquo;{quoteText}&rdquo;
          </div>
          {srcMatch && (
            <a href={srcMatch[1]} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: COLORS.tertiary, marginTop: 6, display: 'block', textDecoration: 'none' }}>
              {new URL(srcMatch[1]).hostname} &rarr;
            </a>
          )}
        </div>
      );
      i++;
      continue;
    }

    const sourceMatch = line.match(/^\[SOURCE:\s*(https?:\/\/[^\]]+)\]\s*(.*)/);
    if (sourceMatch) {
      const url = sourceMatch[1];
      const rest = sourceMatch[2].trim();
      if (i + 1 < lines.length && /^>\s*\*"/.test(lines[i + 1])) { i++; continue; }
      let hostname = url;
      try { hostname = new URL(url).hostname; } catch {}
      elements.push(
        <div key={i} style={{ marginBottom: 4 }}>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: COLORS.purple, textDecoration: 'none', marginRight: 6 }}>
            [{hostname}]
          </a>
          {rest && <IntelInline text={rest} />}
        </div>
      );
      i++;
      continue;
    }

    if (line.includes('[SOURCE:') && !line.startsWith('[SOURCE:')) {
      elements.push(<div key={i} style={{ marginBottom: 4 }}><IntelInline text={line} /></div>);
      i++;
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    if (/^\s*[-\u2022]\s/.test(line)) {
      const bullets: string[] = [];
      while (i < lines.length && /^\s*[-\u2022]\s/.test(lines[i])) {
        bullets.push(lines[i].replace(/^\s*[-\u2022]\s*/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} style={{ paddingLeft: 20, margin: '4px 0' }}>
          {bullets.map((b, j) => (
            <li key={j} style={{ marginBottom: 2, fontSize: 14, color: COLORS.secondary }}><IntelInline text={b} /></li>
          ))}
        </ul>
      );
      continue;
    }

    elements.push(<div key={i} style={{ marginBottom: 4, fontSize: 14, color: COLORS.secondary }}><IntelInline text={line} /></div>);
    i++;
  }

  return <>{elements}</>;
}

/* ------------------------------------------------------------------ */
/*  Badges                                                             */
/* ------------------------------------------------------------------ */

function IcpBadge({ score, size = 'normal' }: { score: string | undefined; size?: 'normal' | 'small' }) {
  if (!score) return null;
  const isStrong = score === 'Strong';
  const isModerate = score === 'Moderate';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: size === 'small' ? '2px 8px' : '4px 12px',
      borderRadius: 4, fontFamily: FONTS.sans,
      fontSize: size === 'small' ? 10 : 11,
      fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
      background: isStrong ? '#ecfdf5' : isModerate ? '#fefce8' : '#fef2f2',
      color: isStrong ? '#065f46' : isModerate ? '#854d0e' : '#991b1b',
    }}>
      {score} ICP
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const c = TIER_COLORS[tier] || TIER_COLORS.coach;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
      borderRadius: 4, fontSize: 10, fontWeight: 700,
      background: c.bg, color: c.text,
      textTransform: 'uppercase', letterSpacing: '0.04em',
      fontFamily: FONTS.sans,
    }}>
      {tier}
    </span>
  );
}

function AgeBadge({ createdAt }: { createdAt: string | undefined }) {
  if (!createdAt) return null;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days < 1) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
        borderRadius: 4, fontSize: 11, fontWeight: 500, fontFamily: FONTS.sans,
        background: '#ecfdf5', color: '#065f46',
      }}>Today</span>
    );
  }
  if (days > 90) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
        borderRadius: 4, fontSize: 11, fontWeight: 500, fontFamily: FONTS.sans,
        background: '#fef2f2', color: '#991b1b',
      }}>Stale — {days}d old</span>
    );
  }
  if (days > 30) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
        borderRadius: 4, fontSize: 11, fontWeight: 500, fontFamily: FONTS.sans,
        background: '#fefce8', color: '#854d0e',
      }}>Review — {days}d old</span>
    );
  }
  if (days >= 7) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
        borderRadius: 4, fontSize: 11, fontWeight: 500, fontFamily: FONTS.sans,
        background: '#f5f5f0', color: COLORS.tertiary,
      }}>{days}d ago</span>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Header metrics bar                                                 */
/* ------------------------------------------------------------------ */

function extractMetricFromProse(...texts: (string | undefined | null)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    // Revenue patterns: "$X billion", "€X billion", "£X million", "USD X.X billion", "revenue of $X"
    const revMatch = text.match(/(?:revenue[^.]*?)?[\$€£][\s]?[\d,.]+\s*(?:billion|million|trillion|bn|mn|B|M|T)/i)
      || text.match(/(?:USD|EUR|GBP|CHF)\s?[\d,.]+\s*(?:billion|million|trillion|bn|mn|B|M|T)/i);
    if (revMatch) return revMatch[0].replace(/^revenue[^$€£]*/i, '').trim();
  }
  return null;
}

function extractEmployeesFromProse(...texts: (string | undefined | null)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    // "~52,000 employees", "over 200,000 staff", "10,000+ employees", "workforce of 50,000"
    const empMatch = text.match(/(?:~|approximately |about |over |nearly |around )?[\d,]+\+?\s*(?:employees|staff|people|team members|workforce)/i)
      || text.match(/(?:workforce|headcount|team)\s+(?:of\s+)?(?:~|approximately |about |over |nearly |around )?[\d,]+/i);
    if (empMatch) {
      // Extract just the number portion
      const numMatch = empMatch[0].match(/((?:~|approximately |about |over |nearly |around )?[\d,]+\+?)/i);
      return numMatch ? numMatch[1].trim() : empMatch[0].trim();
    }
  }
  return null;
}

function extractDesignOrgFromProse(...texts: (string | undefined | null)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    const m = text.match(/(?:design\s+(?:team|org|organisation|organization|department|function))[^.]*?(?:of\s+)?(?:~|approximately |about |over |nearly |around )?([\d,]+\+?)/i)
      || text.match(/([\d,]+\+?)\s*(?:designers?|UX\s+(?:designers?|researchers?))/i);
    if (m) return m[1].trim();
  }
  return null;
}

function MetricsBar({ pov, personas }: { pov: any; hooksData?: any; personas?: any }) {
  // Try structured fields first, then extract from prose
  const revenue = pov?.overview?.revenue || pov?.about?.revenue
    || extractMetricFromProse(pov?.about?.how_they_make_money, pov?.about?.what_they_do);
  const employees = pov?.overview?.employees
    || pov?.about?.employees
    || pov?.about?.headcount
    || pov?.overview?.headcount
    || pov?.org_structure?.total_headcount
    || extractEmployeesFromProse(pov?.about?.what_they_do, pov?.about?.who_they_are, pov?.org_structure?.structure_summary, pov?.about?.how_they_make_money);
  const designOrg = pov?.overview?.design_org_size
    || pov?.org_structure?.design_team_size
    || pov?.why_figma?.design_org?.estimated_size
    || pov?.why_figma?.design_org?.team_size
    || pov?.why_figma?.design_infrastructure?.design_team_size
    || pov?.why_figma?.design_infrastructure?.team_size
    || extractDesignOrgFromProse(
        pov?.why_figma?.design_org?.notes,
        pov?.why_figma?.primary_products?.[0]?.relevance,
        pov?.about?.what_they_do,
      );
  const triggers = pov?.why_now?.triggers || [];
  const triggerBreakdown = triggers.reduce((acc: Record<string, number>, t: any) => {
    const cat = (t?.category || t?.type || 'other').toUpperCase();
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  // Count contacts
  const matrix = personas?.matrix;
  let totalContacts = 0;
  let ebCount = 0;
  let champCount = 0;
  if (matrix) {
    for (const fn of ['design', 'engineering', 'product']) {
      for (const tier of ['eb', 'champion', 'coach']) {
        const count = matrix?.[fn]?.[tier]?.length || 0;
        totalContacts += count;
        if (tier === 'eb') ebCount += count;
        if (tier === 'champion') champCount += count;
      }
    }
  }

  const items: { label: string; value: string; sub?: string }[] = [];
  if (revenue) items.push({ label: 'REVENUE', value: typeof revenue === 'string' ? revenue : `$${revenue}` });
  if (employees) items.push({ label: 'EMPLOYEES', value: typeof employees === 'number' ? employees.toLocaleString() : employees });
  if (designOrg) items.push({ label: 'DESIGN ORG', value: typeof designOrg === 'number' ? `~${designOrg}` : designOrg });
  if (triggers.length > 0) {
    const breakdown = Object.entries(triggerBreakdown).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ');
    items.push({ label: 'TRIGGERS', value: `${triggers.length}`, sub: breakdown });
  }
  if (totalContacts > 0) {
    const split = [ebCount && `${ebCount} EB`, champCount && `${champCount} Champion`].filter(Boolean).join(', ');
    items.push({ label: 'CONTACTS', value: `${totalContacts}`, sub: split });
  }

  if (items.length === 0) return null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      gap: 1,
      background: COLORS.border,
      borderTop: `1px solid ${COLORS.border}`,
    }}>
      {items.map((item, i) => (
        <div key={i} style={{
          background: '#fff',
          padding: '14px 16px',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: COLORS.faint,
            fontFamily: FONTS.sans, marginBottom: 3,
          }}>
            {item.label}
          </div>
          <div style={{
            fontSize: 22, fontWeight: 700, color: COLORS.body,
            fontFamily: FONTS.serif,
          }}>
            {item.value}
          </div>
          {item.sub && (
            <div style={{ fontSize: 10, color: COLORS.faint, fontFamily: FONTS.sans, marginTop: 1 }}>
              {item.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: ICP Fit                                                   */
/* ------------------------------------------------------------------ */

function IcpSection({ pov, sources }: { pov: any; sources: any[] }) {
  const icp = pov?.icp_fit || pov?.icp_assessment;
  if (!icp) return null;
  return (
    <Section
      title="ICP Fit"
      accent={SECTION_ACCENTS.icp}
      badge={<IcpBadge score={icp.score} size="small" />}
      defaultOpen
    >
      <CitedProse text={icp.rationale} sources={sources} />
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: About                                                     */
/* ------------------------------------------------------------------ */

function PulledNumbers({ pov }: { pov: any }) {
  // Try to extract key numbers from the POV data
  const nums: { value: string; label: string }[] = [];

  const about = pov?.about || {};
  const overview = pov?.overview || {};

  // Structured fields first
  const rev = about.revenue || overview.revenue;
  if (rev) nums.push({ value: typeof rev === 'number' ? `$${rev.toLocaleString()}` : rev, label: 'Revenue' });

  const emp = about.employees || overview.employees || overview.headcount || about.headcount;
  if (emp) nums.push({ value: typeof emp === 'number' ? emp.toLocaleString() : emp, label: 'Employees' });

  if (about.customer_count || overview.customer_count)
    nums.push({ value: about.customer_count || overview.customer_count, label: 'Customers' });

  if (about.business_customers || overview.business_customers)
    nums.push({ value: about.business_customers || overview.business_customers, label: 'Business customers' });

  if (about.deposits || overview.deposits)
    nums.push({ value: about.deposits || overview.deposits, label: 'Deposits' });

  if (about.profit || overview.profit)
    nums.push({ value: about.profit || overview.profit, label: 'Profit' });

  if (about.founded || overview.founded)
    nums.push({ value: String(about.founded || overview.founded), label: 'Founded' });

  // Prose extraction fallback — runs when structured fields are empty
  if (nums.filter(n => n.label === 'Revenue').length === 0) {
    const about = pov?.about || {};
    const revExtracted = extractMetricFromProse(
      about.how_they_make_money, about.what_they_do, about.who_they_are
    );
    if (revExtracted) nums.push({ value: revExtracted, label: 'Revenue' });
  }

  if (nums.filter(n => n.label === 'Employees').length === 0) {
    const about = pov?.about || {};
    const empExtracted = extractEmployeesFromProse(
      about.what_they_do, about.who_they_are, pov?.org_structure?.structure_summary, about.how_they_make_money
    );
    if (empExtracted) nums.push({ value: empExtracted, label: 'Employees' });
  }

  if (nums.length === 0) return null;
  const display = nums.slice(0, 4);

  return (
    <div style={{
      display: 'flex', gap: 0, margin: '16px 0',
      borderTop: `1px solid ${COLORS.border}`, borderBottom: `1px solid ${COLORS.border}`,
      padding: '12px 0',
    }}>
      {display.map((n, i) => (
        <div key={i} style={{
          flex: 1, textAlign: 'center',
          borderRight: i < display.length - 1 ? `1px solid ${COLORS.border}` : 'none',
          padding: '0 12px',
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.body, fontFamily: FONTS.serif }}>{n.value}</div>
          <div style={{ fontSize: 10, color: COLORS.tertiary, fontFamily: FONTS.sans, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{n.label}</div>
        </div>
      ))}
    </div>
  );
}

function AboutSection({ pov, sources }: { pov: any; sources: any[] }) {
  const about = pov?.about;
  if (!about) return null;

  return (
    <Section title="About" accent={SECTION_ACCENTS.about}>
      {/* Narrative intro */}
      {(about.who_they_are || about.what_they_do) && (
        <CitedProse text={about.who_they_are || about.what_they_do} sources={sources} />
      )}

      {/* Pulled numbers */}
      <PulledNumbers pov={pov} />

      {/* Org narrative */}
      {pov?.org_structure?.structure_summary && (
        <p style={{ fontSize: 15, lineHeight: 1.75, color: COLORS.body, fontFamily: FONTS.sans, margin: '12px 0' }}>
          {pov.org_structure.structure_summary}
        </p>
      )}

      {/* what_they_do if separate from who_they_are — use IntelMarkdown for structured markdown */}
      {about.who_they_are && about.what_they_do && (
        about.what_they_do.includes('## ') ? (
          <IntelMarkdown text={about.what_they_do} />
        ) : (
          <CitedProse text={about.what_they_do} sources={sources} />
        )
      )}

      {/* Revenue model callout */}
      {about.how_they_make_money && (
        <div style={{
          borderLeft: `3px solid ${SECTION_ACCENTS.about}`,
          padding: '12px 16px', marginTop: 16,
          background: '#f8f7ff', borderRadius: '0 6px 6px 0',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: SECTION_ACCENTS.about,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
            fontFamily: FONTS.sans,
          }}>Revenue Model</div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: COLORS.body, fontFamily: FONTS.sans, margin: 0 }}>
            {about.how_they_make_money}
          </p>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Why Anything                                              */
/* ------------------------------------------------------------------ */

function ExpandableObjective({ objective, index }: { objective: any; index: number }) {
  const [open, setOpen] = useState(false);
  const title = typeof objective === 'string' ? objective : (objective?.objective || objective?.title || `Objective ${index + 1}`);
  const detail = typeof objective === 'string' ? null : (objective?.detail || objective?.description || objective?.narrative);

  return (
    <div style={{
      padding: '10px 0',
      borderBottom: `1px solid ${COLORS.borderLight}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {detail && <ItemChevron open={open} onClick={() => setOpen(o => !o)} />}
        <div style={{ flex: 1, cursor: detail ? 'pointer' : 'default' }} onClick={() => detail && setOpen(o => !o)}>
          <div style={{
            fontSize: 14, fontWeight: 500, color: COLORS.body,
            fontFamily: FONTS.sans, lineHeight: 1.5,
          }}>
            {title}
          </div>
        </div>
      </div>
      {open && detail && (
        <div style={{
          marginTop: 8, marginLeft: 32,
          fontSize: 14, lineHeight: 1.65, color: COLORS.secondary,
          fontFamily: FONTS.sans,
        }}>
          {detail}
        </div>
      )}
    </div>
  );
}

function WhyAnythingSection({ pov, sources }: { pov: any; sources: any[] }) {
  const wa = pov?.why_anything;
  if (!wa) return null;
  const objectives = wa.strategic_objectives || [];

  return (
    <Section
      title="Why Anything"
      accent={SECTION_ACCENTS.whyAnything}
      count={objectives.length > 0 ? `${objectives.length} objectives` : undefined}
    >
      {/* Corporate strategy callout */}
      {wa.corporate_strategy && (
        <div style={{
          background: '#fefce8', borderRadius: 6,
          padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#854d0e',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
            fontFamily: FONTS.sans,
          }}>Corporate Strategy</div>
          <div style={{
            fontSize: 16, fontFamily: FONTS.serif, fontWeight: 500,
            color: COLORS.body, lineHeight: 1.6,
          }}>
            {wa.corporate_strategy}
          </div>
        </div>
      )}

      {/* Strategic objectives — expandable rows */}
      {objectives.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {objectives.map((obj: any, i: number) => (
            <ExpandableObjective key={i} objective={obj} index={i} />
          ))}
        </div>
      )}

      {/* Macro forces callout */}
      {wa.macro_forces && (
        <div style={{
          background: '#fef2f2', borderRadius: 6,
          padding: '14px 16px', marginTop: 12,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#991b1b',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
            fontFamily: FONTS.sans,
          }}>Macro Forces</div>
          <CitedProse text={wa.macro_forces} sources={sources} />
        </div>
      )}

      {/* Narrative fallback */}
      {wa.narrative && !wa.corporate_strategy && !objectives.length && (
        <CitedProse text={wa.narrative} sources={sources} />
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Why Now                                                   */
/* ------------------------------------------------------------------ */

function TriggerBlock({ trigger }: { trigger: any }) {
  const [expanded, setExpanded] = useState(false);
  const cat = (trigger?.category || trigger?.type || 'BUSINESS').toUpperCase();
  const style = TRIGGER_COLORS[cat] || TRIGGER_COLORS.BUSINESS;

  return (
    <div style={{
      borderLeft: `3px solid ${style.border}`,
      padding: '12px 16px', marginBottom: 10,
      borderRadius: '0 6px 6px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: style.text,
          fontFamily: FONTS.sans,
        }}>
          {cat}
        </span>
      </div>

      <div style={{
        fontSize: 14, color: COLORS.body, lineHeight: 1.5,
        fontWeight: 500, fontFamily: FONTS.sans, marginBottom: 4,
      }}>
        {trigger?.trigger}
      </div>

      {trigger?.evidence && (
        <Trunc lines={2} expanded={expanded} onToggle={() => setExpanded(e => !e)}>
          <div style={{ fontSize: 14, color: COLORS.secondary, fontFamily: FONTS.sans }}>
            <IntelInline text={trigger.evidence} />
          </div>
        </Trunc>
      )}

      {trigger?.source_url && (
        <a href={trigger.source_url} target="_blank" rel="noopener noreferrer"
          style={{
            fontSize: 12, color: COLORS.purple, display: 'inline-flex',
            alignItems: 'center', gap: 3, marginTop: 4, textDecoration: 'none',
            fontFamily: FONTS.sans,
          }}>
          Source <span style={{ fontSize: 10 }}>{'\u2197'}</span>
        </a>
      )}
    </div>
  );
}

function WhyNowSection({ pov }: { pov: any; sources?: any[] }) {
  const triggers = pov?.why_now?.triggers || [];
  if (triggers.length === 0) return null;

  return (
    <Section title="Why Now" accent={SECTION_ACCENTS.whyNow} count={`${triggers.length} triggers`}>
      {pov?.why_now?.urgency_rationale && (
        <p style={{ fontSize: 14, lineHeight: 1.65, color: COLORS.secondary, fontFamily: FONTS.sans, marginBottom: 16 }}>
          {pov.why_now.urgency_rationale}
        </p>
      )}
      {triggers.map((t: any, i: number) => (
        <TriggerBlock key={i} trigger={t} />
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Why Figma                                                 */
/* ------------------------------------------------------------------ */

function ExpandableProduct({ product }: { product: any }) {
  const [open, setOpen] = useState(false);
  const name = product?.product || '';
  const relevance = product?.relevance || '';
  const firstSentence = relevance.split(/\.\s/)[0] + (relevance.includes('. ') ? '.' : '');
  const hasMore = relevance.length > firstSentence.length + 10;

  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${COLORS.borderLight}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {hasMore && <ItemChevron open={open} onClick={() => setOpen(o => !o)} />}
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, color: COLORS.purple,
            fontFamily: FONTS.sans, marginBottom: 4,
          }}>
            {name}
          </div>
          <div style={{ fontSize: 13, color: COLORS.secondary, fontFamily: FONTS.sans, lineHeight: 1.6 }}>
            {firstSentence}
          </div>
          {open && hasMore && (
            <div style={{ fontSize: 13, color: COLORS.secondary, fontFamily: FONTS.sans, lineHeight: 1.6, marginTop: 6 }}>
              {relevance}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WhyFigmaSection({ pov, sources }: { pov: any; sources: any[] }) {
  const wf = pov?.why_figma;
  if (!wf) return null;
  const products = wf.primary_products || [];
  const di = wf.design_infrastructure;
  const painSignals = wf.pain_signals || [];

  return (
    <Section title="Why Figma" accent={SECTION_ACCENTS.whyFigma} count={products.length > 0 ? `${products.length} products` : undefined}>
      {/* Strongest angle */}
      {wf.strongest_angle && (
        <div style={{
          borderLeft: `3px solid ${COLORS.purple}`,
          padding: '12px 16px', marginBottom: 16,
          borderRadius: '0 6px 6px 0',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: COLORS.purple,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
            fontFamily: FONTS.sans,
          }}>Strongest Angle</div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: COLORS.body, fontFamily: FONTS.sans, margin: 0 }}>
            {wf.strongest_angle}
          </p>
        </div>
      )}

      {/* Rationale */}
      {wf.rationale && (
        <div style={{ marginBottom: 16 }}>
          <CitedProse text={wf.rationale} sources={sources} />
        </div>
      )}

      {/* Products — expandable */}
      {products.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {products.map((p: any, i: number) => (
            <ExpandableProduct key={i} product={p} />
          ))}
        </div>
      )}

      {/* Design infrastructure + What they're saying */}
      {(di || painSignals.length > 0) && (
        <div style={{ marginTop: 8 }}>
          {di && (() => {
            const hasContent = (di.named_systems?.length > 0) || (di.confirmed_tools?.length > 0) || di.design_team_size;
            if (!hasContent) return null;
            return (
              <>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: COLORS.purple,
                  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
                  fontFamily: FONTS.sans,
                }}>Design Infrastructure</div>

                {di.named_systems?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    {di.named_systems.map((sys: any, i: number) => (
                      <div key={i} style={{ fontSize: 13, color: COLORS.secondary, fontFamily: FONTS.sans, marginBottom: 4 }}>
                        <strong style={{ color: COLORS.body }}>{sys.name}</strong>
                        {sys.scope && <span> — {sys.scope}</span>}
                        {sys.maturity && <span style={{ color: COLORS.tertiary }}> ({sys.maturity})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {di.confirmed_tools?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {di.confirmed_tools.map((tool: string, i: number) => (
                      <span key={i} style={{
                        fontSize: 12, padding: '3px 10px', borderRadius: 12,
                        background: '#f3f0ff', color: COLORS.purple, fontWeight: 500,
                        fontFamily: FONTS.sans,
                      }}>{tool}</span>
                    ))}
                  </div>
                )}

                {di.design_team_size && (
                  <div style={{ fontSize: 13, color: COLORS.secondary, fontFamily: FONTS.sans, marginBottom: 8 }}>
                    <strong>Team size:</strong> {di.design_team_size}
                  </div>
                )}
                {di.handoff_approach && (
                  <div style={{ fontSize: 13, color: COLORS.secondary, fontFamily: FONTS.sans, marginBottom: 8 }}>
                    <strong>Handoff:</strong> {di.handoff_approach}
                  </div>
                )}
              </>
            );
          })()}

          {/* Pain signals as quotes */}
          {painSignals.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: COLORS.purple,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
                fontFamily: FONTS.sans,
              }}>What They're Saying</div>
              {painSignals.map((ps: any, i: number) => (
                <div key={i} style={{
                  borderLeft: `3px solid ${COLORS.purple}`,
                  padding: '10px 14px', marginBottom: 8,
                  borderRadius: '0 6px 6px 0',
                }}>
                  <div style={{
                    fontStyle: 'italic', fontSize: 14,
                    color: COLORS.body, lineHeight: 1.6,
                    fontFamily: FONTS.serif,
                  }}>
                    &ldquo;{ps.quote}&rdquo;
                  </div>
                  {ps.speaker && (
                    <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.purple, marginTop: 4, fontFamily: FONTS.sans }}>
                      {ps.speaker}
                    </div>
                  )}
                  {ps.relevance && (
                    <div style={{ fontSize: 12, color: COLORS.tertiary, marginTop: 2, fontFamily: FONTS.sans }}>{ps.relevance}</div>
                  )}
                  {ps.source && (
                    <a href={ps.source} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: COLORS.purple, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                      Source <span style={{ fontSize: 10 }}>{'\u2197'}</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Research Deep Dive                                        */
/* ------------------------------------------------------------------ */

function DeepDiveSubsection({ heading, body }: { heading: string; body: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 0', cursor: 'pointer', userSelect: 'none',
          borderBottom: `1px solid ${COLORS.borderLight}`,
        }}
      >
        <ItemChevron open={open} onClick={() => {}} />
        <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.body, fontFamily: FONTS.sans }}>
          {heading}
        </span>
      </div>
      {open && (
        <div style={{ padding: '12px 0 8px 32px', fontSize: 14, lineHeight: 1.7, color: COLORS.secondary }}>
          <IntelMarkdown text={body} />
        </div>
      )}
    </div>
  );
}

function ResearchDeepDiveSection({ pov }: { pov: any }) {
  const [expanded, setExpanded] = useState(false);
  const intel = pov?.distilled_intel || pov?.research_deep_dive;
  if (!intel) return null;

  // Try to split into sections
  const cleanIntel = intel.split('---SOURCE_DECISIONS_START---')[0].trim();
  const rawSections = cleanIntel.split(/^## /m).filter(Boolean);
  const sections = rawSections.filter((s: string) => /^\d+\./.test(s.trim()));

  if (sections.length > 0) {
    return (
      <Section title="Research Deep Dive" accent={SECTION_ACCENTS.researchDeepDive} count={`${sections.length} sections`}>
        {sections.map((section: string, i: number) => {
          const lines = section.split('\n');
          const heading = lines[0].trim();
          const body = lines.slice(1).join('\n').trim();
          return <DeepDiveSubsection key={i} heading={heading} body={body} />;
        })}
      </Section>
    );
  }

  // Fallback: render as truncated prose
  return (
    <Section title="Research Deep Dive" accent={SECTION_ACCENTS.researchDeepDive}>
      <Trunc lines={10} expanded={expanded} onToggle={() => setExpanded(e => !e)}>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: COLORS.secondary, fontFamily: FONTS.sans }}>
          <IntelMarkdown text={cleanIntel} />
        </div>
      </Trunc>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Value Pyramid                                             */
/* ------------------------------------------------------------------ */

function ValuePyramidSection({ pyramid }: { pyramid: any }) {
  if (!pyramid) return null;
  const objectives = pyramid.corporate_objectives || [];
  const strategies = pyramid.business_strategies || [];
  const initiatives = pyramid.targeted_initiatives || [];
  if (!objectives.length && !strategies.length && !initiatives.length) return null;

  const totalItems = objectives.length + strategies.length + initiatives.length;

  const layers: { label: string; color: string; items: any[]; field: string }[] = [
    { label: 'CORPORATE OBJECTIVES', color: '#059669', items: objectives, field: 'objective' },
    { label: 'BUSINESS STRATEGIES', color: '#4361ee', items: strategies, field: 'strategy' },
    { label: 'TARGETED INITIATIVES', color: COLORS.purple, items: initiatives, field: 'initiative' },
  ];

  return (
    <Section title="Value Pyramid" accent={SECTION_ACCENTS.valuePyramid} count={`${totalItems} items`}>
      {layers.map((layer, li) => {
        if (layer.items.length === 0) return null;
        return (
          <div key={li} style={{
            borderLeft: `3px solid ${layer.color}`,
            paddingLeft: 14, marginBottom: 18,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: layer.color,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginBottom: 8, fontFamily: FONTS.sans,
            }}>
              {layer.label}
            </div>
            {layer.items.map((item: any, i: number) => (
              <div key={i} style={{ fontSize: 14, color: COLORS.body, fontFamily: FONTS.sans, marginBottom: 6, lineHeight: 1.6 }}>
                {item[layer.field] || item.objective || item.strategy || item.initiative}
                {item.talk_track && (
                  <div style={{
                    fontSize: 13, color: COLORS.secondary, fontStyle: 'italic',
                    borderLeft: `2px solid #a855f7`, paddingLeft: 8, marginTop: 4,
                    fontFamily: FONTS.sans,
                  }}>
                    {item.talk_track}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Job Signals                                               */
/* ------------------------------------------------------------------ */

function JobSignalsSection({ pov }: { pov: any }) {
  const signals = pov?.job_signals;
  const extracted = pov?.job_signals_extracted;
  const hasExtracted = extracted && (extracted.signals?.length > 0 || extracted.roles?.length > 0);
  const design = signals?.design_tool_signals || [];
  const other = signals?.other_signals || [];
  const signalCount = (hasExtracted ? (extracted.signals?.length || 0) : 0) + design.length + other.length;

  if (!hasExtracted && design.length === 0 && other.length === 0) return null;

  return (
    <Section title="Job Signals" accent={SECTION_ACCENTS.jobSignals} count={signalCount > 0 ? `${signalCount} signals` : undefined}>
      {/* Extracted signals */}
      {hasExtracted && extracted.signals?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {extracted.signals.map((s: any, i: number) => {
            const catColor = SIGNAL_CATEGORY_COLOURS[s.category] || SECTION_ACCENTS.jobSignals;
            return (
              <div key={i} style={{
                padding: '10px 0 10px 12px',
                borderBottom: `1px solid ${COLORS.borderLight}`,
                borderLeft: `3px solid ${catColor}`,
                marginBottom: 4,
              }}>
                {s.category && (
                  <span style={{
                    display: 'inline-block', fontSize: 10, padding: '2px 8px',
                    borderRadius: 10, marginBottom: 6,
                    background: catColor + '18', color: catColor,
                    fontWeight: 600, letterSpacing: '0.04em', fontFamily: FONTS.sans,
                  }}>
                    {formatCategory(s.category)}
                  </span>
                )}
                <div style={{ fontSize: 14, color: COLORS.body, fontFamily: FONTS.sans, lineHeight: 1.5 }}>
                  {s.signal}
                </div>
                {s.jobs?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {s.jobs.slice(0, 3).map((job: any, j: number) => {
                      const title = typeof job === 'string' ? job : (job?.title || String(job));
                      const url = typeof job === 'object' ? (job?.url || job?.link) : null;
                      return url ? (
                        <a key={j} href={url} target="_blank" rel="noopener noreferrer" style={{
                          fontSize: 11, color: COLORS.purple, fontFamily: FONTS.sans,
                          textDecoration: 'underline', textDecorationStyle: 'dashed' as const,
                        }}>
                          {title} {'\u2197'}
                        </a>
                      ) : (
                        <span key={j} style={{ fontSize: 11, color: COLORS.tertiary, fontFamily: FONTS.sans }}>
                          {title}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legacy design tool signals */}
      {design.length > 0 && design.map((s: any, i: number) => (
        <div key={`d-${i}`} style={{
          padding: '10px 0',
          borderBottom: `1px solid ${COLORS.borderLight}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.body, fontFamily: FONTS.sans }}>
            {s?.role_title}
            {s?.link && (
              <a href={s.link} target="_blank" rel="noopener noreferrer"
                style={{
                  marginLeft: 8, color: COLORS.purple, fontSize: 12,
                  textDecoration: 'underline dashed',
                }}>
                View <span style={{ fontSize: 10 }}>{'\u2197'}</span>
              </a>
            )}
          </div>
          {s?.why_relevant && <div style={{ fontSize: 13, color: COLORS.secondary, marginTop: 4, fontFamily: FONTS.sans }}>{s.why_relevant}</div>}
        </div>
      ))}

      {/* Other signals */}
      {other.length > 0 && other.map((s: any, i: number) => (
        <div key={`o-${i}`} style={{
          padding: '10px 0',
          borderBottom: `1px solid ${COLORS.borderLight}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.body, fontFamily: FONTS.sans }}>{s?.role_title}</div>
          {s?.signal && <div style={{ fontSize: 13, color: COLORS.secondary, marginTop: 4, fontFamily: FONTS.sans }}>{s.signal}</div>}
        </div>
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Digital Products                                          */
/* ------------------------------------------------------------------ */

function DigitalProductsSection({ pov }: { pov: any }) {
  const products = pov?.digital_products || [];
  if (products.length === 0) return null;

  return (
    <Section title="Digital Products" accent={SECTION_ACCENTS.digitalProducts} count={`${products.length} products`}>
      {products.map((p: any, i: number) => {
        const platforms: string[] = Array.isArray(p?.platforms)
          ? p.platforms
          : p?.platform
            ? p.platform.split(/[,/·•]+/).map((s: string) => s.trim()).filter(Boolean)
            : p?.type ? [p.type] : [];

        return (
          <DataRow
            key={i}
            accent={SECTION_ACCENTS.digitalProducts}
            title={p?.product || p?.name || 'Product'}
          >
            <div style={{ fontFamily: FONTS.sans }}>{p?.description || '\u2014'}</div>
            {p?.users && (
              <div style={{ fontSize: 12, color: COLORS.tertiary, marginTop: 2, fontFamily: FONTS.sans }}>{p.users}</div>
            )}
            {platforms.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {platforms.map((plat: string, pi: number) => (
                  <span key={pi} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: SECTION_ACCENTS.digitalProducts + '18',
                    color: SECTION_ACCENTS.digitalProducts,
                    border: `1px solid ${SECTION_ACCENTS.digitalProducts}30`,
                    fontWeight: 500, fontFamily: FONTS.sans,
                  }}>
                    {plat}
                  </span>
                ))}
              </div>
            )}
          </DataRow>
        );
      })}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Who to Contact                                            */
/* ------------------------------------------------------------------ */

function ContactCard({ contact }: { contact: any }) {
  const [open, setOpen] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const tier = contact?.tier || 'coach';
  const summary = contact?.outreach_context
    ? contact.outreach_context.split(/\.\s/)[0] + '.'
    : contact?.hook || '';

  return (
    <div style={{
      padding: '12px 0',
      borderBottom: `1px solid ${COLORS.borderLight}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ItemChevron open={open} onClick={() => setOpen(o => !o)} />

        {/* Avatar circle */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: SECTION_ACCENTS.contacts + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 600, color: SECTION_ACCENTS.contacts,
          fontFamily: FONTS.sans, flexShrink: 0,
        }}>
          {(contact?.name || '?')[0]}
        </div>

        {/* Name, tier, title on one baseline */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.body, fontFamily: FONTS.sans }}>
              {contact?.name}
            </span>
            <TierBadge tier={tier} />
            <span style={{ fontSize: 13, color: COLORS.tertiary, fontFamily: FONTS.sans }}>
              {contact?.title}
            </span>
          </div>
          {/* Summary text below */}
          {summary && (
            <div style={{
              fontSize: 13, color: COLORS.secondary, fontFamily: FONTS.sans,
              marginTop: 4, lineHeight: 1.5,
            }}>
              {summary}
            </div>
          )}
        </div>

        {contact?.departure_signal && (
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontWeight: 500, fontFamily: FONTS.sans }}>Departed</span>
        )}
      </div>

      {/* Expanded state */}
      {open && (
        <div style={{ marginTop: 0, marginLeft: 64, paddingTop: 12, borderTop: `1px solid ${COLORS.borderLight}` }}>
          {/* Full outreach context */}
          {contact?.outreach_context && (
            <div style={{ marginBottom: 12 }}>
              <Trunc lines={3} expanded={contextExpanded} onToggle={() => setContextExpanded(e => !e)}>
                <div style={{
                  borderLeft: `3px solid ${COLORS.faint}`, paddingLeft: 12,
                  fontStyle: 'italic', fontSize: 13, lineHeight: 1.65,
                  color: COLORS.body, fontFamily: FONTS.sans,
                }}>
                  {contact.outreach_context}
                </div>
              </Trunc>
            </div>
          )}

          {/* Briefing bullets */}
          {contact?.briefing_bullets?.length > 0 && (
            <ul style={{ paddingLeft: 20, margin: '0 0 12px 0' }}>
              {contact.briefing_bullets.map((b: string, i: number) => (
                <li key={i} style={{ fontSize: 13, marginBottom: 4, color: COLORS.secondary, lineHeight: 1.5, fontFamily: FONTS.sans }}>{b}</li>
              ))}
            </ul>
          )}

          {/* Urgency triggers */}
          {contact?.urgency_triggers?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {contact.urgency_triggers.map((t: string, i: number) => (
                <span key={i} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#fefce8', color: '#854d0e', fontFamily: FONTS.sans }}>{t}</span>
              ))}
            </div>
          )}

          {/* Recommended angle */}
          {contact?.recommended_angle && (
            <div style={{ fontSize: 13, color: COLORS.secondary, marginBottom: 8, fontFamily: FONTS.sans }}>
              <strong>Angle:</strong> {contact.recommended_angle}
            </div>
          )}

          {/* Footer links */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            {contact?.email && (
              <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#ecfdf5', color: '#065f46', fontFamily: FONTS.sans }}>{contact.email}</span>
            )}
            {contact?.url && (
              <a href={contact.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: COLORS.purple, textDecoration: 'none', fontFamily: FONTS.sans }}>
                LinkedIn <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContactsSection({ personas, hooksData }: { personas: any; hooksData?: any }) {
  const matrix = personas?.matrix;
  if (!matrix) return null;

  // Build hooks lookup
  const hooksLookup = new Map<string, any>();
  if (hooksData?.contacts) {
    for (const hc of hooksData.contacts) {
      if (hc?.name) hooksLookup.set(hc.name.toLowerCase(), hc);
    }
  }

  // Collect all contacts, sorted: EBs first, then Champions, then Coaches
  const allContacts: any[] = [];
  for (const fn of ['design', 'engineering', 'product']) {
    for (const tier of ['eb', 'champion', 'coach']) {
      const contacts = matrix?.[fn]?.[tier];
      if (Array.isArray(contacts)) {
        for (const c of contacts) {
          const hookContact = c?.name ? hooksLookup.get(c.name.toLowerCase()) : null;
          allContacts.push({ ...c, ...hookContact, tier, function: fn });
        }
      }
    }
  }

  // Deduplicate by name (keep first/highest tier)
  const seen = new Set<string>();
  const unique = allContacts.filter(c => {
    const key = (c.name || '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: EB first, then Champion, then Coach
  const tierOrder: Record<string, number> = { eb: 0, EB: 0, champion: 1, Champion: 1, coach: 2, Coach: 2 };
  unique.sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9));

  if (unique.length === 0) return null;

  const rfm = hooksData?.recommended_first_move || personas?.recommended_first_move;

  return (
    <Section
      title="Who to Contact"
      accent={SECTION_ACCENTS.contacts}
      count={`${unique.length} contacts`}
      defaultOpen
    >
      {rfm && (
        <div style={{
          borderLeft: `3px solid ${SECTION_ACCENTS.contacts}`,
          padding: '12px 16px', marginBottom: 16,
          background: '#f0fdf4', borderRadius: '0 6px 6px 0',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontFamily: FONTS.sans }}>
            Recommended First Move
          </div>
          <div style={{ fontWeight: 500, fontSize: 14, color: COLORS.body, fontFamily: FONTS.sans }}>
            {rfm.contact_name} {rfm.title ? `\u2014 ${rfm.title}` : ''}
          </div>
          {rfm.angle && <div style={{ color: COLORS.secondary, marginTop: 4, fontSize: 13, fontFamily: FONTS.sans }}>{rfm.angle}</div>}
          {rfm.rationale && <div style={{ color: COLORS.tertiary, fontSize: 12, marginTop: 4, fontFamily: FONTS.sans }}>{rfm.rationale}</div>}
        </div>
      )}

      {unique.map((c, i) => <ContactCard key={c?.name || i} contact={c} />)}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Key Executives                                            */
/* ------------------------------------------------------------------ */

function KeyExecutivesSection({ pov }: { pov: any }) {
  const executives = pov?.executives || [];
  if (executives.length === 0) return null;

  return (
    <Section title="Key Executives" accent={SECTION_ACCENTS.keyExecutives} count={`${executives.length} found`}>
      {executives.map((exec: any, i: number) => (
        <DataRow
          key={i}
          accent={SECTION_ACCENTS.keyExecutives}
          title={exec?.name || 'Unknown'}
          subtitle={exec?.title}
        >
          <div>{exec?.significance || exec?.relevance || exec?.description || '\u2014'}</div>
        </DataRow>
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Technology Partnerships                                   */
/* ------------------------------------------------------------------ */

function TechPartnersSection({ pov }: { pov: any }) {
  const partners = pov?.technology_partnerships || [];
  if (partners.length === 0) return null;

  return (
    <Section title="Technology Partnerships" accent={SECTION_ACCENTS.techPartners} count={`${partners.length} partners`}>
      {partners.map((p: any, i: number) => (
        <DataRow
          key={i}
          accent={SECTION_ACCENTS.techPartners}
          title={p?.partner || 'Partner'}
        >
          <div>{p?.details || '\u2014'}</div>
        </DataRow>
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Proof Points                                              */
/* ------------------------------------------------------------------ */

function ProofPointsSection({ pov }: { pov: any }) {
  const points = pov?.proof_points || [];
  if (points.length === 0) return null;

  return (
    <Section title="Proof Points" accent={COLORS.faint} count={`${points.length} found`}>
      {points.map((pp: any, i: number) => (
        <div key={i} style={{
          padding: '12px 0',
          borderBottom: `1px solid ${COLORS.borderLight}`,
        }}>
          <div style={{ fontSize: 12, color: COLORS.tertiary, fontFamily: FONTS.sans }}>{pp?.reference}</div>
          {pp?.quote_or_stat && (
            <div style={{
              fontSize: 15, fontStyle: 'italic', color: COLORS.body,
              fontFamily: FONTS.serif, marginTop: 4, lineHeight: 1.5,
            }}>
              &ldquo;{pp.quote_or_stat}&rdquo;
            </div>
          )}
          {pp?.why_relevant && (
            <div style={{ fontSize: 13, color: COLORS.secondary, marginTop: 4, fontFamily: FONTS.sans }}>{pp.why_relevant}</div>
          )}
        </div>
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Sources                                                   */
/* ------------------------------------------------------------------ */

function SourcesSection({ pov }: { pov: any }) {
  const allSources = pov?.sources_used || [];
  const cleanSources = allSources.filter((s: any) => {
    const url = typeof s === 'string' ? s : (s?.url || s?.source || '');
    const title = typeof s === 'string' ? '' : (s?.title || s?.what_it_provided || '');
    if (url.length > 200) return false;
    return !isNoisySource(url, title);
  });

  if (cleanSources.length === 0) return null;

  return (
    <Section title="Sources" accent={COLORS.faint} count={`${cleanSources.length} sources`}>
      {cleanSources.map((s: any, i: number) => {
        const url = typeof s === 'string' ? s : (s?.url || s?.source || '');
        const title = typeof s === 'string' ? '' : (s?.title || s?.what_it_provided || '');
        return (
          <div key={i} style={{
            fontSize: 13, padding: '6px 0',
            borderBottom: `1px solid ${COLORS.borderLight}`,
            fontFamily: FONTS.sans,
          }}>
            <span style={{ color: COLORS.faint, marginRight: 6 }}>[{i + 1}]</span>
            {url.startsWith('http') ? (
              <a href={url} target="_blank" rel="noopener noreferrer"
                style={{ color: COLORS.purple, textDecoration: 'none' }}>
                {title || url} <span style={{ fontSize: 10 }}>{'\u2197'}</span>
              </a>
            ) : (
              <span style={{ color: COLORS.secondary }}>{url}</span>
            )}
          </div>
        );
      })}
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
      <div style={{ fontSize: 11, color: COLORS.faint, marginBottom: 6, fontFamily: FONTS.sans, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Run History ({runs.length} runs)
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {runs.map((r) => {
          const active = r.id === currentRunId;
          const date = new Date(r.created_at);
          return (
            <button key={r.id} onClick={() => navigate(`/briefs/${r.id}`)} style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 4, fontFamily: FONTS.sans,
              background: active ? COLORS.purple : '#f5f5f0',
              color: active ? '#fff' : COLORS.secondary,
              border: 'none', cursor: active ? 'default' : 'pointer',
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
      <div style={{ background: '#ecfdf5', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 32 }}>
        <div style={{ fontSize: 13, color: '#065f46', fontWeight: 500, fontFamily: FONTS.sans }}>Thanks for your feedback!</div>
      </div>
    );
  }

  const StarRow = ({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: COLORS.secondary, width: 90, fontFamily: FONTS.sans }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange(n)} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 2,
            color: value && n <= value ? '#ca8a04' : COLORS.faint,
          }}>{value && n <= value ? '\u2605' : '\u2606'}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: 32 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 6,
        padding: '8px 14px', fontSize: 12, color: COLORS.secondary,
        cursor: 'pointer', fontFamily: FONTS.sans,
      }}>
        {open ? '\u25B2' : '\u25BC'} Rate this brief
      </button>
      {open && (
        <div style={{ marginTop: 12, background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 16 }}>
          <StarRow label="Overall" value={rating} onChange={setRating} />
          <StarRow label="Accuracy" value={accuracy} onChange={setAccuracy} />
          <StarRow label="Usefulness" value={usefulness} onChange={setUsefulness} />
          <textarea
            value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Optional comment..."
            style={{
              width: '100%', minHeight: 60, marginTop: 8, padding: 10, fontSize: 13,
              background: '#fdfcfa', border: `1px solid ${COLORS.border}`,
              borderRadius: 6, color: COLORS.body, resize: 'vertical',
              fontFamily: FONTS.sans,
            }}
          />
          <button onClick={handleSubmit} disabled={!rating || submitting} style={{
            marginTop: 8, background: rating ? COLORS.purple : '#f5f5f0',
            color: rating ? '#fff' : COLORS.faint,
            border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13,
            fontWeight: 500, cursor: rating ? 'pointer' : 'default',
            fontFamily: FONTS.sans,
          }}>
            {submitting ? 'Sending...' : 'Submit feedback'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Brief content (all sections assembled)                             */
/* ------------------------------------------------------------------ */

function BriefContent({ pov, personas, hooksData, runId, session, valuePyramid }: {
  pov: any; personas: any; hooksData?: any; runId?: string; session?: any; valuePyramid?: any;
}) {
  const allSources = pov?.sources_used || [];

  return (
    <>
      {/* Research Gaps warning */}
      {pov?.research_gaps && (
        <details style={{
          background: '#fefce8', border: `1px solid #fde68a`,
          borderRadius: 6, marginBottom: 12, cursor: 'pointer',
        }}>
          <summary style={{
            padding: '10px 14px', fontSize: 13, color: '#854d0e',
            fontWeight: 500, listStyle: 'none', display: 'flex',
            alignItems: 'center', gap: 8, userSelect: 'none',
            fontFamily: FONTS.sans,
          }}>
            <span>{'\u26A0'}</span>
            <span>Research gaps — review before your call</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: COLORS.faint }}>click to expand</span>
          </summary>
          <div style={{ padding: '0 14px 12px', fontSize: 13, color: COLORS.secondary, lineHeight: 1.6, fontFamily: FONTS.sans }}>
            {Array.isArray(pov.research_gaps) ? (
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {pov.research_gaps.map((gap: string, i: number) => <li key={i} style={{ marginBottom: 4 }}>{gap}</li>)}
              </ul>
            ) : (
              <p style={{ margin: 0 }}>{pov.research_gaps}</p>
            )}
          </div>
        </details>
      )}

      {/* 1. ICP Fit */}
      <IcpSection pov={pov} sources={allSources} />

      {/* 2. About */}
      <AboutSection pov={pov} sources={allSources} />

      {/* 3. Why Anything */}
      <WhyAnythingSection pov={pov} sources={allSources} />

      {/* 4. Why Now */}
      <WhyNowSection pov={pov} sources={allSources} />

      {/* 5. Why Figma */}
      <WhyFigmaSection pov={pov} sources={allSources} />

      {/* 6. Research Deep Dive */}
      <ResearchDeepDiveSection pov={pov} />

      {/* 7. Value Pyramid */}
      <ValuePyramidSection pyramid={valuePyramid} />

      {/* 8. Job Signals */}
      <JobSignalsSection pov={pov} />

      {/* 9. Digital Products */}
      <DigitalProductsSection pov={pov} />

      {/* 10. Who to Contact */}
      <ContactsSection personas={personas} hooksData={hooksData} />

      {/* 11. Key Executives */}
      <KeyExecutivesSection pov={pov} />

      {/* 12. Technology Partnerships */}
      <TechPartnersSection pov={pov} />

      {/* 13. Proof Points */}
      <ProofPointsSection pov={pov} />

      {/* 14. Sources */}
      <SourcesSection pov={pov} />

      {/* 15. Feedback */}
      {runId && session && <FeedbackPanel runId={runId} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main BriefView page                                                */
/* ------------------------------------------------------------------ */

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


  const handleRunInEnglish = async () => {
    if (!session || !run) return;
    setRunningEnglish(true);
    try {
      await workerFetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: run.company, url: run.url, market: 'en' }),
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
    } catch { setShareStatus('idle'); }
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
    } finally { setDeleting(false); }
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
    } finally { setRerendering(false); }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!run_id) return;
    let cancelled = false;

    async function load() {
      const { data: runData, error: runErr } = await supabase
        .from('runs')
        .select('id, company, url, created_at, status, pdf_url, excel_url, brief_id, market, debug_events_url')
        .eq('id', run_id)
        .single();

      if (cancelled) return;
      if (runErr || !runData) { setError('Run not found.'); setLoading(false); return; }
      setRun(runData as Run);

      if (runData.brief_id) {
        const { data: briefData } = await supabase
          .from('briefs')
          .select('pov_json, personas_json, hooks_json, value_pyramid, schema_version')
          .eq('id', runData.brief_id)
          .single();
        if (!cancelled && briefData) setBrief(briefData as Brief);
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

  const mainStyle: React.CSSProperties = {
    maxWidth: 960,
    margin: '0 auto',
    paddingBottom: 64,
    transition: 'margin-right 200ms ease',
    ...(chatOpen ? { marginRight: 380 } : {}),
  };

  // Button style helper
  const btnStyle = (variant: 'primary' | 'secondary' | 'ghost' = 'secondary'): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6,
    cursor: 'pointer', fontFamily: FONTS.sans, textDecoration: 'none',
    transition: 'all 120ms',
    ...(variant === 'primary' ? { background: COLORS.purple, color: '#fff', border: 'none' } :
      variant === 'ghost' ? { background: 'transparent', color: COLORS.tertiary, border: `1px solid ${COLORS.border}` } :
      { background: 'transparent', color: COLORS.secondary, border: `1px solid ${COLORS.border}` }),
  });

  if (loading) {
    return (
      <Layout bgColor={COLORS.bg}>
          <div style={{ padding: '32px 0' }}>
            <TableSkeleton rows={8} cols={1} />
          </div>
      </Layout>
    );
  }

  if (error || !run) {
    return (
      <Layout bgColor={COLORS.bg}>
          <div style={{ padding: '32px 0', color: COLORS.secondary, fontSize: 13, fontFamily: FONTS.sans }}>
            {error || 'Run not found.'}
            <button onClick={() => navigate('/my-briefs')} style={{
              marginLeft: 12, background: 'none', border: 'none', color: COLORS.purple,
              cursor: 'pointer', fontSize: 13, fontFamily: FONTS.sans,
            }}>
              Back to My Briefs
            </button>
          </div>
      </Layout>
    );
  }

  return (
    <Layout bgColor={COLORS.bg}>
      <div style={mainStyle}>
        {/* ============ HEADER ============ */}
        <div style={{
          background: '#fff',
          borderBottom: `1px solid ${COLORS.border}`,
          margin: '-32px -40px 24px',
        }}>
          <div style={{ padding: '32px 40px 0' }}>
            {/* Back link */}
            <button onClick={() => navigate('/my-briefs')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', color: COLORS.secondary,
              cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 20,
              fontFamily: FONTS.sans,
            }}>
              <ArrowLeft size={14} /> My Briefs
            </button>

            {/* Company name + badges on ONE LINE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
              <h1 style={{
                fontFamily: FONTS.serif, fontSize: 30, fontWeight: 600,
                margin: 0, letterSpacing: '-0.03em', color: COLORS.body,
              }}>
                {pov?.company_name || run.company}
              </h1>
              <IcpBadge score={pov?.icp_fit?.score || pov?.icp_assessment?.score} size="small" />
              <AgeBadge createdAt={run.created_at} />
              {run.market && run.market !== 'en' && run.market !== 'auto' && LANGUAGE_FLAGS[run.market] && (
                <span style={{ fontSize: 12, color: COLORS.tertiary, fontFamily: FONTS.sans }}>
                  {LANGUAGE_FLAGS[run.market]} {LANGUAGE_NAMES[run.market] || run.market}
                </span>
              )}
            </div>

            {/* URL */}
            {run.url && (
              <a href={run.url} target="_blank" rel="noopener noreferrer"
                style={{
                  fontSize: 13, color: COLORS.faint, display: 'inline-flex',
                  alignItems: 'center', gap: 4, margin: '0 0 12px',
                  fontFamily: FONTS.sans, textDecoration: 'none',
                }}>
                {run.url} <ExternalLink size={12} />
              </a>
            )}
            {!run.url && <div style={{ marginBottom: 12 }} />}

            {/* Action buttons row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <button onClick={handleShare} disabled={shareStatus === 'loading'} style={{
                ...btnStyle('secondary'),
                color: shareStatus === 'copied' ? '#065f46' : COLORS.secondary,
              }}>
                <Share2 size={14} /> {shareStatus === 'copied' ? 'Link copied!' : 'Share'}
              </button>
              <button onClick={() => setChatOpen(true)} style={btnStyle('primary')}>
                <MessageSquare size={14} /> Chat
              </button>
              {run.pdf_url && (
                <a href={run.pdf_url} target="_blank" rel="noopener noreferrer" style={btnStyle('secondary')}>
                  <FileText size={14} /> {run.market && run.market !== 'en' && run.market !== 'auto' && LANGUAGE_FLAGS[run.market]
                    ? `${LANGUAGE_FLAGS[run.market]} PDF` : 'PDF'}
                </a>
              )}
              {run.excel_url && (
                <a href={run.excel_url} target="_blank" rel="noopener noreferrer" style={btnStyle('secondary')}>
                  <Table size={14} /> Excel
                </a>
              )}
              {run.debug_events_url && (
                <a href={`/AccountResearcherPortal/debug/${run.id}`} style={btnStyle('secondary')}>
                  <Activity size={14} /> Debug
                </a>
              )}
              {run.market && run.market !== 'en' && run.market !== 'auto' && !englishSubmitted && (
                <button onClick={handleRunInEnglish} disabled={runningEnglish} style={btnStyle('ghost')}>
                  {'\u{1F1EC}\u{1F1E7}'} {runningEnglish ? 'Submitting\u2026' : 'Also run in English'}
                </button>
              )}
              {englishSubmitted && (
                <span style={{ fontSize: 12, color: '#065f46', display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONTS.sans }}>
                  {'\u{1F1EC}\u{1F1E7}'} English run submitted
                </span>
              )}
              {userProfile?.role === 'admin' && run.status === 'complete' && (
                <button
                  onClick={handleRegeneratePdf}
                  disabled={rerendering || rerenderDone}
                  style={{
                    ...btnStyle('ghost'),
                    color: rerenderDone ? '#065f46' : COLORS.tertiary,
                    opacity: rerendering ? 0.6 : 1,
                  }}
                >
                  <RefreshCw size={14} style={rerendering ? { animation: 'spin 1s linear infinite' } : undefined} />
                  {rerendering ? 'Re-rendering\u2026' : rerenderDone ? 'Dispatched!' : 'Re-render PDF'}
                </button>
              )}
              {userProfile?.role === 'admin' && (
                <>
                  {!deleteConfirm ? (
                    <button onClick={() => setDeleteConfirm(true)} style={btnStyle('ghost')}>
                      <Trash2 size={14} /> Delete
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#854d0e', fontFamily: FONTS.sans }}>Delete permanently?</span>
                      <button onClick={handleDelete} disabled={deleting} style={{
                        background: '#dc2626', border: 'none', color: '#fff',
                        padding: '4px 12px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                        fontWeight: 500, opacity: deleting ? 0.6 : 1, fontFamily: FONTS.sans,
                      }}>{deleting ? 'Deleting...' : 'Yes, delete'}</button>
                      <button onClick={() => setDeleteConfirm(false)} style={{
                        background: 'transparent', border: `1px solid ${COLORS.border}`,
                        color: COLORS.secondary, padding: '4px 10px',
                        fontSize: 12, borderRadius: 4, cursor: 'pointer', fontFamily: FONTS.sans,
                      }}>Cancel</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* MetricsBar — full bleed, inside header */}
          {pov && <MetricsBar pov={pov} hooksData={hooksData} personas={personas} />}
        </div>

        {/* Run history */}
        <RunHistory currentRunId={run_id || ''} company={run.company} />

        {/* Old schema warning */}
        {brief && !brief.schema_version && (
          <div style={{
            background: '#fefce8', border: `1px solid #fde68a`,
            borderRadius: 6, padding: '10px 14px', marginBottom: 20,
            fontSize: 13, color: '#854d0e', fontFamily: FONTS.sans,
          }}>
            This brief was generated with an earlier pipeline version — some sections may be missing.
            {run.pdf_url && (
              <a href={run.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.purple, marginLeft: 8 }}>
                Download full PDF <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </a>
            )}
          </div>
        )}

        {/* No brief data fallback */}
        {!pov && (
          <div style={{
            background: '#fff', border: `1px solid ${COLORS.border}`,
            borderRadius: 8, padding: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.secondary, marginBottom: 8, fontFamily: FONTS.sans }}>
              Brief data not yet available
            </div>
            <div style={{ fontSize: 13, color: COLORS.tertiary, marginBottom: 16, fontFamily: FONTS.sans }}>
              The structured brief will appear here once the pipeline completes.
            </div>
            {run.pdf_url && (
              <a href={run.pdf_url} target="_blank" rel="noopener noreferrer" style={{
                ...btnStyle('primary'), textDecoration: 'none',
              }}>
                <FileText size={14} /> Download PDF
              </a>
            )}
          </div>
        )}

        {/* ============ Brief content sections ============ */}
        {pov && (
          <BriefContent
            pov={pov} personas={personas} hooksData={hooksData}
            runId={run_id} session={session}
            valuePyramid={brief?.value_pyramid || pov?.value_pyramid}
          />
        )}
      </div>

      {/* ============ Chat panel ============ */}
      {chatOpen && (
        <div style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 380,
          background: '#fff', borderLeft: `1px solid ${COLORS.border}`,
          display: 'flex', flexDirection: 'column', zIndex: 100,
          animation: 'slideIn 150ms ease-out',
          fontFamily: FONTS.sans,
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, color: COLORS.body }}>Chat</div>
              <div style={{ fontSize: 12, color: COLORS.tertiary, marginTop: 1 }}>
                {pov?.company_name || run.company}
              </div>
            </div>
            <button onClick={() => setChatOpen(false)} style={{
              background: 'none', border: 'none', color: COLORS.faint,
              cursor: 'pointer', padding: 4, borderRadius: 4,
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
            {chatMessages.length === 0 ? (
              <div>
                <p style={{ fontSize: 12, color: COLORS.tertiary, marginBottom: 12 }}>
                  Ask anything about this brief
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SUGGESTED_PROMPTS.map((prompt, i) => (
                    <button key={i} onClick={() => sendMessage(prompt)} style={{
                      textAlign: 'left', background: '#fdfcfa',
                      border: `1px solid ${COLORS.border}`, borderRadius: 6,
                      padding: '8px 12px', fontSize: 13, color: COLORS.secondary,
                      cursor: 'pointer',
                    }}>
                      {prompt}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: COLORS.faint, marginTop: 16, lineHeight: 1.5 }}>
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
                      maxWidth: '85%', padding: '8px 12px',
                      borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      background: msg.role === 'user' ? COLORS.purple : '#f5f5f0',
                      fontSize: 13, lineHeight: 1.5,
                      color: msg.role === 'user' ? '#fff' : COLORS.body,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                      {streaming && i === chatMessages.length - 1 && msg.role === 'assistant' && (
                        <span style={{
                          display: 'inline-block', width: 2, height: 14,
                          background: COLORS.faint, marginLeft: 2,
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
          <div style={{ padding: '12px 18px', borderTop: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
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
                  flex: 1, background: '#fdfcfa',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, padding: '8px 12px',
                  fontSize: 13, color: COLORS.body,
                  resize: 'none', outline: 'none', fontFamily: FONTS.sans,
                }}
              />
              <button
                onClick={() => sendMessage(chatInput)}
                disabled={!chatInput.trim() || streaming}
                style={{
                  background: COLORS.purple, color: '#fff',
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
            <p style={{ fontSize: 11, color: COLORS.faint, marginTop: 6 }}>
              Enter to send &middot; Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </Layout>
  );
}
