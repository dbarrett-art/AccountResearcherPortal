import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../src/index.css';
import { AccountSearchPreviewBody } from '../src/pages/PreviewAccountSearch';
import { SubmitBody } from '../src/pages/Submit';
import { type SubmittedRun } from '../src/components/SubmitConfirmation';
import { AuthContext, type AuthContextType, type UserProfile } from '../src/context/AuthContext';
import {
  type AccountSelection,
  type WhitespaceCandidate,
  type DomainVerdict,
  type DomainRelation,
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
 *   ?page=preview|submit                which page body to render (default: preview)
 *   ?fixture=one|two|nets|five|nofix|nowebsite|nulls|none|search   which account
 *   ?confirmed=1                        skip to the confirmed state
 *   ?typed=1                            on `none`, a domain typed for the locked account
 *   ?sent=1|queued                      the post-submit confirmation (page=submit only)
 *   ?haiku=1|0                          advisory annotations on/off (default: on)
 *   ?theme=light|dark
 *   ?checkDelay=<ms>                     hold each /domain-check answer, to time the render
 *
 * `page=submit` renders the REAL Submit body (`SubmitBody`), which is what the
 * cutover screenshots have to show — the picker inside the page that spends a
 * credit, not the picker on a page that cannot. The stub fetcher answers
 * /account-search and /domain-check and nothing else, so a submit attempt from a
 * harness page fails at the network rather than dispatching: there is no session
 * behind it and no /submit stub to catch it.
 */

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.setAttribute('data-theme', theme);

// ─── Fixtures ───────────────────────────────────────────────────────────────
//
// Real accounts, every field read off `whitespace_accounts` at load 11 on
// 2026-08-26 rather than invented -- the ranking these images show is a function
// of the domain list and the Salesforce `Website`, and the card is now a function
// of eight more columns besides.
//
// The line each row carries is a DESCRIPTION OF THE SITE as of 2026-08-26, not a
// justification of the verdict, and every one below was measured by running
// cloudflare-worker/scripts/describe-domain-options.mjs against the real domains.
// None was written by hand: an invented description is a screenshot of a feature
// that does not exist, and the one thing these images are for is showing that the
// descriptions tell an account's domains apart.
//
// Each fixture exercises a different rule or a different edge:
//   two      Entur AS -- rule 0 breaking a tie rules 1-3 cannot
//   nets     Nets -- one passing, one wrong company, one unreachable
//   five     HSBC -- rule 0 and rule 1 agreeing over five options
//   one      Adyen -- one domain, and the confirm step still happens
//   nofix    Government of the Netherlands -- a `Website` naming no domain on
//            the record, so rule 0 goes quiet
//   nowebsite Maersk Supply Service -- no `Website` at all, five domains, none
//            of them matching the name. Rule 3 alone: raw record order.
//   nulls    Ministério DAS Finanças Angola -- `employees` and
//            `total_whitespace` both null, so two of the card's figures read
//            `—` while `dev_seats: 0` reads 0
//   none     Roblox -- in the book with no domain at all
//
// `nets` is back, standing for something else. It used to mean "no `Website` at
// all", which load 11 settled by giving Nets `www.nets.eu`; Maersk Supply Service
// covers that state now and is one of the 20 active accounts where the column is
// genuinely null. Nets returns as the three-verdict account: its own site, its
// parent trading under another name, and a subdomain of the parent that serves
// nothing. It is the account where the description does more than the chip.
const LOADED_AT = '2026-08-26T07:52:08.733542+00:00';

interface Fixture {
  label: string;
  candidate: WhitespaceCandidate;
  /** Fixture verdicts, keyed by domain. Absent means "couldn't check". */
  verdicts: Record<string, {
    verdict: DomainVerdict;
    /** On `related_company` only. Drives the chip's wording. */
    relation?: DomainRelation;
    description: string;
  }>;
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
    account_owner: null,
    employees: null,
    full_seats: null,
    dev_seats: null,
    loaded_at: LOADED_AT,
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
      arr: 837360,
      sales_segment: 'MM',
      region: 'UKINN',
      billing_country: 'Netherlands',
      account_owner: 'Sofia Ioana Ianas',
      employees: 4345,
      total_whitespace: 644820,
      full_seats: 536,
      dev_seats: 242,
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
        description: 'Fintech platform for payments, data management, and financial products',
      },
    },
  },

  // Two domains, and the reason the whole ranking was revisited.
  //
  // Both are apex and both match the account name, so rule 1 and rule 2 tie and
  // ordering used to fall through to whatever came first out of DOMAINS__C --
  // entur.org.
  //
  // The advisory check cannot break the tie either, and this is the account that
  // proves it: entur.org 302s to https://entur.no/ and the two serve the
  // byte-for-byte same page. Neither of them is a developer portal -- that is
  // developer.entur.org, which the record does not hold. So no description could
  // honestly separate these two by what the sites DO, and the check does not
  // pretend to: it says the redirect, which is the real distinction. Both rows
  // pass, neither carries a chip, and the lines read "Norway's national journey
  // planner for public transport" and "Redirects to entur.no -- ...". An AE can
  // see they are one site.
  //
  // Real record, verified in Sigma 2026-08-25: DOMAINS__C is
  // 'entur.org,entur.no' and Salesforce's Website is 'www.entur.no'.
  two: {
    label: 'two domains — the rule 0 case',
    candidate: candidate({
      account_id: '0013u00001GP1HQAA1',
      name: 'Entur AS',
      arr: 58020,
      sales_segment: 'MM',
      region: 'UKINN',
      billing_country: 'Norway',
      account_owner: 'George Harding',
      employees: 227,
      total_whitespace: 49482,
      full_seats: 69,
      dev_seats: 36,
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
        description: 'Norway\'s national journey planner for public transport',
      },
      'entur.org': {
        verdict: 'looks_right',
        description: 'Redirects to entur.no — Norway\'s national journey planner for public transport',
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
      arr: 2347860,
      sales_segment: 'Strat',
      region: 'UKINN',
      billing_country: 'United Kingdom',
      account_owner: 'Seán Feehan',
      employees: 208844,
      total_whitespace: 2998741.02,
      full_seats: 949,
      dev_seats: 1760,
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
        description: 'HSBC Group corporate website and global banking services',
      },
      'noexternalmail.hsbc.com': {
        verdict: 'couldnt_check',
        description: 'No such host — DNS did not resolve',
      },
      'hsbc.co.in': {
        verdict: 'looks_right',
        description: 'Redirects to hsbc.bank.in — HSBC India retail banking site',
      },
      'hsbc.com.cn': {
        verdict: 'looks_right',
        description: 'HSBC China retail banking site with credit cards, wealth management, loans',
      },
      'hsbc.com.hk': {
        verdict: 'looks_right',
        description: 'HSBC Hong Kong retail banking site offering accounts, insurance, credit cards',
      },
    },
  },

  // Three domains, three different answers -- the account the row rule was signed
  // off against.
  //
  // nets.eu is Nets' own site and carries no chip. nexigroup.com is the Italian
  // parent trading under its own name, which is the wrong-company case this whole
  // feature exists for, and it is where the description does more than the chip:
  // "different company" asserts, "Nexi Group, European paytech and Nets' parent
  // company" explains. external.nexigroup.com has no DNS record at all.
  //
  // One measurement note, because the fixture would otherwise look wrong to
  // anyone re-running the script: from Node, nets.eu fails as
  // UNABLE_TO_VERIFY_LEAF_SIGNATURE -- the server omits its intermediate
  // certificate and undici will not chase the AIA extension to find it. curl and
  // every browser do, and so does the Workers runtime, so the deployed endpoint
  // sees the page. The verdict below was measured against the real title and meta
  // description, fetched with curl and handed to the same prompt.
  nets: {
    label: 'three domains, three verdicts — including the parent',
    candidate: candidate({
      account_id: '001PX00000QVdcQYAT',
      name: 'Nets',
      arr: 36060,
      sales_segment: 'MM',
      region: 'UKINN',
      billing_country: null,
      account_owner: 'George Harding',
      employees: 3351,
      total_whitespace: 132786,
      full_seats: 38,
      dev_seats: 31,
      website: 'www.nets.eu',
      domains: ['external.nexigroup.com', 'nets.eu', 'nexigroup.com'],
      primary_domain: 'external.nexigroup.com',
      rank_tier: 1,
      match: 'name_exact',
      matched_on: 'name',
    }),
    verdicts: {
      'nets.eu': {
        verdict: 'looks_right',
        description: 'Payment solutions and services for financial institutions and merchants',
      },
      // The fifth verdict, measured 2026-08-26 through
      // cloudflare-worker/scripts/repeat-domain-check.mjs: related_company /
      // parent, five reps out of five. It was different_company until then, and
      // that was wrong in a specific way — Nexi acquired Nets in 2021, so this
      // page is the parent's, not a stranger's. Still the wrong domain to
      // research, which is why it keeps a chip and the chip reads as caution.
      //
      // The description no longer ends "and Nets' parent company". The chip says
      // "parent company" now, and spending four of the twelve words repeating it
      // was four words not spent on what the site is.
      'nexigroup.com': {
        verdict: 'related_company',
        relation: 'parent',
        description: 'Nexi — European payments and digital transaction technology',
      },
      'external.nexigroup.com': {
        verdict: 'couldnt_check',
        description: 'No such host — DNS did not resolve',
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
      arr: 1075353,
      sales_segment: 'Ent',
      region: 'UKINN',
      billing_country: 'Netherlands',
      account_owner: 'Eleanor Davies',
      employees: 13000,
      total_whitespace: 1524123.45,
      full_seats: 901,
      dev_seats: 351,
      website: 'www.government.nl',
      domains: ['belastingdienst.nl', 'ns.nl', 'politie.nl', 'amsterdam.nl', 'uwv.nl'],
      primary_domain: 'belastingdienst.nl',
      rank_tier: 1,
      match: 'name_exact',
      matched_on: 'name',
    }),
    verdicts: {
      'belastingdienst.nl': {
        verdict: 'looks_right',
        description: 'Dutch tax authority portal for filings and tax information',
      },
      'ns.nl': {
        verdict: 'different_company',
        description: 'Nederlandse Spoorwegen (NS), Dutch national railway operator',
      },
      'politie.nl': {
        verdict: 'looks_right',
        description: 'Dutch national police website with organizational and local bureau information',
      },
      'amsterdam.nl': {
        verdict: 'couldnt_check',
        description: 'No page returned — HTTP 403',
      },
      'uwv.nl': {
        verdict: 'different_company',
        description: 'UWV, the Dutch employee insurance agency',
      },
    },
  },

  // No `Website` at all -- one of the 20 active accounts where the column is
  // genuinely null. Rule 0 goes quiet, and none of the five domains contains the
  // account name either, so rule 2 has nothing to say and the order is rule 3:
  // the record's own. That fallback has to look exactly as it did before rule 0
  // existed, and this is the account that shows it.
  //
  // Replaces the old `nets` fixture, which stood for the same state until load 11
  // gave Nets `www.nets.eu`.
  nowebsite: {
    label: 'no Salesforce website — rule 3 alone',
    candidate: candidate({
      account_id: '0013u00001ctfoYAAQ',
      name: 'Maersk Supply Service',
      arr: 0,
      sales_segment: 'MM',
      region: 'APAC',
      billing_country: null,
      account_owner: 'Timothy Beriau',
      employees: 1350,
      total_whitespace: 5220,
      full_seats: 0,
      dev_seats: 0,
      website: null,
      domains: [
        'visiblescm.com',
        'mcicontainers.com',
        'kghcustoms.com',
        'maerskdrilling.com',
        'b2ceurope.eu',
      ],
      primary_domain: 'visiblescm.com',
      rank_tier: 1,
      match: 'name_exact',
      matched_on: 'name',
    }),
    verdicts: {
      'visiblescm.com': {
        verdict: 'couldnt_check',
        description: 'No page returned — nothing in 6s',
      },
      'mcicontainers.com': {
        verdict: 'looks_right',
        description: 'Maersk Container Industry — reefer containers and cold-chain logistics',
      },
      'kghcustoms.com': {
        verdict: 'different_company',
        description: 'Redirects to maersk.com — KGH Customs rebranded as Maersk Customs Services',
      },
      'maerskdrilling.com': {
        verdict: 'couldnt_check',
        description: 'No such host — DNS did not resolve',
      },
      'b2ceurope.eu': {
        verdict: 'different_company',
        description: 'Redirects to maersk.com — Maersk\'s e-commerce logistics service',
      },
    },
  },

  // Null metrics. `employees` is null on 1,251 active accounts and
  // `total_whitespace` on 3,026; this row has both, so those two figures read `—`
  // while `dev_seats: 0` reads 0. That difference is the whole point of the
  // fixture: one says nobody has measured, the other says somebody measured and
  // found none.
  nulls: {
    label: 'null employee and whitespace figures',
    candidate: candidate({
      account_id: '001PX000001bwksYAA',
      name: 'Ministério DAS Finanças Angola',
      arr: 25287,
      sales_segment: 'SMB',
      region: 'South EMEA',
      billing_country: null,
      account_owner: 'Justine Belh',
      employees: null,
      total_whitespace: null,
      full_seats: 20,
      dev_seats: 0,
      // Salesforce names minfin.go.ao, the record's first entry is minfin.gov.ao.
      // Rule 0 fires on the second and moves it up, which is the rule doing its
      // job on an account nobody would have looked at twice.
      website: 'www.minfin.go.ao',
      domains: ['minfin.gov.ao', 'minfin.go.ao'],
      primary_domain: 'minfin.gov.ao',
      rank_tier: 1,
      match: 'name_exact',
      matched_on: 'name',
    }),
    verdicts: {
      'minfin.gov.ao': {
        verdict: 'looks_right',
        description: 'Angola\'s Finance Ministry official portal',
      },
      'minfin.go.ao': {
        verdict: 'couldnt_check',
        description: 'No such host — DNS did not resolve',
      },
    },
  },

  // An account the book holds with no domain at all. There is nothing to
  // confirm and the card has to say so rather than offer an empty radio list.
  none: {
    label: 'no domain on record',
    candidate: candidate({
      account_id: '001PX00000ofFZNYA2',
      name: 'Roblox',
      arr: 0,
      sales_segment: 'Unassigned',
      region: 'Program Manager',
      billing_country: null,
      account_owner: 'Jono Loeser',
      // Both null on this row, so three of the four metrics read `—` and only
      // ARR and the seat counts read 0. A card of em dashes on an account with
      // nothing to confirm is the honest picture.
      employees: null,
      total_whitespace: null,
      full_seats: 0,
      dev_seats: 0,
      website: null,
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
  FIXTURES.nowebsite.candidate,
  FIXTURES.two.candidate,
  FIXTURES.nets.candidate,
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
 * How long the stub takes to answer /domain-check, in ms.
 *
 * 0 by default, so a screenshot never catches a half-painted list — the
 * "checking…" state is real in the app and is simply not what those images are
 * for. scripts/measure-card-render.mjs sets it to the figure measured against
 * the real endpoint, to time the card's render against a check that is genuinely
 * slow rather than against an instant one.
 */
const CHECK_DELAY_MS = parseInt(params.get('checkDelay') || '0', 10) || 0;

/** Stands in for `workerFetch`. */
const stubFetcher = (async (path: string, init?: RequestInit) => {
  if (path.startsWith('/domain-check')) {
    if (CHECK_DELAY_MS > 0) await new Promise(r => setTimeout(r, CHECK_DELAY_MS));
    const body = JSON.parse(String(init?.body || '{}')) as { domain?: string };
    const domain = body.domain || '';
    const hit = fixture?.verdicts[domain];
    return jsonResponse({
      domain,
      verdict: hit?.verdict ?? 'couldnt_check',
      relation: hit?.relation ?? null,
      description: hit?.description ?? 'Not checked — no fixture verdict for this domain',
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
/**
 * A domain typed by hand for a locked account that holds none.
 *
 * Only meaningful on `none` (Roblox — in the book, no `account_domains` row), and
 * it is the state the cutover added: 567 active accounts land here, and until
 * 2026-08-26 the confirm step was a dead end on every one of them. `roblox.com`
 * is what an AE would type, and the point of the shot is that the card still
 * carries Roblox's own record while the chip admits the domain is not from it.
 */
const typed = params.get('typed') === '1';

const selection: AccountSelection | null = fixture && fixtureName !== 'search'
  ? (() => {
      const domain_options = rankDomains(
        fixture.candidate.domains,
        fixture.candidate.name,
        fixture.candidate.website,
      );
      if (typed && domain_options.length === 0) {
        return {
          kind: 'whitespace_account' as const,
          account_id: fixture.candidate.account_id,
          name: fixture.candidate.name,
          domain: `${fixture.candidate.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
          domain_confirmed: true,
          domain_options,
          domain_source: 'user_entered' as const,
          candidate: fixture.candidate,
        };
      }
      return {
        kind: 'whitespace_account' as const,
        account_id: fixture.candidate.account_id,
        name: fixture.candidate.name,
        domain: domain_options[0]?.domain ?? null,
        domain_confirmed: confirmed && domain_options.length > 0,
        domain_options,
        // The typed-domain path is `typed` above; every other seeded selection
        // picked its domain off the record.
        domain_source: 'whitespace' as const,
        candidate: fixture.candidate,
      };
    })()
  : null;

/**
 * A net-new prospect, for the Submit shot that has to show that path.
 *
 * There is no fixture account behind it — that is the state. `?fixture=prospect`
 * on `page=submit`.
 */
const NEW_PROSPECT: AccountSelection = {
  kind: 'new_prospect',
  account_id: null,
  name: 'Northwind Robotics',
  domain: 'northwindrobotics.example',
  no_whitespace_data: true,
};

/**
 * The post-submit confirmation, seeded.
 *
 * `?sent=1` for a dispatched run, `?sent=queued` for one that queued behind
 * MAX_CONCURRENT_RUNS. Both are confirmations — a queued run's credit is spent and
 * its row exists — and the only difference on screen is the timing line and the
 * border, which is why both need capturing.
 *
 * The run id is a fixed literal rather than generated: `Math.random` and
 * `Date.now` would make every screenshot differ from the last for no reason.
 */
const sentParam = params.get('sent');

// ─── Auth and status, stubbed ───────────────────────────────────────────────
//
// SubmitBody reads `useAuth()` for the session and the credit counter and
// `useStatus()` for the API-degraded notice. StatusContext already defaults to
// operational outside a provider, so only auth needs standing in.
//
// `session` is a truthy placeholder rather than a real one. handleSubmit returns
// early without it, and a screenshot of a form whose button cannot fire for a
// reason invisible on screen is worse than no screenshot; a real session is not
// obtainable here and is not what these images are for. The stub fetcher has no
// /submit route, so an attempt fails at the network.
const AE_PROFILE: UserProfile = {
  id: '350c544b-7748-497d-a4b5-c9dd97444648',
  email: 'ae@figma.com',
  name: 'An AE',
  role: 'ae',
  credits_remaining: 5,
  manager_id: null,
};

const noop = async () => {};
const authStub: AuthContextType = {
  user: null,
  session: { access_token: 'harness' } as AuthContextType['session'],
  userProfile: AE_PROFILE,
  realUserProfile: AE_PROFILE,
  isImpersonating: false,
  loading: false,
  authError: null,
  signOut: noop,
  refreshProfile: noop,
  clearAuthError: () => {},
  impersonate: () => {},
  stopImpersonating: () => {},
};

const page = params.get('page') === 'submit' ? 'submit' : 'preview';

const submittedSeed: SubmittedRun | null = sentParam
  ? {
      selection: (fixtureName === 'prospect' ? NEW_PROSPECT : selection)!,
      market: 'auto',
      runId: '18c5bf5b-338f-4726-9dd6-cbb6df976b95',
      queue: sentParam === 'queued' ? { position: 2, waitMinutes: 24 } : undefined,
    }
  : null;
// On unless explicitly turned off, matching the component's own default. Passed
// rather than read off Admin's localStorage key so a screenshot never depends on
// what the browser profile happens to hold.
const domainCheckOn = params.get('haiku') !== '0';
const seeded = fixtureName === 'prospect' ? NEW_PROSPECT : selection;

/**
 * A MemoryRouter, because the confirmation panel calls `useNavigate` and that
 * hook throws outside a router context — not because anything here navigates.
 * `onNavigate` below intercepts the buttons so a screenshot cannot wander off the
 * page it is meant to be of. In memory rather than browser history so the harness
 * cannot touch the URL the screenshot script drove it to.
 */
createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
  <div style={{ background: 'var(--bg-app)', minHeight: '100vh', padding: 32 }}>
    <div style={{
      maxWidth: 560, marginBottom: 20, padding: '8px 12px', borderRadius: 6,
      border: '1px dashed var(--border-strong)', background: 'var(--bg-surface)',
      fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6,
    }}>
      <strong style={{ color: 'var(--text-secondary)' }}>Screenshot harness</strong> —
      {' '}page: <code>{page}</code>, fixture: <code>{fixtureName}</code>
      {fixture ? ` (${fixture.label})` : ''}.
      Every domain verdict shown below is fixture data. No page was fetched and no
      model was called.
      {page === 'submit' && ' The credit count is a stub and nothing here can dispatch a run.'}
    </div>
    {page === 'submit' ? (
      <AuthContext.Provider value={authStub}>
        <SubmitBody
          fetcher={stubFetcher}
          initialDomainCheck={domainCheckOn}
          initialSelection={seeded}
          initialSubmitted={submittedSeed}
          // Rendered outside a Router, so the confirmation's buttons cannot
          // navigate. Logged instead of throwing — the images are of the panel,
          // not of where its buttons go.
          onNavigate={(path) => console.log(`[harness] navigate ${path}`)}
        />
      </AuthContext.Provider>
    ) : (
      <AccountSearchPreviewBody
        fetcher={stubFetcher}
        initialDomainCheck={domainCheckOn}
        initialSelection={seeded}
      />
    )}
  </div>
  </MemoryRouter>,
);
