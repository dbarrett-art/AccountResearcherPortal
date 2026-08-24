import { useState } from 'react';
import Layout from '../components/Layout';
import Banner from '../components/Banner';
import usePageTitle from '../hooks/usePageTitle';
import AccountSearch, { type AccountSelection } from '../components/AccountSearch';

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
 * GET /account-search.
 *
 * Admin-only via the route guard, and not linked from any navigation.
 *
 * The payload panel is the point of the page: it prints what each of the two
 * outcomes actually sends, next to what that means downstream. A no-match is a
 * fork, not a dead end — a company can legitimately not be in the whitespace
 * book, and the net-new-prospect path lets the research proceed on a hand-typed
 * domain with the absence of whitespace data recorded rather than guessed around.
 */

export default function PreviewAccountSearch() {
  usePageTitle('Preview — Account Search');

  const [selection, setSelection] = useState<AccountSelection | null>(null);

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
  const payload = selection?.kind === 'whitespace_account'
    ? {
        company: selection.name,
        url: selection.domain ? `https://${selection.domain}` : null,
        whitespace_account_id: selection.account_id,
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
    <Layout>
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

        <div style={{ marginBottom: 16 }}>
          <AccountSearch
            value={selection}
            onChange={setSelection}
            allowNewProspect
            label="Company"
            autoFocus
          />
        </div>

        <div style={cardStyle}>
          <div style={cardTitleStyle}>
            What Submit would send
            {selection?.kind === 'new_prospect' && ' — new prospect'}
          </div>

          {!payload ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              Pick an account above — or take the new-prospect path on a no-match — and the
              exact request body appears here.
            </div>
          ) : (
            <pre style={codeBlockStyle}>{JSON.stringify(payload, null, 2)}</pre>
          )}

          {selection?.kind === 'whitespace_account' && (
            <div style={noteStyle}>
              <code>whitespace_account_id</code> is the lock. M1.5 resolves whitespace by
              equality on that Salesforce ID and never re-matches the company name or the
              domain, so no substring can send the brief to a different account.
              <br />
              <code>company</code> and <code>url</code> come from the whitespace record, not
              from what was typed.
              <br />
              <code>whitespace_status: "matched"</code> is what licenses the brief to state
              usage, ARR and seat figures at all — sourced to that record, never supplemented
              from anywhere else.
            </div>
          )}

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
              exactly what this feature exists to stop.
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
    </Layout>
  );
}
