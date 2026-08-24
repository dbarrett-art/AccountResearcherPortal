import { useState, useCallback } from 'react';
import Layout from '../components/Layout';
import Banner from '../components/Banner';
import usePageTitle from '../hooks/usePageTitle';
import { workerFetch } from '../lib/supabase';
import AccountSearch, { type AccountSelection } from '../components/AccountSearch';

/**
 * Preview harness for the type-ahead account picker.
 *
 * NOT the Submit page. Submit is untouched and still takes free-text company and
 * website; this route exists so the picker's behaviour can be reviewed against
 * real data before anything is wired into a flow that spends credits and
 * dispatches pipeline runs. Nothing here submits anything — no /submit call, no
 * GHA dispatch, no credit decrement. The only network traffic is
 * GET /account-search.
 *
 * Admin-only via the route guard, and not linked from any navigation.
 *
 * The scripted cases below are the real ones: the three wrong-company briefs
 * this feature exists to make impossible, the ambiguity cases that actually
 * occur in the live book, the diacritic and public-suffix canaries, and both
 * shapes of no-match.
 *
 * A no-match is a fork, not a dead end: a company can legitimately not be in the
 * whitespace book, and the net-new-prospect path lets the research proceed on a
 * hand-typed domain with the absence of whitespace data recorded rather than
 * guessed around. The payload panel below prints what each of the two outcomes
 * actually sends, side by side with what it means downstream.
 */

interface Scenario {
  label: string;
  query: string;
  why: string;
}

const SCENARIOS: Scenario[] = [
  {
    label: 'Entur — the Accenture mismatch',
    query: 'entur',
    why: 'The old path matched "entur" inside accENTURe and briefed Accenture ($10.3M ARR) as if it were Entur AS ($58K). Entur AS should lead here despite being 178x smaller: match strength ranks above ARR, and ARR only orders within a tier.',
  },
  {
    label: 'Entur — by domain',
    query: 'entur.no',
    why: 'Apex equality against account_domains. Exactly one candidate, and no way for a substring to intrude.',
  },
  {
    label: 'Nets — the Enexis Netbeheer mismatch',
    query: 'nets.eu',
    why: 'nets.eu is one of three domains on the Nets account. The old path could reach Enexis Netbeheer from here; the domain apex cannot.',
  },
  {
    label: 'Nexi — the Cenexi mismatch',
    query: 'nexi.com',
    why: 'nexi.com is not in the whitespace book at all. The old path stripped the TLD and ilike-matched "nexi", landing on Cenexi. This should say so plainly instead.',
  },
  {
    label: 'Nexi — by name',
    query: 'nexi',
    why: 'The name reaches the right account a different way: Nexi Group trades as the Salesforce account "Nets", which owns nexigroup.com. Cenexi and Enexis Netbeheer are visible but ranked below, where a person can see they are not it.',
  },
  {
    label: 'Ambiguity — one domain, two companies',
    query: 'rolls-royce.com',
    why: 'Rolls-Royce ($116K) and Rolls-Royce Power Systems AG ($53K) both list a rolls-royce.com domain. Both shown, highest ARR first, and the picker refuses to choose for you.',
  },
  {
    label: 'Ambiguity — genuinely different companies',
    query: 'lotuscars.com',
    why: 'Volvo Cars ($710K) and GEELY ($416K) both list lotuscars.com. Nothing in the string tells them apart — only a person can.',
  },
  {
    label: 'Ambiguity — ICICI',
    query: 'icicibank.com',
    why: 'ICICI Lombard ($34K) and ICICI Bank ($21K). One of the 20 shared apexes in the live book.',
  },
  {
    label: 'Diacritics — Össur',
    query: 'ossur',
    why: 'The stored search column holds the folded form, so typing plain ASCII finds the accented name. Typing "Össur" works too.',
  },
  {
    label: 'Public suffix — .com.tr',
    query: 'softtech.isbank.com.tr',
    why: 'The ported extractDomain resolves this to isbank.com.tr. The old logic returned com.tr, an apex that pooled 40 unrelated Turkish companies.',
  },
  {
    label: 'No match — a company with no account',
    query: 'Zzyzx Nonexistent Holdings',
    why: 'The no-guessing case. No near-miss is offered and no default account is silently used.',
  },
  {
    label: 'No match — a domain with no account',
    query: 'figma-not-a-customer.example',
    why: 'Same rule via the domain path, with the apex it tried spelled out.',
  },
  {
    label: 'New prospect — the path out of a no-match',
    query: 'Northwind Robotics',
    why: 'A company genuinely not in the book is not a search failure and must not be a dead end. Take the "new prospect" button, type a domain by hand, and the payload panel shows no_whitespace_account_id, no_whitespace_data: true, and the domain you entered. Nothing suggests the domain for you — the system does not know this account, so it does not get to guess its website.',
  },
  {
    label: 'New prospect — searched by domain',
    query: 'northwind-robotics.example',
    why: 'Same path, reached from a domain search. The domain field starts pre-filled because you already typed it — repeating your own input is not a guess. Try a malformed one ("not a domain", "foo@bar") and the confirm button stays disabled.',
  },
];

