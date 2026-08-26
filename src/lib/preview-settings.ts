/**
 * Settings for the preview routes, read from localStorage.
 *
 * One key, one default, one place. The domain check used to be a checkbox on
 * /preview/account-search itself, which made sense while the question under
 * review was "does this annotation earn its place" — you answered it by turning
 * it off and on over one account.
 *
 * It is now on by default, so the switch is no longer part of the thing being
 * reviewed; it is an off-ramp. It moved to Admin → Preview rather than being
 * deleted, because if the check starts producing noise — a run of `couldn't
 * check` on a bad afternoon for some CDN, a verdict that reads as a red flag on
 * a domain that is fine — it has to be possible to turn it off without a deploy.
 *
 * Why localStorage and not a table
 * ────────────────────────────────
 * Deliberate, and its limit is worth stating: this is per browser, not per org.
 * /preview/account-search needs the `admin` role and of 194 users exactly one
 * account has it, so the set of people who can see the switch's effect is the
 * set of people who can reach the page — one. A settings table plus a Worker
 * endpoint would be the right answer for a flag that gates the Submit page, and
 * that is the task that wires this component into Submit, not this one.
 *
 * ThemeContext is the existing precedent for a portal preference living here.
 */

const PREFIX = 'm4s.preview.';

export const DOMAIN_CHECK_KEY = `${PREFIX}domainCheck`;

/**
 * On. The domain being wrong is the failure the confirmation step exists to
 * catch, and an opt-in check is one nobody opts into.
 */
export const DOMAIN_CHECK_DEFAULT = true;

/** Reads the stored value, or the default when nothing has been stored. */
export function getDomainCheck(): boolean {
  try {
    const raw = localStorage.getItem(DOMAIN_CHECK_KEY);
    if (raw === null) return DOMAIN_CHECK_DEFAULT;
    return raw === 'true';
  } catch {
    // Private-mode Safari throws on localStorage access. A setting that cannot
    // be read is not a setting that is off.
    return DOMAIN_CHECK_DEFAULT;
  }
}

export function setDomainCheck(on: boolean): void {
  try {
    localStorage.setItem(DOMAIN_CHECK_KEY, String(on));
  } catch {
    /* nothing to do — the page still works, it just will not remember */
  }
}
