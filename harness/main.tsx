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
 *   ?fixture=one|two|five|nofix|nets|none|search   which account
 *   ?confirmed=1                        skip to the confirmed state
 *   ?haiku=1                            advisory annotations on
 *   ?theme=light|dark
 */

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.setAttribute('data-theme', theme);

// ─── Fixtures ───────────────────────────────────────────────────────────────
//
// Real accounts, with the domain list and the Salesforce `Website` read off
// Sigma on 2026-08-25 rather than invented, because the ranking these images
// show is now a function of both. Each one exercises a different rule: Entur is
// rule 0 breaking a tie rules 1-3 cannot; HSBC is rule 0 and rule 1 agreeing
// over five options; Government of the Netherlands is a `Website` that names no
// domain on the record, so rule 0 goes quiet; Nets has no `Website` at all,
// which is every account in the book until the loader next runs.

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
    website: null,
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
  //
  // Salesforce agrees with the only domain on the record, so rule 0 fires and
  // says so -- which is the honest label even when there was nothing to choose
  // between. "The only domain we hold" and "the domain Salesforce considers
  // theirs" are different statements and this account is where they coincide.
  one: {
    label: 'one domain',
    candidate: candidate({
      account_id: '0013u00001GOvzVAAT',
      name: 'Adyen',
      arr: 639240,
      sales_segment: 'MM',
      region: 'UKINN',
      billing_country: 'Netherlands',
      website: 'www.adyen.com',
      domains: ['adyen.com'],
      primary_domain: 'adyen.com',
      rank_tier: 0,
      match: 'domain_exact',
      matched_on: 'domain:adyen.com',
    }),
    verdicts: {
      'adyen.com': {
        verdict: 'looks_right',
        reason: 'title reads “Adyen | The financial technology platform”',
      },
    },
  },

  // Two domains, and the reason the whole ranking was revisited.
  //
  // Both are apex and both match the account name, so rule 1 and rule 2 tie and
  // ordering used to fall through to whatever came first out of DOMAINS__C --
  // entur.org. The advisory check cannot break the tie either: it returns "looks
  // right" for both, with the same sentence, because both genuinely are Entur's
  // sites. That identical pair of reasons is why the reason line is now dropped
  // when it does not distinguish the options.
  //
  // Real record, verified in Sigma 2026-08-25: DOMAINS__C is
  // 'entur.org,entur.no' and Salesforce's Website is 'www.entur.no'.
  two: {
    label: 'two domains — the rule 0 case',
    candidate: candidate({
      account_id: '0013u00001GP1HQAA1',
      name: 'Entur AS',
      arr: 38940,
      sales_segment: 'MM',
      region: 'UKINN',
      billing_country: 'Norway',
      website: 'www.entur.no',
      domains: ['entur.org', 'entur.no'],
      primary_domain: 'entur.org',
      rank_tier: 1,
      match: 'name_exact',
      matched_on: 'name',
    }),
    verdicts: {
      'entur.no': {
        verdict: 'looks_right',
        reason: 'title names Entur',
      },
      'entur.org': {
        verdict: 'looks_right',
        reason: 'title names Entur',
      },
    },
  },

  // Five domains. Real record: DOMAINS__C is
  // 'noexternalmail.hsbc.com,hsbc.com,hsbc.co.in,hsbc.com.cn,hsbc.com.hk' and
  // the locked domain is the mail host. Website is 'www.hsbc.com', so rule 0 and
  // rule 1 happen to agree -- and the four options rule 0 does not name still
  // carry their own reasons, which is what keeps the list readable rather than
  // one annotated row and four bare ones.
  five: {
    label: 'five domains',
    candidate: candidate({
      account_id: '0013u00001GOvOtAAL',
      name: 'HSBC',
      arr: 901260,
      sales_segment: 'Ent',
      region: 'UKINN',
      billing_country: 'United Kingdom',
      website: 'www.hsbc.com',
      domains: [
        'noexternalmail.hsbc.com',
        'hsbc.com',
        'hsbc.co.in',
        'hsbc.com.cn',
        'hsbc.com.hk',
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
      'hsbc.co.in': {
        verdict: 'looks_right',
        reason: 'title reads “HSBC India”',
      },
      'hsbc.com.cn': {
        verdict: 'couldnt_check',
        reason: 'HTTP 403',
      },
      'hsbc.com.hk': {
        verdict: 'looks_right',
        reason: 'title reads “HSBC Hong Kong”',
      },
    },
  },

  // The Website naming a domain the record does not hold: 524 of the 2,215
  // disagreements look like this. Rule 0 goes quiet and rules 1-3 decide alone,
  // which is the point of keeping them. Nothing on screen claims a Salesforce
  // answer, because there is not one among the options.
  nofix: {
    label: 'website not on the record',
    candidate: candidate({
      account_id: '0013u00001ctdluAAA',
      name: 'Government of the Netherlands',
      arr: 770580,
      sales_segment: 'Ent',
      region: 'UKINN',
      billing_country: 'Netherlands',
      website: 'www.government.nl',
      domains: ['belastingdienst.nl', 'ns.nl', 'politie.nl', 'amsterdam.nl', 'uwv.nl'],
      primary_domain: 'belastingdienst.nl',
      rank_tier: 1,
      match: 'name_exact',
      matched_on: 'name',
    }),
    verdicts: {
      'belastingdienst.nl': {
        verdict: 'different_company',
        reason: 'title reads “Belastingdienst” — the tax office',
      },
      'ns.nl': {
        verdict: 'different_company',
        reason: 'title reads “NS — Nederlandse Spoorwegen”',
      },
      'politie.nl': {
        verdict: 'different_company',
        reason: 'title reads “Politie”',
      },
      'amsterdam.nl': {
        verdict: 'different_company',
        reason: 'title reads “Gemeente Amsterdam”',
      },
      'uwv.nl': {
        verdict: 'different_company',
        reason: 'title reads “UWV”',
      },
    },
  },

  // Rule 2 alone, with no website at all -- which is every account in the book
  // until the whitespace loader runs again. The fallback has to look exactly as
  // it did before rule 0 existed.
  nets: {
    label: 'no website — rule 2 alone',
    candidate: candidate({
      account_id: '0011t00000B2NetsA',
      name: 'Nets A/S',
      arr: 318000,
      sales_segment: 'Ent',
      region: 'UKINN',
      billing_country: 'Denmark',
      website: null,
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
  FIXTURES.nofix.candidate,
  FIXTURES.nets.candidate,
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
      const domain_options = rankDomains(
        fixture.candidate.domains,
        fixture.candidate.name,
        fixture.candidate.website,
      );
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
