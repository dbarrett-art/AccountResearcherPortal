/**
 * Order the domains an account holds, best first.
 *
 * The picker used to lock `domains[0]` — whichever domain came first out of the
 * `DOMAINS__C` cell, `is_primary` ahead of the rest. There is no logic in that
 * order and nothing showed the AE it had happened, so Toyota got
 * `mail.toyota.co.jp`, LVMH got `sephora.com`, and the Dutch government got the
 * tax office. 1,010 accounts lock a domain Salesforce does not consider theirs.
 *
 * That domain is what gets scraped, what the web research is built on, and what
 * contact discovery runs against, so this exists to make it a suggestion with a
 * stated reason rather than a side effect of comma order in a spreadsheet.
 *
 * A suggestion is all it is. Nothing here selects — the ranking decides which
 * option is pre-selected in the list and what reason sits next to it, and the
 * AE's confirm click is what chooses.
 *
 * There is a second copy, and it does select
 * ──────────────────────────────────────────
 * The unattended paths — batch-run.js, overnight-batch-rerun.mjs — resolve their
 * own accounts and have nobody to click, so a suggestion is not enough there.
 * They rank with prospect-research/src/utils/domain-rank.mjs, a deliberate port
 * of this file, and take its head as the answer. Ported rather than imported
 * because the two repos deploy separately, exactly as the Worker's copy of the
 * search normalisation is.
 *
 * CHANGE BOTH IN THE SAME COMMIT. prospect-research's
 * scripts/verify-account-search-parity.mjs imports THIS file directly, compares
 * every field of every ranked entry against the port over every active account in
 * the live book, and fails on a divergence — but only when somebody runs it.
 *
 * That import is why this file must stay erasable-syntax-only: Node strips the
 * types to load it, which `type` and `interface` survive and `enum` and
 * `namespace` do not. Adding either would silently take the gate offline.
 *
 * The rules
 * ─────────
 *   0. The domain Salesforce's own `Website` field points at. `entur.no` for
 *      "Entur AS" over `entur.org`.
 *   1. Apex beats subdomain WHEN BOTH ARE ON THE RECORD. `hsbc.com` over
 *      `noexternalmail.hsbc.com`.
 *   2. A domain label matching the account name. `nets.eu` for "Nets" over
 *      `nexigroup.com`.
 *   3. Otherwise the order they arrived in.
 *
 * Rule 0 exists because rules 1–3 cannot answer the case the feature was built
 * for. Entur AS holds `entur.org` and `entur.no`: both are apex, both match the
 * account name, so rule 1 and rule 2 both tie and it falls through to record
 * order — the exact assumption this is meant to remove. The advisory page check
 * cannot break the tie either; it returns "looks right" for both, with the same
 * reasoning, because both genuinely are Entur's sites. Only Salesforce's own
 * answer separates them, and it says `entur.no`.
 *
 * Rules 1 and 2 stay, unchanged, underneath it. `website` is null on plenty of
 * records and points at nothing on the record on plenty more, and in both cases
 * the ranking has to keep working exactly as it did.
 *
 * Why rule 0 is a HOST-RELATIONSHIP test and not an apex-equality one
 * ──────────────────────────────────────────────────────────────────
 * The brief calls it "apex matches apex", and computing an apex correctly needs a
 * public suffix list — `isbank.com.tr` apexes to `isbank.com.tr`, not `com.tr`,
 * and getting that wrong merges 40 unrelated Turkish companies into one bucket.
 * There are already three copies of that table (the pipeline, the Worker, and a
 * parity script gating the two) and a fourth living here, where nothing would
 * check it, is a worse trade than the one below.
 *
 * So rule 0 fires when the `Website` host, reduced to a bare host, is the same
 * as a domain on the record, or is a subdomain of it, or has it as a subdomain.
 * That is the same relative move rule 1 makes, and it needs no suffix list.
 *
 * It costs one case: a `Website` of `a.example.com` against a record holding
 * only `b.example.com` — siblings under a shared apex, related by neither
 * direction. Apex equality would fire there and this does not. Nothing in the
 * 1,010 sample looks like that, and the consequence when it happens is a fall
 * through to rules 1–3, which is where the ranking was before this rule existed.
 *
 * What is NOT done with `website`
 * ───────────────────────────────
 * It is never offered as an option. It is a Salesforce text field holding
 * whatever a human typed — `https://www.hsbc.com/`, `hsbc.com`, occasionally
 * something that is not a URL at all — and the radio list is every domain the
 * whitespace record actually holds, not that list plus a hearsay entry. If the
 * `Website` names a domain the record does not have, rule 0 simply does not
 * fire.
 */

export type DomainReason = 'salesforce_website' | 'apex' | 'name_match';

