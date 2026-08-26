/**
 * Links into Figma's Salesforce org.
 *
 * The account card holds a Salesforce account ID because the ID is the lock the
 * pipeline resolves whitespace by. It was rendered as raw mono text so it could
 * be copied and pasted into Salesforce by hand, which is a link with the last
 * step left to the reader.
 *
 * The host and the path shape were both established against the live org rather
 * than assumed, because a link to the wrong place is worse than an ID:
 *
 *   1. My Domain is `figma`. `User.FullPhotoUrl` on the signed-in user reads
 *      `https://figma.file.force.com/profilephoto/005/F` — the content subdomain
 *      is derived from My Domain, so the org's My Domain name is `figma`.
 *   2. `https://figma.lightning.force.com` is live and is a Lightning host. An
 *      unauthenticated GET of
 *      `/lightning/r/Account/0013u00001GP1HQAA1/view` answers 302 to
 *      `https://figma.my.salesforce.com/visualforce/session?url=<the same path,
 *      percent-encoded>` — the standard Lightning session bootstrap, which
 *      round-trips the full path and lands on the record after login.
 *
 * `/lightning/r/Account/<id>/view` and not the classic `/<id>`. Both resolve —
 * the bare-ID form 302s through the same bootstrap — but the classic form relies
 * on Salesforce's own redirect to work out the object, and the canonical
 * Lightning form does not.
 */

/**
 * The Lightning host for the org, per the probe above.
 *
 * Hardcoded rather than configured: there is one Salesforce org behind this
 * portal, its My Domain is not going to change without somebody noticing, and a
 * `VITE_` variable that nobody sets is a link that silently breaks.
 */
const LIGHTNING_HOST = 'https://figma.lightning.force.com';

/**
 * A Salesforce account ID, 15 or 18 characters.
 *
 * Both lengths appear in this data: `whitespace_accounts.account_id` carries
 * whatever the Sigma export held, and the two tables behind it disagree —
 * `accounts` is 15-char and `whitespace.Id` is 18. Salesforce accepts either in
 * a record URL, so both are linked and neither is widened here.
 *
 * `001` is the Account key prefix. Anchored on it deliberately: this builds
 * `/r/Account/` URLs, and an ID for some other object would produce a link to a
 * page that does not exist.
 */
const ACCOUNT_ID = /^001[A-Za-z0-9]{12}([A-Za-z0-9]{3})?$/;

/**
 * The Lightning record URL for an account, or null if the ID is not one.
 *
 * Null rather than a best-effort URL. The caller falls back to showing the raw
 * ID, which is what the card did before this existed — strictly better than a
 * link to a Salesforce error page.
 */
export function salesforceAccountUrl(accountId: string | null | undefined): string | null {
  const id = String(accountId ?? '').trim();
  if (!ACCOUNT_ID.test(id)) return null;
  return `${LIGHTNING_HOST}/lightning/r/Account/${id}/view`;
}
