/**
 * Capture the domain confirmation states for sign-off.
 *
 * Drives the dev-only harness at /AccountResearcherPortal/harness/, which renders
 * the real preview page body against fixtures. Fixtures rather than the live
 * endpoint for two reasons: /preview/account-search needs the admin role and
 * exactly one of 194 accounts has it, and the number of domains an account holds
 * — the variable these images exist to show — depends on what the whitespace
 * loader put in the book that morning.
 *
 * Puppeteer is resolved out of the prospect-research repo rather than added to
 * this one. The portal ships to GitHub Pages and has no other use for a
 * headless browser; a screenshot script is not a reason to put one in its
 * dependency tree.
 *
 *   node scripts/screenshot-domain-confirm.mjs [--out DIR] [--base URL]
 *
 * Expects `npm run dev` to already be serving. Prints one line per capture.
 */

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PUPPETEER_HOST = '/Users/dbarrett/M4S/prospect-research';
const require = createRequire(`${PUPPETEER_HOST}/package.json`);
const puppeteer = require('puppeteer');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = flag('base', 'http://localhost:5173/AccountResearcherPortal/harness/');
const OUT = resolve(flag('out', 'screenshots/domain-confirm'));

/**
 * The matrix the sign-off asks for: one, two and five domains, each unconfirmed
 * and confirmed, with the advisory check off and on — plus the two states that
 * only exist at the edges (an account holding no domain, and the candidate
 * dropdown, whose "+N more" wording changed).
 *
 * `confirmed` shots are captured with the check off: once the domain is
 * confirmed the annotation is gone from the screen, so a confirmed × haiku
 * variant would be the same image twice.
 */
const SHOTS = [
  { fixture: 'one',    confirmed: false, haiku: false },
  { fixture: 'one',    confirmed: false, haiku: true },
  { fixture: 'one',    confirmed: true,  haiku: false },
  { fixture: 'two',    confirmed: false, haiku: false },
  { fixture: 'two',    confirmed: false, haiku: true },
  { fixture: 'two',    confirmed: true,  haiku: false },
  { fixture: 'five',   confirmed: false, haiku: false },
  { fixture: 'five',   confirmed: false, haiku: true },
  { fixture: 'five',   confirmed: true,  haiku: false },
  { fixture: 'none',   confirmed: false, haiku: false },
  { fixture: 'search', confirmed: false, haiku: false, type: 'hsbc' },
];

const THEMES = ['light', 'dark'];

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});

let captured = 0;
try {
  for (const theme of THEMES) {
    for (const shot of SHOTS) {
      const page = await browser.newPage();
      await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 2 });

      const url = new URL(BASE);
      url.searchParams.set('fixture', shot.fixture);
      url.searchParams.set('theme', theme);
      if (shot.confirmed) url.searchParams.set('confirmed', '1');
      if (shot.haiku) url.searchParams.set('haiku', '1');

      await page.goto(url.href, { waitUntil: 'networkidle0' });

      // The dropdown only exists while something is typed, so that one shot has
      // to go through the field rather than through a seeded selection.
      if (shot.type) {
        await page.type('input[role="combobox"]', shot.type, { delay: 20 });
        await page.waitForSelector('[role="listbox"]', { timeout: 5000 });
      }

      // Fonts settle a frame or two after the annotations paint; without this the
      // light and dark pairs disagree on line wrapping.
      await new Promise(r => setTimeout(r, 350));

      const parts = [
        shot.fixture,
        shot.confirmed ? 'confirmed' : 'unconfirmed',
        shot.haiku ? 'check-on' : 'check-off',
        theme,
      ];
      const file = `${OUT}/${parts.join('_')}.png`;
      await page.screenshot({ path: file, fullPage: true });
      await page.close();
      captured++;
      console.log(`  ${file.replace(`${OUT}/`, '')}`);
    }
  }
} finally {
  await browser.close();
}

console.log(`\n${captured} screenshots -> ${OUT}`);