export interface RankedDomain {
  domain: string;
  /** Higher is better. Deterministic; see SCORE below. */
  score: number;
  /** Why this scored above the raw order. Empty means "no reason, just order". */
  reasons: DomainReason[];
  /** Position in the account's own domain list, which is the tiebreak. */
  original_index: number;
}

/**
 * Rule 0 dominates rule 1, which dominates rule 2.
 *
 * The weights are not decorative, and the two rule-0 tiers are the reason.
 *
 * A `Website` of `us.hsbc.com` against a record holding both `us.hsbc.com` and
 * `hsbc.com` satisfies rule 0 twice — one exactly, one as its parent. Salesforce
 * named the first, so the first has to win. Worst case for the named host is
 * EXACT with SHADOWED_BY_SIBLING and no name match; best case for the merely
 * related one is RELATED with APEX_OF_SIBLING and NAME_MATCH. So
 * EXACT - 2 > RELATED + 3, i.e. EXACT > RELATED + 5.
 *
 * RELATED in turn has to clear the best a non-rule-0 domain can score,
 * APEX_OF_SIBLING + NAME_MATCH (3), from the worst a rule-0 domain can start at,
 * SHADOWED_BY_SIBLING (-2). Anything over 5 does.
 *
 * 8 and 16 rather than 6 and 12, so a fourth rule does not silently land inside
 * a gap that was exactly wide enough and no wider.
 */
const SCORE = {
  /** Salesforce's `Website` IS this domain. */
  SALESFORCE_WEBSITE_EXACT: 16,
  /** Salesforce's `Website` is a subdomain of this domain, or vice versa. */
  SALESFORCE_WEBSITE_RELATED: 8,
  /** Some other domain on this record is a subdomain of this one. */
  APEX_OF_SIBLING: 2,
  /** Some other domain on this record is this one's parent. */
  SHADOWED_BY_SIBLING: -2,
  /** A label of this domain matches the account name. */
  NAME_MATCH: 1,
};

export const REASON_LABEL: Record<DomainReason, string> = {
  salesforce_website: 'Salesforce website',
  apex: 'apex domain',
  name_match: 'matches account name',
};

/**
 * Words dropped before a company name is compared to a domain label. Not a
 * general-purpose suffix list — just enough that "Nets A/S" compares as `nets`
 * and "HSBC Holdings plc" as `hsbc`.
 */
const CORPORATE_WORDS = new Set([
  'ltd', 'limited', 'inc', 'incorporated', 'corp', 'corporation', 'company',
  'holdings', 'holding', 'group', 'plc', 'llc', 'lp', 'llp', 'gmbh', 'ag', 'sa',
  'nv', 'bv', 'ab', 'as', 'oy', 'aps', 'spa', 'srl', 'sas', 'se', 'kk', 'pty',
  'co', 'the', 'and', 'of',
]);

/**
 * Labels never tested for a name match. The final label of a host is always
 * skipped, and these cover the second-level pieces of a compound public suffix
 * (`co.uk`, `com.tr`, `co.jp`) plus `www`.
 *
 * A short list rather than a public suffix list. A false negative here costs a
 * tiebreak; carrying a real PSL copy costs a fourth thing to keep in step.
 */
const NON_NAME_LABELS = new Set([
  'www', 'com', 'co', 'net', 'org', 'gov', 'govt', 'edu', 'ac', 'sch', 'mil',
  'or', 'ne', 'go', 'gr', 'gob', 'gouv', 'biz', 'info', 'nom', 'ind', 'web',
]);

/** Diacritics off, lowercase. Matches how the account name is spelled, not how
 *  it is folded in the book — this comparison never touches a stored column. */
function fold(s: string): string {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[łŁ]/g, 'l')
    .replace(/[đĐðÐ]/g, 'd')
    .toLowerCase();
}

/** The account name reduced to comparable pieces. */
function nameForms(accountName: string): { tokens: string[]; compact: string } {
  const tokens = fold(accountName)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 0 && !CORPORATE_WORDS.has(t));
  return { tokens, compact: tokens.join('') };
}

/** The labels of a host worth comparing to a company name. */
function nameableLabels(domain: string): string[] {
  const labels = domain.split('.');
  // The TLD is never a company name; the rest are, minus the compound-suffix
  // pieces and www.
  return labels.slice(0, -1).filter(l => l.length > 0 && !NON_NAME_LABELS.has(l));
}

/**
 * The bare host of a domain or of whatever is in Salesforce's `Website`.
 *
 * Scheme, credentials, port, path, query, fragment, a leading `www.` and a
 * trailing dot all come off; the rest is lowercased. Same normalisation the
 * record's own domains get, so the two sides of rule 0 are comparable.
 *
 * Returns '' for anything that is not shaped like a host — `Website` is free
 * text and holds phone numbers, "n/a", and bare company names often enough that
 * a garbage value has to read as "no website" rather than as a host that
 * matches nothing.
 */
