import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Check, Link, Shield, AlertTriangle, Clock, X, ExternalLink } from 'lucide-react';
import { workerFetch } from '../lib/supabase';
import { parseDomainInput } from '../lib/domain';
import { rankDomains, reasonText, type RankedDomain } from '../lib/domain-rank';

/**
 * AccountSearch — type-ahead over the real whitespace book.
 *
 * Replaces free-text company entry. The AE types, sees actual
 * `whitespace_accounts` rows with the name, domain, ARR and segment needed to
 * tell them apart, and picks one. The selection carries that account's
 * Salesforce ID, which is what the pipeline then resolves whitespace by —
 * instead of re-matching the typed string later and sometimes landing on a
 * different company (entur.no -> Accenture, nexi.com -> Cenexi, nets.eu ->
 * Enexis Netbeheer).
 *
 * Self-contained on purpose: no layout assumptions, no page-specific state, and
 * the only outside dependency is `workerFetch`, which is overridable. It can be
 * dropped into the Submit form as-is.
 *
 * Two questions, both asked out loud
 * ──────────────────────────────────
 * WHICH ACCOUNT, then WHICH DOMAIN. Picking a candidate answers the first and
 * only the first: the selection comes back with `domain_confirmed: false` and a
 * ranked list of every domain on the record, and a host must treat that as an
 * incomplete request. Confirming the domain answers the second.
 *
 * The domain used to be settled silently as `primary_domain` — the first entry
 * in a comma-separated spreadsheet cell, `is_primary` first and no logic after
 * that. It is what gets scraped, what the web research is built on, and what
 * contact discovery runs against, and 1,010 accounts had it pointing somewhere
 * Salesforce does not consider theirs: Toyota at `mail.toyota.co.jp`, LVMH at
 * `sephora.com`, the Dutch government at the tax office. Ranking (see
 * lib/domain-rank) makes the suggestion defensible; the confirm step makes it a
 * decision.
 *
 * What it deliberately does NOT do
 * ───────────────────────────────
 * Auto-select. Not even when exactly one candidate comes back, and not even
 * when the account holds exactly one domain. A single result is still a guess
 * about intent, and "this is the only domain we hold" is not "this is the right
 * domain". `onChange` fires only from a click or Enter on a highlighted row,
 * and `domain_confirmed` flips only on the confirm button.
 *
 * No match is a state, not an empty list. An empty dropdown reads as "still
 * loading" or "keep typing"; this says the whitespace book has no record, and
 * offers the honest ways forward — search differently, or say explicitly that
 * this is a net-new prospect and proceed without whitespace data.
 *
 * The net-new prospect path
 * ────────────────────────
 * A company can legitimately not be in the whitespace book: a genuine net-new
 * prospect nobody has ever scored. That is not a search failure and it is not a
 * reason to block the research — so "no match" is a fork, not a dead end.
 *
 * Taking that fork asks for the domain, typed by hand. Nothing is auto-suggested,
 * fuzzy-matched or looked up: if the system does not know the account, it has no
 * business pretending to know the domain either. The only check is that what was
 * typed is shaped like a domain.
 *
 * What comes out of it is deliberately NOT the same as an account with a
 * whitespace record whose opportunity buckets happen to be zero. One knows
 * nothing, the other knows there is nothing, and collapsing them is how a brief
 * ends up telling an AE there is no room in an account nobody has ever measured.
 * The selection carries `no_whitespace_data: true` and no account_id, and the
 * pipeline keeps the two apart the whole way to the PDF.
 */

export type MatchTier = 'domain_exact' | 'name_exact' | 'prefix' | 'contains';

export interface WhitespaceCandidate {
  account_id: string;
  name: string;
  arr: number | null;
  sales_segment: string | null;
  region: string | null;
  billing_country: string | null;
  total_whitespace: number | null;
  domains: string[];
  primary_domain: string | null;
  rank_tier: number;
  match: MatchTier;
  matched_on: string;
}

/** An account chosen from real whitespace_accounts rows. */
export interface LockedAccountSelection {
  kind: 'whitespace_account';
  /** Salesforce account ID — the lock the pipeline consumes. */
  account_id: string;
  /** Canonical account name from the whitespace book, not what was typed. */
  name: string;
  /**
   * The domain this brief will run against: the AE's choice once
   * `domain_confirmed` is true, and the ranked suggestion until then.
   *
   * Null only when the record holds no domain at all.
   */
  domain: string | null;
  /**
   * False until the AE has explicitly confirmed the domain, including when the
   * account holds exactly one.
   *
   * A host must treat an unconfirmed selection as incomplete and refuse to
   * submit it. "This is the only domain we hold" is not the same statement as
   * "this is the right domain", and the whole reason 1,010 accounts lock a
   * domain Salesforce does not consider theirs is that nobody was ever asked.
   */
  domain_confirmed: boolean;
  /**
   * Every domain on the record, ranked best-first, each carrying why it ranked
   * where it did. Never truncated — a hidden option is the "+N more" treatment
   * this replaces.
   */
  domain_options: RankedDomain[];
  candidate: WhitespaceCandidate;
}

