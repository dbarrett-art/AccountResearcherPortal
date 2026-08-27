import { Check, Clock, AlertTriangle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AccountSelection } from './AccountSearch';
import { salesforceAccountUrl } from '../lib/salesforce-url';
// Was a local copy that had drifted — it offered neither Danish nor Finnish,
// while '.dk' and '.fi' have been in the detection map the whole time.
import { LANGUAGE_LABEL } from '../lib/language-detect';

/**
 * What Submit shows once a run has actually been dispatched.
 *
 * Replaces the form rather than sitting above it, and that is the whole point.
 * Before this, a successful submit set `selection` back to null and left the form
 * standing — which read as "nothing happened, try again" and was worse than that
 * in practice: the picker's internal `query` still held what had been typed, so
 * the search effect re-ran, hit its own cache, and re-opened the dropdown over
 * the page. The AE was dropped back into a half-finished search for the company
 * they had just submitted, with the success banner rendering underneath the open
 * dropdown where it could not be seen.
 *
 * Replacing the form fixes that class of bug structurally rather than by
 * resetting more state: `AccountSearch` UNMOUNTS, so there is no stale query, no
 * warm result cache and no reopened dropdown to suppress. "Submit another" mounts
 * a fresh one. Nothing here needs to know that the picker keeps caches across a
 * `clear()` — which it does deliberately, so that an AE comparing two accounts
 * gets instant results — because nothing here calls `clear()`.
 *
 * What it shows, and why each line is on it
 * ────────────────────────────────────────
 * The three facts an AE needs to be able to check afterwards, and they are the
 * three the old free-text flow could not have shown because it never knew them:
 * WHICH ACCOUNT (by canonical name and Salesforce ID, linked), WHICH DOMAIN, and
 * where that domain came from. A brief that comes back wrong is diagnosed from
 * exactly those, and "I typed Entur" was never enough to tell whether the run
 * went to Entur or to Accenture.
 *
 * Deliberately NOT the account card's figures. ARR, seats and whitespace are what
 * the brief will contain, not what was submitted; repeating them here would
 * invite reading this as a result rather than as a receipt. They are one click
 * away on the brief.
 *
 * What it deliberately does not do
 * ───────────────────────────────
 * It is not shown for a cache hit. `{cached: true}` means no run was dispatched
 * and no credit was spent — the form stays up with an informational banner and a
 * link to the existing brief, because the AE may well want to submit something
 * else. Confirming a submission that did not happen is the same class of error as
 * everything else this feature exists to stop.
 */

/** The outcome being confirmed. A cache hit is not one of these — see the header. */
export interface SubmittedRun {
  /** What was chosen, exactly as the picker produced it. */
  selection: AccountSelection;
  /** The language select's value at submit time. */
  market: string;
  /** Present on an immediate dispatch; absent on a queued one until it starts. */
  runId?: string;
  /**
   * Set only when the run was QUEUED rather than dispatched. Queued is still
   * submitted — the credit is spent and the row exists — so it gets the same
   * confirmation with a different timing line, not a warning banner.
   */
  queue?: { position: number | null; waitMinutes: number | null };
}

interface Props {
  submitted: SubmittedRun;
  /** Clears the confirmation and brings a fresh form back. */
  onSubmitAnother: () => void;
  /**
   * Injected by the screenshot harness, which renders outside a Router and would
   * otherwise throw on `useNavigate`.
   */
  onNavigate?: (path: string) => void;
}

