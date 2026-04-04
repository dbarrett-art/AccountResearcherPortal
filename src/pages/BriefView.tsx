import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, workerFetch } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { ArrowLeft, FileText, X, ChevronDown, ExternalLink, Send, Trash2, Activity, Share2, RefreshCw, Paperclip, ClipboardList, Copy, Check, ThumbsUp } from 'lucide-react';
import SectionFeedback from '../components/SectionFeedback';
import DOMPurify from 'dompurify';

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

interface ChatAttachment {
  type: 'pdf' | 'image';
  mimeType: string;
  filename: string;
  data: string; // base64
  file?: File; // original file for preview
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
  reviewMode?: boolean;
}

const LANGUAGE_FLAGS: Record<string, string> = {
  de: '\u{1F1E9}\u{1F1EA}', fr: '\u{1F1EB}\u{1F1F7}', es: '\u{1F1EA}\u{1F1F8}',
  it: '\u{1F1EE}\u{1F1F9}', nl: '\u{1F1F3}\u{1F1F1}', pt: '\u{1F1F5}\u{1F1F9}',
  ja: '\u{1F1EF}\u{1F1F5}', ko: '\u{1F1F0}\u{1F1F7}', sv: '\u{1F1F8}\u{1F1EA}',
  no: '\u{1F1F3}\u{1F1F4}', da: '\u{1F1E9}\u{1F1F0}', fi: '\u{1F1EB}\u{1F1EE}',
};

const SUGGESTED_PROMPTS: Record<string, string[]> = {
  en: [
    "What's the strongest angle for this account?",
    "Who should I contact first and why?",
    "Draft a cold email to the Head of Design",
    "What are the key triggers to reference on the call?",
    "Summarise the ICP fit in 2 sentences",
    "What objections should I prepare for?",
  ],
  fr: [
    "Quel est le meilleur angle d'approche pour ce compte ?",
    "Qui devrais-je contacter en premier et pourquoi ?",
    "Rédige un email de prospection pour le responsable Design",
    "Quels sont les déclencheurs clés à mentionner lors de l'appel ?",
    "Résume l'adéquation ICP en 2 phrases",
    "Quelles objections dois-je anticiper ?",
  ],
};

function getSuggestedPrompts(market: string | null): string[] {
  if (market && market !== 'en' && market !== 'auto' && SUGGESTED_PROMPTS[market]) {
    return SUGGESTED_PROMPTS[market];
  }
  return SUGGESTED_PROMPTS.en;
}

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
  heading: '#1a1a1a',
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
  title, accent, badge, count, defaultOpen = false, children, feedbackNode,
}: {
  title: string;
  accent: string;
  badge?: React.ReactNode;
  count?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  feedbackNode?: React.ReactNode;
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
          fontFamily: FONTS.serif, fontSize: 19, fontWeight: 500,
          color: COLORS.heading, flex: 1,
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
          {feedbackNode && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <span style={{ fontSize: 12, color: '#999', fontFamily: 'DM Sans, sans-serif' }}>Rate this section:</span>
              {feedbackNode}
            </div>
          )}
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
        <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.heading, fontFamily: FONTS.sans }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: COLORS.tertiary, fontFamily: FONTS.sans, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ flex: 1, fontSize: 16, color: COLORS.secondary, lineHeight: 1.65, fontFamily: FONTS.sans }}>
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
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['sup', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
  });
  return (
    <p style={{
      fontSize: 17, lineHeight: 1.75, color: COLORS.body,
      fontFamily: FONTS.sans, margin: 0,
    }} dangerouslySetInnerHTML={{ __html: sanitized }} />
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
          fontSize: 16, fontWeight: 700, color: COLORS.body,
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
          fontSize: 15, fontWeight: 600, color: COLORS.body,
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
          <div style={{ fontStyle: 'italic', fontSize: 16, color: COLORS.body, lineHeight: 1.6, fontFamily: FONTS.serif }}>
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
            <li key={j} style={{ marginBottom: 2, fontSize: 16, color: COLORS.secondary }}><IntelInline text={b} /></li>
          ))}
        </ul>
      );
      continue;
    }

    elements.push(<div key={i} style={{ marginBottom: 4, fontSize: 16, color: COLORS.secondary }}><IntelInline text={line} /></div>);
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
      }}>Last run · Today</span>
    );
  }
  if (days > 90) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
        borderRadius: 4, fontSize: 11, fontWeight: 500, fontFamily: FONTS.sans,
        background: '#fef2f2', color: '#991b1b',
      }}>Last run · Stale — {days}d old</span>
    );
  }
  if (days > 30) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
        borderRadius: 4, fontSize: 11, fontWeight: 500, fontFamily: FONTS.sans,
        background: '#fefce8', color: '#854d0e',
      }}>Last run · {days}d ago</span>
    );
  }
  if (days >= 7) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
        borderRadius: 4, fontSize: 11, fontWeight: 500, fontFamily: FONTS.sans,
        background: '#f5f5f0', color: COLORS.tertiary,
      }}>Last run · {days}d ago</span>
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

/* extractDesignOrgFromProse removed — Design Org metric replaced by ARR/Whitespace in MetricsBar */

function MetricsBar({ pov }: { pov: any; hooksData?: any; personas?: any }) {
  // Try structured fields first, then extract from prose
  const revenue = pov?.overview?.revenue || pov?.about?.revenue
    || extractMetricFromProse(pov?.about?.how_they_make_money, pov?.about?.what_they_do);
  const employees = pov?.overview?.employees
    || pov?.about?.employees
    || pov?.about?.headcount
    || pov?.overview?.headcount
    || pov?.org_structure?.total_headcount
    || extractEmployeesFromProse(pov?.about?.what_they_do, pov?.about?.who_they_are, pov?.org_structure?.structure_summary, pov?.about?.how_they_make_money);

  // Whitespace data
  const ws = pov?.whitespace_section;
  const currentArr = ws?.current_arr;
  const gaps = ws?.key_gaps || {};
  const devGapVal = (gaps.dev_mode?.gap || 0) * FIGMA_PRICES.devSeat * 12;
  const designerGapVal = (gaps.full_seats_designers?.gap || 0) * FIGMA_PRICES.fullSeat * 12;
  const pmGapVal = (gaps.make_pm?.gap || 0) * FIGMA_PRICES.fullSeat * 12;
  const govVal = gaps.governance_plus?.value || 0;
  const euVal = gaps.enterprise_upgrade?.eligible ? (gaps.enterprise_upgrade?.value || 0) : 0;
  const services: any[] = (ws?.services_opportunities || []).filter((s: any) => s?.found);
  const servicesTotal = services.length * 125000;
  const totalWhitespace = ws ? devGapVal + designerGapVal + pmGapVal + govVal + euVal + servicesTotal : null;

  const fmtDollar = (v: number | null | undefined) => {
    if (v == null || isNaN(v)) return '\u2014';
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
    return `$${Math.round(v).toLocaleString()}`;
  };

  const items: { label: string; value: string }[] = [];
  if (revenue) items.push({ label: 'REVENUE', value: typeof revenue === 'string' ? revenue : `$${revenue}` });
  if (employees) items.push({ label: 'EMPLOYEES', value: typeof employees === 'number' ? employees.toLocaleString() : employees });
  items.push({ label: 'ARR', value: fmtDollar(currentArr) });
  items.push({ label: 'WHITESPACE', value: fmtDollar(totalWhitespace) });

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
            fontFamily: FONTS.sans, marginBottom: 3, textAlign: 'center',
          }}>
            {item.label}
          </div>
          <div style={{
            fontSize: 22, fontWeight: 700, color: COLORS.heading,
            fontFamily: FONTS.serif, textAlign: 'center',
          }}>
            {item.value}
          </div>
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