export function bareHost(raw: string | null | undefined): string {
  let v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');   // scheme
  v = v.replace(/^[^/@]*@/, '');                  // user:pass@
  v = v.split(/[/?#]/)[0];                        // path, query, fragment
  v = v.replace(/:\d+$/, '');                     // port
  v = v.replace(/^www\./, '').replace(/\.$/, '');
  if (!v || /\s/.test(v)) return '';
  // label(.label)+ with an alphabetic TLD of two or more. `co.uk` and `com.tr`
  // pass as a matter of course; punycode passes as ordinary labels.
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(v)) return '';
  return v;
}

/**
 * How this domain relates to the host in Salesforce's `Website`.
 *
 * 'exact' when they are the same host, 'related' when one is a subdomain of the
 * other, null otherwise. See the header for why this is relative rather than an
 * apex comparison, and SCORE for why the two arms are not worth the same.
 */
export function websiteRelation(
  domain: string,
  websiteHost: string,
): 'exact' | 'related' | null {
  if (!domain || !websiteHost) return null;
  if (domain === websiteHost) return 'exact';
  if (websiteHost.endsWith(`.${domain}`)) return 'related';
  if (domain.endsWith(`.${websiteHost}`)) return 'related';
  return null;
}

/** Does rule 0 fire on this domain at all? */
export function matchesWebsite(domain: string, websiteHost: string): boolean {
  return websiteRelation(domain, websiteHost) !== null;
}

/**
 * Does any label of this domain look like this account's name?
 *
 * Exact on a token or on the whole name run together, or a prefix relationship
 * where the shorter side is at least four characters — which is what carries
 * `lvmh` for "LVMH Moët Hennessy Louis Vuitton" and `hsbcnet` for "HSBC".
 *
 * Loose enough to admit a false positive, and that is affordable: a name match
 * only ever reorders one account's own domains against each other, so the worst
 * case is a worse suggestion on a list the AE is already reading.
 */
export function labelMatchesName(domain: string, accountName: string): boolean {
  const { tokens, compact } = nameForms(accountName);
  if (!compact) return false;
  for (const label of nameableLabels(domain)) {
    if (tokens.includes(label)) return true;
    if (label === compact) return true;
    if (label.length >= 4 && compact.startsWith(label)) return true;
    if (compact.length >= 4 && label.startsWith(compact)) return true;
  }
  return false;
}

/**
 * Rank every domain on the record. Never drops one, never truncates: the AE has
 * to be able to see why the account matched, and a hidden option is the
 * "+N more" treatment this replaces.
 *
 * @param domains     every domain on the whitespace record
 * @param accountName the account's canonical name
 * @param website     Salesforce's `Website` for this account, as stored. Null,
 *                    absent or unparseable all mean the same thing: rule 0 does
 *                    not fire and rules 1–3 decide alone.
 */
export function rankDomains(
  domains: (string | null | undefined)[],
  accountName: string,
  website?: string | null,
): RankedDomain[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of domains || []) {
    const d = String(raw || '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    if (!d || seen.has(d)) continue;
    seen.add(d);
    clean.push(d);
  }

  const websiteHost = bareHost(website);

  return clean
    .map((domain, original_index) => {
      const reasons: DomainReason[] = [];
      let score = 0;

      const relation = websiteRelation(domain, websiteHost);
      if (relation) {
        score += relation === 'exact'
          ? SCORE.SALESFORCE_WEBSITE_EXACT
          : SCORE.SALESFORCE_WEBSITE_RELATED;
        reasons.push('salesforce_website');
      }

      const isParentOfSibling = clean.some(o => o !== domain && o.endsWith(`.${domain}`));
      const isChildOfSibling = clean.some(o => o !== domain && domain.endsWith(`.${o}`));

      // Only claimed when it actually beat something. A lone domain is not
      // "the apex domain" in any sense worth printing next to it — the label
      // has to mean "this one, rather than the subdomain below it".
      if (isParentOfSibling) {
        score += SCORE.APEX_OF_SIBLING;
        reasons.push('apex');
      }
      if (isChildOfSibling) score += SCORE.SHADOWED_BY_SIBLING;

      if (labelMatchesName(domain, accountName)) {
        score += SCORE.NAME_MATCH;
        reasons.push('name_match');
      }

      return { domain, score, reasons, original_index };
    })
    .sort((a, b) => (b.score - a.score) || (a.original_index - b.original_index));
}

/**
 * Human-readable reason for one option, or null when there is nothing to say.
 *
 * Capped at the strongest reason rather than joined. `Salesforce website · apex
 * domain · matches account name` is three claims where one settles it, and the
 * chip this lands in has one line to say it.
 */
export function reasonText(ranked: RankedDomain): string | null {
  if (!ranked.reasons.length) return null;
  if (ranked.reasons.includes('salesforce_website')) return REASON_LABEL.salesforce_website;
  return ranked.reasons.map(r => REASON_LABEL[r]).join(' · ');
}
