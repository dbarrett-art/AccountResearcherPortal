/**
 * The language is decided BEFORE the run, and only by an explicit act.
 *
 * What this replaces, in two passes. The select used to default to "Auto-detect"
 * and stay there, so detection ran inside the pipeline — after Run had been
 * pressed, with nothing on screen to correct — and on this path it never ran at
 * all: 'auto' became `home_language=english` at the Worker, and app.js skips its
 * own detection whenever a language is named. Across ~346 runs `runs.market` has
 * never once held 'no', 'sv' or 'nl'.
 *
 * The first fix moved detection here and set the select silently. That trades
 * one quiet failure for another: `--home-language` drives the localised research
 * pass AND the output language, so confirming entur.no meant the entire brief
 * came back in Norwegian, announced by a 12px line under a select nobody had
 * reason to look at. So it asks.
 *
 * The assertions here are about the prompt and the copy. The rule is
 * language-detect.test.ts; the three-repo parity is
 * prospect-research/scripts/verify-language-detect-parity.mjs.
 */

import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SubmitBody } from './Submit';
import { AuthContext, type AuthContextType, type UserProfile } from '../context/AuthContext';
import type { AccountSelection, WhitespaceCandidate } from '../components/AccountSearch';

/** Entur AS. Real row — the .no account this whole change was measured against. */
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

const locked = (domain: string, domain_confirmed: boolean): AccountSelection => ({
  kind: 'whitespace_account',
  account_id: ENTUR.account_id,
  name: ENTUR.name,
  domain,
  domain_confirmed,
  domain_options: [],
  domain_source: 'whitespace',
  candidate: ENTUR,
});

const AE: UserProfile = {
  id: '350c544b-7748-497d-a4b5-c9dd97444648',
  email: 'ae@figma.com', name: 'An AE', role: 'ae',
  credits_remaining: 5, manager_id: null,
};
const noop = async () => {};
const authStub: AuthContextType = {
  user: null,
  session: { access_token: 'test' } as AuthContextType['session'],
  userProfile: AE, realUserProfile: AE, isImpersonating: false,
  loading: false, authError: null,
  signOut: noop, refreshProfile: noop, clearAuthError: () => {},
  impersonate: () => {}, stopImpersonating: () => {},
};

/** Nothing here submits or checks a domain; the endpoints are never reached. */
const fetcher = (async () =>
  new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })) as never;

const renderBody = (initialSelection: AccountSelection | null) =>
  render(
    <MemoryRouter>
      <AuthContext.Provider value={authStub}>
        <SubmitBody fetcher={fetcher} initialDomainCheck={false} initialSelection={initialSelection} />
      </AuthContext.Provider>
    </MemoryRouter>,
  );

const languageSelect = () => screen.getByLabelText('Language') as HTMLSelectElement;

describe('before a domain is confirmed', () => {
  test('nothing is picked — English, and the hint says what to expect', () => {
    renderBody(null);
    expect(languageSelect().value).toBe('en');
    expect(screen.getByText(/confirm a domain above and we will suggest/i)).toBeTruthy();
  });

  test('a SUGGESTED domain does not even raise the question', () => {
    // The picker shows a ranked suggestion before the confirm click, and that
    // suggestion is exactly what the confirm step exists to interrogate.
    renderBody(locked('entur.no', false));
    expect(languageSelect().value).toBe('en');
    expect(screen.queryByRole('button', { name: /use norwegian/i })).toBeNull();
  });
});

