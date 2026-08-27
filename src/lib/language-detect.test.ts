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

describe('the re-detect rule', () => {
  // Extracted from the Submit effect so it can be asserted without a DOM. The
  // React test covers rendering and the survives-a-render case; this covers the
  // rule, which is where the mistakes are.
  test('nothing confirmed yet is English, attributed to nothing', () => {
    const s = initialLanguageState(null);
    expect(s).toEqual({ code: 'en', forDomain: null, iso: null, overridden: false });
  });

  test('a confirmed .no is Norwegian, attributed to the domain', () => {
    expect(initialLanguageState('entur.no'))
      .toEqual({ code: 'no', forDomain: 'entur.no', iso: 'no', overridden: false });
  });

  test('a confirmed .com is English, attributed to nothing', () => {
    // code 'en', iso null. The difference is the whole point: one is a
    // detection, the other is a default, and the hint says which.
    expect(initialLanguageState('keepit.com'))
      .toEqual({ code: 'en', forDomain: 'keepit.com', iso: null, overridden: false });
  });

  test('the same domain again changes nothing', () => {
    // Returns null rather than an equal object — a fresh identity every render
    // would loop the effect that calls this.
    const s = initialLanguageState('entur.no');
    expect(nextLanguageState(s, 'entur.no')).toBeNull();
  });

  test('an override against the current domain survives', () => {
    // The bug this pins: an earlier version cleared the gate on override, so the
    // effect re-ran immediately and put the detected language straight back. The
    // select could not be changed at all.
    const overridden = overrideLanguage(initialLanguageState('entur.no'), 'en');
    expect(overridden.code).toBe('en');
    expect(overridden.overridden).toBe(true);
    expect(nextLanguageState(overridden, 'entur.no')).toBeNull();
  });

  test('confirming a different domain discards the override', () => {
    // The domain is the input to the detection, so changing it invalidates the
    // output. The page says where the new value came from rather than moving it
    // silently.
    const overridden = overrideLanguage(initialLanguageState('keepit.com'), 'fr');
    const next = nextLanguageState(overridden, 'entur.no');
    expect(next).toEqual({ code: 'no', forDomain: 'entur.no', iso: 'no', overridden: false });
  });

  test('clearing the selection goes back to English and to no attribution', () => {
    const next = nextLanguageState(initialLanguageState('entur.no'), null);
    expect(next).toEqual({ code: 'en', forDomain: null, iso: null, overridden: false });
  });
});
