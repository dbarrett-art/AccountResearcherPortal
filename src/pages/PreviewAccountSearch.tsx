import { useState } from 'react';
import Layout from '../components/Layout';
import usePageTitle from '../hooks/usePageTitle';
import AccountSearch, { type AccountSelection } from '../components/AccountSearch';
import { formatLoadDate } from '../lib/account-format';
import type { workerFetch } from '../lib/supabase';
import { getDomainCheck } from '../lib/preview-settings';

/**
 * Preview of the type-ahead account picker, styled as the Submit page it will
 * replace so that what gets signed off is the component and not the scaffolding
 * around it.
 *
 * NOT the Submit page. Submit is untouched and still takes free-text company and
 * website; this route exists so the picker's behaviour can be reviewed against
 * real data before anything is wired into a flow that spends credits and
 * dispatches pipeline runs. Nothing here submits anything — no /submit call, no
 * GHA dispatch, no credit decrement. The only network traffic is
 * GET /account-search and, when the advisory check is switched on,
 * POST /domain-check.
 *
 * Admin-only via the route guard, and not linked from any navigation.
 *
 * "What happens next" is the panel under the picker, and it used to be a block
 * of pretty-printed JSON. That was a reviewer's artefact that had become the
 * primary presentation: an AE reading it has to know that `whitespace_status` is
 * a three-valued field and that `url` follows the radio above, neither of which
 * is their job. It now says the same four things in the language of the
 * consequence — what gets researched, what it gets filed against, where the
 * contacts come from, and where the figures come from.
 *
 * The last of those four is the one that earns its place hardest. "Figures from
 * the Sigma whitespace export, loaded 26 Aug 2026" is the answer to "why does
 * this differ from what I see in Salesforce", which is the complaint that
 * started this whole thread. The date is read off the account's own `loaded_at`
 * rather than written down here, because a hardcoded date is wrong the morning
 * after the next load.
 *
 * The raw payload is still available, collapsed, at the bottom. It is the fast
 * way to see that `url` follows the radio and that nothing would be sent while
 * the domain is unconfirmed — a debugging affordance, which is what it always
 * was, now labelled as one.
 *
 * The panel still has a state for a request that is NOT yet sendable: an account
 * chosen whose domain has not been confirmed. It is dimmed rather than hidden on
 * purpose. Hiding it would mean the reviewer never sees that the summary follows
 * the radio, which is the whole subject of the domain-confirmation change.
 */

export default function PreviewAccountSearch() {
  usePageTitle('Preview — Account Search');
  return (
    <Layout>
      <AccountSearchPreviewBody />
    </Layout>
  );
}

interface BodyProps {
  /**
   * Injectable so the screenshot harness can drive the page off fixtures
   * instead of the live endpoint. Undefined on the route above, which is what
   * makes the reviewed page the real one.
   */
  fetcher?: typeof workerFetch;
  /**
   * Starting state of the advisory check. Undefined means "whatever Admin →
   * Preview says", which on a fresh browser is on.
   */
  initialDomainCheck?: boolean;
  /** Pre-seeded selection, for the harness only. */
  initialSelection?: AccountSelection | null;
}

/**
 * The page body, minus the app chrome.
 *
 * Split out from the route component so the screenshot harness renders exactly
 * this — the same component tree in the same order — rather than an
 * approximation of it that can drift from what was signed off.
 */