/**
 * Advisory verdicts from `POST /domain-check`.
 *
 * Annotation only. Nothing in this component reads a verdict to decide an
 * order, a pre-selection, or whether confirmation is allowed — it is printed
 * next to an option and that is the end of its authority. A check built on a
 * page title and a meta description is not good enough to outrank a person who
 * knows the account.
 */
export type DomainVerdict = 'looks_right' | 'different_company' | 'not_a_website' | 'couldnt_check';

export interface DomainCheckResult {
  domain: string;
  verdict: DomainVerdict;
  /** One line, from the model or from whatever went wrong. */
  reason: string;
  page?: { title: string; description: string; status: number } | null;
  latency_ms?: number;
}

/**
 * A company the whitespace book has no record of, declared as such.
 *
 * A discriminated union rather than a nullable `account_id` on one shape, so a
 * consumer cannot read `selection.candidate` on this branch and get `undefined`
 * where it expected ARR. There is no candidate here: nothing was matched.
 */
export interface NewProspectSelection {
  kind: 'new_prospect';
  /** No Salesforce record. Not "unknown" — established as absent. */
  account_id: null;
  /** The company as the person searching spelled it. */
  name: string;
  /** Typed by hand. Never suggested, never fuzzy-matched, never looked up. */
  domain: string;
  /**
   * Travels to the pipeline. Distinct from "has a whitespace record whose
   * opportunity buckets are all zero" — see the header comment.
   */
  no_whitespace_data: true;
}

export type AccountSelection = LockedAccountSelection | NewProspectSelection;

interface SearchResponse {
  query: string;
  interpreted_as: { kind: 'name' | 'domain' | 'too_short'; apex: string | null };
  candidates: WhitespaceCandidate[];
  count: number;
  no_match: boolean;
  truncated?: boolean;
  latency_ms?: number;
}

interface Props {
  value: AccountSelection | null;
  onChange: (selection: AccountSelection | null) => void;
  /**
   * Offer the net-new-prospect path on a no-match. Off by default, because a
   * page that cannot cope with a submission carrying no whitespace record should
   * not present the option — for those, a no-match stays a dead end and says so.
   *
   * When on, taking the path produces a `NewProspectSelection` through the normal
   * `onChange`. The host does not need a second callback: there is one question
   * on this field ("which account is this brief about") and "none of them, here
   * is the domain" is one of its answers.
   */
  allowNewProspect?: boolean;
  /**
   * Annotate each domain option with the advisory page check (see
   * DomainVerdict). Off by default: it costs a fetch and a Haiku call per
   * option, and every path through the confirmation step works identically
   * without it.
   */
  domainCheck?: boolean;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /**
   * Injectable for tests. Typed off workerFetch so a stand-in cannot drift from
   * the real signature.
   */
  fetcher?: typeof workerFetch;
}

/**
 * Shortest query that runs a search. Raised 2 -> 3 on 2026-08-25, in step with
 * MIN_QUERY_LEN in the Worker's account-search.js -- the client gate exists to
 * save the round trip, so a client that is looser than the server just pays for
 * a request the server refuses.
 *
 * A trigram index cannot serve a pattern shorter than three characters, as
 * '%hs%' or as 'hs%', so every two-character query was a full scan of all 20,769
 * active accounts however the table is indexed -- and it was the first search
 * every keystroke sequence triggered. 119ms at two characters against a 34-39ms
 * floor; 37ms at three.
 *
 * 62 active accounts have a name of two characters or fewer and are no longer
 * reachable by typing the name in full. They are still reachable by domain, and
 * the helper text below says what to do rather than showing an empty list.
 */
const MIN_QUERY_LEN = 3;
// The endpoint's own server-side work is single-digit milliseconds and the round
// trip is ~50ms, so the debounce is the largest single contributor to how the
// field feels. 120ms still coalesces a burst of typing into one request — a
// fast typist is under 100ms between keystrokes — while taking 80ms off every
// search compared with the 200ms this started at.
const DEBOUNCE_MS = 120;

/**
 * Results are cached per exact query string, for the session.
 *
 * Typing is not a forward-only sequence: people backspace, retype, and re-check
 * a candidate they already looked at. Every one of those was a fresh round trip.
 * Cached, they are instant, which does more for how the field feels than any
 * query tuning — the alternative to a cache hit is not a fast request, it is a
 * ~50ms one at best and a few hundred at worst.
 *
 * Capped because an AE could type for a long time in one session, and unbounded
 * growth in a component that lives for a whole page visit is a leak.
 */
const CACHE_MAX = 200;

/**
 * Ceiling on advisory page checks per account.
 *
 * Not a display cap — every domain is listed, always. This caps only how many
 * get annotated, because each one is a root-URL fetch plus a model call and the
 * widest records in the book hold well over twenty domains. The five checked are
 * the five the ranking put on top, which are the five an AE actually reads.
 */
