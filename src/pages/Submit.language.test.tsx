/**
 * The language is decided BEFORE the run, and the AE can change it.
 *
 * What this replaces: the select defaulted to "Auto-detect" and stayed there,
 * so the detection ran inside the pipeline — after Run had been pressed, with
 * nothing on screen to correct. On this path it never ran at all. 'auto' became
 * `home_language=english` at the Worker, and app.js skips its own detection
 * whenever a language is named. Across ~346 runs `runs.market` has never once
 * held 'no', 'sv' or 'nl'.
 *
 * So the assertions here are about timing and about override, not about the TLD
 * map — that is language-detect.test.ts, and the three-repo parity is
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
  test('nothing is picked — English, and the hint says what to do', () => {
    renderBody(null);
    expect(languageSelect().value).toBe('en');
    expect(screen.getByText(/confirm a domain above and this updates/i)).toBeTruthy();
  });

  test('a SUGGESTED domain does not drive the language', () => {
    // The picker shows a ranked suggestion before the confirm click, and that
    // suggestion is exactly what the confirm step exists to interrogate.
    // Detecting from it would show a language derived from a domain nobody has
    // agreed to, then change it under them when they agree to a different one.
    renderBody(locked('entur.no', false));
    expect(languageSelect().value).toBe('en');
    expect(screen.getByText(/confirm a domain above and this updates/i)).toBeTruthy();
  });
});

describe('on confirming the domain', () => {
  test('entur.no gives Norwegian, and says where it came from', () => {
    renderBody(locked('entur.no', true));
    expect(languageSelect().value).toBe('no');
    expect(screen.getByText(/detected from entur\.no/i)).toBeTruthy();
  });

  test('a .com gives English, and says the domain told us nothing', () => {
    // The distinction that matters: "detected English" and "no signal, defaulted
    // to English" are different facts, and collapsing them is what let the dead
    // path go unnoticed.
    renderBody(locked('keepit.com', true));
    expect(languageSelect().value).toBe('en');
    expect(screen.getByText(/does not indicate a language/i)).toBeTruthy();
    expect(screen.queryByText(/detected from/i)).toBeNull();
  });

  test('a typed net-new domain is settled the moment it exists', () => {
    // Nothing to confirm on that path — it was typed by hand and validated
    // before the selection could be built.
    renderBody({
      kind: 'new_prospect', account_id: null,
      name: 'Some Danish Company', domain: 'somecompany.dk', no_whitespace_data: true,
    });
    expect(languageSelect().value).toBe('da');
    expect(screen.getByText(/detected from somecompany\.dk/i)).toBeTruthy();
  });
});

describe('the AE can override it', () => {
  test('choosing a language sticks, and the note stops claiming detection', () => {
    renderBody(locked('entur.no', true));
    expect(languageSelect().value).toBe('no');

    fireEvent.change(languageSelect(), { target: { value: 'en' } });

    expect(languageSelect().value).toBe('en');
    expect(screen.queryByText(/detected from entur\.no/i)).toBeNull();
    expect(screen.getByText(/set by hand/i)).toBeTruthy();
  });

  test('the override survives a re-render — the effect must not run again', () => {
    // The bug this catches: an earlier version cleared the detection gate on
    // override, so the effect immediately re-ran and put the detected language
    // straight back. The select could not be changed at all.
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
  });
});

describe('the option list', () => {
  test('Auto-detect is gone', () => {
    renderBody(null);
    const values = [...languageSelect().options].map(o => o.value);
    expect(values).not.toContain('auto');
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
