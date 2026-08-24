/**
 * Table check for parseDomainInput(), the only piece of new logic in the net-new
 * prospect path with real edge cases.
 *
 *   node scripts/verify-domain-parse.mjs
 *
 * The function is extracted from src/lib/domain.ts at run time and its type
 * annotation stripped, rather than copied here — a copy would let this pass while
 * the shipped regex says something else. This repo has no test runner; when one is
 * added, this belongs in it as-is.
 *
 * What it is NOT checking: whether the domain exists, or belongs to the company
 * named. Nothing is looked up on this path by design — if the whitespace book has
 * no record of the account, the system has no business inventing its website. So a
 * well-formed domain for a company that does not exist passes, deliberately.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(HERE, '..', 'src', 'lib', 'domain.ts'), 'utf8');
const start = src.indexOf('export function parseDomainInput');
if (start < 0) throw new Error('parseDomainInput not found in src/lib/domain.ts');
// Balance braces from the first { after the signature.
let i = src.indexOf('{', start), depth = 0, end = -1;
for (let j = i; j < src.length; j++) {
  if (src[j] === '{') depth++;
  else if (src[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
}
const body = src.slice(start, end)
  .replace('export function parseDomainInput(raw: string): string | null', 'function parseDomainInput(raw)')
  .replace(/let v = \(raw \|\| ''\)/, "let v = (raw || '')");
const parseDomainInput = new Function(`${body}; return parseDomainInput;`)();

const CASES = [
  // [input, expected]
  ['acme.com', 'acme.com'],
  ['ACME.COM', 'acme.com'],
  ['  acme.com  ', 'acme.com'],
  ['www.acme.com', 'acme.com'],
  ['https://acme.com', 'acme.com'],
  ['http://acme.com/about/us', 'acme.com'],
  ['https://www.acme.com/careers?ref=x#top', 'acme.com'],
  ['acme.com.', 'acme.com'],
  ['acme.co.uk', 'acme.co.uk'],
  ['softtech.isbank.com.tr', 'softtech.isbank.com.tr'],
  ['my-company.io', 'my-company.io'],
  ['a.co', 'a.co'],
  ['xn--80ak6aa92e.com', 'xn--80ak6aa92e.com'],       // punycode
  ['northwind-robotics.example', 'northwind-robotics.example'],
  // rejected
  ['', null],
  ['   ', null],
  ['acme', null],                                      // no TLD
  ['not a domain', null],
  ['dan@figma.com', null],
  ['acme.c', null],                                    // 1-char TLD
  ['acme.123', null],                                  // numeric TLD
  ['.com', null],
  ['acme..com', null],
  ['-acme.com', null],
  ['acme-.com', null],
  ['acme.com acme.org', null],
  ['https://', null],
  ['a'.repeat(250) + '.com', null],                    // over 253
];

let fails = 0;
for (const [input, expected] of CASES) {
  const got = parseDomainInput(input);
  const ok = got === expected;
  if (!ok) fails++;
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${JSON.stringify(input).slice(0, 46).padEnd(48)} -> ${JSON.stringify(got)}${ok ? '' : `  (expected ${JSON.stringify(expected)})`}`);
}
console.log(`\n${fails ? `FAIL — ${fails}/${CASES.length}` : `PASS — ${CASES.length}/${CASES.length}`}`);
process.exit(fails ? 1 : 0);