export default function SubmitConfirmation({ submitted, onSubmitAnother, onNavigate }: Props) {
  // Called unconditionally — hooks cannot be conditional — but only used when the
  // harness has not supplied a navigator. `useNavigate` is safe to call here
  // because the harness wraps this in a MemoryRouter for exactly that reason.
  const navigate = useNavigate();
  const go = onNavigate ?? navigate;

  const { selection, market, runId, queue } = submitted;
  const isNewProspect = selection.kind === 'new_prospect';
  const typedDomain = selection.kind === 'whitespace_account'
    && selection.domain_source === 'user_entered';
  const sfUrl = selection.account_id ? salesforceAccountUrl(selection.account_id) : null;

  const label: React.CSSProperties = {
    fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500,
    width: 124, flexShrink: 0,
  };
  const row: React.CSSProperties = {
    display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 7,
  };
  /**
   * No `flexWrap` on the row, and `flex: 1; minWidth: 0` on the value.
   *
   * With wrap on the row, the one long value — the net-new "no record" sentence —
   * broke onto its own line below its label, which put it out of the column the
   * other three values line up in and made the panel look like it had lost a row.
   * Constraining the value instead makes long text wrap INSIDE its column, which
   * is what every other row was already doing by being short enough not to notice.
   */
  const valueCell: React.CSSProperties = { flex: 1, minWidth: 0 };
  const mono: React.CSSProperties = {
    fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
    wordBreak: 'break-all',
  };
  const pill: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 10,
    whiteSpace: 'nowrap',
  };

  return (
    <div>
      {/* Green on the border and the tick, and nowhere else. The panel is a
          receipt, not a celebration — the only thing that needs to read as
          "succeeded" is the state, and the facts below it are just facts. */}
      <div style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${queue ? 'var(--border-strong)' : 'var(--status-complete-text, #16a34a)'}`,
        borderRadius: 8,
        padding: 18,
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
          {queue
            ? <Clock size={16} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
            : <Check size={16} style={{ flexShrink: 0, color: 'var(--status-complete-text, #16a34a)' }} />}
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {queue ? 'Research queued' : 'Research submitted'}
          </div>
        </div>

        {/* The account, at the size the account card gives it — this is the
            answer to "what did I just file this against". */}
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
          {selection.name}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 4 }}>
          <div style={row}>
            <span style={label}>Research domain</span>
            <span style={{ ...valueCell, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={mono}>{selection.domain}</code>
              {/* Says who settled the domain, because that is what the brief
                  turns on and it is the one thing that is not self-evident from
                  the domain itself. Amber on a hand-typed one: still a decision
                  somebody made, but not one the record can vouch for. */}
              {isNewProspect || typedDomain ? (
                <span style={{
                  ...pill,
                  background: 'var(--badge-yellow-bg)', color: 'var(--badge-yellow-text)',
                  border: '1px solid var(--badge-yellow-text)',
                }}>
                  <AlertTriangle size={9} /> entered by hand
                </span>
              ) : (
                <span style={{
                  ...pill,
                  background: 'var(--badge-green-bg)', color: 'var(--badge-green-text)',
                }}>
                  <Check size={9} /> confirmed
                </span>
              )}
            </span>
          </div>

          <div style={row}>
            <span style={label}>Salesforce</span>
            {sfUrl ? (
              <a
                href={sfUrl}
                target="_blank"
                rel="noreferrer noopener"
                style={{ ...mono, ...valueCell, color: 'var(--accent)', display: 'flex', gap: 4, alignItems: 'center' }}
              >
                {selection.account_id}
                <ExternalLink size={11} />
              </a>
            ) : (
              <span style={{ ...valueCell, fontSize: 12, color: 'var(--text-secondary)' }}>
                none — new prospect
              </span>
            )}
          </div>

          {/* Only on the net-new path, and it is not a repeat of the chip above.
              The chip says where the domain came from; this says what the BRIEF
              will say about the figures, which is the thing an AE would otherwise
              be surprised by when they open it. */}
          {isNewProspect && (
            <div style={row}>
              <span style={label}>Whitespace / TAM</span>
              <span style={{ ...valueCell, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                no record — the brief will state seats, ARR and opportunity as unknown,
                which is not the same as zero
              </span>
            </div>
          )}

          <div style={row}>
            <span style={label}>Language</span>
            <span style={{ ...valueCell, fontSize: 12, color: 'var(--text-primary)' }}>
              {LANGUAGE_LABEL[market] || market}
            </span>
          </div>
        </div>

        <div style={{
          marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)',
          fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          {queue
            ? <>You&rsquo;re #{queue.position ?? '?'} in the queue — estimated wait
                ~{queue.waitMinutes ?? '?'} minutes. It starts automatically when a slot
                frees up, and you&rsquo;ll be notified when the brief is ready.</>
            : <>Typically around 15 minutes, longer if the system is busy. You&rsquo;ll be
                notified when it&rsquo;s ready — there is no need to keep this page open.</>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        {/* My Briefs rather than the brief itself. On an immediate dispatch the
            brief does not exist yet and /briefs/:id would be a spinner or a 404;
            on a queued run there is not even a run row to point at. The list is
            the page that can honestly show "running". */}
        <button
          type="button"
          onClick={() => go('/my-briefs')}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          View in My Briefs
        </button>
        <button
          type="button"
          onClick={onSubmitAnother}
          style={{
            background: 'transparent', border: '1px solid var(--border-strong)',
            borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500,
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          Submit another
        </button>
      </div>

      {/* The run id, for the one conversation where it matters — "my brief looks
          wrong, here is the run". Small, last, and not a link: the brief is not
          there yet. */}
      {runId && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>
          Run <code style={{ fontFamily: 'var(--font-mono)' }}>{runId}</code>
        </div>
      )}
    </div>
  );
}
