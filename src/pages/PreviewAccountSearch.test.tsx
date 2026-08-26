/**
 * What renders BELOW the picker, which is now almost nothing.
 *
 * These exist because that region has been emptied in two passes — the "What
 * happens next" summary and its chips, then the raw-payload disclosure — and
 * each pass left the surrounding guards one level shallower than before. The
 * risk is not that too much renders; it is that the one thing that must still
 * render, the net-new-prospect note, got caught in a guard that was rewritten
 * around it.
 *
 * So: nothing at all on the whitespace-account path, note present on the
 * net-new path. Asserted as opposites, because "renders nothing" passes
 * trivially if the component throws.
 */

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountSearchPreviewBody } from './PreviewAccountSearch';
import type { AccountSelection, WhitespaceCandidate } from '../components/AccountSearch';

/** Entur AS, the account the sign-off screenshots are taken against. Real row. */
const ENTUR: WhitespaceCandidate = {
  account_id: '0013u00001GP1HQAA1',
  name: 'Entur AS',
  arr: 58020,
  sales_segment: 'MM',
  region: 'UKINN',
  billing_country: 'Norway',
  total_whitespace: 49482,
  website: 'www.entur.no',
  account_owner: 'George Harding',
  employees: 227,
  full_seats: 69,
  dev_seats: 36,
  loaded_at: '2026-08-26T07:52:08.733542+00:00',
  domains: ['entur.org', 'entur.no'],
  primary_domain: 'entur.org',
  rank_tier: 1,
  match: 'name_exact',
  matched_on: 'name',
};

const lockedSelection = (domain_confirmed: boolean): AccountSelection => ({
  kind: 'whitespace_account',
  account_id: ENTUR.account_id,
  name: ENTUR.name,
  domain: 'entur.no',
  domain_confirmed,
  domain_options: [],
  candidate: ENTUR,
});

const newProspect: AccountSelection = {
  kind: 'new_prospect',
  account_id: null,
  name: 'Some Company Nobody Has',
  domain: 'somecompany.example',
  no_whitespace_data: true,
};

/** The endpoints are never reached — nothing here submits or checks a domain. */
const fetcher = (async () =>
  new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })) as never;

const renderBody = (initialSelection: AccountSelection | null) =>
  render(
    <AccountSearchPreviewBody
      fetcher={fetcher}
      initialDomainCheck={false}
      initialSelection={initialSelection}
    />,
  );

describe('below the picker', () => {
  // The three strings that were deleted. If any comes back, it came back by
  // accident.
  test.each([
    ['the summary heading', /what happens next/i],
    ['the unconfirmed chip', /incomplete — domain not confirmed/i],
    ['the payload disclosure', /raw request body/i],
  ])('%s is gone on a locked account', (_label, pattern) => {
    renderBody(lockedSelection(false));
    expect(screen.queryByText(pattern)).toBeNull();
  });

  test('an unconfirmed locked account renders nothing below the picker', () => {
    renderBody(lockedSelection(false));
    // The card itself is still there — otherwise this assertion is vacuous.
    expect(screen.getByText('Entur AS')).toBeTruthy();
    expect(screen.queryByText(/nothing would be sent/i)).toBeNull();
  });

  test('a confirmed locked account renders nothing below the picker either', () => {
    renderBody(lockedSelection(true));
    expect(screen.getByText('Entur AS')).toBeTruthy();
    expect(screen.queryByText(/raw request body/i)).toBeNull();
  });

  // The exception, and the reason these tests exist: this note survived both
  // deletions and its guard was rewritten under it twice.
  test('the net-new-prospect note still renders', () => {
    renderBody(newProspect);
    expect(screen.getByText(/no_whitespace_data: true/)).toBeTruthy();
    expect(screen.getByText(/is a positive statement, not the absence/)).toBeTruthy();
    // …and it explains all three fields, not just the first.
    expect(screen.getByText(/whitespace_status: "no_record"/)).toBeTruthy();
  });

  test('nothing renders below the picker before anything is picked', () => {
    renderBody(null);
    expect(screen.queryByText(/raw request body/i)).toBeNull();
    expect(screen.queryByText(/no_whitespace_data/)).toBeNull();
  });
});
