/**
 * How an account's fields read on screen.
 *
 * Split out of AccountSearch because the confirmation card and the preview
 * page's "what happens next" summary both need them, and a component file that
 * also exports helpers takes Fast Refresh offline for the whole module.
 *
 * The one rule worth stating at the top: **null is not zero.** Of the 20,963
 * active accounts in the whitespace book, `employees` is null on 1,251 and
 * `total_whitespace` on 3,026, while `full_seats` is genuinely zero on 16,116.
 * Rendering all of those as `0` would tell an AE that Figma has measured an
 * account and found no room in it, when in fact nobody has measured it — which is
 * the same conflation the whole whitespace-state work exists to undo. So every
 * formatter here returns an em dash for null and a real figure for zero.
 */

const EM_DASH = '\u2014';

export function formatMoney(v: number | null | undefined): string {
  if (v == null) return EM_DASH;
  const n = Number(v);
  if (!Number.isFinite(n)) return EM_DASH;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** A plain count. `—` for null, `0` for zero. See the note above. */
export function formatCount(v: number | null | undefined): string {
  if (v == null) return EM_DASH;
  const n = Number(v);
  if (!Number.isFinite(n)) return EM_DASH;
  return n.toLocaleString();
}

/**
 * The load date, as a date and not a timestamp.
 *
 * This is the answer to "why does this differ from what I see in Salesforce",
 * which is the question the account card exists to pre-empt. `loaded_at` is when
 * the load that wrote THIS row ran, so it is read off the row rather than
 * written down anywhere — a hardcoded date is wrong the morning after the next
 * load.
 */
export function formatLoadDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Strip a trailing legal suffix, for display only.
 *
 * Feeds the verdict chip, which reads "Entur's site" rather than "Entur AS's
 * site". Nothing matches, ranks or searches on the result — `normaliseName` in
 * the Worker's account-search.js is what does that, and this is deliberately not
 * a second copy of it. It is a possessive in a chip, and the cost of getting it
 * wrong is an awkward label, not a brief about the wrong company.
 */
const LEGAL_SUFFIX = /[\s,]+(a\/s|as|ab|asa|oyj|aps|bv|nv|sa|se|ag|gmbh|plc|ltd|limited|inc|llc|corp|co|group|holdings|pte|kk)\.?$/i;

export function displayName(name: string): string {
  const trimmed = String(name || '').trim();
  const stripped = trimmed.replace(LEGAL_SUFFIX, '').trim();
  // Never strip to nothing: "AS", "Co" and "Group" are real account names.
  return stripped.length >= 2 ? stripped : trimmed;
}

/** `Entur` -> `Entur's`, `Nets` -> `Nets'`. */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}\u2019` : `${name}\u2019s`;
}