export function AccountSearchPreviewBody({
  fetcher,
  initialDomainCheck,
  initialSelection = null,
}: BodyProps) {
  const [selection, setSelection] = useState<AccountSelection | null>(initialSelection);
  /**
   * The advisory page check, on by default, with its off-switch in Admin →
   * Preview rather than on this page.
   *
   * Read once at mount and not subscribed to. It is a kill switch flipped by one
   * admin on another tab; a page already open does not need to react to it
   * mid-review, and a reload is a cheaper contract than a storage listener.
   */
  const [domainCheck] = useState(
    () => initialDomainCheck ?? getDomainCheck(),
  );

  // Submit's own primitives, reused rather than approximated: its card panel
  // (Submit.tsx:379), its card heading, its helper-text scale. 8px on the panel
  // and 6px inside it, which is the app's split — panels at 8, fields and
  // buttons at 6.
  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: 16,
  };
  const cardTitleStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 500, marginBottom: 10,
  };
  // The portal's existing code-block treatment, from PipelineDebug's JSON panes.
  const codeBlockStyle: React.CSSProperties = {
    margin: 0, background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: 6, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12,
    lineHeight: 1.5, color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  };
  const noteStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.6,
  };

  const locked = selection?.kind === 'whitespace_account' ? selection : null;
  /**
   * Whether this payload could actually be sent.
   *
   * A whitespace account with an unconfirmed domain is a real, incomplete
   * request: everything else about it is settled and `url` is not. The
   * new-prospect path has no such state — the domain there is typed by hand and
   * the typing IS the confirmation.
   */
  const sendable = locked ? locked.domain_confirmed && !!locked.domain : !!selection;

  // whitespace_status is sent explicitly rather than left to be derived. Derivation
  // works — the Worker does it when the field is absent — but it can only ever
  // produce the two values the payload already implies. It cannot produce
  // 'unresolved', and 'unresolved' is the value that matters: a lookup that failed
  // or left candidates unresolved is not a net-new prospect, and the Worker refuses
  // it rather than running on a whitespace answer nobody gave. Sending the field
  // means this page is on the contract that has a place to say so.
  //
  // This picker cannot currently reach 'unresolved': a search error clears the
  // results and leaves nothing selectable, so there is no selection to submit. The
  // guard is at the door for the clients that follow, not for this one.
  //
  // usage_known is deliberately NOT sent. It is derived at the Worker, so a client
  // cannot assert usage alongside a no_record declaration.
  //
  // domain_confirmed is NOT sent either, and that is the same principle from the
  // other side. It is a gate on this client, not a claim about the account — a
  // caller able to send `domain_confirmed: true` could send it without ever having
  // asked anybody. What the Worker can rely on is that `url` arrived, not that a
  // client says a person looked at it.
  const payload = locked
    ? {
        company: locked.name,
        // Follows the radio above. Null only while the record holds no domain.
        url: locked.domain ? `https://${locked.domain}` : null,
        whitespace_account_id: locked.account_id,
        whitespace_status: 'matched',
        domain_source: 'whitespace',
        include_contacts: true,
        market: 'auto',
      }
    : selection?.kind === 'new_prospect'
      ? {
          company: selection.name,
          url: `https://${selection.domain}`,
          whitespace_account_id: null,
          no_whitespace_data: true,
          whitespace_status: 'no_record',
          // Nothing suggested it and nothing looked it up — a person typed it. M3
          // must not treat it with the authority of a domain off a resolved record.
          domain_source: 'user_entered',
          include_contacts: true,
          market: 'auto',
        }
      : null;

  /**
   * The same four facts the payload carries, said as consequences.
   *
   * Not a rendering of the payload — a rendering of what it causes. `mono: true`
   * marks a value that is a literal an AE might paste somewhere (a domain, an
   * ID) rather than a sentence.
   */
  const loadDate = locked ? formatLoadDate(locked.candidate.loaded_at) : null;

  const summary: { label: string; value: string; mono?: boolean }[] | null = locked
    ? [
        {
          label: 'Research',
          value: locked.domain ?? 'nothing — this account holds no domain',
          mono: !!locked.domain,
        },
        {
          label: 'Filed against',
          value: locked.candidate.account_owner
            ? `${locked.name} — ${locked.candidate.account_owner}`
            : locked.name,
        },
        {
          // Apollo searches by domain, so this follows the radio too. Worth
          // saying out loud: the domain above is not only what gets scraped, it
          // is the email domain contact discovery filters on, and a wrong domain
          // returns the wrong people rather than no people.
          label: 'Contacts',
          value: locked.domain
            ? `Apollo, searching @${locked.domain} — plus web search for names Apollo misses`
            : 'nothing to search — contact discovery needs a domain',
        },
        {
          // The complaint this thread started from. Whitespace figures are a
          // Sigma export loaded on a date, not a live Salesforce read, and the
          // date is why the two disagree.
          label: 'Figures from',
          value: loadDate
            ? `Sigma whitespace export, loaded ${loadDate}`
            : 'Sigma whitespace export — load date not on this record',
        },
      ]
    : selection?.kind === 'new_prospect'
      ? [
          { label: 'Research', value: selection.domain, mono: true },
          { label: 'Filed against', value: 'no Salesforce account — a new prospect' },
          {
            label: 'Contacts',
            value: `Apollo, searching @${selection.domain} — plus web search for names Apollo misses`,
          },
          {
            label: 'Figures from',
            value: 'nowhere — this account has no whitespace record, so seats, ARR and '
              + 'opportunity read as unknown rather than zero',
          },
        ]
      : null;

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24,
      }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>New Research Request</h1>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)' }}>
          Preview
        </span>
      </div>

      {/* The advisory-check switch used to be here. It is now on by default and
          its off-switch is in Admin → Preview — see lib/preview-settings. A
          control for something that is always on is not part of what is being
          reviewed, and it was the first thing on the page. */}

      <div style={{ marginBottom: 16 }}>
        <AccountSearch
          value={selection}
          onChange={setSelection}
          allowNewProspect
          domainCheck={domainCheck}
          label="Company"
          autoFocus={!initialSelection}
          fetcher={fetcher}
        />
      </div>

      <div style={cardStyle}>
        <div style={{ ...cardTitleStyle, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            What happens next
            {selection?.kind === 'new_prospect' && ' — new prospect'}
          </span>
          {payload && !sendable && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 10,
              background: 'var(--badge-yellow-bg)', color: 'var(--badge-yellow-text)',
              fontWeight: 500,
            }}>
              incomplete — domain not confirmed
            </span>
          )}
          {payload && sendable && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 10,
              background: 'var(--badge-green-bg)', color: 'var(--badge-green-text)',
              fontWeight: 500,
            }}>
              complete
            </span>
          )}
        </div>

        {!summary || !payload ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            Pick an account above — or take the new-prospect path on a no-match — and what
            the run would do appears here.
          </div>
        ) : (
          <>
            {/* Dimmed until the domain is confirmed, as the payload was. The
                point of the state is that the reviewer can watch these lines
                change as the radio moves, and see that nothing would be sent
                until it is confirmed. */}
            <div style={{ opacity: sendable ? 1 : 0.55 }}>
              {summary.map((row, i) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex', gap: 12, alignItems: 'baseline',
                    padding: '7px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  }}
                >
                  <div style={{
                    fontSize: 11, color: 'var(--text-tertiary)',
                    width: 88, flexShrink: 0,
                  }}>
                    {row.label}
                  </div>
                  <div style={{
                    fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5,
                    minWidth: 0, wordBreak: 'break-word',
                    fontFamily: row.mono ? 'var(--font-mono)' : undefined,
                  }}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Collapsed, and for whoever is changing this code rather than for
                an AE. It is the fastest way to confirm that `url` follows the
                radio and that `whitespace_status` says what it should — which is
                a debugging question, not a thing to put in front of a person
                picking a domain. */}
            <details style={{ marginTop: 12 }}>
              <summary style={{
                fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer',
                listStyle: 'revert',
              }}>
                Raw request body
                {!sendable && ' — incomplete, nothing would be sent'}
              </summary>
              <pre style={{
                ...codeBlockStyle,
                marginTop: 8,
                borderStyle: sendable ? 'solid' : 'dashed',
              }}>{JSON.stringify(payload, null, 2)}</pre>
            </details>
          </>
        )}

        {/* The two rationale blocks that used to sit here — one arguing why
            "+N more" was the wrong treatment and what `url` follows, one
            explaining the lock, the canonical name and what
            whitespace_status: "matched" licenses — are gone. Both were making a
            case to a reviewer rather than helping anyone pick a domain, and
            between them they pushed the payload below the fold on every account
            with more than two domains.

            What they said is not lost: it is the header comment of this file and
            of AccountSearch, where the next person to change this behaviour will
            actually be reading. The state they described is still on screen — the
            "incomplete — domain not confirmed" chip above, and the dashed,
            dimmed payload under it. */}
        {selection?.kind === 'new_prospect' && (
          <div style={noteStyle}>
            <code>no_whitespace_data: true</code> is a positive statement, not the absence
            of one. Omitting <code>whitespace_account_id</code> on its own would only mean
            “nothing was decided here”, which still leaves M1.5 free to match the typed
            name as free text — the wrong-company path. This says the book was searched
            and has no row, so M1.5 skips the lookup altogether.
            <br /><br />
            <code>whitespace_status: "no_record"</code> is the same fact on the three-valued
            field. Its third value, <code>"unresolved"</code>, is the one this page cannot
            send: a lookup that errored or left candidates unresolved is refused at
            <code> /submit</code> rather than run as a new prospect. Absence from the book is
            not absence of usage — the brief will say the figures are unknown, and it is not
            permitted to call this account a non-customer.
            <br /><br />
            <code>url</code> is what was typed by hand. Nothing suggested it and nothing
            verified it: there is no record to check it against, and inventing one is
            exactly what this feature exists to stop. There is no separate confirm step on
            this path for the same reason — the typing is the confirmation.
            <br /><br />
            Downstream the brief carries{' '}
            <code>_meta.whitespace_data_state = "no_record"</code>, and the PDF and the
            portal both print “No whitespace record for this account… unknown, not zero”.
            An account that <em>has</em> a record measuring zero opportunity gets{' '}
            <code>"record_no_opportunity"</code> and different words. Before this, both
            rendered as nothing at all.
          </div>
        )}
      </div>
    </div>
  );
}
