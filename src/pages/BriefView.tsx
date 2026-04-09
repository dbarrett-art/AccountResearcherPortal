import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, workerFetch } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import useWindowWidth from '../hooks/useWindowWidth';
import { ArrowLeft, FileText, X, ChevronDown, ExternalLink, Send, Trash2, Activity, Share2, RefreshCw, Paperclip, ClipboardList, Copy, Check, MoreHorizontal } from 'lucide-react';
import SectionFeedback from '../components/SectionFeedback';
// DOMPurify removed — CitedProse now renders React elements instead of innerHTML

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

const FEEDBACK_SECTIONS = [
  { id: 'icp_fit',           label: 'ICP Fit',                  icon: '\u25CE' },
  { id: 'about',             label: 'About',                    icon: '\u25A4' },
  { id: 'why_anything',      label: 'Why Anything',             icon: '\u25C8' },
  { id: 'why_now',           label: 'Why Now',                  icon: '\u25F7' },
  { id: 'why_figma',         label: 'Why Figma',                icon: '\u25C6' },
  { id: 'whitespace',        label: 'Whitespace & Opportunity', icon: '\u25EB' },
  { id: 'value_pyramid',     label: 'Value Pyramid',            icon: '\u25B3' },
  { id: 'contact_matrix',    label: 'Key Contacts',             icon: '\u25C9' },
  { id: 'research_deep_dive', label: 'Research Deep Dive',      icon: '\u25C8' },
];

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

function CitedProse({ text, sources, style, onCitationClick }: {
  text: string | undefined | null;
  sources?: any[];
  style?: React.CSSProperties;
  onCitationClick?: (index: number, source: any, event: React.MouseEvent) => void;
}) {
  if (!text) return null;

  // Strip [SOURCE: url] patterns (these come from distilled intel and should not render as raw text)
  const cleanText = text.replace(/\s*\[SOURCE:\s*https?:\/\/[^\]]+\]/gi, '');

  // Split text on [N] citation markers and build React elements
  const parts: React.ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(cleanText)) !== null) {
    // Text before this citation
    if (match.index > lastIndex) {
      parts.push(cleanText.slice(lastIndex, match.index));
    }
    const n = parseInt(match[1], 10);
    // Look up by citation_number first (new pipeline), fall back to array index (legacy)
    const src = sources?.find((s: any) => s.citation_number === n) ?? sources?.[n - 1];
    const url = src ? (typeof src === 'string' ? src : (src?.url || src?.source || '')) : '';

    if (url && url.startsWith('http') && onCitationClick && src) {
      parts.push(
        <sup key={key++}>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onCitationClick(n - 1, src, e); }}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 18, height: 18, borderRadius: 4,
              background: '#EEEDFE', color: '#534AB7',
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
              border: '0.5px solid #AFA9EC',
              verticalAlign: 'middle', margin: '0 1px',
              fontFamily: 'DM Sans, sans-serif', lineHeight: 1,
            }}
          >
            {n}
          </span>
        </sup>
      );
    } else if (url && url.startsWith('http')) {
      parts.push(
        <sup key={key++}>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ color: COLORS.purple, textDecoration: 'none', cursor: 'pointer' }}>
            [{n}]
          </a>
        </sup>
      );
    } else {
      parts.push(<sup key={key++} style={{ color: COLORS.faint }}>[{n}]</sup>);
    }
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last citation
  if (lastIndex < cleanText.length) {
    parts.push(cleanText.slice(lastIndex));
  }

  return (
    <p style={{
      fontSize: 17, lineHeight: 1.75, color: COLORS.body,
      fontFamily: FONTS.sans, margin: 0, fontWeight: 400,
      ...style,
    }}>
      {parts}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Citation snippet extraction                                        */
/* ------------------------------------------------------------------ */

function extractSnippet(distilledIntel: string | null | undefined, sourceUrl: string): string | null {
  if (!distilledIntel || !sourceUrl) return null;

  // distilled_intel uses [SOURCE: <url>] tags before each factual claim
  const tag = `[SOURCE: ${sourceUrl}]`;
  const tagIdx = distilledIntel.indexOf(tag);
  if (tagIdx === -1) {
    // Try matching just the domain+path (some URLs may differ slightly)
    try {
      const parsed = new URL(sourceUrl);
      const shortUrl = parsed.hostname + parsed.pathname.replace(/\/$/, '');
      const shortIdx = distilledIntel.indexOf(shortUrl);
      if (shortIdx === -1) return null;
      // Find the [SOURCE: ...] tag that contains this URL
      const tagStart = distilledIntel.lastIndexOf('[SOURCE:', shortIdx);
      if (tagStart === -1) return null;
      const tagEnd = distilledIntel.indexOf(']', shortIdx);
      if (tagEnd === -1) return null;
      return extractAroundTag(distilledIntel, tagStart, tagEnd + 1);
    } catch {
      return null;
    }
  }

  return extractAroundTag(distilledIntel, tagIdx, tagIdx + tag.length);
}

function extractAroundTag(text: string, _tagStart: number, tagEnd: number): string | null {
  // Grab the content after the tag until the next [SOURCE:] or section heading or 300 chars
  const afterTag = text.slice(tagEnd).trimStart();
  const nextTag = afterTag.search(/\[SOURCE:|^##\s/m);
  const chunk = nextTag > 0 ? afterTag.slice(0, nextTag) : afterTag.slice(0, 400);

  // Split into sentences and take 2-3
  const sentences = chunk.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
  const snippet = sentences.slice(0, 3).join(' ').trim();

  // Clean up markdown artifacts
  return snippet
    .replace(/\[SOURCE:[^\]]*\]/g, '')
    .replace(/^[-•*]\s*/, '')
    .replace(/\*\*/g, '')
    .trim() || null;
}

/* ------------------------------------------------------------------ */
/*  Citation tooltip + modal                                           */
/* ------------------------------------------------------------------ */

function CitationTooltip({ tooltip }: {
  tooltip: { source: any; index: number; x: number; y: number; snippet?: string | null };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const source = tooltip.source;
  const url = typeof source === 'string' ? source : (source?.url || source?.source || '');
  let domain: string | null = null;
  try { domain = url ? new URL(url).hostname.replace('www.', '') : null; } catch {}
  const title = source?.title || source?.source || source?.what_it_provided || 'Source';
  const snippet = tooltip.snippet;
  const fallbackSummary = source?.snippet || source?.description || source?.what_it_provided || null;
  const displayText = snippet || fallbackSummary;

  // Position above badge by default, fall back to below if near top
  const popoverHeight = 200; // approximate
  const posAbove = tooltip.y - popoverHeight - 8;
  const useAbove = posAbove > 10;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: Math.min(tooltip.x, window.innerWidth - 340),
        top: useAbove ? posAbove : tooltip.y + 8,
        maxWidth: 320,
        background: '#ffffff',
        border: '1px solid #e5e0d8',
        borderRadius: 6,
        padding: '14px 16px',
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        fontFamily: 'DM Sans, sans-serif',
      }}
      onClick={e => e.stopPropagation()}
    >
      {domain && (
        <div style={{ fontSize: 11, color: '#888', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7F77DD', flexShrink: 0 }} />
          {domain} · Source [{tooltip.index + 1}]
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.body, marginBottom: 8, lineHeight: 1.4 }}>
        {title.length > 80 ? title.slice(0, 80) + '…' : title}
      </div>
      {snippet ? (
        <div style={{ fontSize: 13, color: COLORS.secondary, lineHeight: 1.55, marginBottom: 12, fontStyle: 'italic' }}>
          {snippet.length > 280 ? snippet.slice(0, 280) + '…' : snippet}
        </div>
      ) : displayText && displayText !== title && displayText !== 'Research source' ? (
        <div style={{ fontSize: 13, color: COLORS.secondary, lineHeight: 1.5, marginBottom: 12 }}>
          {displayText.length > 200 ? displayText.slice(0, 200) + '…' : displayText}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: COLORS.faint, lineHeight: 1.5, marginBottom: 12, fontStyle: 'italic' }}>
          No preview available
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #e5e0d8' }}>
        <div style={{ fontSize: 11, color: COLORS.faint }}>
          {source?.date || ''}
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12, color: COLORS.purple, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(124,58,237,0.08)', border: 'none',
              borderRadius: 8, padding: '5px 10px',
              textDecoration: 'none',
            }}
          >
            View source ↗
          </a>
        )}
      </div>
    </div>
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

