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

  const payload = selection?.kind === 'whitespace_account'
    ? {
        company: selection.name,
        url: selection.domain ? `https://${selection.domain}` : null,
        whitespace_account_id: selection.account_id,
        include_contacts: true,
        market: 'auto',
      }
    : selection?.kind === 'new_prospect'
      ? {
          company: selection.name,
          url: `https://${selection.domain}`,
          whitespace_account_id: null,
          no_whitespace_data: true,
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
