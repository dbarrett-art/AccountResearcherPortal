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
 * The collapsed raw payload went the same way on the next pass. It survived one
 * round as the only thing left in the panel, which is what made the answer
 * obvious: a bordered box under the card holding a single closed disclosure is
 * chrome around a debugging affordance, and the affordance is better served by
 * the devtools of whoever is changing this code. Nothing renders below the
 * picker now on the whitespace-account path.
 *
 * THE PAYLOAD CONTRACT, which the deleted code was the only record of
 * ────────────────────────────────────────────────────────────────────
 * Nothing on this page builds a request body any more, so what the picker's
 * output is *for* lives here. Whatever wires this component into Submit has to
 * get these four right, and three of them are refusals:
 *
 *   `url` follows the radio, and is null only while the record holds no domain.
 *   It is not `primary_domain` and not the first entry in the DOMAINS__C cell.
 *
 *   `whitespace_status` is sent explicitly rather than left to be derived.
 *   Derivation works — the Worker does it when the field is absent — but it can
 *   only ever produce the two values the body already implies. It cannot produce
 *   'unresolved', and 'unresolved' is the value that matters: a lookup that
 *   failed or left candidates unresolved is not a net-new prospect, and the
 *   Worker refuses it rather than running on a whitespace answer nobody gave.
 *   This picker cannot currently reach it — a search error clears the results and
 *   leaves nothing selectable — so that guard is at the door for the clients that
 *   follow, not for this one.
 *
 *   `usage_known` is NOT sent. It is derived at the Worker, so that a client
 *   cannot assert usage alongside a no_record declaration.
 *
 *   `domain_confirmed` is NOT sent either, and that is the same principle from
 *   the other side. It is a gate on the client, not a claim about the account: a
 *   caller able to send `domain_confirmed: true` could send it without ever
 *   having asked anybody. What the Worker can rely on is that `url` arrived, not
 *   that a client says a person looked at it.
 *
 * On the net-new path, `no_whitespace_data: true` and
 * `whitespace_status: 'no_record'` are positive statements and
 * `domain_source: 'user_entered'` is the admission that nothing verified the
 * domain. The note still on screen for that path spells out why each one is
 * load-bearing.
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
  // The note is the card's only child now, so no top margin — the panel's own
  // 16px padding is the gap.
  const noteStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
  };

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

      {/* Nothing below the picker on the whitespace-account path — no summary,
          no chip, no payload. Everything the AE needs is on the card, and the
          Confirm button carries the unconfirmed state by existing.

          The net-new path is the one exception, and it is not a summary: it says
          why `no_whitespace_data`, `whitespace_status: "no_record"` and
          `domain_source: "user_entered"` are each positive statements rather
          than omissions, which is not derivable from anything on screen. The
          payload contract those sentences belong to is in the file header now
          that nothing here builds one. */}
      {selection?.kind === 'new_prospect' && (
      <div style={cardStyle}>
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
      </div>
      )}
    </div>
  );
}
