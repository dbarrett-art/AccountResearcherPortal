/**
 * Which language a brief is researched and written in, decided BEFORE the run.
 *
 * The bug this closes
 * ───────────────────
 * The TLD→language map lived only inside the pipeline's app.js, so the earliest
 * it could run was after the AE had pressed Run and the Opus call was already
 * paid for. There was no way to see what it picked, and therefore no way to
 * correct it.
 *
 * On the path that matters it never ran at all. This page's default was
 * "Auto-detect", which put `market: 'auto'` on the wire; the Worker's
 * isoToLanguageName turned 'auto' into 'english'; app.js then saw
 * `--home-language=english`, which is neither 'auto' nor empty, so its
 * detectLanguageFromUrl was skipped entirely. Measured across ~346 runs:
 * `runs.market` has never once held 'no', 'sv' or 'nl', and the 10 runs that do
 * hold 'auto' are every one of them a .com. The feature was decorative.
 *
 * So detection happens here now, the moment a domain is confirmed, filling a
 * select the AE can change before submitting. "Auto-detect" is gone from that
 * select: there is nothing left for it to mean once the answer is on screen, and
 * leaving it would put a second code path behind the same question.
 *
 * THREE COPIES, ON PURPOSE
 * ────────────────────────
 * This one, prospect-research/src/utils/language-detect.mjs (the pipeline), and
 * cloudflare-worker/src/language-detect.js (for callers that still send 'auto' —
 * batch runners, retry, re-dispatch). Same arrangement as domain-rank and the
 * account-search normalisation: three repos that deploy separately and cannot
 * import each other, and a twenty-line TLD map is not worth a package.
 *
 * CHANGE ALL THREE IN THE SAME COMMIT. prospect-research's
 * scripts/verify-language-detect-parity.mjs imports THIS file directly and
 * compares all three over the whole map and over every domain in the live
 * account book.
 *
 * That import is why this file must stay erasable-syntax-only: Node strips the
 * types to load it, which `type` and `interface` survive and `enum` and
 * `namespace` do not. Adding either would silently take the gate offline.
 */

/** Language name → ISO code. What `runs.market` stores and what the select holds. */
export const LANG_TO_ISO: Record<string, string> = {
  english: 'en', portuguese: 'pt', french: 'fr', german: 'de',
  swedish: 'sv', danish: 'da', finnish: 'fi', norwegian: 'no',
  dutch: 'nl', italian: 'it', spanish: 'es', korean: 'ko', japanese: 'ja',
};

/**
 * TLD → language.
 *
 * A country TLD is evidence about the audience, not proof — plenty of .de sites
 * are English-first — which is the whole reason the answer is now shown to a
 * person instead of acted on silently. Longest suffix wins, so '.co.jp' beats
 * '.jp'.
 *
 * '.com', '.io', '.eu' and every other generic are deliberately absent. A
 * generic TLD says nothing about language, and mapping it to English would make
 * "no signal" indistinguishable from "detected English" — which is exactly the
 * confusion that let the dead path go unnoticed.
 */
export const DOMAIN_LANGUAGE_MAP: Record<string, string> = {
  '.co.jp': 'japanese', '.jp': 'japanese',
  '.co.kr': 'korean', '.kr': 'korean',
  '.de': 'german', '.at': 'german',
  '.fr': 'french',
  '.es': 'spanish', '.mx': 'spanish',
  '.it': 'italian',
  '.nl': 'dutch', '.be': 'dutch',
  '.pt': 'portuguese', '.br': 'portuguese',
  '.se': 'swedish',
  '.no': 'norwegian',
  '.dk': 'danish',
  '.fi': 'finnish',
};

const SUFFIXES_LONGEST_FIRST = Object.keys(DOMAIN_LANGUAGE_MAP)
  .sort((a, b) => b.length - a.length);

/**
 * The language a URL or bare domain implies, or null when nothing does.
 *
 * null is a real answer and must not be collapsed into 'english'. "This domain
 * tells us nothing" and "this domain is English-speaking" are different facts,
 * and the caller decides what to do with the first — visibly, in one place.
 */
