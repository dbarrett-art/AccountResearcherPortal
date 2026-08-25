import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AccountSearchPreviewBody } from '../src/pages/PreviewAccountSearch';
import {
  type AccountSelection,
  type WhitespaceCandidate,
  type DomainVerdict,
} from '../src/components/AccountSearch';
import { rankDomains } from '../src/lib/domain-rank';

/**
 * Screenshot harness for the domain confirmation step.
 *
 * Dev-server only — `vite build` reads the root index.html and never reaches
 * this directory, so none of it ships. It renders the REAL preview page body
 * (`AccountSearchPreviewBody`) with a stub fetcher and a pre-seeded selection,
 * so what gets captured is the component under review rather than a mock of it.
 *
 * Why a harness at all: /preview/account-search is admin-only and, of 194
 * users, exactly one account has the admin role. It also reads the live
 * whitespace book, which means the number of domains an account holds — the
 * variable the screenshots exist to show — depends on what happened to be
 * loaded that morning. Neither is a good basis for a sign-off image.
 *
 * Every verdict below is FIXTURE DATA. Nothing here calls Haiku or fetches a
 * page, and the banner says so on screen so a screenshot cannot be mistaken for
 * a live check.
 *
 *   ?fixture=one|two|five|none|search   which account
 *   ?confirmed=1                        skip to the confirmed state
 *   ?haiku=1                            advisory annotations on
 *   ?theme=light|dark
 */

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.setAttribute('data-theme', theme);

// ─── Fixtures ───────────────────────────────────────────────────────────────
//
// Real accounts, real domain sets, chosen because each one exercises a different
// rule. Entur is the account that gave the whole feature its name (entur.no once
// resolved to Accenture); HSBC is the apex-versus-subdomain case; Nets is the
// name-match case.

interface Fixture {
  label: string;
  candidate: WhitespaceCandidate;
  /** Fixture verdicts, keyed by domain. Absent means "couldn't check". */
  verdicts: Record<string, { verdict: DomainVerdict; reason: string }>;
}

function candidate(over: Partial<WhitespaceCandidate>): WhitespaceCandidate {
  return {
    account_id: '0011t00000XxXxXAAA',
    name: 'Example',
    arr: null,
    sales_segment: null,
    region: null,
    billing_country: null,
    total_whitespace: null,
    domains: [],
    primary_domain: null,
    rank_tier: 1,
    match: 'name_exact',
    matched_on: 'name',
    ...over,
  };
}

const FIXTURES: Record<string, Fixture> = {
  // One domain. The confirm step still happens.
  one: {
    label: 'one domain',
    candidate: candidate({
      account_id: '0011t00000A1Entur',
      name: 'Entur AS',
      arr: 41200,
      sales_segment: 'Commercial',
      region: 'EMEA North',
      billing_country: 'Norway',
      domains: ['entur.no'],
      primary_domain: 'entur.no',
      rank_tier: 0,
      match: 'domain_exact',
      matched_on: 'domain:entur.no',
    }),
    verdicts: {
      'entur.no': {
        verdict: 'looks_right',
        reason: 'title reads “Entur – Norges reiseplanlegger”',
      },
    },
  },

  // Two domains, separated by rule 2 only. The record's own order puts the
  // wrong one first, which is exactly what used to get locked.
  two: {
    label: 'two domains',
    candidate: candidate({
      account_id: '0011t00000B2NetsA',
      name: 'Nets A/S',
      arr: 318000,
      sales_segment: 'Enterprise',
      region: 'EMEA North',
      billing_country: 'Denmark',
      domains: ['nexigroup.com', 'nets.eu'],
      primary_domain: 'nexigroup.com',
      rank_tier: 1,
      match: 'name_exact',
      matched_on: 'name',
    }),
    verdicts: {
      'nets.eu': {
        verdict: 'looks_right',
        reason: 'title reads “Nets – Payments, cards and digital identity”',
      },
      'nexigroup.com': {
        verdict: 'different_company',
        reason: 'title reads “Nexi Group — European PayTech”',
      },
    },
  },

  // Five domains: apex beating its own subdomain, two name matches, and one
  // option that ranking cannot judge at all.
  five: {
    label: 'five domains',
    candidate: candidate({
      account_id: '0011t00000C3HSBCH',
      name: 'HSBC Holdings plc',
      arr: 10300000,
      sales_segment: 'Strategic',
      region: 'EMEA UKI',
      billing_country: 'United Kingdom',
      domains: [
        'noexternalmail.hsbc.com',
        'hsbc.com',
        'hsbcnet.com',
        'us.hsbc.com',
        'globalbanking-markets.io',
      ],
      primary_domain: 'noexternalmail.hsbc.com',
      rank_tier: 1,
      match: 'name_exact',
      matched_on: 'name',
    }),
    verdicts: {
      'hsbc.com': {
        verdict: 'looks_right',
        reason: 'title reads “HSBC | Banking and financial services”',
      },
      // Measured against the real host: it has no DNS record at all, so the
      // honest verdict is COULDNT_CHECK and not a finding about the page.
      'noexternalmail.hsbc.com': {
        verdict: 'couldnt_check',
        reason: 'DNS did not resolve — no such host',
      },
      'hsbcnet.com': {
        verdict: 'looks_right',
        reason: 'title reads “HSBCnet — business banking”',
      },
      'us.hsbc.com': {
        verdict: 'couldnt_check',
        reason: 'HTTP 403',
      },
      'globalbanking-markets.io': {
        verdict: 'not_a_website',
        reason: 'no title, no description — parked page',
      },
    },
  },

  // An account the book holds with no domain at all. There is nothing to
  // confirm and the card has to say so rather than offer an empty radio list.
  none: {
    label: 'no domain on record',
    candidate: candidate({
      account_id: '0011t00000D4NoDom',
      name: 'Rijksoverheid (Belastingdienst)',
      arr: 0,
      sales_segment: 'Public Sector',
      region: 'EMEA West',
      billing_country: 'Netherlands',
      domains: [],
      primary_domain: null,
    }),
    verdicts: {},
  },
};