const MAX_DOMAIN_CHECKS = 5;

const MATCH_LABEL: Record<MatchTier, string> = {
  domain_exact: 'exact domain',
  name_exact: 'exact name',
  prefix: 'starts with',
  contains: 'contains',
};

/**
 * The four verdicts the annotation can show, and nothing else.
 *
 * Used as the allowlist when a response comes back: a verdict outside this list
 * is treated as "couldn't check" rather than mapped to the nearest match.
 */
const VERDICT_ORDER: DomainVerdict[] = [
  'looks_right', 'different_company', 'not_a_website', 'couldnt_check',
];

/**
 * How each verdict reads. Wording is the AE's, not the model's — "looks right"
 * rather than "verified", because a page title and a meta description do not
 * verify anything.
 */
const VERDICT_STYLE: Record<DomainVerdict, {
  label: string; bg: string; fg: string; icon: typeof Check | null;
}> = {
  looks_right: {
    label: 'looks right',
    bg: 'var(--badge-green-bg)', fg: 'var(--badge-green-text)', icon: Check,
  },
  different_company: {
    label: 'looks like a different company',
    bg: 'var(--badge-red-bg)', fg: 'var(--badge-red-text)', icon: AlertTriangle,
  },
  not_a_website: {
    label: 'not a website',
    bg: 'var(--badge-yellow-bg)', fg: 'var(--badge-yellow-text)', icon: X,
  },
  couldnt_check: {
    // No icon and no colour. "We could not ask" is not a finding, and dressing
    // it as one would make an unreachable host look like a red flag.
    label: 'couldn’t check',
    bg: 'var(--badge-muted-bg)', fg: 'var(--badge-muted-text)', icon: null,
  },
};

