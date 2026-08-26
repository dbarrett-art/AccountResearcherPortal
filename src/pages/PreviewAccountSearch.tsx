import { useState } from 'react';
import Layout from '../components/Layout';
import usePageTitle from '../hooks/usePageTitle';
import AccountSearch, { type AccountSelection } from '../components/AccountSearch';
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
 * There is no longer a "What happens next" panel under the picker. It had been a
 * block of pretty-printed JSON, then four rows of prose — what gets researched,
 * what it gets filed against, where the contacts come from, where the figures
 * come from — and a live review on 2026-08-26 read the prose version as
 * non-additive: the domain, the account name and the owner are all on the card
 * above it, and the unconfirmed state is communicated by the Confirm button
 * existing. So it is deleted rather than reworded again, and deliberately not
 * replaced with anything.
 *
 * Two of its four rows were NOT strictly duplicates and are worth naming, since
 * they went with it. "Contacts — Apollo, searching @<domain>" said out loud that
 * the confirmed domain is also the email domain contact discovery filters on, so
 * a wrong domain returns the wrong people rather than no people. "Figures from
 * the Sigma whitespace export, loaded 26 Aug 2026" was the answer to "why does
 * this differ from what I see in Salesforce" — read off the account's own
 * `loaded_at`, and not shown anywhere on the card. Neither fact is on screen
 * now. If either turns out to be missed, the card is where it should go, not a
 * second panel restating the card.
 *
 * What remains below the picker is the collapsed raw payload, kept on purpose.
 * It is the fast way to see that `url` follows the radio and that nothing would
 * be sent while the domain is unconfirmed — a debugging affordance for whoever
 * is changing this code, which is what it always was and is now the only thing
 * in the panel.
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

      {/* No panel at all until something is picked. The card above is the
          screen; an empty bordered box under it was the frame the deleted
          summary used to sit in. */}
      {payload && (
      <div style={cardStyle}>
        {/* Collapsed, and for whoever is changing this code rather than for an
            AE. It is the fastest way to confirm that `url` follows the radio and
            that `whitespace_status` says what it should — a debugging question,
            not a thing to put in front of a person picking a domain.

            `!sendable` is the only place the incomplete state is still stated in
            words on this page, and it is stated about the payload rather than
            about the request: nothing would be SENT. The "incomplete — domain
            not confirmed" chip that used to head this panel is gone. The Confirm
            button above communicates that by existing, which is what the review
            concluded, and a second badge saying so was the panel arguing with
            the card. */}
        <details>
          <summary style={{
            fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer',
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

        {/* The two rationale blocks that used to sit here — one arguing why
            "+N more" was the wrong treatment and what `url` follows, one
            explaining the lock, the canonical name and what
            whitespace_status: "matched" licenses — are gone. Both were making a
            case to a reviewer rather than helping anyone pick a domain, and
            between them they pushed the payload below the fold on every account
            with more than two domains.

            What they said is not lost: it is the header comment of this file and
            of AccountSearch, where the next person to change this behaviour will
            actually be reading.

            The chip that used to carry the unconfirmed state went the same way,
            for the same reason, on 2026-08-26. What is left of that state on
            screen is the Confirm button above still being there, and the dashed
            border on the payload below. */}
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
      )}
    </div>
  );
}