export default function PreviewAccountSearch() {
  usePageTitle('Preview — Account Search');

  const [selection, setSelection] = useState<AccountSelection | null>(null);
  const [seedKey, setSeedKey] = useState(0);
  const [seed, setSeed] = useState('');
  const [note, setNote] = useState<Scenario | null>(null);

  // Latency is measured here as well as in the component, because the number
  // that matters for "does this feel responsive" is the browser-observed round
  // trip, not the Worker's own timer.
  const [samples, setSamples] = useState<number[]>([]);

  const timedFetch: typeof workerFetch = useCallback(async (path, init) => {
    const t0 = performance.now();
    const res = await workerFetch(path, init);
    const ms = Math.round(performance.now() - t0);
    setSamples(prev => [...prev.slice(-49), ms]);
    return res;
  }, []);

  const runScenario = (s: Scenario) => {
    setSelection(null);
    setNote(s);
    setSeed(s.query);
    setSeedKey(k => k + 1); // remount so the field starts from the seeded query
  };

  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : null;
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null;

  const card: React.CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 16,
  };

  return (
    <Layout>
      <div style={{ maxWidth: 780 }}>
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 20 }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Preview — type-ahead account selection
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0', lineHeight: 1.6 }}>
            Review harness for the picker that will replace free-text company entry on
            Submit. Live data, live endpoint, nothing submitted — this page cannot start a
            run, spend a credit, or write anything.
          </p>
        </div>

        <Banner type="info" style={{ marginBottom: 20 }}>
          The Submit page is unchanged and still uses free-text entry. Wiring this component
          in is a separate task, pending sign-off on what you see here.
        </Banner>

        <div style={{ ...card, marginBottom: 20 }}>
          <AccountSearch
            key={seedKey}
            value={selection}
            onChange={setSelection}
            allowNewProspect
            label="Company"
            autoFocus
            showLatency
            fetcher={timedFetch}
          />
          {seed && !selection && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>
              Scenario query to type or paste: <code>{seed}</code>
              {'  '}
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(seed)}
                style={{
                  background: 'none', border: 'none', color: 'var(--accent)',
                  cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0,
                }}
              >
                copy
              </button>
            </div>
          )}
        </div>

        {note && (
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{note.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{note.why}</div>
          </div>
        )}

        {/* What actually gets locked — the point of the whole change made visible. */}
        {selection?.kind === 'whitespace_account' && (
          <div style={{
            ...card,
            marginBottom: 20,
            borderColor: 'var(--status-complete-text, #16a34a)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
              What Submit would send
            </div>
            <pre style={{
              margin: 0, fontSize: 12, lineHeight: 1.7, overflowX: 'auto',
              color: 'var(--text-primary)',
            }}>
{JSON.stringify({
  company: selection.name,
  url: selection.domain ? `https://${selection.domain}` : null,
  whitespace_account_id: selection.account_id,
  include_contacts: true,
  market: 'auto',
}, null, 2)}
            </pre>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.7 }}>
              <code>whitespace_account_id</code> is the lock. M1.5 resolves whitespace by
              equality on that Salesforce ID and never re-matches the company name or the
              domain, so no substring can send the brief to a different account.
              <br />
              <code>company</code> and <code>url</code> come from the whitespace record, not
              from what was typed.
            </div>
          </div>
        )}

        {selection?.kind === 'new_prospect' && (
          <div style={{ ...card, marginBottom: 20, borderColor: '#d97706' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
              What Submit would send — new prospect
            </div>
            <pre style={{
              margin: 0, fontSize: 12, lineHeight: 1.7, overflowX: 'auto',
              color: 'var(--text-primary)',
            }}>
{JSON.stringify({
  company: selection.name,
  url: `https://${selection.domain}`,
  whitespace_account_id: null,
  no_whitespace_data: true,
  include_contacts: true,
  market: 'auto',
}, null, 2)}
            </pre>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.7 }}>
              <code>no_whitespace_data: true</code> is a positive statement, not the absence
              of one. Omitting <code>whitespace_account_id</code> on its own would only mean
              “nothing was decided here”, which still leaves M1.5 free to match the typed
              name as free text — the wrong-company path. This says the book was searched
              and has no row, so M1.5 skips the lookup altogether.
              <br /><br />
              <code>url</code> is what was typed by hand. Nothing suggested it and nothing
              verified it: there is no record to check it against, and inventing one is
              exactly what this feature exists to stop.
              <br /><br />
              Downstream the brief carries{' '}
              <code>_meta.whitespace_data_state = "no_record"</code>, and the PDF and the
              portal both print “No whitespace record for this account… unknown, not zero”.
              An account that <em>has</em> a record measuring zero opportunity gets{' '}
              <code>"record_no_opportunity"</code> and different words. Before this, both
              rendered as nothing at all.
            </div>
          </div>
        )}

        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Measured latency</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Browser-observed round trip to <code>GET /account-search</code>, this session.
          </div>
          {samples.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              No samples yet — type in the field above.
            </div>
          ) : (
            <div style={{ fontSize: 13, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <span><strong>{samples.length}</strong> requests</span>
              <span>p50 <strong>{p50}ms</strong></span>
              <span>p95 <strong>{p95}ms</strong></span>
              <span>last <strong>{samples[samples.length - 1]}ms</strong></span>
              <span>min <strong>{sorted[0]}ms</strong></span>
              <span>max <strong>{sorted[sorted.length - 1]}ms</strong></span>
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Scenarios to try</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Each one loads the query and the reason it is worth looking at. Type it into the
            field above — the field is deliberately not auto-filled, so what you see is what
            an AE would see while typing.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SCENARIOS.map(s => (
              <button
                key={s.query + s.label}
                type="button"
                onClick={() => runScenario(s)}
                style={{
                  textAlign: 'left',
                  background: note?.label === s.label ? 'var(--bg-hover, rgba(127,127,127,0.10))' : 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 500 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  <code>{s.query}</code>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