export function detectLanguageFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let hostname: string;
  try {
    hostname = new URL(String(url).startsWith('http') ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
  hostname = hostname.toLowerCase().replace(/\.$/, '');
  for (const tld of SUFFIXES_LONGEST_FIRST) {
    if (hostname.endsWith(tld)) return DOMAIN_LANGUAGE_MAP[tld];
  }
  return null;
}

/** The same answer as the ISO code the select and `runs.market` speak. */
export function detectIsoFromUrl(url: string | null | undefined): string | null {
  const lang = detectLanguageFromUrl(url);
  return lang ? (LANG_TO_ISO[lang] ?? null) : null;
}

/**
 * The ISO code to put in the select for a confirmed domain.
 *
 * 'en' when nothing is detected — the select must always hold a real language,
 * because there is no 'auto' option any more. Distinguishing "detected English"
 * from "detected nothing, defaulted to English" is the caller's job and is what
 * the hint line under the select is for; use detectIsoFromUrl for that.
 */
export function languageForDomain(domain: string | null | undefined): string {
  return detectIsoFromUrl(domain) ?? 'en';
}

/**
 * The languages the select offers, in display order.
 *
 * One list, because there were two and they had both drifted: Submit's picker
 * and SubmitConfirmation's label map were each missing Danish and Finnish, while
 * '.dk' and '.fi' have been in the detection map and in the pipeline's supported
 * set the whole time. Detecting a language the picker cannot render would leave
 * the select showing nothing at all, which is a worse failure than the one this
 * change set out to fix.
 *
 * No 'auto' entry. Detection has already run by the time this list is shown, and
 * a value meaning "decide later" would be a second code path behind a question
 * that is already answered on screen.
 *
 * A test asserts this covers every language in LANG_TO_ISO, so adding one to the
 * map without adding it here fails rather than rendering blank.
 */
export const LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string; flag: string }> = [
  { code: 'en', label: 'English',    flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'de', label: 'German',     flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'fr', label: 'French',     flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'es', label: 'Spanish',    flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'it', label: 'Italian',    flag: '\u{1F1EE}\u{1F1F9}' },
  { code: 'nl', label: 'Dutch',      flag: '\u{1F1F3}\u{1F1F1}' },
  { code: 'pt', label: 'Portuguese', flag: '\u{1F1F5}\u{1F1F9}' },
  { code: 'ja', label: 'Japanese',   flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'ko', label: 'Korean',     flag: '\u{1F1F0}\u{1F1F7}' },
  { code: 'sv', label: 'Swedish',    flag: '\u{1F1F8}\u{1F1EA}' },
  { code: 'no', label: 'Norwegian',  flag: '\u{1F1F3}\u{1F1F4}' },
  { code: 'da', label: 'Danish',     flag: '\u{1F1E9}\u{1F1F0}' },
  { code: 'fi', label: 'Finnish',    flag: '\u{1F1EB}\u{1F1EE}' },
];

/**
 * ISO code → display label, including 'auto' for run rows written before the
 * select stopped offering it. 346 runs already hold that value and a brief page
 * that renders a raw 'auto' next to a language name reads like a bug.
 */
export const LANGUAGE_LABEL: Record<string, string> = {
  auto: 'Auto-detect',
  ...Object.fromEntries(LANGUAGE_OPTIONS.map(o => [o.code, o.label])),
};

/**
 * What the language field holds, and where the value came from.
 *
 * `code` is what goes on the wire. The other three exist so the page can say
 * something true about `code` rather than just showing it:
 *
 *   forDomain  the confirmed domain the detection has already been run for. The
 *              gate — detection fires when the domain differs from this, i.e.
 *              once per domain rather than once per render.
 *   iso        what that detection found, or null if the domain implied nothing.
 *              Kept apart from `code`, which falls back to English, so
 *              "detected English" and "told us nothing" stay distinguishable.
 *              Collapsing those two is what let the dead auto-detect path go
 *              unnoticed.
 *   overridden the AE set it by hand since the last detection.
 */
export interface LanguageState {
  code: string;
  forDomain: string | null;
  iso: string | null;
  overridden: boolean;
}

/** The state for a page that has not seen a confirmed domain yet. */
export function initialLanguageState(confirmedDomain: string | null): LanguageState {
  const iso = detectIsoFromUrl(confirmedDomain);
  return { code: iso ?? 'en', forDomain: confirmedDomain, iso, overridden: false };
}

/**
 * Re-detect for a newly confirmed domain, or leave the state alone.
 *
 * Returns null when nothing should change, which is the common case — the same
 * domain on every render. Returning the same object instead would be a new
 * object identity each time and would loop the effect that calls this.
 *
 * A new domain DISCARDS an override made against the old one. That is the right
 * way round: the domain is the input to the detection, so changing it
 * invalidates the output. The page says where the new value came from rather
 * than moving it silently.
 *
 * An override against the CURRENT domain survives, because the gate is already
 * satisfied and this returns null. An earlier version cleared `forDomain` on
 * override, so this re-ran immediately and put the detected language straight
 * back — the select could not be changed at all.
 */
export function nextLanguageState(prev: LanguageState, confirmedDomain: string | null): LanguageState | null {
  if (confirmedDomain === prev.forDomain) return null;
  return initialLanguageState(confirmedDomain);
}

/** The AE typed it. Same value, no longer attributable to a detection. */
export function overrideLanguage(prev: LanguageState, code: string): LanguageState {
  return { ...prev, code, overridden: true };
}