function stripMarkdownHeaders(text: string): string {
  // If the text contains ## headers, only keep the prose before the first one
  // (the structured markdown under ## Overview / ## Organisation / ## Strategy
  // is redundant with the prose paragraphs and renders as an unreadable blob)
  const firstHeader = text.indexOf('##');
  if (firstHeader >= 0) {
    text = text.substring(0, firstHeader).trim();
    if (!text) return '';
  }
  return text
    .split('\n')
    .map(line => {
      if (/^#{1,3}\s/.test(line)) return '';
      if (/^\s*[-•]\s/.test(line)) return line.replace(/^\s*[-•]\s*/, '');
      return line;
    })
    .filter(line => line.trim() !== '')
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function AboutSection({ pov, sources, feedbackNode }: { pov: any; sources: any[]; feedbackNode?: React.ReactNode }) {
  const about = pov?.about;
  if (!about) return null;

  const cleanWhatTheyDo = about.what_they_do ? stripMarkdownHeaders(about.what_they_do) : null;

  return (
    <Section title="About" accent={SECTION_ACCENTS.about} feedbackNode={feedbackNode}>
      {/* Narrative intro */}
      {(about.who_they_are || cleanWhatTheyDo) && (
        <CitedProse text={about.who_they_are || cleanWhatTheyDo} sources={sources} />
      )}

      {/* Pulled numbers */}
      <PulledNumbers pov={pov} />

      {/* Org narrative */}
      {pov?.org_structure?.structure_summary && (
        <p style={{ fontSize: 17, lineHeight: 1.75, color: COLORS.body, fontFamily: FONTS.sans, margin: '12px 0' }}>
          {pov.org_structure.structure_summary}
        </p>
      )}

      {/* what_they_do prose (only content before ## headers, if who_they_are already shown) */}
      {about.who_they_are && cleanWhatTheyDo && (
        <CitedProse text={cleanWhatTheyDo} sources={sources} />
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
            fontSize: 16, fontWeight: 500, color: COLORS.body,
            fontFamily: FONTS.sans, lineHeight: 1.5,
          }}>
            {title}
          </div>
        </div>
      </div>
      {open && detail && (
        <div style={{
          marginTop: 8, marginLeft: 32,
          fontSize: 16, lineHeight: 1.65, color: COLORS.secondary,
          fontFamily: FONTS.sans,
        }}>
          {detail}
        </div>
      )}
    </div>
  );
}

function WhyAnythingSection({ pov, sources, feedbackNode }: { pov: any; sources: any[]; feedbackNode?: React.ReactNode }) {
  const wa = pov?.why_anything;
  if (!wa) return null;
  const objectives = wa.strategic_objectives || [];

  return (
    <Section
      title="Why Anything"
      accent={SECTION_ACCENTS.whyAnything}
      count={objectives.length > 0 ? `${objectives.length} objectives` : undefined}
      feedbackNode={feedbackNode}
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
          <CitedProse text={wa.corporate_strategy} sources={sources} />
        </div>
      )}

      {/* Narrative */}
      {wa.narrative && (
        <div style={{ marginBottom: 16 }}>
          <CitedProse text={wa.narrative} sources={sources} />
        </div>
      )}

      {/* Macro forces callout */}
      {wa.macro_forces && (
        <div style={{
          background: '#fef2f2', borderRadius: 6,
          padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#991b1b',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
            fontFamily: FONTS.sans,
          }}>Macro Forces</div>
          <CitedProse text={wa.macro_forces} sources={sources} />
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
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Why Now                                                   */
/* ------------------------------------------------------------------ */

function TriggerBlock({ trigger, sources }: { trigger: any; sources?: any[] }) {
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
        fontSize: 16, color: COLORS.body, lineHeight: 1.5,
        fontWeight: 500, fontFamily: FONTS.sans, marginBottom: 4,
      }}>
        {trigger?.trigger}
      </div>

      {trigger?.evidence && (
        <Trunc lines={2} expanded={expanded} onToggle={() => setExpanded(e => !e)}>
          <div style={{ fontSize: 16, color: COLORS.secondary, fontFamily: FONTS.sans }}>
            <CitedProse text={trigger.evidence} sources={sources} />
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

function WhyNowSection({ pov, sources, feedbackNode }: { pov: any; sources?: any[]; feedbackNode?: React.ReactNode }) {
  const triggers = pov?.why_now?.triggers || [];
  if (triggers.length === 0) return null;

  return (
    <Section title="Why Now" accent={SECTION_ACCENTS.whyNow} count={`${triggers.length} triggers`} feedbackNode={feedbackNode}>
      {pov?.why_now?.urgency_rationale && (
        <div style={{ marginBottom: 16 }}>
          <CitedProse text={pov.why_now.urgency_rationale} sources={sources} />
        </div>
      )}
      {triggers.map((t: any, i: number) => (
        <TriggerBlock key={i} trigger={t} sources={sources} />
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
            fontSize: 16, fontWeight: 600, color: COLORS.purple,
            fontFamily: FONTS.sans, marginBottom: 4,
          }}>
            {name}
          </div>
          <div style={{ fontSize: 15, color: COLORS.secondary, fontFamily: FONTS.sans, lineHeight: 1.6 }}>
            {firstSentence}
          </div>
          {open && hasMore && (
            <div style={{ fontSize: 15, color: COLORS.secondary, fontFamily: FONTS.sans, lineHeight: 1.6, marginTop: 6 }}>
              {relevance}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WhyFigmaSection({ pov, sources, feedbackNode }: { pov: any; sources: any[]; feedbackNode?: React.ReactNode }) {
  const wf = pov?.why_figma;
  if (!wf) return null;
  const products = wf.primary_products || [];
  const di = wf.design_infrastructure;
  const painSignals = wf.pain_signals || wf.what_they_say || [];

  return (
    <Section title="Why Figma" accent={SECTION_ACCENTS.whyFigma} count={products.length > 0 ? `${products.length} products` : undefined} feedbackNode={feedbackNode}>
      {/* What They're Saying — exec quotes before strongest angle */}
      {painSignals.length > 0 && (
        <div style={{ marginBottom: 16 }}>
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
                fontStyle: 'italic', fontSize: 16,
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
                <div style={{ fontSize: 14, color: COLORS.tertiary, marginTop: 2, fontFamily: FONTS.sans }}>{ps.relevance}</div>
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
          <p style={{ fontSize: 16, lineHeight: 1.7, color: COLORS.body, fontFamily: FONTS.sans, margin: 0 }}>
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

      {/* Design infrastructure */}
      {di && (
        <div style={{ marginTop: 8 }}>
          {(() => {
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
                      <div key={i} style={{ fontSize: 15, color: COLORS.secondary, fontFamily: FONTS.sans, marginBottom: 4 }}>
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
                  <div style={{ fontSize: 15, color: COLORS.secondary, fontFamily: FONTS.sans, marginBottom: 8 }}>
                    <strong>Team size:</strong> {di.design_team_size}
                  </div>
                )}
                {di.handoff_approach && (
                  <div style={{ fontSize: 15, color: COLORS.secondary, fontFamily: FONTS.sans, marginBottom: 8 }}>
                    <strong>Handoff:</strong> {di.handoff_approach}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Research Deep Dive                                        */
/* ------------------------------------------------------------------ */

function DeepDiveSubsection({ heading, body, defaultOpen = false }: { heading: string; body: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
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
        <span style={{ fontSize: 16, fontWeight: 500, color: COLORS.body, fontFamily: FONTS.sans }}>
          {heading}
        </span>
      </div>
      {open && (
        <div style={{ padding: '12px 0 8px 32px', fontSize: 16, lineHeight: 1.7, color: COLORS.secondary }}>
          <IntelMarkdown text={body} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Whitespace & Opportunity                                           */
/* ------------------------------------------------------------------ */

const FIGMA_PRICES = {
  fullSeat: 90,    // per seat per month
  devSeat: 35,     // per seat per month
  collabSeat: 5,   // per seat per month (not used in display but keep for reference)
};

function WhitespaceSection({ pov, feedbackNode }: { pov: any; feedbackNode?: React.ReactNode }) {
  if (pov?._meta?.whitespace_available === false || !pov?.whitespace_section) return null;

  const ws = pov.whitespace_section;
  const gaps = ws.key_gaps || {};
  const services: any[] = (ws.services_opportunities || []).filter((s: any) => s?.found);

  // Format currency
  const fmtDollar = (v: number) => {
    if (v == null || isNaN(v)) return '$0';
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    return `$${Math.round(v).toLocaleString()}`;
  };

  // Calculate seat gap values
  const devGapVal = (gaps.dev_mode?.gap || 0) * FIGMA_PRICES.devSeat * 12;
  const designerGapVal = (gaps.full_seats_designers?.gap || 0) * FIGMA_PRICES.fullSeat * 12;
  const pmGapVal = (gaps.make_pm?.gap || 0) * FIGMA_PRICES.fullSeat * 12;
  const govVal = gaps.governance_plus?.value || 0;
  const euVal = gaps.enterprise_upgrade?.eligible ? (gaps.enterprise_upgrade?.value || 0) : 0;
  const servicesTotal = services.length * 125000;
  const totalWhitespace = devGapVal + designerGapVal + pmGapVal + govVal + euVal + servicesTotal;

  const ACCENT = {
    devMode: '#7c3aed',
    fullSeat: '#0891b2',
    governance: '#dc2626',
    enterprise: '#4361ee',
    services: '#059669',
    arrFloor: '#ca8a04',
  };

  return (
    <Section title="Whitespace & Opportunity" accent={COLORS.purple} defaultOpen={false} feedbackNode={feedbackNode}>
      {/* Metrics row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { label: 'CURRENT ARR', value: fmtDollar(ws.current_arr) },
          { label: 'TOTAL WHITESPACE', value: fmtDollar(totalWhitespace) },
          { label: 'YOY GROWTH', value: ws.arr_growth_yoy || '—' },
        ].map((m, i) => (
          <div key={i} style={{ background: '#f5f5f0', borderRadius: 8, padding: '10px 12px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.faint, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{m.label}</div>
            <div style={{ fontFamily: FONTS.serif, fontSize: 20, fontWeight: 500, color: COLORS.heading, marginTop: 4 }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Seat opportunities */}
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: COLORS.tertiary, textTransform: 'uppercase' as const, marginBottom: 10 }}>
        SEAT OPPORTUNITIES
      </div>

      {/* Dev Mode */}
      {gaps.dev_mode?.gap > 0 && (
        <div style={{ borderLeft: `3px solid ${ACCENT.devMode}`, padding: '12px 16px', marginBottom: 10, borderRadius: '0 6px 6px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: ACCENT.devMode, marginBottom: 4 }}>DEV MODE</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: COLORS.heading }}>Dev Mode seats</span>
            <span style={{ fontFamily: FONTS.serif, fontSize: 18, fontWeight: 500, color: COLORS.heading }}>{fmtDollar(devGapVal)}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 3, background: '#f0ede8', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: ACCENT.devMode, width: `${Math.min(100, ((gaps.dev_mode.licensed || 0) / Math.max(gaps.dev_mode.universe || 1, 1)) * 100)}%`, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 12, color: COLORS.faint, marginTop: 3 }}>{gaps.dev_mode.licensed} of {Math.round(gaps.dev_mode.universe)} licensed</div>
          </div>
        </div>
      )}

      {/* Designer seats */}
      {gaps.full_seats_designers?.gap > 0 && (
        <div style={{ borderLeft: `3px solid ${ACCENT.fullSeat}`, padding: '12px 16px', marginBottom: 10, borderRadius: '0 6px 6px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: ACCENT.fullSeat, marginBottom: 4 }}>FULL SEAT — DESIGN</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: COLORS.heading }}>Designer seats</span>
            <span style={{ fontFamily: FONTS.serif, fontSize: 18, fontWeight: 500, color: COLORS.heading }}>{fmtDollar(designerGapVal)}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 3, background: '#f0ede8', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: ACCENT.fullSeat, width: `${Math.min(100, ((gaps.full_seats_designers.licensed || 0) / Math.max(gaps.full_seats_designers.universe || 1, 1)) * 100)}%`, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 12, color: COLORS.faint, marginTop: 3 }}>{gaps.full_seats_designers.licensed} of {Math.round(gaps.full_seats_designers.universe)} licensed</div>
          </div>
        </div>
      )}

      {/* PM / Make seats */}
      {gaps.make_pm?.gap > 0 && (
        <div style={{ borderLeft: `3px solid ${ACCENT.fullSeat}`, padding: '12px 16px', marginBottom: 10, borderRadius: '0 6px 6px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: ACCENT.fullSeat, marginBottom: 4 }}>FULL SEAT — MAKE</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: COLORS.heading }}>PM / Make seats</span>
            <span style={{ fontFamily: FONTS.serif, fontSize: 18, fontWeight: 500, color: COLORS.heading }}>{fmtDollar(pmGapVal)}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 3, background: '#f0ede8', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: ACCENT.fullSeat, width: `${Math.min(100, ((gaps.make_pm.licensed || 0) / Math.max(gaps.make_pm.universe || 1, 1)) * 100)}%`, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 12, color: COLORS.faint, marginTop: 3 }}>{gaps.make_pm.licensed} of {Math.round(gaps.make_pm.universe)} licensed</div>
          </div>
        </div>
      )}

      {/* Governance+ */}
      {govVal > 0 && (
        <div style={{ borderLeft: `3px solid ${ACCENT.governance}`, padding: '12px 16px', marginBottom: 10, borderRadius: '0 6px 6px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: ACCENT.governance, marginBottom: 4 }}>GOVERNANCE+</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: COLORS.heading }}>Governance+ add-on</span>
            <span style={{ fontFamily: FONTS.serif, fontSize: 18, fontWeight: 500, color: COLORS.heading }}>{fmtDollar(govVal)}</span>
          </div>
          {gaps.governance_plus?.priority && (
            <span style={{ fontSize: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 20, padding: '2px 8px', fontWeight: 600, display: 'inline-block', marginTop: 6 }}>priority: true</span>
          )}
          {gaps.governance_plus?.reason && (
            <div style={{ fontSize: 15, color: COLORS.secondary, lineHeight: 1.65, marginTop: 6 }}>{gaps.governance_plus.reason}</div>
          )}
        </div>
      )}

      {/* Enterprise upgrade */}
      {euVal > 0 && (
        <div style={{ borderLeft: `3px solid ${ACCENT.enterprise}`, padding: '12px 16px', marginBottom: 10, borderRadius: '0 6px 6px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: ACCENT.enterprise, marginBottom: 4 }}>ENTERPRISE UPGRADE</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: COLORS.heading }}>Enterprise tier upgrade</span>
            <span style={{ fontFamily: FONTS.serif, fontSize: 18, fontWeight: 500, color: COLORS.heading }}>{fmtDollar(euVal)}</span>
          </div>
        </div>
      )}

      {/* Services opportunities */}
      {services.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: COLORS.tertiary, textTransform: 'uppercase' as const, marginTop: 18, marginBottom: 10 }}>
            SERVICES OPPORTUNITIES
          </div>
          {services.map((s: any, i: number) => (
            <div key={i} style={{ borderLeft: `3px solid ${ACCENT.services}`, padding: '12px 16px', marginBottom: 10, borderRadius: '0 6px 6px 0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: ACCENT.services, marginBottom: 4 }}>$125K ENGAGEMENT</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 16, fontWeight: 500, color: COLORS.heading }}>{s.engagement_label}</span>
                <span style={{ fontFamily: FONTS.serif, fontSize: 18, fontWeight: 500, color: COLORS.heading }}>$125K</span>
              </div>
              {s.evidence && (
                <div style={{ fontSize: 14, fontStyle: 'italic', color: COLORS.tertiary, marginTop: 8, paddingTop: 8, borderTop: `1px solid #f5f3ef`, lineHeight: 1.6 }}>{s.evidence}</div>
              )}
            </div>
          ))}

          {/* ARR floor */}
          <div style={{ borderLeft: `3px solid ${ACCENT.arrFloor}`, padding: '12px 16px', marginBottom: 10, borderRadius: '0 6px 6px 0' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: ACCENT.arrFloor, marginBottom: 4 }}>25% ARR MINIMUM</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: COLORS.heading }}>Services floor</span>
              <span style={{ fontFamily: FONTS.serif, fontSize: 18, fontWeight: 500, color: COLORS.heading }}>{fmtDollar(ws.services_arr_floor || 125000)}</span>
            </div>
            <div style={{ fontSize: 15, color: COLORS.secondary, lineHeight: 1.65, marginTop: 6 }}>25% ARR floor — use as anchor if selling a single bundled engagement.</div>
          </div>
        </>
      )}

      {/* Total Whitespace */}
      <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: '14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
        <span style={{ fontSize: 13, color: COLORS.tertiary }}>Total Whitespace — seats + Governance+ + services</span>
        <span style={{ fontFamily: FONTS.serif, fontSize: 24, fontWeight: 500, color: COLORS.heading }}>{fmtDollar(totalWhitespace)}</span>
      </div>
    </Section>
  );
}

function ResearchDeepDiveSection({ pov, feedbackNode }: { pov: any; feedbackNode?: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const intel = pov?.distilled_intel || pov?.research_deep_dive;
  if (!intel) return null;

  // Try to split into sections
  const cleanIntel = intel.split('---SOURCE_DECISIONS_START---')[0].trim();
  const rawSections = cleanIntel.split(/^## /m).filter(Boolean);
  const sections = rawSections.filter((s: string) => /^\d+\./.test(s.trim()));

  if (sections.length > 0) {
    return (
      <Section title="Research Deep Dive" accent={SECTION_ACCENTS.researchDeepDive} count={`${sections.length} sections`} feedbackNode={feedbackNode}>
        {sections.map((section: string, i: number) => {
          const lines = section.split('\n');
          const heading = lines[0].trim();
          const body = lines.slice(1).join('\n').trim();
          return <DeepDiveSubsection key={i} heading={heading} body={body} defaultOpen={i === 0} />;
        })}
      </Section>
    );
  }

  // Fallback: render as truncated prose
  return (
    <Section title="Research Deep Dive" accent={SECTION_ACCENTS.researchDeepDive} feedbackNode={feedbackNode}>
      <Trunc lines={10} expanded={expanded} onToggle={() => setExpanded(e => !e)}>
        <div style={{ fontSize: 16, lineHeight: 1.7, color: COLORS.secondary, fontFamily: FONTS.sans }}>
          <IntelMarkdown text={cleanIntel} />
        </div>
      </Trunc>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Value Pyramid                                             */
/* ------------------------------------------------------------------ */

function ValuePyramidSection({ pyramid, feedbackNode }: { pyramid: any; feedbackNode?: React.ReactNode }) {
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
    <Section title="Value Pyramid" accent={SECTION_ACCENTS.valuePyramid} count={`${totalItems} items`} feedbackNode={feedbackNode}>
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
              <div key={i} style={{ fontSize: 16, color: COLORS.body, fontFamily: FONTS.sans, marginBottom: 6, lineHeight: 1.6 }}>
                {item[layer.field] || item.objective || item.strategy || item.initiative}
                {item.talk_track && (
                  <div style={{
                    fontSize: 15, color: COLORS.secondary, fontStyle: 'italic',
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
                <div style={{ fontSize: 16, color: COLORS.body, fontFamily: FONTS.sans, lineHeight: 1.5 }}>
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
          <div style={{ fontSize: 16, fontWeight: 500, color: COLORS.body, fontFamily: FONTS.sans }}>
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
          {s?.why_relevant && <div style={{ fontSize: 15, color: COLORS.secondary, marginTop: 4, fontFamily: FONTS.sans }}>{s.why_relevant}</div>}
        </div>
      ))}

      {/* Other signals */}
      {other.length > 0 && other.map((s: any, i: number) => (
        <div key={`o-${i}`} style={{
          padding: '10px 0',
          borderBottom: `1px solid ${COLORS.borderLight}`,
        }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: COLORS.body, fontFamily: FONTS.sans }}>
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
          {s?.signal && <div style={{ fontSize: 15, color: COLORS.secondary, marginTop: 4, fontFamily: FONTS.sans }}>{s.signal}</div>}
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
            {p?.significance && (
              <div style={{ fontSize: 12, color: COLORS.tertiary, marginTop: 2, fontFamily: FONTS.sans }}>{p.significance}</div>
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

function LinkedInIcon({ url, onClick }: { url: string; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      onClick={onClick}
      style={{ opacity: 0.45, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="24" rx="4" fill="#0A66C2"/>
        <path d="M7.5 9.5H5V18.5H7.5V9.5Z" fill="white"/>
        <circle cx="6.25" cy="6.75" r="1.5" fill="white"/>
        <path d="M18.5 18.5H16V13.75C16 12.5 15.25 11.75 14.25 11.75C13.25 11.75 12.5 12.5 12.5 13.75V18.5H10V9.5H12.5V10.75C13 9.75 14 9.25 15 9.25C16.75 9.25 18.5 10.5 18.5 13.25V18.5Z" fill="white"/>
      </svg>
    </a>
  );
}

function PresenceDot({ level }: { level: string }) {
  const bg = level === 'high' ? '#059669'
    : level === 'medium' ? '#ca8a04'
    : 'var(--color-border-secondary, #d6d3d1)';
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: bg, display: 'inline-block', flexShrink: 0 }} />;
}

function ContactCard({ contact }: { contact: any }) {
  const [open, setOpen] = useState(false);
  const tier = contact?.tier || 'coach';
  const isEB = tier === 'eb' || tier === 'EB';
  const isDeparted = !!contact?.departure_signal;
  const presenceLevel = contact?.public_presence?.presence_level || contact?.presence_level || 'none';
  const fnLabel = (contact?.function || '').replace(/^./, (c: string) => c.toUpperCase());

  // Derive personal signals: signals not already captured in outreach_context
  const oc = contact?.outreach_context || '';
  const signals: Array<{ type: string; description: string; source?: string }> = contact?.public_presence?.signals || contact?.signals || [];
  const distinctSignals = signals.filter(s =>
    s?.description && !oc.toLowerCase().includes(s.description.slice(0, 40).toLowerCase())
  ).slice(0, 2);

  // Signal source labels for footer (e.g. "NRF 2026 · LinkedIn active")
  const sourceLabels: string[] = [];
  for (const s of signals.slice(0, 3)) {
    if (s?.type === 'talk' || s?.type === 'conference') {
      const label = s.description?.match(/\b(?:NRF|CES|MWC|SXSW|Shoptalk|Config|Web Summit|re:Invent)\s*\d{4}/i)?.[0];
      if (label) sourceLabels.push(label);
    }
  }
  if (presenceLevel === 'high' || presenceLevel === 'medium') sourceLabels.push('LinkedIn active');
  const footerSources = [...new Set(sourceLabels)].slice(0, 3);

  return (
    <div style={{
      border: '0.5px solid var(--color-border-tertiary, #e7e5e4)',
      borderRadius: 'var(--border-radius-lg, 10px)',
      background: 'var(--color-background-primary, #fff)',
      marginBottom: 8,
      overflow: 'hidden',
    }}>
      {/* Header — always visible, clickable to expand */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}
      >
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: isDeparted ? '#e7e5e4' : isEB ? 'var(--color-background-info, #dbeafe)' : '#EEF2FF',
          color: isDeparted ? '#a8a29e' : isEB ? 'var(--color-text-info, #1e40af)' : '#3730a3',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 600, fontFamily: FONTS.sans, flexShrink: 0,
          marginTop: 2,
        }}>
          {(contact?.name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.heading, fontFamily: FONTS.sans }}>
              {contact?.name}
            </span>
            <TierBadge tier={tier} />
            {isDeparted && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#fef2f2', color: '#dc2626', fontWeight: 600, fontFamily: FONTS.sans }}>
                ⚠ Departed
              </span>
            )}
            {contact?.url && (
              <LinkedInIcon url={contact.url} onClick={e => e.stopPropagation()} />
            )}
          </div>
          <div style={{ fontSize: 13, color: COLORS.tertiary, fontFamily: FONTS.sans, marginTop: 2 }}>
            {contact?.title}{fnLabel ? ` · ${fnLabel}` : ''}
          </div>
          {/* Meta row: presence + email */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <PresenceDot level={presenceLevel} />
            <span style={{ fontSize: 12, color: COLORS.tertiary, fontFamily: FONTS.sans }}>
              {presenceLevel.replace(/^./, (c: string) => c.toUpperCase())}
            </span>
            <span style={{ fontSize: 12, color: COLORS.faint }}>·</span>
            <span style={{ fontSize: 12, color: contact?.email ? COLORS.secondary : COLORS.faint, fontFamily: FONTS.sans }}>
              {contact?.email || 'No verified email'}
            </span>
          </div>
        </div>

        {/* Chevron */}
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: open ? '#eef2ff' : '#f5f5f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 6,
          transition: 'background 0.15s',
        }}>
          <svg width="10" height="10" viewBox="0 0 10 10" style={{
            transform: open ? 'rotate(180deg)' : 'rotate(-90deg)',
            transition: 'transform 0.18s',
          }}>
            <path d="M2 3.5L5 6.5L8 3.5" stroke={open ? '#4361ee' : '#78716c'} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Body — expanded only */}
      {open && (
        <div style={{ padding: '0 16px 16px 62px', borderTop: `1px solid var(--color-border-tertiary, #e7e5e4)` }}>
          {/* Outreach context — rendered ONCE */}
          {oc && (
            <div style={{ marginTop: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.faint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, fontFamily: FONTS.sans }}>
                Outreach context
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.65, color: COLORS.body, fontFamily: FONTS.sans }}>
                {oc}
              </div>
            </div>
          )}

          {/* Briefing bullets */}
          {contact?.briefing_bullets?.length > 0 && (
            <ul style={{ paddingLeft: 18, margin: '0 0 12px 0' }}>
              {contact.briefing_bullets.map((b: string, i: number) => (
                <li key={i} style={{ fontSize: 13, marginBottom: 4, color: COLORS.secondary, lineHeight: 1.55, fontFamily: FONTS.sans }}>{b}</li>
              ))}
            </ul>
          )}

          {/* Personal signal block — only if distinct signals exist */}
          {distinctSignals.length > 0 && (
            <div style={{
              borderLeft: '3px solid #059669', paddingLeft: 12,
              marginBottom: 12, padding: '8px 12px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, fontFamily: FONTS.sans }}>
                Personal signal
              </div>
              {distinctSignals.map((s, i) => (
                <div key={i} style={{ fontSize: 13, color: COLORS.body, lineHeight: 1.55, fontFamily: FONTS.sans }}>
                  {s.description}
                </div>
              ))}
            </div>
          )}

          {/* Angle block */}
          {contact?.recommended_angle && (
            <div style={{
              borderLeft: '3px solid #7c3aed', paddingLeft: 12,
              marginBottom: 12, padding: '8px 12px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, fontFamily: FONTS.sans }}>
                Angle
              </div>
              <div style={{ fontSize: 13, color: COLORS.body, lineHeight: 1.55, fontFamily: FONTS.sans }}>
                {contact.recommended_angle}
              </div>
            </div>
          )}

          {/* Footer — email + signal sources */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
            <div>
              {contact?.email && (
                <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#ecfdf5', color: '#065f46', fontFamily: FONTS.sans }}>{contact.email}</span>
              )}
            </div>
            {footerSources.length > 0 && (
              <span style={{ fontSize: 12, color: COLORS.faint, fontFamily: FONTS.sans }}>
                {footerSources.join(' · ')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContactsSection({ personas, hooksData, feedbackNode }: { personas: any; hooksData?: any; feedbackNode?: React.ReactNode }) {
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
      feedbackNode={feedbackNode}
    >
      {rfm && (
        <div style={{
          borderLeft: '3px solid #7c3aed',
          padding: '12px 16px', marginBottom: 16,
          background: '#f5f3ff', borderRadius: '0 6px 6px 0',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontFamily: FONTS.sans }}>
            Recommended First Move
          </div>
          <div style={{ fontWeight: 500, fontSize: 16, color: COLORS.body, fontFamily: FONTS.sans }}>
            {rfm.contact_name} {rfm.title ? `\u2014 ${rfm.title}` : ''}
          </div>
          {rfm.angle && <div style={{ color: COLORS.secondary, marginTop: 4, fontSize: 15, fontFamily: FONTS.sans }}>{rfm.angle}</div>}
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
              fontSize: 17, fontStyle: 'italic', color: COLORS.body,
              fontFamily: FONTS.serif, marginTop: 4, lineHeight: 1.5,
            }}>
              &ldquo;{pp.quote_or_stat}&rdquo;
            </div>
          )}
          {pp?.why_relevant && (
            <div style={{ fontSize: 15, color: COLORS.secondary, marginTop: 4, fontFamily: FONTS.sans }}>{pp.why_relevant}</div>
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
/*  Brief content (all sections assembled)                             */
/* ------------------------------------------------------------------ */

function BriefContent({ pov, personas, hooksData, valuePyramid, sectionFeedback, onSectionFeedback }: {
  pov: any; personas: any; hooksData?: any; valuePyramid?: any;
  sectionFeedback: Record<string, { score: number; comment: string }>;
  onSectionFeedback: (key: string, score: number, comment: string) => void;
}) {
  const allSources = pov?.sources_used || [];
  void ProofPointsSection; // Retained but removed from render tree (2026-04-01 reframe)

  const fb = (key: string) => (
    <SectionFeedback sectionKey={key} feedback={sectionFeedback[key]} onChange={onSectionFeedback} />
  );

  return (
    <>
      {/* 1. ICP Fit */}
      <IcpSection pov={pov} sources={allSources} />

      {/* 2. About */}
      <AboutSection pov={pov} sources={allSources} feedbackNode={fb('about')} />

      {/* 3. Why Anything */}
      <WhyAnythingSection pov={pov} sources={allSources} feedbackNode={fb('why_anything')} />

      {/* 4. Why Now */}
      <WhyNowSection pov={pov} sources={allSources} feedbackNode={fb('why_now')} />

      {/* 5. Why Figma */}
      <WhyFigmaSection pov={pov} sources={allSources} feedbackNode={fb('why_figma')} />

      {/* 5.5 Whitespace & Opportunity */}
      <WhitespaceSection pov={pov} feedbackNode={fb('whitespace')} />

      {/* 6. Value Pyramid */}
      <ValuePyramidSection pyramid={valuePyramid} feedbackNode={fb('value_pyramid')} />

      {/* 8. Digital Products */}
      <DigitalProductsSection pov={pov} />

      {/* 9. Who to Contact */}
      <ContactsSection personas={personas} hooksData={hooksData} feedbackNode={fb('contact_matrix')} />

      {/* 10. Job Signals */}
      <JobSignalsSection pov={pov} />

      {/* 11. Key Executives */}
      <KeyExecutivesSection pov={pov} />

      {/* 12. Technology Partnerships */}
      <TechPartnersSection pov={pov} />

      {/* 13. Research Deep Dive */}
      <ResearchDeepDiveSection pov={pov} feedbackNode={fb('research_deep_dive')} />

      {/* Proof Points — removed from spec (2026-04-01 reframe) */}

      {/* 14. Sources */}
      <SourcesSection pov={pov} />

      {/* Feedback moved to header toolbar Rate button */}
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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareStatus, setShareStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [shareError, setShareError] = useState('');
  const shareRef = useRef<HTMLDivElement>(null);
  const [runningEnglish, setRunningEnglish] = useState(false);
  const [englishSubmitted, setEnglishSubmitted] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [rerenderDone, setRerenderDone] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [usefulness, setUsefulness] = useState<number | null>(null);
  const [rateComment, setRateComment] = useState('');
  const [rateSubmitted, setRateSubmitted] = useState(false);
  const [rateSubmitting, setRateSubmitting] = useState(false);
  const rateRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [reviewMode, setReviewMode] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Section feedback state
  const [sectionFeedback, setSectionFeedback] = useState<Record<string, { score: number; comment: string }>>({});
  const sectionFeedbackRef = useRef(sectionFeedback);
  sectionFeedbackRef.current = sectionFeedback;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedbackBannerDismissed, setFeedbackBannerDismissed] = useState(() => {
    const dismissed = localStorage.getItem('feedback_banner_dismissed');
    return dismissed ? Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000 : false;
  });
  const [timeOnPage, setTimeOnPage] = useState(0);
  const [scrolledPastMid, setScrolledPastMid] = useState(false);
  const [emailCopied, setEmailCopied] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reviewFileInputRef = useRef<HTMLInputElement>(null);


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

  const handleDownloadPdf = async () => {
    if (!run?.id || pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await workerFetch(`/pdf/${run.id}`);
      if (!res.ok) throw new Error('Failed to get PDF');
      const { signedUrl } = await res.json();
      window.open(signedUrl, '_blank');
    } catch {
      // Silently fail — the button just stops loading
    } finally {
      setPdfLoading(false);
    }
  };

  const handleShare = async () => {
    if (!session || shareStatus === 'sending') return;
    const email = shareEmail.trim().toLowerCase();
    if (!email || !email.endsWith('@figma.com')) {
      setShareStatus('error');
      setShareError('Only @figma.com email addresses are allowed');
      return;
    }
    setShareStatus('sending');
    setShareError('');
    try {
      const res = await workerFetch(`/share/${run_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Failed to send' }));
        throw new Error(error || 'Failed to send');
      }
      setShareStatus('sent');
    } catch (err: any) {
      setShareStatus('error');
      setShareError(err.message || 'Failed to send access link');
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

  // Close overflow menu on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  // Close share popover on outside click
  useEffect(() => {
    if (!shareOpen) return;
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [shareOpen]);

  // Close rate popover on outside click
  useEffect(() => {
    if (!rateOpen) return;
    const handler = (e: MouseEvent) => {
      if (rateRef.current && !rateRef.current.contains(e.target as Node)) setRateOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [rateOpen]);

  const handleRateSubmit = async () => {
    if (!rating || !run_id) return;
    setRateSubmitting(true);
    try {
      await workerFetch(`/feedback/${run_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, accuracy_rating: accuracy, usefulness_rating: usefulness, comment: rateComment || null }),
      });
      setRateSubmitted(true);
    } catch { /* silent */ }
    setRateSubmitting(false);
  };

  // Section feedback handler — debounced auto-save
  const handleSectionFeedback = (key: string, score: number, comment: string) => {
    const updated = { ...sectionFeedbackRef.current, [key]: { score, comment } };
    // Remove entries reset to 0 with no comment
    if (score === 0 && !comment) delete updated[key];
    setSectionFeedback(updated);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!run_id) return;
      const rated = Object.values(updated).filter(f => f.score !== 0);
      const thumbsUp = rated.filter(f => f.score === 1).length;
      const overallScore = rated.length > 0 ? thumbsUp / rated.length : null;
      try {
        await workerFetch(`/feedback/${run_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section_feedback: updated,
            overall_score: overallScore,
            rating: rating || null,
            accuracy_rating: accuracy || null,
            usefulness_rating: usefulness || null,
            comment: rateComment || null,
          }),
        });
      } catch { /* silent */ }
    }, 1000);
  };

  // Time-on-page counter for feedback banner
  useEffect(() => {
    const interval = setInterval(() => setTimeOnPage(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Scroll-past-midpoint detection for feedback banner
  useEffect(() => {
    const handler = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const mid = document.documentElement.scrollHeight / 2;
      if (scrolled >= mid) setScrolledPastMid(true);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const hasAnyFeedback = Object.values(sectionFeedback).some(f => f.score !== 0);
  const showFeedbackBanner = !feedbackBannerDismissed && !hasAnyFeedback && timeOnPage >= 120 && scrolledPastMid;

  // Overall score calculation
  const ratedSections = Object.values(sectionFeedback).filter(f => f.score !== 0);
  const thumbsUpCount = ratedSections.filter(f => f.score === 1).length;
  const overallScoreText = ratedSections.length > 0 ? `${thumbsUpCount}/${ratedSections.length} sections rated positively` : null;

  // sparkle keyframes moved to inline <style> tag in JSX

  useEffect(() => {
    if (!run_id) return;
    let cancelled = false;

    async function load() {
      const { data: runData, error: runErr } = await supabase
        .from('runs')
        .select('id, company, url, created_at, status, pdf_url, brief_id, market, debug_events_url')
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

  const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;
    const fileArr = Array.from(files);
    const errors: string[] = [];

    // Enforce limits
    const totalCount = pendingAttachments.length + fileArr.length;
    if (totalCount > 5) { errors.push('Max 5 attachments total.'); }

    const validFiles: ChatAttachment[] = [];
    for (const file of fileArr.slice(0, 5 - pendingAttachments.length)) {
      if (file.type === 'application/pdf' && file.size > 10 * 1024 * 1024) {
        errors.push(`${file.name}: PDF must be under 10MB.`);
        continue;
      }
      if (file.type.startsWith('image/') && file.size > 5 * 1024 * 1024) {
        errors.push(`${file.name}: Image must be under 5MB.`);
        continue;
      }
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        errors.push(`${file.name}: Only PDF and image files are supported.`);
        continue;
      }
      try {
        const data = await toBase64(file);
        validFiles.push({
          type: file.type === 'application/pdf' ? 'pdf' : 'image',
          mimeType: file.type,
          filename: file.name,
          data,
          file,
        });
      } catch {
        errors.push(`${file.name}: Failed to read file.`);
      }
    }

    if (errors.length > 0) {
      setToastMessage(errors.join(' '));
      setTimeout(() => setToastMessage(null), 4000);
    }
    if (validFiles.length > 0) {
      setPendingAttachments(prev => [...prev, ...validFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async (content: string) => {
    if ((!content.trim() && pendingAttachments.length === 0) || streaming) return;

    const currentAttachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    const currentReviewMode = reviewMode;
    const userMessage: ChatMessage = { role: 'user', content, attachments: currentAttachments, reviewMode: currentReviewMode || undefined };
    const newMessages = [...chatMessages, userMessage];
    setChatMessages(newMessages);
    setChatInput('');
    setPendingAttachments([]);
    setReviewMode(false);
    setStreaming(true);

    const assistantMessage: ChatMessage = { role: 'assistant', content: '', reviewMode: currentReviewMode || undefined };
    setChatMessages([...newMessages, assistantMessage]);

    // Build messages for API — convert attachments to content blocks for the current message
    const apiMessages = newMessages.map(m => {
      if (m.attachments && m.attachments.length > 0) {
        const content: any[] = [];
        for (const att of m.attachments) {
          if (att.type === 'pdf') {
            content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.data } });
          } else {
            content.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType, data: att.data } });
          }
        }
        content.push({ type: 'text', text: m.content || '(attached files)' });
        return { role: m.role, content };
      }
      return { role: m.role, content: m.content };
    });

    try {
      const res = await workerFetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_id,
          market: run?.market ?? null,
          messages: apiMessages,
          reviewMode: currentReviewMode || undefined,
          attachments: currentAttachments?.map(a => ({ type: a.type, mimeType: a.mimeType, filename: a.filename, data: a.data })),
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
    paddingBottom: 64,
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
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes sparkle-spin {
          0%   { transform: rotate(0deg) scale(1);    opacity: 1; }
          25%  { transform: rotate(15deg) scale(1.15); opacity: 0.8; }
          50%  { transform: rotate(0deg) scale(0.95);  opacity: 1; }
          75%  { transform: rotate(-10deg) scale(1.1); opacity: 0.85; }
          100% { transform: rotate(0deg) scale(1);    opacity: 1; }
        }
        @keyframes sparkle-dot {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1.2); }
        }
        .sparkle-main { animation: sparkle-spin 2.2s ease-in-out infinite; transform-origin: center; }
        .sparkle-dot1 { animation: sparkle-dot 1.4s ease-in-out infinite; }
        .sparkle-dot2 { animation: sparkle-dot 1.4s ease-in-out infinite 0.5s; }
        .sparkle-dot3 { animation: sparkle-dot 1.4s ease-in-out infinite 0.9s; }
      `}</style>
      <div style={{
        paddingRight: chatOpen ? 380 : 0,
        transition: 'padding-right 200ms ease',
        minHeight: '100vh',
      }}>
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

            {/* Title + badges + action buttons — single row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
              <h1 style={{
                fontFamily: FONTS.serif, fontSize: 30, fontWeight: 600,
                margin: 0, letterSpacing: '-0.03em', color: COLORS.heading,
              }}>
                {pov?.company_name || run.company}
              </h1>
              <AgeBadge createdAt={run.created_at} />

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Action buttons */}
              <button onClick={() => setChatOpen(true)} style={btnStyle('secondary')}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ display: 'block', flexShrink: 0 }}>
                  {/* main star */}
                  <path className="sparkle-main" d="M10 2.5 L11.3 7.2 L16.5 8.5 L11.3 9.8 L10 14.5 L8.7 9.8 L3.5 8.5 L8.7 7.2 Z" fill="#7F77DD"/>
                  {/* top right dot */}
                  <circle className="sparkle-dot1" cx="16" cy="3" r="1.5" fill="#AFA9EC"/>
                  {/* bottom left dot */}
                  <circle className="sparkle-dot2" cx="4" cy="15.5" r="1" fill="#CECBF6"/>
                  {/* mid right dot */}
                  <circle className="sparkle-dot3" cx="17.5" cy="12" r="1" fill="#AFA9EC"/>
                </svg>
                {' '}Chat
              </button>
              <button onClick={() => {
                setChatOpen(true);
                reviewFileInputRef.current?.click();
              }} style={btnStyle('secondary')}>
                <ClipboardList size={14} /> Review Plan
              </button>
              <input
                ref={reviewFileInputRef}
                type="file"
                accept="application/pdf,image/*"
                multiple
                style={{ display: 'none' }}
                onChange={async (e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    await handleFileSelect(e.target.files);
                    setChatInput('Please review this PSP against the brief.');
                    setReviewMode(true);
                  }
                  e.target.value = '';
                }}
              />
              <button onClick={() => {
                setToastMessage('Coming soon — Generate PSP will be available once we\'ve reviewed example plans.');
                setTimeout(() => setToastMessage(null), 4000);
              }} style={btnStyle('ghost')}>
                <FileText size={14} /> Generate PSP
              </button>

              {/* Section feedback score pill */}
              {overallScoreText && (
                <span style={{
                  fontSize: 11, fontFamily: FONTS.sans, fontWeight: 500,
                  color: '#065f46', background: '#ecfdf5',
                  padding: '4px 10px', borderRadius: 20,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <ThumbsUp size={11} /> {overallScoreText}
                </span>
              )}

              {/* Rate button + popover */}
              {session && (
                <div ref={rateRef} style={{ position: 'relative' }}>
                  <button onClick={() => setRateOpen(o => !o)} style={{
                    ...btnStyle('secondary'),
                    color: rateSubmitted ? '#065f46' : COLORS.secondary,
                  }}>
                    <span style={{ fontSize: 14 }}>{rateSubmitted ? '★' : '☆'}</span> {rateSubmitted ? 'Rated!' : 'Rate'}
                  </button>
                  {rateOpen && !rateSubmitted && (
                    <div style={{
                      position: 'absolute', right: 0, top: '100%', marginTop: 4,
                      background: '#fff', border: `1px solid ${COLORS.border}`,
                      borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      padding: 16, minWidth: 260, zIndex: 50,
                    }}>
                      {[
                        { label: 'Overall', value: rating, onChange: setRating },
                        { label: 'Accuracy', value: accuracy, onChange: setAccuracy },
                        { label: 'Usefulness', value: usefulness, onChange: setUsefulness },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <div style={{ fontSize: 12, color: COLORS.secondary, width: 90, fontFamily: FONTS.sans }}>{row.label}</div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {[1, 2, 3, 4, 5].map(n => (
                              <button key={n} onClick={() => row.onChange(n)} style={{
                                background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 2,
                                color: row.value && n <= row.value ? '#ca8a04' : COLORS.faint,
                              }}>{row.value && n <= row.value ? '\u2605' : '\u2606'}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <textarea
                        value={rateComment} onChange={e => setRateComment(e.target.value)}
                        placeholder="Optional comment..."
                        style={{
                          width: '100%', minHeight: 50, marginTop: 4, padding: 8, fontSize: 12,
                          background: '#fdfcfa', border: `1px solid ${COLORS.border}`,
                          borderRadius: 6, color: COLORS.body, resize: 'vertical',
                          fontFamily: FONTS.sans,
                        }}
                      />
                      <button onClick={handleRateSubmit} disabled={!rating || rateSubmitting} style={{
                        marginTop: 8, background: rating ? COLORS.purple : '#f5f5f0',
                        color: rating ? '#fff' : COLORS.faint,
                        border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12,
                        fontWeight: 500, cursor: rating ? 'pointer' : 'default',
                        fontFamily: FONTS.sans, width: '100%',
                      }}>
                        {rateSubmitting ? 'Sending...' : 'Submit'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Overflow menu */}
              <div ref={overflowRef} style={{ position: 'relative' }}>
                <button onClick={() => setOverflowOpen(o => !o)} style={{
                  ...btnStyle('secondary'), padding: '6px 10px', minWidth: 0,
                }}>
                  {'\u22EF'}
                </button>
                {overflowOpen && (
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: 4,
                    background: '#fff', border: `1px solid ${COLORS.border}`,
                    borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    minWidth: 180, zIndex: 50, overflow: 'hidden',
                  }}>
                    {/* Share — opens popover inline */}
                    <div ref={shareRef} style={{ position: 'relative' }}>
                      <button onClick={(e) => { e.stopPropagation(); setShareOpen(o => !o); setShareStatus('idle'); setShareError(''); setShareEmail(''); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '10px 14px', fontSize: 13, color: COLORS.secondary,
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontFamily: FONTS.sans, borderBottom: `1px solid ${COLORS.borderLight}`,
                          textAlign: 'left',
                        }}>
                        <Share2 size={14} /> Share
                      </button>
                      {shareOpen && (
                        <div style={{
                          position: 'absolute', right: '100%', top: 0, marginRight: 4,
                          background: '#1a1a1a', border: '1px solid #333', borderRadius: 8,
                          padding: 16, width: 300, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        }}>
                          {shareStatus === 'sent' ? (
                            <div style={{ fontSize: 13, color: '#22c55e', lineHeight: 1.6 }}>
                              Access link sent to <strong>{shareEmail}</strong>. They'll receive an email to view this brief.
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#ccc', marginBottom: 8 }}>
                                Share with a Figma colleague
                              </div>
                              <input
                                type="email"
                                placeholder="name@figma.com"
                                value={shareEmail}
                                onChange={e => setShareEmail(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleShare(); }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                  width: '100%', padding: '8px 10px', fontSize: 13,
                                  background: '#111', border: '1px solid #444', borderRadius: 6,
                                  color: '#e5e5e5', outline: 'none', boxSizing: 'border-box',
                                }}
                              />
                              {shareStatus === 'error' && (
                                <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{shareError}</div>
                              )}
                              <button
                                onClick={handleShare}
                                disabled={shareStatus === 'sending' || !shareEmail.trim()}
                                style={{
                                  ...btnStyle('primary'), width: '100%', marginTop: 8,
                                  justifyContent: 'center', opacity: shareStatus === 'sending' || !shareEmail.trim() ? 0.5 : 1,
                                }}
                              >
                                <Send size={13} /> {shareStatus === 'sending' ? 'Sending...' : 'Send access link'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Download PDF */}
                    {run.pdf_url && (
                      <button onClick={() => { handleDownloadPdf(); setOverflowOpen(false); }} disabled={pdfLoading}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '10px 14px', fontSize: 13, color: COLORS.secondary,
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontFamily: FONTS.sans, borderBottom: `1px solid ${COLORS.borderLight}`,
                          textAlign: 'left',
                        }}>
                        <FileText size={14} /> {pdfLoading ? 'Loading...' : (run.market && run.market !== 'en' && run.market !== 'auto' && LANGUAGE_FLAGS[run.market]
                          ? `${LANGUAGE_FLAGS[run.market]} Download PDF` : 'Download PDF')}
                      </button>
                    )}
                    {run.market && run.market !== 'en' && run.market !== 'auto' && !englishSubmitted && (
                      <button onClick={() => { handleRunInEnglish(); setOverflowOpen(false); }} disabled={runningEnglish}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '10px 14px', fontSize: 13, color: COLORS.secondary,
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontFamily: FONTS.sans, borderBottom: `1px solid ${COLORS.borderLight}`,
                          textAlign: 'left',
                        }}>
                        {'\u{1F1EC}\u{1F1E7}'} {runningEnglish ? 'Submitting\u2026' : 'Run in English'}
                      </button>
                    )}
                    {englishSubmitted && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', fontSize: 13, color: '#065f46',
                        fontFamily: FONTS.sans, borderBottom: `1px solid ${COLORS.borderLight}`,
                      }}>
                        {'\u{1F1EC}\u{1F1E7}'} English run submitted
                      </div>
                    )}
                    {userProfile?.role === 'admin' && run.debug_events_url && (
                      <a href={`/AccountResearcherPortal/debug/${run.id}`}
                        onClick={() => setOverflowOpen(false)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '10px 14px', fontSize: 13, color: COLORS.secondary,
                          textDecoration: 'none', fontFamily: FONTS.sans,
                          borderBottom: `1px solid ${COLORS.borderLight}`,
                        }}>
                        <Activity size={14} /> Debug
                      </a>
                    )}
                    {userProfile?.role === 'admin' && run.status === 'complete' && (
                      <button onClick={() => { handleRegeneratePdf(); setOverflowOpen(false); }}
                        disabled={rerendering || rerenderDone}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '10px 14px', fontSize: 13,
                          color: rerenderDone ? '#065f46' : COLORS.secondary,
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontFamily: FONTS.sans, borderBottom: `1px solid ${COLORS.borderLight}`,
                          textAlign: 'left', opacity: rerendering ? 0.6 : 1,
                        }}>
                        <RefreshCw size={14} style={rerendering ? { animation: 'spin 1s linear infinite' } : undefined} />
                        {rerendering ? 'Re-rendering\u2026' : rerenderDone ? 'Dispatched!' : 'Re-render PDF'}
                      </button>
                    )}
                    {userProfile?.role === 'admin' && (
                      <>
                        {!deleteConfirm ? (
                          <button onClick={() => { setDeleteConfirm(true); setOverflowOpen(false); }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                              padding: '10px 14px', fontSize: 13, color: '#dc2626',
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontFamily: FONTS.sans, textAlign: 'left',
                            }}>
                            <Trash2 size={14} /> Delete
                          </button>
                        ) : (
                          <div style={{ padding: '10px 14px' }}>
                            <div style={{ fontSize: 12, color: '#854d0e', fontFamily: FONTS.sans, marginBottom: 8 }}>Delete permanently?</div>
                            <div style={{ display: 'flex', gap: 6 }}>
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
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* MetricsBar — full bleed, inside header */}
          {pov && <MetricsBar pov={pov} hooksData={hooksData} personas={personas} />}
        </div>

        {/* Research Gaps warning — separate card below header */}
        {pov?.research_gaps && (
          <details style={{
            background: '#fefce8', border: `1px solid #fde68a`,
            borderRadius: 6, marginTop: 10, marginBottom: 16, cursor: 'pointer',
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
              <button onClick={handleDownloadPdf} disabled={pdfLoading} style={{ background: 'none', border: 'none', padding: 0, color: COLORS.purple, marginLeft: 8, cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit' }}>
                {pdfLoading ? 'Loading...' : 'Download full PDF'} <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </button>
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
              <button onClick={handleDownloadPdf} disabled={pdfLoading} style={btnStyle('primary')}>
                <FileText size={14} /> {pdfLoading ? 'Loading...' : 'Download PDF'}
              </button>
            )}
          </div>
        )}

        {/* ============ Brief content sections ============ */}
        {pov && (
          <BriefContent
            pov={pov} personas={personas} hooksData={hooksData}
            valuePyramid={brief?.value_pyramid || pov?.value_pyramid}
            sectionFeedback={sectionFeedback}
            onSectionFeedback={handleSectionFeedback}
          />
        )}
      </div>
      </div>

      {/* ============ Feedback prompt banner ============ */}
      {showFeedbackBanner && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 10,
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 80,
          fontFamily: FONTS.sans, fontSize: 14, color: '#92400e',
          maxWidth: 520,
        }}>
          <span style={{ flex: 1 }}>Finding this brief useful? Let us know what's working.</span>
          <button
            onClick={() => {
              // Scroll to first section with feedback thumbs
              const firstSection = document.querySelector('[data-section-feedback]');
              if (firstSection) firstSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setFeedbackBannerDismissed(true);
              localStorage.setItem('feedback_banner_dismissed', String(Date.now()));
            }}
            style={{
              background: '#f59e0b', color: '#fff', border: 'none',
              padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
              fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
            }}
          >
            Rate sections
          </button>
          <button
            onClick={() => {
              setFeedbackBannerDismissed(true);
              localStorage.setItem('feedback_banner_dismissed', String(Date.now()));
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#92400e', padding: 4, fontSize: 16, lineHeight: 1,
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

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
                  {getSuggestedPrompts(run?.market ?? null).map((prompt, i) => (
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
                  <div key={i}>
                    <div style={{
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
                        {/* Attachment chips in user messages */}
                        {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                            {msg.attachments.map((att, j) => (
                              <span key={j} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                background: 'rgba(255,255,255,0.2)', borderRadius: 4,
                                padding: '2px 8px', fontSize: 11,
                              }}>
                                {att.type === 'pdf' ? <FileText size={11} /> : null}
                                {att.type === 'image' && att.file ? (
                                  <img src={URL.createObjectURL(att.file)} alt="" style={{ height: 20, borderRadius: 2 }} />
                                ) : null}
                                {att.filename}
                              </span>
                            ))}
                          </div>
                        )}
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
                    {/* Copy as Email button for review mode responses */}
                    {msg.role === 'assistant' && msg.reviewMode && msg.content && !streaming && (
                      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 6 }}>
                        <button
                          onClick={() => {
                            const accountName = pov?.company_name || run.company;
                            const plain = msg.content
                              .replace(/\*\*([^*]+)\*\*/g, '$1')
                              .replace(/##\s*/g, '')
                              .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                              .replace(/^[-*]\s/gm, '- ')
                              .replace(/`([^`]+)`/g, '$1');
                            // Extract sections
                            const workingMatch = plain.match(/What'?s working\n([\s\S]*?)(?=Areas to develop|$)/i);
                            const areasMatch = plain.match(/Areas to develop\n([\s\S]*?)(?=Priorities before|$)/i);
                            const prioritiesMatch = plain.match(/Priorities before[^\n]*\n([\s\S]*?)$/i);
                            const working = workingMatch ? workingMatch[1].trim() : '';
                            const areas = areasMatch ? areasMatch[1].trim() : '';
                            const priorities = prioritiesMatch ? prioritiesMatch[1].trim() : '';
                            const priorityList = priorities
                              .split('\n')
                              .filter(l => l.trim())
                              .map((l, idx) => `${idx + 1}. ${l.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, '')}`)
                              .slice(0, 3)
                              .join('\n');
                            const email = `Subject: PSP Review — ${accountName}\n\nHi [Rep Name],\n\nHere's a summary of my coaching notes on your ${accountName} PSP ahead of our next session.\n\n${working}\n\n${areas}\n\nBefore our next session:\n${priorityList}\n\nHappy to dig into any of these together.\n\n${userProfile?.name || '[Manager Name]'}`;
                            navigator.clipboard.writeText(email);
                            setEmailCopied(i);
                            setTimeout(() => setEmailCopied(null), 2000);
                          }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: 'none', border: `1px solid ${COLORS.border}`,
                            borderRadius: 4, padding: '4px 10px', fontSize: 11,
                            color: COLORS.secondary, cursor: 'pointer', fontFamily: FONTS.sans,
                          }}
                        >
                          {emailCopied === i ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy as email</>}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: '12px 18px', borderTop: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
            {/* Attachment preview strip */}
            {pendingAttachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {pendingAttachments.map((att, i) => (
                  <div key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: '#f5f5f0', border: `1px solid ${COLORS.border}`,
                    borderRadius: 6, padding: '4px 8px', fontSize: 12, color: COLORS.body,
                  }}>
                    {att.type === 'pdf' ? (
                      <><FileText size={12} color={COLORS.secondary} /> {att.filename}</>
                    ) : (
                      att.file ? <img src={URL.createObjectURL(att.file)} alt="" style={{ height: 32, borderRadius: 3 }} /> : att.filename
                    )}
                    <button onClick={() => removeAttachment(i)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      color: COLORS.faint, marginLeft: 2, lineHeight: 1,
                    }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {reviewMode && (
              <div style={{
                background: '#f0edf8', borderRadius: 6, padding: '6px 10px',
                fontSize: 11, color: COLORS.purple, marginBottom: 6, fontWeight: 500,
              }}>
                PSP Review mode — Claude will coach against this brief
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={streaming}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: COLORS.secondary, padding: '4px', alignSelf: 'flex-end',
                  opacity: streaming ? 0.4 : 1,
                }}
                title="Attach file"
              >
                <Paperclip size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                multiple
                style={{ display: 'none' }}
                onChange={e => { handleFileSelect(e.target.files); e.target.value = ''; }}
              />
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
                disabled={(!chatInput.trim() && pendingAttachments.length === 0) || streaming}
                style={{
                  background: COLORS.purple, color: '#fff',
                  border: 'none', borderRadius: 6, padding: '0 14px',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  opacity: ((!chatInput.trim() && pendingAttachments.length === 0) || streaming) ? 0.4 : 1,
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

      {/* Toast notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 13, fontFamily: FONTS.sans,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 200,
          maxWidth: 400, textAlign: 'center',
          animation: 'fadeIn 150ms ease-out',
        }}>
          {toastMessage}
        </div>
      )}
    </Layout>
  );
}
