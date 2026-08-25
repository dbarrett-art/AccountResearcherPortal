import { useState } from 'react';
import Layout from '../components/Layout';
import Banner from '../components/Banner';
import usePageTitle from '../hooks/usePageTitle';
import AccountSearch, { type AccountSelection } from '../components/AccountSearch';
import type { workerFetch } from '../lib/supabase';

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
 * The payload panel is the point of the page: it prints what each of the
 * outcomes actually sends, next to what that means downstream. A no-match is a
 * fork, not a dead end — a company can legitimately not be in the whitespace
 * book, and the net-new-prospect path lets the research proceed on a hand-typed
 * domain with the absence of whitespace data recorded rather than guessed around.
 *
 * The panel also has a state for a request that is NOT yet sendable: an account
 * chosen whose domain has not been confirmed. It is shown rather than hidden on
 * purpose. Hiding it would mean the reviewer never sees that `url` follows the
 * radio above it, which is the whole subject of the domain-confirmation change.
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
  /** Starting state of the advisory-check toggle. */
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
  initialDomainCheck = false,
  initialSelection = null,
}: BodyProps) {
  const [selection, setSelection] = useState<AccountSelection | null>(initialSelection);
  /**
   * The advisory page check, behind a switch rather than a build flag, so it can
   * be turned on and off against the same account during a review. Off by
   * default: it spends a fetch and a Haiku call per domain option, and every
   * path through the confirmation step behaves identically without it.
   */
  const [domainCheck, setDomainCheck] = useState(initialDomainCheck);

  // Submit's own primitives, reused rather than approximated: its card panel,
  // its card heading, its helper-text scale.
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

      <Banner type="info" style={{ marginBottom: 16 }}>
        The Submit page is unchanged and still uses free-text entry. Wiring this component
        in is a separate task, pending sign-off on what you see here. This page cannot
        start a run, spend a credit, or write anything.
      </Banner>

      {/* Review switch for the advisory check. Deliberately not a build flag: the
          question being reviewed is whether the annotation earns its place next
          to the options, and that is answered by turning it off and on over one
          account. */}
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16,
        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={domainCheck}
          onChange={(e) => setDomainCheck(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0, accentColor: 'var(--accent)' }}
        />
        {/* One line on screen. The paragraph that used to be here — how it
            fetches, what it reads, that it is advisory, what a failure looks
            like — is reviewer context, and it now lives in the title attribute
            and in the task report rather than above the field it describes. */}
        <span title={
          'Fetches the root URL, reads the <title> and meta description, and asks Haiku ' +
          'whether it is that company’s site. Advisory: it annotates the options and never ' +
          'picks, reorders or blocks. A fetch or model failure reads “couldn’t check”, ' +
          'never a guess.'
        }>
          Check each domain’s home page{' '}
          <span style={{ color: 'var(--text-tertiary)' }}>— advisory</span>
        </span>
      </label>

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
            What Submit would send
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

        {!payload ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            Pick an account above — or take the new-prospect path on a no-match — and the
            exact request body appears here.
          </div>
        ) : (
          <pre style={{
            ...codeBlockStyle,
            // Shown, not hidden. The point of the state is that the reviewer can
            // watch `url` change as the radio moves, and see that nothing would
            // be sent until it is confirmed.
            opacity: sendable ? 1 : 0.6,
            borderStyle: sendable ? 'solid' : 'dashed',
          }}>{JSON.stringify(payload, null, 2)}</pre>
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
