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
 * The two rules
 * ─────────────
 *   1. Apex beats subdomain WHEN BOTH ARE ON THE RECORD. `hsbc.com` over
 *      `noexternalmail.hsbc.com`.
 *   2. A domain label matching the account name. `nets.eu` for "Nets" over
 *      `nexigroup.com`.
 *   3. Otherwise the order they arrived in.
 *
 * Rule 1 is deliberately relative — a domain is only demoted as a subdomain if
 * some OTHER domain on the same record is its parent. That needs no public
 * suffix list, which matters: the alternative is a third copy of the
 * `apexDomain` table (the pipeline has one, the Worker mirrors it, and there is
 * a parity script gating the two) living in the portal, where nothing would
 * check it. The cost of staying relative is that a record holding only
 * `mail.toyota.co.jp` cannot be helped by ranking at all — no rule can see that
 * a lone domain is a mail host. That case is exactly what the advisory page
 * check is for.
 *
 * Salesforce's own `Website` field would settle most of this outright, and is
 * not available: the whitespace Sigma table has no `WEBSITE` column — only
 * `DOMAINS__C` and `DOMAIN_COUNT`. Getting it means joining the workbook to
 * `CLEANED_SALESFORCE_ACCOUNT`, which is separate work. Nothing here references
 * or approximates it.
 */

export type DomainReason = 'apex' | 'name_match';

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
 * Rule 1 dominates rule 2, so the apex weight has to exceed the name weight;
 * anything else and a name-matching subdomain would beat its own parent.
 */
const SCORE = {
  /** Some other domain on this record is a subdomain of this one. */
  APEX_OF_SIBLING: 2,
  /** Some other domain on this record is this one's parent. */
  SHADOWED_BY_SIBLING: -2,
  /** A label of this domain matches the account name. */
  NAME_MATCH: 1,
};

export const REASON_LABEL: Record<DomainReason, string> = {
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
 */
export function rankDomains(domains: (string | null | undefined)[], accountName: string): RankedDomain[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of domains || []) {
    const d = String(raw || '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    if (!d || seen.has(d)) continue;
    seen.add(d);
    clean.push(d);
  }

  return clean
    .map((domain, original_index) => {
      const reasons: DomainReason[] = [];
      let score = 0;

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

/** Human-readable reason for one option, or null when there is nothing to say. */
export function reasonText(ranked: RankedDomain): string | null {
  if (!ranked.reasons.length) return null;
  return ranked.reasons.map(r => REASON_LABEL[r]).join(' · ');
}
