/**
 * The TLD map, and the two guarantees the select depends on.
 *
 * The three-repo parity is checked separately and against the live book by
 * prospect-research/scripts/verify-language-detect-parity.mjs. What is asserted
 * here is what this repo alone can be wrong about: that the map answers
 * correctly, that null stays null, and that every language the map can produce
 * is one the select can actually render.
 */

import { describe, test, expect } from 'vitest';
import {
  detectLanguageFromUrl, detectIsoFromUrl, languageForDomain,
  DOMAIN_LANGUAGE_MAP, LANG_TO_ISO, LANGUAGE_OPTIONS, LANGUAGE_LABEL,
  initialLanguageState, nextLanguageState, overrideLanguage,
  acceptSuggestion, declineSuggestion,
} from './language-detect';

describe('detection', () => {
  const CASES: Array<[string, string | null]> = [
    ['https://entur.no', 'norwegian'],
    ['entur.no', 'norwegian'],
    ['www.entur.no', 'norwegian'],
    ['https://www.lufthansa.de/de/en', 'german'],
    ['keepit.com', null],
    ['bbc.co.uk', null],
    ['ossur.com', null],
    ['', null],
  ];
  for (const [input, expected] of CASES) {
    test(`${input || '(empty)'} → ${expected}`, () => {
      expect(detectLanguageFromUrl(input)).toBe(expected);
    });
  }

  test('the longest suffix wins — .co.jp is not .jp by accident', () => {
    // Both map to japanese today, so the assertion is on the SUFFIX chosen, not
    // the answer. A future '.co.uk' entry under a '.uk' one would be a real
    // divergence and this is the rule that prevents it.
    const suffixes = Object.keys(DOMAIN_LANGUAGE_MAP);
    for (const a of suffixes) {
      for (const b of suffixes) {
        if (a !== b && a.endsWith(b)) {
          expect(a.length).toBeGreaterThan(b.length);
          expect(detectLanguageFromUrl(`example${a}`)).toBe(DOMAIN_LANGUAGE_MAP[a]);
        }
      }
    }
  });

  test('a trailing dot and mixed case are the same host', () => {
    expect(detectLanguageFromUrl('ENTUR.NO.')).toBe('norwegian');
  });

  test('generic TLDs are absent on purpose', () => {
    // Mapping .com to English would make "no signal" indistinguishable from
    // "detected English", which is the confusion that let the dead auto-detect
    // path go unnoticed for months.
    for (const generic of ['.com', '.io', '.eu', '.net', '.org', '.ai', '.co']) {
      expect(Object.keys(DOMAIN_LANGUAGE_MAP)).not.toContain(generic);
    }
  });

  test('null is preserved through the ISO conversion, and only defaulted deliberately', () => {
    expect(detectIsoFromUrl('keepit.com')).toBeNull();
    // languageForDomain is the one that defaults, because the select must always
    // hold a real language. The two are separate so the hint line can tell
    // "detected English" from "defaulted to English".
    expect(languageForDomain('keepit.com')).toBe('en');
    expect(languageForDomain('entur.no')).toBe('no');
    expect(languageForDomain(null)).toBe('en');
  });
});

describe('the select can render anything the map produces', () => {
  test('every detectable language has an ISO code and an option', () => {
    const offered = new Set(LANGUAGE_OPTIONS.map(o => o.code));
    for (const lang of new Set(Object.values(DOMAIN_LANGUAGE_MAP))) {
      const iso = LANG_TO_ISO[lang];
      expect(iso, `${lang} has no ISO code`).toBeTruthy();
      expect(offered.has(iso), `${lang} (${iso}) is detectable but not offered`).toBe(true);
    }
  });

  test('Danish and Finnish specifically', () => {
    // The regression this catches. '.dk' and '.fi' were in the map and in the
    // pipeline's supported list, and neither the picker nor the confirmation
    // could display them — 259 Danish and 159 Finnish domains in the live book,
    // any of which would have left the select rendering blank.
    expect(detectIsoFromUrl('novonordisk.dk')).toBe('da');
    expect(detectIsoFromUrl('elisa.fi')).toBe('fi');
    expect(LANGUAGE_OPTIONS.map(o => o.code)).toContain('da');
    expect(LANGUAGE_OPTIONS.map(o => o.code)).toContain('fi');
  });

  test('every option is a real ISO code', () => {
    const codes = new Set(Object.values(LANG_TO_ISO));
    for (const o of LANGUAGE_OPTIONS) expect(codes.has(o.code), o.code).toBe(true);
  });

  test('no auto option — detection has already run by the time this is shown', () => {
    expect(LANGUAGE_OPTIONS.map(o => o.code)).not.toContain('auto');
  });

  test('the label map still covers auto, for run rows written before it went', () => {
    // ~346 runs already hold market='auto'. A brief page rendering a raw 'auto'
    // next to a language name reads like a bug.
    expect(LANGUAGE_LABEL.auto).toBe('Auto-detect');
    for (const o of LANGUAGE_OPTIONS) expect(LANGUAGE_LABEL[o.code]).toBe(o.label);
  });
});

