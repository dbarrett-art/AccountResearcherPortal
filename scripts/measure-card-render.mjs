/**
 * How long the card takes to appear, and whether it waits for the domain check.
 *
 * The claim the card is built on now that the check is on by default: "the card
 * and the domain list render immediately, with a `checking…` state per row that
 * resolves in place, and it never blocks selection or confirmation." That is two
 * measurable things, and this measures both against the real component:
 *
 *   1. click a candidate -> the domain list is on screen. The synchronous half.
 *   2. click a candidate -> every verdict chip has settled. The async half.
 *
 * Driven through the dev harness, whose stub fetcher answers /domain-check after
 * a delay passed on the query string. The delay is the only synthetic part, and
 * it is set from the real figure measured by the Worker repo's
 * scripts/measure-domain-check-latency.mjs — 1.2-1.8s for five domains in
 * parallel. What is being tested here is the SHAPE (does 1 wait for 2), which a
 * stub can answer honestly; the magnitude comes from the other script.
 *
 *   node scripts/measure-card-render.mjs [--delay 1400] [--reps 5]
 *
 * Expects `npm run dev` to be serving.
 */

import { createRequire } from 'node:module';

const PUPPETEER_HOST = '/Users/dbarrett/M4S/prospect-research';
const require = createRequire(`${PUPPETEER_HOST}/package.json`);
const puppeteer = require('puppeteer');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = flag('base', 'http://localhost:5173/AccountResearcherPortal/harness/');
const DELAY = parseInt(flag('delay', '1400'), 10);
const REPS = parseInt(flag('reps', '5'), 10);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const renders = [];
const settles = [];

try {
  for (let rep = 0; rep < REPS; rep++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1100 });
    const url = new URL(BASE);
    url.searchParams.set('fixture', 'search');
    url.searchParams.set('theme', 'dark');
    url.searchParams.set('checkDelay', String(DELAY));
    await page.goto(url.href, { waitUntil: 'networkidle0' });

    await page.type('input[role="combobox"]', 'hsbc', { delay: 10 });
    await page.waitForSelector('[role="listbox"]');

    const measured = await page.evaluate(async () => {
      const text = () => document.body.innerText;
      const row = document.querySelector('[role="option"]');
      const t0 = performance.now();
      row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      const until = async (pred, cap = 20000) => {
        const start = performance.now();
        while (performance.now() - start < cap) {
          if (pred()) return performance.now() - t0;
          await new Promise(r => requestAnimationFrame(r));
        }
        return null;
      };

      // 1. The question is on screen and the radios exist.
      const rendered = await until(() =>
        text().includes('Confirm the research domain') &&
        document.querySelectorAll('input[type=radio]').length > 0);

      // 2. Every row that said "checking…" has stopped saying it.
      //
      // Two waits, not one. A single "no row says checking" test passes on the
      // frame BEFORE the checking rows have painted, which is how this first
      // reported the async half as finishing in 23ms — the same number as the
      // synchronous half, which should have been the tell.
      const checkingAppeared = await until(() => text().includes('checking\u2026'), 3000);

      // While every row still says "checking…", is the request actually usable?
      // This is the "never blocks selection or confirmation" claim, tested rather
      // than asserted: the confirm button must be enabled and a different radio
      // must be selectable with the check still in flight.
      const confirm = [...document.querySelectorAll('button')]
        .find(b => b.textContent?.startsWith('Confirm '));
      const radios = [...document.querySelectorAll('input[type=radio]')];
      const second = radios[1];
      if (second) second.click();
      const usableWhileChecking = {
        confirmEnabled: !!confirm && !confirm.disabled,
        confirmLabel: confirm?.textContent?.trim() ?? null,
        radioMoved: !!second && second.checked,
        stillChecking: text().includes('checking\u2026'),
      };
      const settled = checkingAppeared == null
        ? null
        : await until(() => !text().includes('checking\u2026'));

      return {
        rendered, settled, checkingAppeared, usableWhileChecking,
        radios: document.querySelectorAll('input[type=radio]').length,
      };
    });

    if (measured.rendered != null) renders.push(measured.rendered);
    if (measured.settled != null) settles.push(measured.settled);
    console.log(`rep ${rep + 1}: rendered in ${measured.rendered?.toFixed(1)}ms `
      + `(${measured.radios} domains), "checking\u2026" up at ${measured.checkingAppeared?.toFixed(1)}ms, `
      + `all verdicts settled at ${measured.settled?.toFixed(0)}ms`);
    const u = measured.usableWhileChecking;
    console.log(`        while checking: confirm enabled ${u.confirmEnabled} `
      + `(“${u.confirmLabel}”), radio moved ${u.radioMoved}, still checking ${u.stillChecking}`);
    await page.close();
  }
} finally {
  await browser.close();
}

const stat = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return { min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1] };
};

if (renders.length) {
  const r = stat(renders);
  console.log(`\ncard + domain list rendered: min ${r.min.toFixed(1)}ms, median ${r.median.toFixed(1)}ms, max ${r.max.toFixed(1)}ms`);
}
if (settles.length) {
  const s = stat(settles);
  console.log(`all verdicts settled:       min ${s.min.toFixed(0)}ms, median ${s.median.toFixed(0)}ms, max ${s.max.toFixed(0)}ms  (stub delay ${DELAY}ms)`);
}