function formatMoney(v: number | null): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export default function AccountSearch({
  value,
  onChange,
  allowNewProspect = false,
  domainCheck = false,
  label = 'Company',
  placeholder = 'Start typing a company name or website',
  autoFocus = false,
  disabled = false,
  fetcher = workerFetch,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  /**
   * Non-null once the net-new-prospect path is taken: the company name the person
   * searched for, held while they type the domain. Separate from `value` because
   * nothing is selected yet — they have said "not in the book", not yet "and here
   * is the domain", and a half-made choice must not look like a made one.
   */
  const [newProspectName, setNewProspectName] = useState<string | null>(null);
  const [domainDraft, setDomainDraft] = useState('');
  const [domainTouched, setDomainTouched] = useState(false);
  /**
   * Advisory check results, keyed `${account_id}|${domain}`. `'checking'` while a
   * request is in flight; absent means not asked.
   *
   * Rendered as it arrives and never awaited — the card and the domain list are
   * on screen before the first request is issued, and an AE who has already made
   * up their mind should not be waiting on a model to tell them so.
   */
  const [checks, setChecks] = useState<Record<string, DomainCheckResult | 'checking'>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const cacheRef = useRef<Map<string, SearchResponse>>(new Map());
  /**
   * Queries that returned nothing, restricted to those with no dot in them.
   *
   * Substring matching is monotonic: if nothing contains 'zzyz', nothing can
   * contain 'zzyzx' either, so once a query comes back empty every extension of
   * it can be answered without asking. Typing out a 20-character company that
   * is not in the book went from ~18 requests to 3.
   *
   * The dot-free restriction is not cosmetic. A query with a dot may become
   * domain-shaped as it grows, which adds an exact-apex term that the shorter
   * query never ran: 'x.isbank.com.t' matches nothing, but 'x.isbank.com.tr'
   * resolves via the apex isbank.com.tr. Extension does not imply emptiness
   * there, so those queries always go to the network.
   */
  const emptyPrefixRef = useRef<Set<string>>(new Set());
  // Every request carries a sequence number and only the newest is allowed to
  // write state. Abort alone is not enough: a response already in flight can
  // resolve after a later one and repaint the list with stale candidates.
  const seqRef = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  /**
   * Advisory results kept for the session, keyed the same way as `checks`.
   *
   * Survives clearing the selection and coming back, which an AE comparing two
   * accounts does constantly. A page's title does not change in the minutes a
   * submission takes to decide, and re-fetching it is a fetch plus a model call
   * to learn the same thing.
   */
  const checkCacheRef = useRef<Map<string, DomainCheckResult>>(new Map());
  const checkAbortRef = useRef<AbortController | undefined>(undefined);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    const cached = cacheRef.current.get(trimmed);
    if (cached) {
      // Re-insert so the cap evicts genuinely cold entries rather than the ones
      // being used most.
      cacheRef.current.delete(trimmed);
      cacheRef.current.set(trimmed, cached);
      abortRef.current?.abort();
      seqRef.current++;
      setResults(cached);
      setHighlight(0);
      setError(null);
      setLoading(false);
      setOpen(true);
      return;
    }

    // Any extension of a dot-free query that matched nothing also matches
    // nothing. Answer it locally rather than spending a round trip to be told so.
    if (!trimmed.includes('.')) {
      const lower = trimmed.toLowerCase();
      for (const empty of emptyPrefixRef.current) {
        if (lower.startsWith(empty)) {
          abortRef.current?.abort();
          seqRef.current++;
          setResults({
            query: trimmed,
            interpreted_as: { kind: 'name', apex: null },
            candidates: [], count: 0, no_match: true,
          });
          setError(null);
          setLoading(false);
          setOpen(true);
          return;
        }
      }
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++seqRef.current;

    setLoading(true);
    setError(null);

    try {
      const res = await fetcher(
        `/account-search?q=${encodeURIComponent(trimmed)}&limit=10`,
        { signal: controller.signal },
      );
      if (seq !== seqRef.current) return;
      if (!res.ok) {
        setResults(null);
        setError(res.status === 429
          ? 'Too many searches — wait a moment and try again.'
          : `Search failed (${res.status})`);
        return;
      }
      const data: SearchResponse = await res.json();
      if (seq !== seqRef.current) return;

      cacheRef.current.set(trimmed, data);
      if (cacheRef.current.size > CACHE_MAX) {
        // Map preserves insertion order, so the first key is the coldest.
        cacheRef.current.delete(cacheRef.current.keys().next().value as string);
      }
      if (data.no_match && !trimmed.includes('.')) {
        emptyPrefixRef.current.add(trimmed.toLowerCase());
      }

      setResults(data);
      setHighlight(0);
      setOpen(true);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (seq !== seqRef.current) return;
      setResults(null);
      // A failed search is never presented as "no whitespace record": one means
      // the book has no such account, the other means we could not ask.
      setError((err as Error).message || 'Network error');
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    if (value) return; // locked — stop searching
    // Mid net-new-prospect entry the search field is not what has focus, and
    // re-running the query that just missed would only reopen the dropdown over
    // the domain field.
    if (newProspectName !== null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, value, newProspectName, runSearch]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Close on outside click, so the dropdown does not sit over the rest of a form.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Memoised because the tiedCount memo below depends on it; a fresh `[]` on
  // every render would invalidate that memo every render.
  const candidates = useMemo(() => results?.candidates ?? [], [results]);

  // "Ambiguous" means several candidates are equally strong — the case the
  // ordering rule exists for. A weaker runner-up is not a tie.
  const tiedCount = useMemo(() => {
    if (!candidates.length) return 0;
    const top = candidates[0].rank_tier;
    return candidates.filter(c => c.rank_tier === top).length;
  }, [candidates]);

  /**
   * Choosing a candidate settles WHICH ACCOUNT, and nothing else.
   *
   * It used to also settle the domain, silently, as `primary_domain` — the first
   * entry in a comma-separated spreadsheet cell. That is where `mail.toyota.co.jp`
   * and `sephora.com` came from. The domain is now a second, explicit question,
   * and `domain_confirmed: false` is what says it has not been answered.
   */
  const select = (c: WhitespaceCandidate) => {
    const domain_options = rankDomains(c.domains, c.name);
    onChange({
      kind: 'whitespace_account',
      account_id: c.account_id,
      name: c.name,
      // Offered, not chosen. The confirm click is what chooses.
      domain: domain_options[0]?.domain ?? null,
      domain_confirmed: false,
      domain_options,
      candidate: c,
    });
    setOpen(false);
  };

  /** Move the radio. Still unconfirmed — picking is not confirming. */
  const chooseDomain = (domain: string) => {
    if (value?.kind !== 'whitespace_account') return;
    if (domain === value.domain) return;
    onChange({ ...value, domain, domain_confirmed: false });
  };

  const confirmDomain = () => {
    if (value?.kind !== 'whitespace_account' || !value.domain) return;
    onChange({ ...value, domain_confirmed: true });
  };

  /** Reopen the question without losing the account. */
  const reopenDomain = () => {
    if (value?.kind !== 'whitespace_account') return;
    onChange({ ...value, domain_confirmed: false });
  };

  const startNewProspect = (typedQuery: string) => {
    setNewProspectName(typedQuery);
    // If they searched by domain, that IS the domain — pre-filling it is repeating
    // what they typed, not guessing. A name search pre-fills nothing.
    setDomainDraft(parseDomainInput(typedQuery) || '');
    setDomainTouched(false);
    setOpen(false);
  };

  const cancelNewProspect = () => {
    setNewProspectName(null);
    setDomainDraft('');
    setDomainTouched(false);
  };

  const confirmNewProspect = () => {
    const domain = parseDomainInput(domainDraft);
    setDomainTouched(true);
    if (!domain || newProspectName === null) return;
    onChange({
      kind: 'new_prospect',
      account_id: null,
      name: newProspectName,
      domain,
      no_whitespace_data: true,
    });
    setNewProspectName(null);
    setDomainDraft('');
    setDomainTouched(false);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
    setResults(null);
    setError(null);
    setNewProspectName(null);
    setDomainDraft('');
    setDomainTouched(false);
    // Caches are kept. They are keyed on the exact query and the whitespace book
    // does not change mid-session, so a second look at the same company should
    // still be instant.
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !candidates.length) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, candidates.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      // Only ever selects the row the person is looking at. Enter on an empty
      // or unhighlighted list does nothing — it must not submit the host form
      // with no account chosen.
      e.preventDefault();
      const c = candidates[highlight];
      if (c) select(c);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  // ── Advisory page check ───────────────────────────────────────────────────

  const pendingAccountId = value?.kind === 'whitespace_account' && !value.domain_confirmed
    ? value.account_id
    : null;
  // A string rather than the array, so the effect below does not re-run on every
  // render just because `domain_options` is a fresh reference.
  const checkableDomains = value?.kind === 'whitespace_account' && !value.domain_confirmed
    ? value.domain_options.slice(0, MAX_DOMAIN_CHECKS).map(o => o.domain).join(',')
    : '';

  useEffect(() => {
    if (!domainCheck || !pendingAccountId || !checkableDomains) return;

    checkAbortRef.current?.abort();
    const controller = new AbortController();
    checkAbortRef.current = controller;

    const domains = checkableDomains.split(',');
    const known: Record<string, DomainCheckResult | 'checking'> = {};
    const todo: string[] = [];
    for (const domain of domains) {
      const key = `${pendingAccountId}|${domain}`;
      const hit = checkCacheRef.current.get(key);
      if (hit) known[key] = hit;
      else { known[key] = 'checking'; todo.push(domain); }
    }
    // Cached verdicts and in-flight markers land in one paint, before any
    // request goes out, so the list never flashes empty on a second look.
    setChecks(prev => ({ ...prev, ...known }));

    for (const domain of todo) {
      const key = `${pendingAccountId}|${domain}`;
      fetcher('/domain-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: pendingAccountId, domain }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`check failed (${res.status})`);
          return await res.json() as Partial<DomainCheckResult>;
        })
        .then((body) => {
          // The verdict is whatever the endpoint said, or nothing. An
          // unrecognised value is not repaired into the nearest plausible one:
          // a fabricated "looks right" is worse than an admitted blank.
          const verdict = VERDICT_ORDER.includes(body?.verdict as DomainVerdict)
            ? body!.verdict as DomainVerdict
            : 'couldnt_check';
          const result: DomainCheckResult = {
            domain,
            verdict,
            reason: body?.reason || (verdict === 'couldnt_check' ? 'no reason given' : ''),
            page: body?.page ?? null,
            latency_ms: body?.latency_ms,
          };
          checkCacheRef.current.set(key, result);
          if (!controller.signal.aborted) setChecks(prev => ({ ...prev, [key]: result }));
        })
        .catch((err: Error) => {
          if (controller.signal.aborted || err.name === 'AbortError') return;
          // Deliberately NOT cached. A real verdict is a fact about the page and
          // holds for the session; a network failure is a fact about this
          // moment, and sticking it to the domain would mean the annotation
          // never recovers.
          setChecks(prev => ({
            ...prev,
            [key]: { domain, verdict: 'couldnt_check', reason: err.message || 'the check could not be run', page: null },
          }));
        });
    }

    return () => controller.abort();
  }, [domainCheck, pendingAccountId, checkableDomains, fetcher]);

  useEffect(() => () => { checkAbortRef.current?.abort(); }, []);

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    padding: '8px 12px 8px 32px',
    fontSize: 13,
    color: 'var(--text-primary)',
    width: '100%',
    outline: 'none',
  };

  const changeButton = (
    <button
      type="button"
      onClick={clear}
      disabled={disabled}
      style={{
        background: 'transparent',
        border: '1px solid var(--border-strong)',
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 12,
        color: 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
      }}
    >
      Change
    </button>
  );

  // ── Chosen: net-new prospect, no whitespace record ────────────────────────
  // Amber rather than green, and it says what is missing rather than only what is
  // set. This is a valid, complete choice — it is just a choice that carries less
  // information, and the panel should not imply otherwise by looking identical to
  // a locked account.
  if (value?.kind === 'new_prospect') {
    return (
      <div ref={rootRef}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
          {label}
        </label>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid #d97706',
          borderRadius: 6,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}>
          <AlertTriangle size={15} style={{ marginTop: 2, flexShrink: 0, color: '#d97706' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{value.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
              <div>
                <span style={{ opacity: 0.75 }}>Domain (entered by hand)</span>{' '}
                <code style={{ fontSize: 11 }}>{value.domain}</code>
              </div>
              <div>
                <span style={{ opacity: 0.75 }}>Salesforce ID</span> none — new prospect
              </div>
              <div>
                <span style={{ opacity: 0.75 }}>Whitespace / TAM</span> no record
              </div>
            </div>
          </div>
          {changeButton}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.6 }}>
          Research will run against this domain. The brief will state that this account has
          no whitespace record — seats, ARR and opportunity value unknown, which is not the
          same as zero.
        </div>
      </div>
    );
  }

  // ── The account is settled; the domain is the open question ───────────────
  //
  // Reached for EVERY whitespace account, one domain or five. A record holding a
  // single domain still gets asked, because "this is the only domain we hold" is
  // a different statement from "this is the right domain", and the second one is
  // the only one worth locking a brief to.
  //
  // The payload is deliberately still visible to the host while this is on
  // screen — an unconfirmed selection is an incomplete request, not a hidden
  // one, and a host that hid it would be back to a domain nobody looked at.
  if (value?.kind === 'whitespace_account' && !value.domain_confirmed) {
    const options = value.domain_options;
    const suggested = options[0];
    const suggestedReason = suggested ? reasonText(suggested) : null;

    return (
      <div ref={rootRef}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
          {label}
        </label>

        {/* Which account: settled. Neutral border, not green — nothing is done yet. */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 6,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}>
          <Shield size={15} style={{ marginTop: 2, flexShrink: 0, color: 'var(--text-secondary)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{value.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
              <div>
                <span style={{ opacity: 0.75 }}>Salesforce ID</span>{' '}
                <code style={{ fontSize: 11 }}>{value.account_id}</code>
              </div>
              <div>
                <span style={{ opacity: 0.75 }}>ARR</span> {formatMoney(value.candidate.arr)}
                {'   '}
                <span style={{ opacity: 0.75 }}>Segment</span> {value.candidate.sales_segment || '—'}
                {'   '}
                <span style={{ opacity: 0.75 }}>Region</span> {value.candidate.region || '—'}
              </div>
            </div>
          </div>
          {changeButton}
        </div>

        {/* Which domain: the question. */}
        <div style={{
          marginTop: 8,
          background: 'var(--bg-surface)',
          border: '1px solid var(--accent)',
          borderRadius: 8,
          padding: '12px 14px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Confirm the research domain
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
            This is the site that gets scraped, the basis of the web research, and the
            domain contact discovery runs against.
          </div>

          {options.length === 0 ? (
            <div style={{
              fontSize: 12, color: 'var(--badge-yellow-text)', background: 'var(--badge-yellow-bg)',
              border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', lineHeight: 1.6,
            }}>
              This account holds no domain at all, so there is nothing to confirm. Research
              cannot run without one — pick a different account, or take the new-prospect
              path and type the domain by hand.
            </div>
          ) : (
            <>
              <div role="radiogroup" aria-label="Research domain">
                {options.map((option, i) => {
                  const chosen = option.domain === value.domain;
                  const isSuggested = i === 0;
                  const check = checks[`${value.account_id}|${option.domain}`];
                  return (
                    <label
                      key={option.domain}
                      style={{
                        display: 'flex', gap: 9, alignItems: 'flex-start',
                        padding: '8px 10px',
                        marginBottom: 6,
                        border: `1px solid ${chosen ? 'var(--accent)' : 'var(--border)'}`,
                        background: chosen ? 'var(--accent-subtle)' : 'transparent',
                        borderRadius: 6,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name={`research-domain-${value.account_id}`}
                        checked={chosen}
                        disabled={disabled}
                        onChange={() => chooseDomain(option.domain)}
                        style={{ marginTop: 3, flexShrink: 0, accentColor: 'var(--accent)' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
                        }}>
                          <code style={{
                            fontSize: 12, fontFamily: 'var(--font-mono)',
                            color: 'var(--text-primary)', wordBreak: 'break-all',
                          }}>
                            {option.domain}
                          </code>
                          {/* The reason sits on the suggestion, so the suggestion is
                              legible rather than magic. It stays on the suggestion
                              even after the AE picks something else — it describes
                              the ranking, not the current radio. */}
                          {isSuggested && (
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 10,
                              background: 'var(--badge-blue-bg)', color: 'var(--badge-blue-text)',
                              whiteSpace: 'nowrap',
                            }}>
                              suggested{suggestedReason ? ` · ${suggestedReason}` : ''}
                            </span>
                          )}
                        </div>

                        {check === 'checking' && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 4, marginTop: 4,
                            fontSize: 11, color: 'var(--text-tertiary)',
                          }}>
                            <Clock size={11} /> checking the page…
                          </div>
                        )}
                        {check && check !== 'checking' && (() => {
                          const style = VERDICT_STYLE[check.verdict];
                          const Icon = style.icon;
                          return (
                            <div style={{
                              display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 4,
                              fontSize: 11, lineHeight: 1.5, color: style.fg,
                            }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                background: style.bg, color: style.fg,
                                padding: '1px 6px', borderRadius: 10, whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}>
                                {Icon && <Icon size={10} />}
                                {style.label}
                              </span>
                              {check.reason && (
                                <span style={{ color: 'var(--text-tertiary)' }}>{check.reason}</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Look at it yourself. The whole problem is a domain nobody
                          opened, so the cheapest fix is one click away. */}
                      <a
                        href={`https://${option.domain}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={(e) => e.stopPropagation()}
                        title={`Open ${option.domain} in a new tab`}
                        style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }}
                      >
                        <ExternalLink size={12} />
                      </a>
                    </label>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={confirmDomain}
                  disabled={disabled || !value.domain}
                  style={{
                    background: value.domain ? 'var(--accent)' : 'transparent',
                    border: `1px solid ${value.domain ? 'var(--accent)' : 'var(--border-strong)'}`,
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 500,
                    color: value.domain ? '#fff' : 'var(--text-tertiary)',
                    cursor: value.domain && !disabled ? 'pointer' : 'not-allowed',
                  }}
                >
                  Confirm {value.domain}
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {options.length === 1
                    ? 'The only domain on this record'
                    : `All ${options.length} domains on this record`}
                  {domainCheck && options.length > MAX_DOMAIN_CHECKS &&
                    ` · top ${MAX_DOMAIN_CHECKS} checked`}
                </span>
              </div>
            </>
          )}
        </div>

        <div style={{ fontSize: 12, color: 'var(--badge-yellow-text)', marginTop: 6, lineHeight: 1.6 }}>
          {options.length === 0
            ? 'There is no domain to confirm, so this account cannot be researched as it stands.'
            : 'Not confirmed yet — the request is incomplete until you confirm a domain.'}
        </div>
      </div>
    );
  }

  // ── Locked state ───────────────────────────────────────────────────────
  if (value) {
    const confirmedByHand = value.kind === 'whitespace_account';
    return (
      <div ref={rootRef}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
          {label}
        </label>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--status-complete-text, #16a34a)',
          borderRadius: 6,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}>
          <Shield size={15} style={{ marginTop: 2, flexShrink: 0, color: 'var(--status-complete-text, #16a34a)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{value.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ opacity: 0.75 }}>Research domain</span>
                <code style={{ fontSize: 11 }}>{value.domain || '— none on record —'}</code>
                {/* Says who decided, because that is the whole change. */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10, padding: '1px 6px', borderRadius: 10,
                  background: 'var(--badge-green-bg)', color: 'var(--badge-green-text)',
                }}>
                  <Check size={9} /> confirmed
                </span>
                {confirmedByHand && (
                  <button
                    type="button"
                    onClick={reopenDomain}
                    disabled={disabled}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      fontSize: 11, color: 'var(--accent)', textDecoration: 'underline',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    change
                  </button>
                )}
              </div>
              <div>
                <span style={{ opacity: 0.75 }}>Salesforce ID</span>{' '}
                <code style={{ fontSize: 11 }}>{value.account_id}</code>
              </div>
              <div>
                <span style={{ opacity: 0.75 }}>ARR</span> {formatMoney(value.candidate.arr)}
                {'   '}
                <span style={{ opacity: 0.75 }}>Segment</span> {value.candidate.sales_segment || '—'}
                {'   '}
                <span style={{ opacity: 0.75 }}>Region</span> {value.candidate.region || '—'}
              </div>
            </div>
          </div>
          {changeButton}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.6 }}>
          Research will run against this account and this domain. Both were chosen here —
          not derived from the text you typed, and not taken from whichever domain happened
          to come first on the record.
        </div>
      </div>
    );
  }

  // ── Search state ──────────────────────────────────────────────────────────
  const showNoMatch = !!results && results.no_match && !loading && !error;

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <Search
          size={14}
          style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-tertiary)', pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            // Typing again is a change of mind about the company, so the
            // half-finished domain entry for the old query goes away rather than
            // being carried onto a different one.
            if (newProspectName !== null) cancelNewProspect();
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)';
            if (candidates.length || showNoMatch) setOpen(true);
          }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="account-search-list"
          style={inputStyle}
        />
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, minHeight: 17 }}>
        {loading && 'Searching the whitespace book…'}
        {!loading && error && <span style={{ color: '#dc2626' }}>{error}</span>}
        {!loading && !error && query.trim().length > 0 && query.trim().length < MIN_QUERY_LEN &&
          `Keep typing — ${MIN_QUERY_LEN} characters minimum`}
        {!loading && !error && results && !results.no_match && (
          <>
            {results.count} {results.count === 1 ? 'account' : 'accounts'} found
            {results.interpreted_as.apex && ` for ${results.interpreted_as.apex}`}
            {results.truncated && ' (showing the top 10)'}
          </>
        )}
      </div>

      {/* ── Net-new prospect: manual domain entry ──────────────────────────── */}
      {newProspectName !== null && (() => {
        const parsed = parseDomainInput(domainDraft);
        const invalid = domainTouched && domainDraft.trim().length > 0 && !parsed;
        return (
          <div style={{
            marginTop: 8,
            background: 'var(--bg-surface)',
            border: '1px solid #d97706',
            borderRadius: 8,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              New prospect — “{newProspectName}”
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
              Nothing in the whitespace book covers this company, so there is no domain on
              record to use. Type it in — the research runs against whatever you enter here.
            </div>
            <label
              htmlFor="new-prospect-domain"
              style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}
            >
              Company domain
            </label>
            <input
              id="new-prospect-domain"
              type="text"
              autoFocus
              value={domainDraft}
              disabled={disabled}
              placeholder="example.com"
              onChange={(e) => setDomainDraft(e.target.value)}
              onBlur={() => setDomainTouched(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmNewProspect(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelNewProspect(); }
              }}
              aria-invalid={invalid}
              aria-describedby="new-prospect-domain-help"
              style={{
                ...inputStyle,
                paddingLeft: 12,
                borderColor: invalid ? '#dc2626' : 'var(--border-strong)',
              }}
            />
            <div
              id="new-prospect-domain-help"
              style={{ fontSize: 11, marginTop: 5, minHeight: 16, lineHeight: 1.5,
                       color: invalid ? '#dc2626' : 'var(--text-tertiary)' }}
            >
              {invalid
                ? 'That does not look like a domain. Something of the form example.com.'
                : parsed && parsed !== domainDraft.trim().toLowerCase()
                  ? <>Will be used as <code>{parsed}</code></>
                  : 'Not checked against anything — no suggestions, no lookup. You are the one who knows this account.'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <button
                type="button"
                onClick={confirmNewProspect}
                disabled={disabled || !parsed}
                style={{
                  background: parsed ? '#d97706' : 'transparent',
                  border: `1px solid ${parsed ? '#d97706' : 'var(--border-strong)'}`,
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 500,
                  color: parsed ? '#fff' : 'var(--text-tertiary)',
                  cursor: parsed && !disabled ? 'pointer' : 'not-allowed',
                }}
              >
                Use this domain
              </button>
              <button
                type="button"
                onClick={cancelNewProspect}
                disabled={disabled}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                Back to search
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10, lineHeight: 1.6 }}>
              The brief will say plainly that this account has no whitespace record. Seats,
              ARR and opportunity value will read as unknown rather than as zero.
            </div>
          </div>
        );
      })()}

      {newProspectName === null && open && (candidates.length > 0 || showNoMatch) && (
        <div
          id="account-search-list"
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 50,
            left: 0, right: 0,
            marginTop: 2,
            background: 'var(--bg-elevated, var(--bg-surface))',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            boxShadow: '0 10px 30px rgba(0,0,0,0.16)',
            overflow: 'hidden',
          }}
        >
          {tiedCount > 1 && (
            <div style={{
              padding: '8px 12px',
              fontSize: 11,
              color: 'var(--text-secondary)',
              background: 'rgba(234,179,8,0.10)',
              borderBottom: '1px solid var(--border)',
            }}>
              {tiedCount} accounts match this {results?.interpreted_as.kind === 'domain' ? 'domain' : 'name'} equally
              well — highest ARR first. Pick the one this brief is about.
            </div>
          )}

          <div ref={listRef} style={{ maxHeight: 320, overflowY: 'auto' }}>
            {candidates.map((c, i) => (
              <div
                key={c.account_id}
                data-idx={i}
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => { e.preventDefault(); select(c); }}
                style={{
                  padding: '9px 12px',
                  cursor: 'pointer',
                  background: i === highlight ? 'var(--bg-hover, rgba(127,127,127,0.10))' : 'transparent',
                  borderBottom: i === candidates.length - 1 ? 'none' : '1px solid var(--border)',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500, marginBottom: 2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {c.name}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--text-tertiary)',
                    display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                  }}>
                    {/* The ranking's top pick, not `primary_domain`. And a plain
                        count rather than "+N more" — the old wording implied the
                        first domain was the account's real one and the rest were
                        overflow, which is exactly the assumption being removed. */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Link size={10} />
                      {rankDomains(c.domains, c.name)[0]?.domain || 'no domain on record'}
                    </span>
                    {c.domains.length > 1 && <span>{c.domains.length} domains</span>}
                    <span>{c.sales_segment || '—'}</span>
                    <span>{c.region || '—'}</span>
                    <span style={{ opacity: 0.7 }}>{MATCH_LABEL[c.match]}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{formatMoney(c.arr)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>ARR</div>
                </div>
                {i === highlight && (
                  <Check size={14} style={{ marginTop: 3, color: 'var(--accent)', flexShrink: 0 }} />
                )}
              </div>
            ))}
          </div>

          {showNoMatch && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                No whitespace record for “{results!.query}”
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {results!.interpreted_as.kind === 'domain'
                  ? <>Nothing in the whitespace book owns <code>{results!.interpreted_as.apex}</code>. Try the company name, or a domain the account is more likely listed under.</>
                  : <>No account name matches. Try fewer words, a different spelling, or the company’s website domain.</>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, lineHeight: 1.6 }}>
                Only accounts currently in the whitespace book are searchable. A company
                Figma has no Salesforce account for will not appear here — that is the
                answer, not a search failure.
              </div>
              {allowNewProspect && (
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); startNewProspect(results!.query); }}
                  style={{
                    marginTop: 10,
                    background: 'transparent',
                    border: '1px solid #d97706',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    color: '#d97706',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  This is a new prospect — proceed without whitespace data
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