function MetricsBar({ pov, isMobile }: { pov: any; hooksData?: any; personas?: any; isMobile?: boolean }) {
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
  if (currentArr != null) items.push({ label: 'ARR', value: fmtDollar(currentArr) });
  if (totalWhitespace != null) items.push({ label: 'WHITESPACE', value: fmtDollar(totalWhitespace) });

  if (items.length === 0) return null;

  const METRIC_ACCENTS = ['#7F77DD', '#1D9E75', '#378ADD', '#D85A30'];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
      gap: 8,
    }}>
      {items.map((item, i) => (
        <div key={i} style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderTop: `3px solid ${METRIC_ACCENTS[i] || METRIC_ACCENTS[0]}`,
          borderRadius: 'var(--border-radius-md)',
          padding: '14px 16px',
          textAlign: 'center' as const,
        }}>
          <div style={{
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            fontFamily: FONTS.sans,
            marginBottom: 6,
            textAlign: 'center' as const,
          }}>
            {item.label}
          </div>
          <div style={{
            fontSize: 22,
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            fontFamily: FONTS.sans,
            textAlign: 'center' as const,
            lineHeight: 1,
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

function IcpSection({ pov, sources, onCitationClick }: { pov: any; sources: any[]; onCitationClick?: (i: number, src: any, e: React.MouseEvent) => void }) {
  const icp = pov?.icp_fit || pov?.icp_assessment;
  if (!icp) return null;
  return (
    <Section
      title="ICP Fit"
      accent={SECTION_ACCENTS.icp}
      badge={<IcpBadge score={icp.score} size="small" />}
    >
      <CitedProse text={icp.rationale} sources={sources} onCitationClick={onCitationClick} />
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

function AboutSection({ pov, sources, feedbackNode, onCitationClick }: { pov: any; sources: any[]; feedbackNode?: React.ReactNode; onCitationClick?: (i: number, src: any, e: React.MouseEvent) => void }) {
  const about = pov?.about;
  if (!about) return null;

  const cleanWhatTheyDo = about.what_they_do ? stripMarkdownHeaders(about.what_they_do) : null;

  return (
    <Section title="About" accent={SECTION_ACCENTS.about} feedbackNode={feedbackNode}>
      {/* Narrative intro */}
      {(about.who_they_are || cleanWhatTheyDo) && (
        <CitedProse text={about.who_they_are || cleanWhatTheyDo} sources={sources} onCitationClick={onCitationClick} />
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
        <CitedProse text={cleanWhatTheyDo} sources={sources} style={{ fontWeight: 400 }} onCitationClick={onCitationClick} />
      )}

      {/* Strategy callout — if a dedicated strategy field exists */}
      {(pov?.why_anything?.corporate_strategy && !about.strategy) ? null : about.strategy && (
        <div style={{
          background: '#eef2ff', borderRadius: 6,
          padding: '14px 16px', marginTop: 12,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#3730a3',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
            fontFamily: FONTS.sans,
          }}>Strategy</div>
          <CitedProse text={about.strategy} sources={sources} style={{ fontWeight: 400 }} onCitationClick={onCitationClick} />
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Organisational Structure                                  */
/* ------------------------------------------------------------------ */

function OrgStructureSection({ pov }: { pov: any }) {
  const org = pov?.org_structure;

  // Filter divisions to only those with meaningful content
  const meaningfulDivisions = (org?.divisions || []).filter((div: any) => {
    if (typeof div === 'string') return div.trim().length > 0;
    return (div.name && div.name.trim().length > 0) || (div.description && div.description.trim().length > 0);
  });

  // Only show section when there's enough content to be useful:
  // - At least 2 meaningful divisions, OR
  // - A substantial structure_summary (> 50 chars)
  const hasMeaningfulContent =
    meaningfulDivisions.length >= 2 ||
    (org?.structure_summary && org.structure_summary.length > 50);

  if (!hasMeaningfulContent) return null;

  return (
    <Section title="Organisational Structure" accent={SECTION_ACCENTS.about} defaultOpen={false}>
      {org.structure_summary && (
        <p style={{ fontSize: 17, lineHeight: 1.75, color: COLORS.body, fontFamily: FONTS.sans, margin: '0 0 12px', fontWeight: 400 }}>
          {org.structure_summary}
        </p>
      )}
      {org.structure_type && (
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: SECTION_ACCENTS.about + '18', color: SECTION_ACCENTS.about,
          fontWeight: 600, fontFamily: FONTS.sans, marginBottom: 12, display: 'inline-block',
        }}>
          {org.structure_type}
        </span>
      )}
      {meaningfulDivisions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {meaningfulDivisions.map((div: any, i: number) => (
            <div key={i} style={{
              borderLeft: `3px solid ${SECTION_ACCENTS.about}`,
              padding: '10px 14px', borderRadius: '0 6px 6px 0',
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.body, fontFamily: FONTS.sans }}>
                {typeof div === 'string' ? div : div.name}
              </div>
              {typeof div !== 'string' && div.description && (
                <div style={{ fontSize: 14, color: COLORS.secondary, fontFamily: FONTS.sans, marginTop: 2, lineHeight: 1.5 }}>
                  {div.description}
                </div>
              )}
              {typeof div !== 'string' && div.estimated_headcount && (
                <div style={{ fontSize: 12, color: COLORS.faint, fontFamily: FONTS.sans, marginTop: 2 }}>
                  {div.estimated_headcount}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Why Anything                                              */
/* ------------------------------------------------------------------ */

function ExpandableObjective({ objective, index, sources, onCitationClick }: { objective: any; index: number; sources?: any[]; onCitationClick?: (i: number, src: any, e: React.MouseEvent) => void }) {
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
          <CitedProse text={title} sources={sources} style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.5 }} onCitationClick={onCitationClick} />
        </div>
      </div>
      {open && detail && (
        <div style={{ marginTop: 8, marginLeft: 32 }}>
          <CitedProse text={detail} sources={sources} style={{ fontSize: 17, lineHeight: 1.65, color: COLORS.secondary }} onCitationClick={onCitationClick} />
        </div>
      )}
    </div>
  );
}

function WhyAnythingSection({ pov, sources, feedbackNode, onCitationClick }: { pov: any; sources: any[]; feedbackNode?: React.ReactNode; onCitationClick?: (i: number, src: any, e: React.MouseEvent) => void }) {
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
          <CitedProse text={wa.corporate_strategy} sources={sources} onCitationClick={onCitationClick} />
        </div>
      )}

      {/* Narrative */}
      {wa.narrative && (
        <div style={{ marginBottom: 16 }}>
          <CitedProse text={wa.narrative} sources={sources} onCitationClick={onCitationClick} />
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
          <CitedProse text={wa.macro_forces} sources={sources} onCitationClick={onCitationClick} />
        </div>
      )}

      {/* Strategic objectives — expandable rows */}
      {objectives.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {objectives.map((obj: any, i: number) => (
            <ExpandableObjective key={i} objective={obj} index={i} sources={sources} onCitationClick={onCitationClick} />
          ))}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Why Now                                                   */
/* ------------------------------------------------------------------ */

function TriggerBlock({ trigger, sources, onCitationClick }: { trigger: any; sources?: any[]; onCitationClick?: (i: number, src: any, e: React.MouseEvent) => void }) {
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
            <CitedProse text={trigger.evidence} sources={sources} onCitationClick={onCitationClick} />
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

function WhyNowSection({ pov, sources, feedbackNode, onCitationClick }: { pov: any; sources?: any[]; feedbackNode?: React.ReactNode; onCitationClick?: (i: number, src: any, e: React.MouseEvent) => void }) {
  const triggers = pov?.why_now?.triggers || [];
  if (triggers.length === 0) return null;

  return (
    <Section title="Why Now" accent={SECTION_ACCENTS.whyNow} count={`${triggers.length} triggers`} feedbackNode={feedbackNode}>
      {pov?.why_now?.urgency_rationale && (
        <div style={{ marginBottom: 16 }}>
          <CitedProse text={pov.why_now.urgency_rationale} sources={sources} onCitationClick={onCitationClick} />
        </div>
      )}
      {triggers.map((t: any, i: number) => (
        <TriggerBlock key={i} trigger={t} sources={sources} onCitationClick={onCitationClick} />
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Why Figma                                                 */
/* ------------------------------------------------------------------ */

function ProductItem({ product, sources, onCitationClick }: { product: any; sources?: any[]; onCitationClick?: (i: number, src: any, e: React.MouseEvent) => void }) {
  const name = product?.product || '';
  const relevance = product?.relevance || '';

  return (
    <div style={{
      borderLeft: `2px solid ${COLORS.purple}`,
      paddingLeft: 14, marginBottom: 12,
    }}>
      <div style={{
        fontSize: 16, fontWeight: 600, color: COLORS.purple,
        fontFamily: FONTS.sans, marginBottom: relevance ? 6 : 0,
      }}>
        {name}
      </div>
      {relevance && (
        <CitedProse text={relevance} sources={sources} style={{ fontSize: 15, color: COLORS.secondary, lineHeight: 1.6, fontWeight: 400 }} onCitationClick={onCitationClick} />
      )}
    </div>
  );
}

function WhyFigmaSection({ pov, sources, feedbackNode, onCitationClick }: { pov: any; sources: any[]; feedbackNode?: React.ReactNode; onCitationClick?: (i: number, src: any, e: React.MouseEvent) => void }) {
  const wf = pov?.why_figma;
  if (!wf) return null;
  const products = wf.primary_products || [];
  const di = wf.design_infrastructure;
  const painSignals = wf.pain_signals || wf.what_they_say || [];
  const [showAllProducts, setShowAllProducts] = useState(products.length <= 6);

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
                fontStyle: 'italic', fontSize: 17,
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
          <CitedProse text={wf.strongest_angle} sources={sources} style={{ fontSize: 16, lineHeight: 1.7, fontWeight: 400 }} onCitationClick={onCitationClick} />
        </div>
      )}

      {/* Rationale — split into scannable paragraphs */}
      {wf.rationale && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {wf.rationale.split(/\n\n+/).map((para: string, i: number) => (
            <CitedProse key={i} text={para.trim()} sources={sources} style={{ fontWeight: 400 }} onCitationClick={onCitationClick} />
          ))}
        </div>
      )}

      {/* Products — always expanded, no accordion */}
      {products.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(showAllProducts ? products : products.slice(0, 6)).map((p: any, i: number) => (
            <ProductItem key={i} product={p} sources={sources} onCitationClick={onCitationClick} />
          ))}
          {!showAllProducts && products.length > 6 && (
            <button
              onClick={() => setShowAllProducts(true)}
              style={{
                fontSize: 13, color: COLORS.purple, background: 'none',
                border: 'none', cursor: 'pointer', padding: '4px 0',
                fontFamily: FONTS.sans, fontWeight: 500, textAlign: 'left',
              }}
            >
              Show all {products.length} products
            </button>
          )}
        </div>
      )}

      {/* Design Infrastructure → Entry Point */}
      {di && (
        (() => {
          const hasConfirmedFigma = (di.confirmed_tools || []).some((t: string) =>
            (typeof t === 'string' ? t : '').toLowerCase().includes('figma')
          );
          const namedSystem = (di.named_systems || [])[0];
          const systemName = typeof namedSystem === 'string' ? namedSystem : namedSystem?.name;
          const handoff = di.handoff_approach;

          if (!hasConfirmedFigma && !systemName && !handoff) return null;

          const parts: string[] = [];
          if (hasConfirmedFigma) parts.push('Figma confirmed in active use');
          if (systemName) parts.push(`Design system: ${systemName}`);
          if (handoff) parts.push(handoff);

          return (
            <div style={{
              fontSize: 13, color: COLORS.secondary, fontFamily: FONTS.sans,
              marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${COLORS.borderLight}`,
              lineHeight: 1.5,
            }}>
              <span style={{ fontWeight: 500, color: COLORS.tertiary, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>
                Entry Point
              </span>
              {' — '}
              {parts.join('. ')}
              {parts.length > 0 && '.'}
            </div>
          );
        })()
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
                <div style={{ fontSize: 14, fontStyle: 'italic', color: COLORS.tertiary, marginTop: 8, paddingTop: 8, borderTop: `1px solid #f5f3ef`, lineHeight: 1.6 }}>{s.evidence.replace(/\s*\[SOURCE:\s*https?:\/\/[^\]]+\]/gi, '')}</div>
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
  console.log('[BriefView] distilled_intel length:', intel ? intel.length : 0);

  if (!intel) {
    return (
      <Section title="Research Deep Dive" accent={SECTION_ACCENTS.researchDeepDive} feedbackNode={feedbackNode}>
        <p style={{ fontSize: 14, color: COLORS.faint, fontFamily: FONTS.sans, margin: 0, fontStyle: 'italic' }}>
          Research intelligence not available for this run. Re-run with --fresh to populate.
        </p>
      </Section>
    );
  }

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

function PyramidItem({ item, field, color }: { item: any; field: string; color: string }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const headline = item[field] || item.objective || item.strategy || item.initiative || '';
  const source = item.source || item.evidence_source || null;
  const talkTrack = item.talk_track || '';
  const figmaProduct = item.figma_product || item.figma_relevance || null;

  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      if (toggleRef.current?.contains(e.target as Node)) return;
      setPopoverOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popoverOpen]);

  const sourceNode = source && (() => {
    const match = String(source).match(/\[?(\d+)\]?/);
    const num = match ? match[1] : null;
    return num ? (
      <span style={{ fontSize: 11, color: COLORS.faint, fontFamily: FONTS.sans }}>
        · [{num}]
      </span>
    ) : (
      <span style={{
        fontSize: 11, color: COLORS.faint, fontFamily: FONTS.sans,
        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={source}>
        · {source.length > 40 ? source.slice(0, 40) + '…' : source}
      </span>
    );
  })();

  const productBadges = figmaProduct
    ? String(figmaProduct).split(/[,;]+/).map(s => s.trim()).filter(Boolean)
    : [];

  return (
    <div style={{ marginBottom: 8, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingTop: 6 }}>
        <span style={{
          flexShrink: 0,
          width: 6, height: 6,
          borderRadius: '50%',
          background: color,
          marginTop: 7,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 15, fontWeight: 600, color: COLORS.body,
              fontFamily: FONTS.sans, lineHeight: 1.5,
            }}>
              {headline}
            </span>
            {sourceNode}
            {talkTrack && (
              <button
                ref={toggleRef}
                onClick={(e) => { e.stopPropagation(); setPopoverOpen(o => !o); }}
                style={{
                  flexShrink: 0, marginTop: 2, marginLeft: 4, padding: 2,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: COLORS.faint, display: 'inline-flex', alignItems: 'center',
                  borderRadius: 4,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16"
                  fill="none" stroke="currentColor" strokeWidth="1.5"
                >
                  <circle cx="8" cy="8" r="7" />
                  <line x1="8" y1="7" x2="8" y2="11" />
                  <circle cx="8" cy="5" r="0.5" fill="currentColor" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {productBadges.length > 0 && (
        <div style={{ marginTop: 6, marginLeft: 14, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {productBadges.map((badge, bi) => (
            <span key={bi} style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10,
              background: COLORS.purple + '14', color: COLORS.purple,
              border: `1px solid ${COLORS.purple}30`,
              fontWeight: 500, fontFamily: FONTS.sans,
            }}>
              {badge}
            </span>
          ))}
        </div>
      )}

      {talkTrack && popoverOpen && (
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            left: 14,
            zIndex: 50,
            background: '#ffffff',
            border: '1px solid #e5e0d8',
            borderRadius: 6,
            padding: '12px 14px',
            fontSize: 14,
            color: COLORS.secondary,
            lineHeight: 1.65,
            fontFamily: FONTS.sans,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            minWidth: 280,
            maxWidth: 400,
            marginTop: 4,
          }}
        >
          {talkTrack}
        </div>
      )}
    </div>
  );
}

function ValuePyramidSection({ pyramid, feedbackNode }: { pyramid: any; feedbackNode?: React.ReactNode }) {
  if (!pyramid) return null;
  const objectives = pyramid.corporate_objectives || [];
  const strategies = pyramid.business_strategies || [];
  const initiatives = pyramid.targeted_initiatives || [];
  if (!objectives.length && !strategies.length && !initiatives.length) return null;

  const totalItems = objectives.length + strategies.length + initiatives.length;

  const layers: { label: string; color: string; items: any[]; field: string; indent: number }[] = [
    { label: 'CORPORATE OBJECTIVES', color: '#6366f1', items: objectives, field: 'objective', indent: 0 },
    { label: 'BUSINESS STRATEGIES', color: '#8b5cf6', items: strategies, field: 'strategy', indent: 48 },
    { label: 'TARGETED INITIATIVES', color: '#a78bfa', items: initiatives, field: 'initiative', indent: 96 },
  ];

  return (
    <Section title="Value Pyramid" accent={SECTION_ACCENTS.valuePyramid} count={`${totalItems} items`} feedbackNode={feedbackNode}>
      {layers.map((layer, li) => {
        if (layer.items.length === 0) return null;
        return (
          <div key={li} style={{ marginBottom: 12, paddingLeft: layer.indent }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: layer.color,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginBottom: 12, fontFamily: FONTS.sans,
              paddingBottom: 6, borderBottom: `2px solid ${layer.color}`,
            }}>
              {layer.label}
            </div>
            {layer.items.map((item: any, i: number) => (
              <PyramidItem key={i} item={item} field={layer.field} color={layer.color} />
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

// Client-side safety net: exclude job signals from known third-party domains
const EXCLUDED_JOB_SIGNAL_DOMAINS = [
  'figma.com', 'ixdf.com', 'interaction-design.org', 'coursera.com',
  'udemy.com', 'pluralsight.com', 'designjobs.careers', 'dribbble.com',
  'behance.net', 'medium.com', 'substack.com', 'dev.to',
  'techcrunch.com', 'wired.com', 'fastcompany.com',
  'uxdesign.cc', 'smashingmagazine.com', 'nngroup.com',
];

function isExcludedJobSignalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return EXCLUDED_JOB_SIGNAL_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch { return false; }
}

function JobSignalsSection({ pov }: { pov: any }) {
  const signals = pov?.job_signals;
  const extracted = pov?.job_signals_extracted;
  const hasExtracted = extracted && (extracted.signals?.length > 0 || extracted.roles?.length > 0);
  const design = (signals?.design_tool_signals || []).filter((s: any) => !isExcludedJobSignalUrl(s?.link));
  const other = (signals?.other_signals || []).filter((s: any) => !isExcludedJobSignalUrl(s?.link));
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
  console.log('[BriefView] executives:', executives.length);
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
  console.log('[BriefView] partners:', partners.length);
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
    const url = typeof s === 'string' ? s : (s?.url || '');
    const title = typeof s === 'string' ? '' : (s?.source || s?.title || '');
    if (url.length > 200) return false;
    return !isNoisySource(url, title);
  });

  if (cleanSources.length === 0) return null;

  return (
    <Section title="Sources" accent={COLORS.faint} count={`${cleanSources.length} sources`}>
      {cleanSources.map((s: any, i: number) => {
        const url = typeof s === 'string' ? s : (s?.url || '');
        const sourceTitle = typeof s === 'string' ? '' : (s?.source || s?.title || '');
        const label = sourceTitle && sourceTitle !== 'Research source'
          ? (sourceTitle.length > 60 ? sourceTitle.slice(0, 57) + '…' : sourceTitle)
          : url ? (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })()
          : '';
        const displayLabel = label || `Source ${i + 1}`;
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
                {displayLabel} <span style={{ fontSize: 10 }}>{'\u2197'}</span>
              </a>
            ) : (
              <span style={{ color: COLORS.secondary }}>{displayLabel}</span>
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

  const [expanded, setExpanded] = useState(false);

  if (runs.length < 2) return null;

  const activeRun = runs.find(r => r.id === currentRunId);
  const activeDate = activeRun ? new Date(activeRun.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            fontSize: 11, color: COLORS.faint, fontFamily: FONTS.sans,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <span style={{
            display: 'inline-block', transition: 'transform 150ms',
            transform: expanded ? 'rotate(90deg)' : 'none',
            fontSize: 13,
          }}>{'\u203A'}</span>
          {runs.length} runs
        </button>
        {!expanded && activeDate && (
          <span style={{ fontSize: 11, color: COLORS.faint, fontFamily: FONTS.sans }}>
            {'\u00B7'} viewing {activeDate}
          </span>
        )}
      </div>
      {expanded && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
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
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Brief content (all sections assembled)                             */
/* ------------------------------------------------------------------ */

function BriefContent({ pov, personas, hooksData, valuePyramid, sectionFeedback, onSectionFeedback, userRole }: {
  pov: any; personas: any; hooksData?: any; valuePyramid?: any;
  sectionFeedback: Record<string, { score: number; comment: string }>;
  onSectionFeedback: (key: string, score: number, comment: string) => void;
  userRole?: string;
}) {
  const allSources = pov?.sources_used || [];
  void ProofPointsSection; // Retained but removed from render tree (2026-04-01 reframe)

  const [citationTooltip, setCitationTooltip] = useState<{
    source: any; index: number; x: number; y: number; snippet?: string | null;
  } | null>(null);

  // Close popover on Escape key
  useEffect(() => {
    if (!citationTooltip) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCitationTooltip(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [citationTooltip]);

  const handleCitationClick = (index: number, source: any, event: React.MouseEvent) => {
    if (!source) return;
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const url = typeof source === 'string' ? source : (source?.url || source?.source || '');
    const snippet = extractSnippet(pov?.distilled_intel, url);
    setCitationTooltip({ source, index, x: rect.left, y: rect.bottom, snippet });
  };

  const onCitationClick = (i: number, src: any, e: React.MouseEvent) => handleCitationClick(i, src, e);

  const fb = (key: string) => (
    <SectionFeedback sectionKey={key} feedback={sectionFeedback[key]} onChange={onSectionFeedback} />
  );

  return (
    <>
      {/* 1. ICP Fit (manager/admin only) */}
      {(userRole === 'manager' || userRole === 'admin') && (
        <IcpSection pov={pov} sources={allSources} onCitationClick={onCitationClick} />
      )}

      {/* 2. About */}
      <AboutSection pov={pov} sources={allSources} feedbackNode={fb('about')} onCitationClick={onCitationClick} />

      {/* 2.5. Organisational Structure */}
      <OrgStructureSection pov={pov} />

      {/* 3. Why Anything */}
      <WhyAnythingSection pov={pov} sources={allSources} feedbackNode={fb('why_anything')} onCitationClick={onCitationClick} />

      {/* 4. Why Now */}
      <WhyNowSection pov={pov} sources={allSources} feedbackNode={fb('why_now')} onCitationClick={onCitationClick} />

      {/* 5. Why Figma */}
      <WhyFigmaSection pov={pov} sources={allSources} feedbackNode={fb('why_figma')} onCitationClick={onCitationClick} />

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

      {/* Citation tooltip */}
      {citationTooltip && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setCitationTooltip(null)} />
          <CitationTooltip tooltip={citationTooltip} />
        </>
      )}
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
  const isMobile = useWindowWidth() <= 768;

  const [run, setRun] = useState<Run | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(360);
  const MIN_CHAT_WIDTH = 280;

  const handleChatResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = chatWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (ev: MouseEvent) => {
      const maxWidth = window.innerWidth * 0.4;
      const delta = startX - ev.clientX;
      setChatWidth(Math.min(maxWidth, Math.max(MIN_CHAT_WIDTH, startWidth + delta)));
    };

    const onMouseUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };
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
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [overallComment, setOverallComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [nudgeBannerVisible, setNudgeBannerVisible] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [reviewMode, setReviewMode] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Section feedback state
  const [sectionFeedback, setSectionFeedback] = useState<Record<string, { score: number; comment: string }>>({});
  const sectionFeedbackRef = useRef(sectionFeedback);
  sectionFeedbackRef.current = sectionFeedback;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Modal submit — sends all section ratings + overall comment
  const handleModalSubmit = async () => {
    if (!run_id) return;
    setFeedbackSubmitting(true);
    const sectionRatings: Record<string, 'up' | 'down'> = {};
    const sectionComments: Record<string, string> = {};
    for (const [key, fb] of Object.entries(sectionFeedback)) {
      if (fb.score === 1) sectionRatings[key] = 'up';
      else if (fb.score === -1) sectionRatings[key] = 'down';
      if (fb.comment) sectionComments[key] = fb.comment;
    }
    const ups = Object.values(sectionRatings).filter(r => r === 'up').length;
    const downs = Object.values(sectionRatings).filter(r => r === 'down').length;
    try {
      await workerFetch(`/feedback/${run_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: ups - downs,
          section_feedback: sectionFeedback,
          section_ratings: sectionRatings,
          section_comments: sectionComments,
          overall_comment: overallComment || null,
          overall_score: Object.keys(sectionRatings).length > 0
            ? ups / (ups + downs) : null,
          source: 'modal',
        }),
      });
      setFeedbackSubmitted(true);
      setTimeout(() => setRateModalOpen(false), 1800);
    } catch { /* silent */ }
    setFeedbackSubmitting(false);
  };

  // Section feedback handler — debounced auto-save (inline) or state-only (modal)
  const handleSectionFeedback = (key: string, score: number, comment: string, autoSave = true) => {
    const updated = { ...sectionFeedbackRef.current, [key]: { score, comment } };
    // Remove entries reset to 0 with no comment
    if (score === 0 && !comment) delete updated[key];
    setSectionFeedback(updated);

    if (!autoSave) return; // Modal handles its own save on submit

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
            source: 'inline',
          }),
        });
      } catch { /* silent */ }
    }, 1000);
  };

  const hasAnyFeedback = Object.values(sectionFeedback).some(f => f.score !== 0);

  // Nudge banner timer — fires after 2 minutes if no ratings given
  useEffect(() => {
    if (hasAnyFeedback || feedbackSubmitted) return;
    const timer = setTimeout(() => setNudgeBannerVisible(true), 2 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [hasAnyFeedback, feedbackSubmitted]);


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
        paddingRight: chatOpen ? chatWidth + 20 : 0,
        transition: 'padding-right 200ms ease',
        minHeight: '100vh',
      }}>
      <div style={mainStyle}>
        {/* ============ HEADER ============ */}
        <div style={{
          background: '#fff',
          borderBottom: `1px solid ${COLORS.border}`,
          margin: isMobile ? '-16px -16px 16px' : '-32px -40px 24px',
        }}>
          <div style={{ padding: isMobile ? '16px 16px 14px' : '32px 40px 20px' }}>
            {/* Back link */}
            <button onClick={() => navigate('/my-briefs')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', color: COLORS.secondary,
              cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 20,
              fontFamily: FONTS.sans,
            }}>
              <ArrowLeft size={14} /> My Briefs
            </button>

            {/* Part 1 — Company name + badges */}
            <h1 style={{
              fontFamily: FONTS.sans, fontSize: 20, fontWeight: 500,
              margin: 0, color: COLORS.heading,
            }}>
              {pov?.company_name || run.company}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 16 }}>
              {(userProfile?.role === 'manager' || userProfile?.role === 'admin') && (
                <IcpBadge score={pov?.icp_fit?.score} size="small" />
              )}
              <AgeBadge createdAt={run.created_at} />
            </div>

            {/* Part 2 — Button row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {/* On mobile: PDF + overflow only. On desktop: all buttons. */}
              {!isMobile && (
                <>
                  <button onClick={() => setChatOpen(prev => !prev)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px',
                    borderRadius: 'var(--border-radius-md, 8px)',
                    border: '0.5px solid var(--color-border-secondary, #d6d3d1)',
                    fontSize: 13, cursor: 'pointer', fontFamily: FONTS.sans,
                    background: chatOpen ? '#f3f0ff' : 'var(--color-background-secondary, #f5f5f0)',
                    color: chatOpen ? '#7c3aed' : COLORS.secondary,
                    ...(chatOpen ? { borderColor: '#7c3aed' } : {}),
                  }}>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ display: 'block', flexShrink: 0 }}>
                      <path className="sparkle-main" d="M10 2.5 L11.3 7.2 L16.5 8.5 L11.3 9.8 L10 14.5 L8.7 9.8 L3.5 8.5 L8.7 7.2 Z" fill={chatOpen ? '#7c3aed' : '#7F77DD'}/>
                      <circle className="sparkle-dot1" cx="16" cy="3" r="1.5" fill="#AFA9EC"/>
                      <circle className="sparkle-dot2" cx="4" cy="15.5" r="1" fill="#CECBF6"/>
                      <circle className="sparkle-dot3" cx="17.5" cy="12" r="1" fill="#AFA9EC"/>
                    </svg>
                    Chat
                  </button>
                  <button onClick={() => {
                    setChatOpen(true);
                    reviewFileInputRef.current?.click();
                  }} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px',
                    borderRadius: 'var(--border-radius-md, 8px)',
                    border: '0.5px solid var(--color-border-secondary, #d6d3d1)',
                    fontSize: 13, cursor: 'pointer', fontFamily: FONTS.sans,
                    background: 'transparent', color: COLORS.secondary,
                  }}>
                    <ClipboardList size={14} /> Review PSP
                  </button>
                  <button onClick={() => {
                    setToastMessage('Coming soon — Generate PSP will be available once we\'ve reviewed example plans.');
                    setTimeout(() => setToastMessage(null), 4000);
                  }} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px',
                    borderRadius: 'var(--border-radius-md, 8px)',
                    border: '0.5px solid var(--color-border-secondary, #d6d3d1)',
                    fontSize: 13, cursor: 'pointer', fontFamily: FONTS.sans,
                    background: 'transparent', color: COLORS.secondary,
                  }}>
                    <FileText size={14} /> Generate PSP
                  </button>
                  <div style={{ width: 0.5, height: 18, background: 'var(--color-border-tertiary, #e7e5e4)' }} />
                  {session && (
                    <button onClick={() => setRateModalOpen(true)} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px',
                      borderRadius: 'var(--border-radius-md, 8px)',
                      border: '0.5px solid var(--color-border-secondary, #d6d3d1)',
                      fontSize: 13, cursor: 'pointer', fontFamily: FONTS.sans,
                      background: 'transparent',
                      color: feedbackSubmitted ? '#065f46' : COLORS.secondary,
                    }}>
                      <span style={{ fontSize: 14 }}>{feedbackSubmitted ? '\u2605' : '\u2606'}</span> {feedbackSubmitted ? 'Rated!' : 'Rate'}
                    </button>
                  )}
                </>
              )}
              {/* PDF button — always visible */}
              {isMobile && run.pdf_url && (
                <button onClick={handleDownloadPdf} disabled={pdfLoading} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px',
                  borderRadius: 'var(--border-radius-md, 8px)',
                  border: '0.5px solid var(--color-border-secondary, #d6d3d1)',
                  fontSize: 13, cursor: 'pointer', fontFamily: FONTS.sans,
                  background: 'transparent', color: COLORS.secondary,
                }}>
                  <FileText size={14} /> {pdfLoading ? 'Loading...' : 'PDF'}
                </button>
              )}
              {/* Mobile overflow button → bottom sheet */}
              {isMobile && (
                <button onClick={() => setMobileActionsOpen(true)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                  borderRadius: 'var(--border-radius-md, 8px)',
                  border: '0.5px solid var(--color-border-secondary, #d6d3d1)',
                  fontSize: 13, cursor: 'pointer', fontFamily: FONTS.sans,
                  background: 'transparent', color: COLORS.secondary,
                }}>
                  <MoreHorizontal size={16} />
                </button>
              )}
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

              {/* Overflow menu */}
              <div ref={overflowRef} style={{ position: 'relative' }}>
                <button onClick={() => setOverflowOpen(o => !o)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                  borderRadius: 'var(--border-radius-md, 8px)',
                  border: '0.5px solid var(--color-border-secondary, #d6d3d1)',
                  fontSize: 13, cursor: 'pointer', fontFamily: FONTS.sans,
                  background: 'transparent', color: COLORS.secondary, minWidth: 0,
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

            {/* Part 3 — Stat cards */}
            {pov && <MetricsBar pov={pov} hooksData={hooksData} personas={personas} isMobile={isMobile} />}
          </div>
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
            userRole={userProfile?.role}
          />
        )}
      </div>
      </div>

      {/* ============ Nudge banner (2-min timer) ============ */}
      {nudgeBannerVisible && !feedbackSubmitted && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', border: '1px solid #333', borderRadius: 8,
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 40,
          fontSize: 13, color: '#ccc', fontFamily: FONTS.sans,
        }}>
          <span>How was this brief?</span>
          <button
            onClick={() => { setRateModalOpen(true); setNudgeBannerVisible(false); }}
            style={{
              background: '#5e6ad2', color: '#fff', border: 'none',
              padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
              fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
            }}
          >
            Rate it &rarr;
          </button>
          <button
            onClick={() => setNudgeBannerVisible(false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#888', padding: 4, fontSize: 16, lineHeight: 1,
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ============ Rate modal ============ */}
      {rateModalOpen && (() => {
        const ratedCount = Object.values(sectionFeedback).filter(f => f.score !== 0).length;
        const ups = Object.values(sectionFeedback).filter(f => f.score === 1).length;
        const downs = Object.values(sectionFeedback).filter(f => f.score === -1).length;
        const netScore = ups - downs;
        return (
          <>
            {/* Overlay */}
            <div
              onClick={() => setRateModalOpen(false)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)', zIndex: 200,
              }}
            />
            {/* Modal */}
            <div style={{
              position: 'fixed', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 480, maxHeight: '85vh',
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              borderRadius: 12, zIndex: 201,
              display: 'flex', flexDirection: 'column',
              fontFamily: FONTS.sans, color: '#e5e5e5',
              boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
            }}>
              {/* Header */}
              <div style={{
                padding: '18px 20px 14px', borderBottom: '1px solid #2a2a2a',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                flexShrink: 0,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Rate this brief</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {pov?.company_name || run?.company}
                    {run?.created_at && <> &middot; {new Date(run.created_at).toLocaleDateString()}</>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Live score badge */}
                  {ratedCount > 0 && (
                    <span style={{
                      fontSize: 13, fontWeight: 600, padding: '3px 10px',
                      borderRadius: 12,
                      background: netScore > 0 ? 'rgba(34,197,94,0.12)' : netScore < 0 ? 'rgba(239,68,68,0.12)' : 'rgba(136,136,136,0.12)',
                      color: netScore > 0 ? '#22c55e' : netScore < 0 ? '#ef4444' : '#888',
                    }}>
                      {netScore > 0 ? '+' : ''}{netScore} &middot; {ratedCount} rated
                    </span>
                  )}
                  <button onClick={() => setRateModalOpen(false)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 4,
                  }}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Scrollable section list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
                {feedbackSubmitted ? (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', padding: '48px 0', gap: 12,
                  }}>
                    <Check size={32} style={{ color: '#22c55e' }} />
                    <div style={{ fontSize: 16, fontWeight: 500, color: '#e5e5e5' }}>Thanks for your feedback!</div>
                    <div style={{ fontSize: 13, color: '#888' }}>Your ratings help us improve.</div>
                  </div>
                ) : (
                  <>
                    {FEEDBACK_SECTIONS.filter(s => s.id !== 'icp_fit' || userProfile?.role === 'manager' || userProfile?.role === 'admin').map(section => {
                      const fb = sectionFeedback[section.id];
                      const score = fb?.score ?? 0;
                      const comment = fb?.comment ?? '';
                      return (
                        <div key={section.id} style={{ padding: '10px 0', borderBottom: '1px solid #222' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 16, width: 24, textAlign: 'center', color: '#666' }}>{section.icon}</span>
                            <span style={{ flex: 1, fontSize: 14, color: '#e5e5e5' }}>{section.label}</span>
                            {/* Thumbs up */}
                            <button
                              onClick={() => handleSectionFeedback(section.id, score === 1 ? 0 : 1, score === 1 ? '' : comment, false)}
                              style={{
                                background: score === 1 ? 'rgba(34,197,94,0.12)' : 'transparent',
                                border: score === 1 ? '1px solid rgba(34,197,94,0.3)' : '1px solid #333',
                                borderRadius: 6, cursor: 'pointer', padding: '5px 10px',
                                fontSize: 15, color: score === 1 ? '#22c55e' : '#666',
                                transition: 'all 0.15s',
                              }}
                            >
                              {'\uD83D\uDC4D'}
                            </button>
                            {/* Thumbs down */}
                            <button
                              onClick={() => handleSectionFeedback(section.id, score === -1 ? 0 : -1, '', false)}
                              style={{
                                background: score === -1 ? 'rgba(239,68,68,0.12)' : 'transparent',
                                border: score === -1 ? '1px solid rgba(239,68,68,0.3)' : '1px solid #333',
                                borderRadius: 6, cursor: 'pointer', padding: '5px 10px',
                                fontSize: 15, color: score === -1 ? '#ef4444' : '#666',
                                transition: 'all 0.15s',
                              }}
                            >
                              {'\uD83D\uDC4E'}
                            </button>
                          </div>
                          {/* Comment field when thumbs down */}
                          {score === -1 && (
                            <div style={{ marginTop: 8, marginLeft: 34 }}>
                              <textarea
                                value={comment}
                                onChange={e => handleSectionFeedback(section.id, score, e.target.value, false)}
                                placeholder="What was wrong with this section?"
                                style={{
                                  width: '100%', minHeight: 48, padding: '8px 10px',
                                  fontSize: 12, fontFamily: FONTS.sans,
                                  background: '#111', border: '1px solid #333',
                                  borderRadius: 6, color: '#ccc', resize: 'vertical',
                                  outline: 'none',
                                }}
                                onFocus={e => { e.currentTarget.style.borderColor = '#5e6ad2'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#333'; }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Overall comments */}
                    <div style={{ padding: '14px 0 8px' }}>
                      <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>Overall comments (optional)</div>
                      <textarea
                        value={overallComment}
                        onChange={e => setOverallComment(e.target.value)}
                        placeholder="Any other thoughts on this brief..."
                        style={{
                          width: '100%', minHeight: 60, padding: '8px 10px',
                          fontSize: 13, fontFamily: FONTS.sans,
                          background: '#111', border: '1px solid #333',
                          borderRadius: 6, color: '#ccc', resize: 'vertical',
                          outline: 'none',
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#5e6ad2'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = '#333'; }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              {!feedbackSubmitted && (
                <div style={{
                  padding: '14px 20px', borderTop: '1px solid #2a2a2a',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {ratedCount} of {FEEDBACK_SECTIONS.filter(s => s.id !== 'icp_fit' || userProfile?.role === 'manager' || userProfile?.role === 'admin').length} sections rated
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setRateModalOpen(false)} style={{
                      background: 'transparent', border: '1px solid #333',
                      borderRadius: 6, padding: '7px 16px', fontSize: 13,
                      color: '#888', cursor: 'pointer', fontFamily: FONTS.sans,
                    }}>
                      Cancel
                    </button>
                    <button
                      onClick={handleModalSubmit}
                      disabled={ratedCount === 0 || feedbackSubmitting}
                      style={{
                        background: ratedCount > 0 ? '#5e6ad2' : '#333',
                        border: 'none', borderRadius: 6, padding: '7px 20px',
                        fontSize: 13, fontWeight: 500,
                        color: ratedCount > 0 ? '#fff' : '#666',
                        cursor: ratedCount > 0 ? 'pointer' : 'default',
                        fontFamily: FONTS.sans,
                      }}
                    >
                      {feedbackSubmitting ? 'Sending...' : 'Submit'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ============ Mobile actions bottom sheet ============ */}
      {mobileActionsOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={() => setMobileActionsOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: '16px 16px 0 0', width: '100%',
            maxWidth: 480, padding: '12px 0 calc(12px + max(env(safe-area-inset-bottom), 8px))',
          }}>
            {[
              { label: 'Chat', icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2.5 L11.3 7.2 L16.5 8.5 L11.3 9.8 L10 14.5 L8.7 9.8 L3.5 8.5 L8.7 7.2 Z" fill="#7F77DD"/></svg>, action: () => { setMobileActionsOpen(false); setChatOpen(true); } },
              { label: 'Review PSP', icon: <ClipboardList size={16} />, action: () => { setMobileActionsOpen(false); setChatOpen(true); reviewFileInputRef.current?.click(); } },
              { label: 'Generate PSP', icon: <FileText size={16} />, action: () => { setMobileActionsOpen(false); setToastMessage('Coming soon — Generate PSP will be available once we\'ve reviewed example plans.'); setTimeout(() => setToastMessage(null), 4000); } },
              ...(session ? [{ label: feedbackSubmitted ? 'Rated!' : 'Rate', icon: <span style={{ fontSize: 16 }}>{feedbackSubmitted ? '\u2605' : '\u2606'}</span>, action: () => { setMobileActionsOpen(false); setRateModalOpen(true); } }] : []),
            ].map((item, i) => (
              <button key={i} onClick={item.action} style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '14px 20px', fontSize: 14, color: COLORS.body,
                background: 'none', border: 'none', borderBottom: `1px solid ${COLORS.borderLight}`,
                cursor: 'pointer', fontFamily: FONTS.sans, textAlign: 'left',
              }}>
                {item.icon} {item.label}
              </button>
            ))}
            <button onClick={() => setMobileActionsOpen(false)} style={{
              width: '100%', padding: '14px 20px', fontSize: 14, fontWeight: 500,
              color: COLORS.tertiary, background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: FONTS.sans,
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ============ Chat panel ============ */}
      {chatOpen && (
        <div style={{
          position: 'fixed',
          ...(isMobile ? { inset: 0 } : { right: 0, top: 0, bottom: 0, width: chatWidth }),
          background: '#fff', borderLeft: isMobile ? 'none' : `1px solid ${COLORS.border}`,
          display: 'flex', flexDirection: 'column', zIndex: 100,
          animation: 'slideIn 150ms ease-out',
          fontFamily: FONTS.sans,
        }}>
          {/* Resize drag handle — desktop only */}
          {!isMobile && (
            <div
              onMouseDown={handleChatResizeStart}
              style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
                cursor: 'col-resize', zIndex: 10,
              }}
            />
          )}
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
