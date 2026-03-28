import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { ArrowLeft, MessageSquare, FileText, Table, X, ChevronDown, ExternalLink, Send } from 'lucide-react';

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{
        fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        marginBottom: 16, paddingBottom: 8,
        borderBottom: '1px solid var(--border)',
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function CitedProse({ text }: { text: string | undefined | null }) {
  if (!text) return null;
  const html = text.replace(/\[(\d+)\]/g, (_, n: string) =>
    `<sup><a href="#cite-${n}" style="color:var(--accent);text-decoration:none">[${n}]</a></sup>`
  );
  return <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function IcpBadge({ score }: { score: string | undefined }) {
  if (!score) return null;
  const colors: Record<string, { bg: string; text: string }> = {
    Strong: { bg: 'rgba(22,163,74,0.12)', text: 'var(--status-complete-text)' },
    Moderate: { bg: 'rgba(217,119,6,0.15)', text: 'var(--status-running-text)' },
    Weak: { bg: 'rgba(220,38,38,0.12)', text: 'var(--status-failed-text)' },
  };
  const c = colors[score] || colors.Moderate;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500,
      background: c.bg, color: c.text,
    }}>
      {score} ICP
    </span>
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

function TriggerCard({ trigger }: { trigger: any }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 16px', marginBottom: 8,
    }}>
      {trigger?.type && (
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
          {trigger.type}
        </div>
      )}
      <div style={{ fontWeight: 500, fontSize: 13 }}>{trigger?.trigger}</div>
      {trigger?.evidence && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>{trigger.evidence}</div>
      )}
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

function JobSignalsSection({ signals }: { signals: any }) {
  if (!signals) return null;
  const design = signals?.design_tool_signals || [];
  const other = signals?.other_signals || [];
  const gaps = signals?.gaps_noted;
  if (design.length === 0 && other.length === 0 && !gaps) return null;
  return (
    <Section title="Job Signals">
      {design.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>DESIGN TOOL SIGNALS</div>
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
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, marginTop: design.length > 0 ? 16 : 0 }}>OTHER SIGNALS</div>
          {other.map((s: any, i: number) => (
            <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{s?.role_title}</div>
              {s?.signal && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{s.signal}</div>}
            </div>
          ))}
        </>
      )}
      {gaps && <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 12 }}>{gaps}</div>}
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

export default function BriefView() {
  const { run_id } = useParams<{ run_id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  usePageTitle('Brief');

  const [run, setRun] = useState<Run | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [streaming, setStreaming] = useState(false);
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
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <IcpBadge score={pov?.icp_fit?.score} />
          <AgeBadge createdAt={run.created_at} />
        </div>

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
          <>
            {/* Section 1: ICP Fit */}
            <Section title="ICP Fit">
              <p style={{ fontSize: 13, lineHeight: 1.7 }}>{pov?.icp_fit?.rationale}</p>
            </Section>

            {/* Section 2: Why Anything */}
            {pov?.why_anything && (
              <Section title="Why Anything">
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
                <CitedProse text={pov.why_anything.narrative} />
              </Section>
            )}

            {/* Section 3: Why Now */}
            {pov?.why_now && (
              <Section title="Why Now">
                {pov.why_now.urgency_rationale && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>
                    {pov.why_now.urgency_rationale}
                  </p>
                )}
                {pov.why_now.triggers?.map((t: any, i: number) => (
                  <TriggerCard key={i} trigger={t} />
                ))}
              </Section>
            )}

            {/* Section 4: Why Figma */}
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
                    <div style={{ fontSize: 13 }}>{pov.why_figma.strongest_angle}</div>
                  </div>
                )}
                <CitedProse text={pov.why_figma.rationale} />
                {pov.why_figma.primary_products?.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    {pov.why_figma.primary_products.map((p: any, i: number) => (
                      <div key={i} style={{
                        background: 'var(--bg-surface)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '12px 16px', marginBottom: 8,
                      }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{p?.product}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{p?.relevance}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {/* Section 5: About */}
            {pov?.about && (
              <Section title="About">
                {pov.about.who_they_are && (
                  <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>{pov.about.who_they_are}</p>
                )}
                <AboutMarkdown text={pov.about.what_they_do} />
                {pov.about.how_they_make_money && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>REVENUE MODEL</div>
                    <p style={{ fontSize: 13, lineHeight: 1.7 }}>{pov.about.how_they_make_money}</p>
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

                {/* Executives */}
                {pov?.executives?.length > 0 && (
                  <DataTable
                    headers={['Name', 'Title', 'Significance']}
                    rows={pov.executives.map((e: any) => [e?.name, e?.title, e?.significance])}
                  />
                )}
              </Section>
            )}

            {/* Section 5b: Org Structure */}
            {pov?.org_structure && pov.org_structure.structure_type !== 'simple' && (
              <Section title="Organisation Structure">
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

            {/* Job Signals */}
            <JobSignalsSection signals={pov?.job_signals} />

            {/* Proof Points */}
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

            {/* Research Gaps */}
            {pov?.research_gaps && (
              <Section title="Research Gaps">
                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{pov.research_gaps}</p>
              </Section>
            )}

            {/* Sources */}
            {pov?.sources_used?.length > 0 && (
              <Section title="Sources">
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  {pov.sources_used.map((s: any, i: number) => (
                    <li key={i} id={`cite-${i + 1}`} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      <span style={{ fontWeight: 500 }}>{typeof s === 'string' ? s : s?.source}</span>
                      {s?.what_it_provided && (
                        <span style={{ color: 'var(--text-tertiary)' }}> — {s.what_it_provided}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </>
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