describe('the suggest-then-confirm rule', () => {
  // Extracted from the Submit effect so it can be asserted without a DOM. The
  // React test covers the buttons and the copy; this covers the rule, which is
  // where the mistakes are.

  test('nothing confirmed yet is English, with nothing to answer', () => {
    expect(initialLanguageState(null))
      .toEqual({ code: 'en', forDomain: null, detected: null, decision: 'none' });
  });

  test('a confirmed .no SUGGESTS Norwegian and stays English', () => {
    // The heart of it. Detection does not change the language; it raises a
    // question. --home-language drives the research pass and the output, so
    // switching silently means the whole brief comes back in Norwegian on the
    // strength of a TLD.
    expect(initialLanguageState('entur.no'))
      .toEqual({ code: 'en', forDomain: 'entur.no', detected: 'no', decision: 'pending' });
  });

  test('a confirmed .com is English with nothing to answer', () => {
    expect(initialLanguageState('keepit.com'))
      .toEqual({ code: 'en', forDomain: 'keepit.com', detected: null, decision: 'none' });
  });

  test('accepting is the only path from a detection to a language', () => {
    const accepted = acceptSuggestion(initialLanguageState('entur.no'));
    expect(accepted.code).toBe('no');
    expect(accepted.decision).toBe('accepted');
  });

  test('declining leaves English, and remembers what was offered', () => {
    // Recorded rather than dismissed: "English, though entur.no suggests
    // Norwegian" stays readable, and the prompt does not reappear next render.
    const declined = declineSuggestion(initialLanguageState('entur.no'));
    expect(declined.code).toBe('en');
    expect(declined.detected).toBe('no');
    expect(declined.decision).toBe('declined');
  });

  test('accept and decline only act on an open question', () => {
    const declined = declineSuggestion(initialLanguageState('entur.no'));
    expect(acceptSuggestion(declined)).toBe(declined);
    const settled = initialLanguageState('keepit.com');
    expect(acceptSuggestion(settled)).toBe(settled);
    expect(declineSuggestion(settled)).toBe(settled);
  });

  test('the same domain again changes nothing', () => {
    // Returns null rather than an equal object — a fresh identity every render
    // would loop the effect that calls this, and would resurrect a dismissed
    // prompt on every keystroke elsewhere on the page.
    expect(nextLanguageState(initialLanguageState('entur.no'), 'entur.no')).toBeNull();
    expect(nextLanguageState(declineSuggestion(initialLanguageState('entur.no')), 'entur.no')).toBeNull();
    expect(nextLanguageState(acceptSuggestion(initialLanguageState('entur.no')), 'entur.no')).toBeNull();
  });

  test('an answer against the current domain survives', () => {
    // The bug this pins: an earlier version cleared the gate on override, so the
    // effect re-ran immediately and put the detected language straight back. The
    // select could not be changed at all.
    const overridden = overrideLanguage(initialLanguageState('entur.no'), 'de');
    expect(overridden.code).toBe('de');
    expect(overridden.decision).toBe('none');
    expect(nextLanguageState(overridden, 'entur.no')).toBeNull();
  });

  test('confirming a different domain asks again, discarding the answer', () => {
    // The domain is what the detection reads, so changing it invalidates the
    // answer — including an accepted one. An AE who accepted Norwegian for
    // entur.no and then confirmed a .de is asked about German rather than
    // silently kept on Norwegian.
    const accepted = acceptSuggestion(initialLanguageState('entur.no'));
    expect(nextLanguageState(accepted, 'lufthansa.de'))
      .toEqual({ code: 'en', forDomain: 'lufthansa.de', detected: 'de', decision: 'pending' });
  });

  test('clearing the selection goes back to English with nothing pending', () => {
    const accepted = acceptSuggestion(initialLanguageState('entur.no'));
    expect(nextLanguageState(accepted, null))
      .toEqual({ code: 'en', forDomain: null, detected: null, decision: 'none' });
  });

  test('a language is never changed without an explicit act', () => {
    // The property, stated once. Every transition that does not involve the AE
    // leaves `code` at 'en'.
    for (const domain of ['entur.no', 'lufthansa.de', 'sony.co.jp', 'keepit.com', null]) {
      expect(initialLanguageState(domain).code).toBe('en');
      expect(nextLanguageState(initialLanguageState('other.example'), domain)?.code).toBe('en');
    }
  });
});