describe('on confirming a domain that implies a language', () => {
  test('the language does NOT change on its own', () => {
    // The whole point. An accepted suggestion means the research and the brief
    // both come back in Norwegian; that cannot happen because a TLD said so.
    renderBody(locked('entur.no', true));
    expect(languageSelect().value).toBe('en');
  });

  test('it asks, naming the domain and what accepting would mean', () => {
    renderBody(locked('entur.no', true));
    // Scoped to the prompt's own sentence — 'entur.no' also appears in the
    // picker above, so a bare text query matches more than one node.
    const prompt = screen.getByText(/suggests/i);
    expect(prompt.textContent).toContain('entur.no');
    expect(prompt.textContent).toContain('Norwegian');
    // Not just "Norwegian?" — what changes if they say yes.
    expect(screen.getByText(/research and the finished brief would both be in/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /use norwegian/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /keep english/i })).toBeTruthy();
  });

  test('accepting switches the select and says where it came from', () => {
    renderBody(locked('entur.no', true));
    fireEvent.click(screen.getByRole('button', { name: /use norwegian/i }));

    expect(languageSelect().value).toBe('no');
    expect(screen.queryByRole('button', { name: /use norwegian/i })).toBeNull();
    expect(screen.getByText(/from entur\.no/i)).toBeTruthy();
  });

  test('declining keeps English and does not ask again', () => {
    renderBody(locked('entur.no', true));
    fireEvent.click(screen.getByRole('button', { name: /keep english/i }));

    expect(languageSelect().value).toBe('en');
    expect(screen.queryByRole('button', { name: /use norwegian/i })).toBeNull();
    // Still says what was on offer — declining is not the same as never knowing.
    expect(screen.getByText(/staying in english/i)).toBeTruthy();
    expect(screen.getByText(/suggested norwegian/i)).toBeTruthy();
  });

  test('a typed net-new .dk asks about Danish', () => {
    // Nothing to confirm on that path — typed by hand and validated before the
    // selection could be built. '.dk' has been in the map the whole time while
    // the select could not render Danish at all.
    renderBody({
      kind: 'new_prospect', account_id: null,
      name: 'Some Danish Company', domain: 'somecompany.dk', no_whitespace_data: true,
    });
    expect(languageSelect().value).toBe('en');
    expect(screen.getByRole('button', { name: /use danish/i })).toBeTruthy();
  });
});

describe('on confirming a domain that implies nothing', () => {
  test('a .com asks nothing and says so', () => {
    // "detected English" and "no signal, defaulted to English" are different
    // facts. Collapsing them is what hid the dead path.
    renderBody(locked('keepit.com', true));
    expect(languageSelect().value).toBe('en');
    expect(screen.queryByRole('button', { name: /^use /i })).toBeNull();
    expect(screen.getByText(/does not suggest a language/i)).toBeTruthy();
  });
});

describe('the AE can set it directly', () => {
  test('choosing from the select answers the question', () => {
    renderBody(locked('entur.no', true));
    expect(screen.getByRole('button', { name: /use norwegian/i })).toBeTruthy();

    fireEvent.change(languageSelect(), { target: { value: 'de' } });

    expect(languageSelect().value).toBe('de');
    expect(screen.queryByRole('button', { name: /use norwegian/i })).toBeNull();
  });

  test('the choice survives a re-render — the effect must not run again', () => {
    // The bug this catches: an earlier version cleared the detection gate on
    // override, so the effect immediately re-ran and reset the field. The select
    // could not be changed at all, and a dismissed prompt came back.
    const { rerender } = renderBody(locked('entur.no', true));
    fireEvent.change(languageSelect(), { target: { value: 'de' } });
    rerender(
      <MemoryRouter>
        <AuthContext.Provider value={authStub}>
          <SubmitBody fetcher={fetcher} initialDomainCheck={false}
            initialSelection={locked('entur.no', true)} />
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    expect(languageSelect().value).toBe('de');
    expect(screen.queryByRole('button', { name: /use norwegian/i })).toBeNull();
  });
});

describe('the option list', () => {
  test('Auto-detect is gone', () => {
    renderBody(null);
    expect([...languageSelect().options].map(o => o.value)).not.toContain('auto');
  });

  test('Danish and Finnish are offerable', () => {
    // '.dk' and '.fi' have been in the detection map the whole time while
    // neither this select nor the confirmation could display them. 259 Danish
    // and 159 Finnish domains in the live book.
    renderBody(null);
    const values = [...languageSelect().options].map(o => o.value);
    expect(values).toContain('da');
    expect(values).toContain('fi');
  });
});
