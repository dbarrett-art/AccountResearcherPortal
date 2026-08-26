/**
 * The Submit gate and the payload it builds.
 *
 * These are the assertions that stop the cutover regressing quietly. Three of
 * them are about fields that must NOT appear, which is not a thing a screenshot
 * or a manual run can show you: `usage_known` and `domain_confirmed` are absent
 * on purpose, and a future hand adding either "for completeness" would break the
 * Worker's guarantee without breaking anything visible.
 *
 * The single-domain case has its own test for the same reason. It is the one an
 * optimisation would target — "there is only one option, just take it" — and
 * taking it is precisely the bug: 1,010 accounts are locked to a domain
 * Salesforce does not consider theirs because nobody was ever asked.
 */

import { describe, test, expect } from 'vitest';
import { submissionReadiness, buildSubmitBody } from './submission';
import type {
  AccountSelection,
  LockedAccountSelection,
  WhitespaceCandidate,
} from '../components/AccountSearch';
import { rankDomains } from './domain-rank';

/** Entur AS — the account the wrong-company failure was found on. Real row. */
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

/** Adyen — one domain on the record. The confirm step still has to happen. */
const ADYEN: WhitespaceCandidate = {
  ...ENTUR,
  account_id: '0013u00001GOvzVAAT',
  name: 'Adyen',
  website: 'www.adyen.com',
  domains: ['adyen.com'],
  primary_domain: 'adyen.com',
};

/** Apple — in the book, no `account_domains` row at all. One of 567. */
const APPLE: WhitespaceCandidate = {
  ...ENTUR,
  account_id: '001PX00000mnvaMYAQ',
  name: 'Apple',
  website: 'www.apple.com',
  domains: [],
  primary_domain: null,
};

const locked = (
  c: WhitespaceCandidate,
  over: Partial<LockedAccountSelection> = {},
): LockedAccountSelection => ({
  kind: 'whitespace_account',
  account_id: c.account_id,
  name: c.name,
  domain: rankDomains(c.domains, c.name, c.website)[0]?.domain ?? null,
  domain_confirmed: false,
  domain_options: rankDomains(c.domains, c.name, c.website),
  domain_source: 'whitespace',
  candidate: c,
  ...over,
});

const NEW_PROSPECT: AccountSelection = {
  kind: 'new_prospect',
  account_id: null,
  name: 'Some Company Nobody Has',
  domain: 'somecompany.example',
  no_whitespace_data: true,
};

const OPTS = { market: 'auto', includeContacts: true };

describe('the gate', () => {
  test('nothing selected is not submittable', () => {
    expect(submissionReadiness(null)).toMatchObject({ ready: false });
  });

  test('an account with an unconfirmed domain is not submittable', () => {
    const gate = submissionReadiness(locked(ENTUR));
    expect(gate.ready).toBe(false);
    expect(gate.ready === false && gate.reason).toMatch(/confirm the research domain/i);
  });

  // The one an optimisation would break.
  test('a single-domain account is STILL not submittable unconfirmed', () => {
    expect(locked(ADYEN).domain_options).toHaveLength(1);
    expect(submissionReadiness(locked(ADYEN)).ready).toBe(false);
  });

  test('an account with no domain says so, rather than asking for a confirmation', () => {
    const gate = submissionReadiness(locked(APPLE));
    expect(gate.ready).toBe(false);
    expect(gate.ready === false && gate.reason).toMatch(/holds no domain/i);
  });

  test('confirmed is submittable', () => {
    expect(submissionReadiness(locked(ENTUR, { domain_confirmed: true }))).toEqual({ ready: true });
  });

  test('a net-new prospect with a typed domain is submittable', () => {
    expect(submissionReadiness(NEW_PROSPECT)).toEqual({ ready: true });
  });

  test('a confirmed selection with no domain is refused', () => {
    const gate = submissionReadiness(locked(APPLE, { domain_confirmed: true, domain: null }));
    expect(gate.ready).toBe(false);
  });
});

describe('the body, locked path', () => {
  const body = buildSubmitBody(
    locked(ENTUR, { domain: 'entur.no', domain_confirmed: true }),
    OPTS,
  );

  test('carries the Salesforce ID as the lock', () => {
    expect(body.whitespace_account_id).toBe('0013u00001GP1HQAA1');
  });

  test('the url is the confirmed domain, not primary_domain', () => {
    // primary_domain on this row is entur.org — the failure mode being removed.
    expect(ENTUR.primary_domain).toBe('entur.org');
    expect(body.url).toBe('https://entur.no');
  });

  test('the company is the canonical name, not the typed query', () => {
    expect(body.company).toBe('Entur AS');
  });

  test('the status is stated, not left to be derived', () => {
    expect(body.whitespace_status).toBe('matched');
    expect(body.domain_source).toBe('whitespace');
  });

  test('no_whitespace_data is absent, not false', () => {
    expect('no_whitespace_data' in body).toBe(false);
  });

  // The three refusals.
  test('usage_known is never sent', () => {
    expect('usage_known' in body).toBe(false);
  });

  test('domain_confirmed is never sent', () => {
    expect('domain_confirmed' in body).toBe(false);
  });

  test('nothing else rides along', () => {
    expect(Object.keys(body).sort()).toEqual([
      'company', 'domain_source', 'include_contacts', 'market', 'url',
      'whitespace_account_id', 'whitespace_status',
    ]);
  });
});

describe('the body, an account with no domain on record', () => {
  const body = buildSubmitBody(
    locked(APPLE, { domain: 'apple.com', domain_confirmed: true, domain_source: 'user_entered' }),
    OPTS,
  );

  // The point of the whole path: the account is real, so the lock is real.
  test('keeps the lock', () => {
    expect(body.whitespace_account_id).toBe('001PX00000mnvaMYAQ');
    expect(body.whitespace_status).toBe('matched');
  });

  test('never claims the account has no whitespace record', () => {
    expect('no_whitespace_data' in body).toBe(false);
  });

  test('admits the domain was typed', () => {
    expect(body.domain_source).toBe('user_entered');
    expect(body.url).toBe('https://apple.com');
  });
});

describe('the body, net-new path', () => {
  const body = buildSubmitBody(NEW_PROSPECT, OPTS);

  test('declares the absence positively', () => {
    expect(body.no_whitespace_data).toBe(true);
    expect(body.whitespace_status).toBe('no_record');
  });

  test('sends no lock', () => {
    expect('whitespace_account_id' in body).toBe(false);
  });

  test('the domain is admitted as user-entered', () => {
    expect(body.domain_source).toBe('user_entered');
    expect(body.url).toBe('https://somecompany.example');
  });

  test('the name is what was typed — there is no canonical form', () => {
    expect(body.company).toBe('Some Company Nobody Has');
  });
});

describe('buildSubmitBody refuses an unready selection', () => {
  test('throws rather than returning a partial body', () => {
    expect(() => buildSubmitBody(locked(ENTUR), OPTS)).toThrow(/not submittable/i);
    expect(() => buildSubmitBody(null, OPTS)).toThrow(/not submittable/i);
  });
});
