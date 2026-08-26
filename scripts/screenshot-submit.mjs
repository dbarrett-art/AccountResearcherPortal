/**
 * Capture Submit in the states the cutover has to be signed off in.
 *
 * Drives the dev-only harness at /AccountResearcherPortal/harness/?page=submit,
 * which renders the REAL `SubmitBody` — the same component tree that ships —
 * against a stub fetcher, a stub `ae` profile and fixture verdicts. Nothing here
 * can dispatch a run: there is no /submit route on the stub fetcher and no real
 * session behind it.
 *
 * Fixtures rather than the live page, for the reasons the domain-confirm shots use
 * them and one more. The first two: /preview/account-search needs the admin role
 * and one of 194 accounts has it, and the number of domains an account holds — the
 * variable these images turn on — depends on what the loader put in the book that
 * morning. The third is specific to this page: driving the real Submit through a
 * browser to take a screenshot means either not pressing the button, which is the
 * uninteresting half, or pressing it, which spends a credit and dispatches a real
 * pipeline run per shot.
 *
 * Puppeteer is resolved out of the prospect-research repo rather than added to
 * this one — the portal ships to GitHub Pages and has no other use for a headless
 * browser.
 *
 *   node scripts/screenshot-submit.mjs [--out DIR] [--base URL]
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
const OUT = resolve(flag('out', 'screenshots/submit-cutover'));

/**
 * The four states the cutover is verified in, plus the two that carry the
 * decisions this task had to make.
 *
 * `empty` is the state an AE opens the page in, and it is where the submit gate is
 * most worth seeing: the button is dimmed and the reason is printed under it,
 * because a dimmed control with nothing beside it reads as a broken page.
 *
 * `unconfirmed` is the state that must not be submittable — the account is
 * settled, the domain is not. Entur, because both its domains pass the advisory
 * check, so neither carries a chip and the descriptions are the only thing telling
 * them apart. `one` is the same state on an account holding exactly ONE domain,
 * which is the shot that proves nothing auto-confirmed.
 *
 * `confirmed` is submittable: green chip, button live, no reason line.
 *
 * `prospect` is the net-new path — no Salesforce record, a hand-typed domain,
 * amber throughout — and it is submittable, which is the point of keeping it.
 *
 * `typed` is the state added by this task: Roblox, one of the 567 active accounts
 * the book holds with no domain at all. It used to be a dead end telling the AE to
 * pick a different account. The account stays locked and the domain is typed, so
 * the card carries Roblox's own record while the chip admits the domain did not
 * come from it.
 */
const SHOTS = [
  { name: 'empty',       fixture: 'search' },
  { name: 'unconfirmed', fixture: 'two' },
  { name: 'unconfirmed-single-domain', fixture: 'one' },
  { name: 'confirmed',   fixture: 'two',  confirmed: true },
  { name: 'prospect',    fixture: 'prospect' },
  { name: 'no-domain-dead-end', fixture: 'none' },
  { name: 'no-domain-typed',    fixture: 'none', typed: true },
];

/**
 * Dark first, and not as a formality. `--bg-app: #0f0f0f` is the `:root` value and
 * light is the `[data-theme="light"]` override, so dark is what the app is and
 * light is the variant.
 */
const THEMES = ['dark', 'light'];

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
      url.searchParams.set('page', 'submit');
      url.searchParams.set('fixture', shot.fixture);
      url.searchParams.set('theme', theme);
      if (shot.confirmed) url.searchParams.set('confirmed', '1');
      if (shot.typed) url.searchParams.set('typed', '1');
      url.searchParams.set('haiku', '1');

      await page.goto(url.href, { waitUntil: 'networkidle0' });

      // Fonts and the advisory annotations settle a frame or two after the first
      // paint; without this the light and dark pairs disagree on line wrapping.
      await new Promise(r => setTimeout(r, 400));

      const file = `${OUT}/${shot.name}_${theme}.png`;
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
