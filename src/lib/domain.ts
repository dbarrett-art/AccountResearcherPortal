/**
 * Read a domain out of what somebody typed.
 *
 * Deliberately shallow. It strips a scheme, a path, a query, a trailing dot and a
 * leading `www.`, lowercases, and then checks the shape. That is reading the input,
 * not guessing at it — the distinction that matters here is that nothing is
 * consulted: no whitespace book, no DNS, no suggestion list. If the system does
 * not know the account it has no business inventing the domain, and a check that
 * "helpfully" corrected a typo would be doing exactly that.
 *
 * So a well-formed domain for a company that does not exist passes. That is
 * correct: the person typing is the authority on their own prospect, and the only
 * failure this can catch is a mistyped shape.
 *
 * @returns the normalised domain, or null if it is not shaped like one
 */
export function parseDomainInput(raw: string): string | null {
  let v = (raw || '').trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');   // scheme
  v = v.split(/[/?#]/)[0];                        // path, query, fragment
  v = v.replace(/^www\./, '').replace(/\.$/, '');  // www., trailing dot
  if (!v || v.includes('@') || /\s/.test(v)) return null;
  // label(.label)+ with an alphabetic TLD of two or more. Covers co.uk and
  // com.tr as a matter of course; punycode (xn--…) passes as ordinary labels.
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(v)) return null;
  if (v.length > 253) return null;
  return v;
}