/** The candidate list, for the one shot that shows the dropdown. */
const SEARCH_CANDIDATES = [
  FIXTURES.five.candidate,
  FIXTURES.two.candidate,
  FIXTURES.one.candidate,
];

// ─── Stub fetcher ───────────────────────────────────────────────────────────

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fixtureName = params.get('fixture') || 'five';
const fixture: Fixture | undefined = FIXTURES[fixtureName];

/**
 * Stands in for `workerFetch`. Resolves immediately, so a screenshot never
 * catches a half-painted list — the "checking…" state is real in the app and is
 * simply not what these images are for.
 */
const stubFetcher = (async (path: string, init?: RequestInit) => {
  if (path.startsWith('/domain-check')) {
    const body = JSON.parse(String(init?.body || '{}')) as { domain?: string };
    const domain = body.domain || '';
    const hit = fixture?.verdicts[domain];
    return jsonResponse({
      domain,
      verdict: hit?.verdict ?? 'couldnt_check',
      reason: hit?.reason ?? 'no fixture verdict for this domain',
      page: null,
      latency_ms: 0,
    });
  }
  if (path.startsWith('/account-search')) {
    return jsonResponse({
      query: 'hsbc',
      interpreted_as: { kind: 'name', apex: null },
      candidates: SEARCH_CANDIDATES,
      count: SEARCH_CANDIDATES.length,
      no_match: false,
      truncated: false,
      latency_ms: 4,
    });
  }
  return jsonResponse({ error: 'not stubbed' });
}) as unknown as typeof import('../src/lib/supabase').workerFetch;

// ─── Seeded selection ───────────────────────────────────────────────────────

const confirmed = params.get('confirmed') === '1';

const selection: AccountSelection | null = fixture && fixtureName !== 'search'
  ? (() => {
      const domain_options = rankDomains(fixture.candidate.domains, fixture.candidate.name);
      return {
        kind: 'whitespace_account' as const,
        account_id: fixture.candidate.account_id,
        name: fixture.candidate.name,
        domain: domain_options[0]?.domain ?? null,
        domain_confirmed: confirmed && domain_options.length > 0,
        domain_options,
        candidate: fixture.candidate,
      };
    })()
  : null;

createRoot(document.getElementById('root')!).render(
  <div style={{ background: 'var(--bg-app)', minHeight: '100vh', padding: 32 }}>
    <div style={{
      maxWidth: 560, marginBottom: 20, padding: '8px 12px', borderRadius: 6,
      border: '1px dashed var(--border-strong)', background: 'var(--bg-surface)',
      fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6,
    }}>
      <strong style={{ color: 'var(--text-secondary)' }}>Screenshot harness</strong> —
      {' '}fixture: <code>{fixtureName}</code>{fixture ? ` (${fixture.label})` : ''}.
      Every domain verdict shown below is fixture data. No page was fetched and no
      model was called.
    </div>
    <AccountSearchPreviewBody
      fetcher={stubFetcher}
      initialDomainCheck={params.get('haiku') === '1'}
      initialSelection={selection}
    />
  </div>,
);
