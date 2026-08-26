import { describe, it, expect } from 'vitest';
import { salesforceAccountUrl } from './salesforce-url';

/**
 * The pattern, pinned.
 *
 * The point of these is not that the string-building works — it is that the
 * SHAPE of the URL is asserted somewhere, because it was established by probing
 * the org and the next person to touch this file will not repeat that probe. If
 * the host or the path changes, this test is where the change has to be argued.
 */

/** Entur AS, the account the card screenshots are taken against. Real ID. */
const ENTUR = '0013u00001GP1HQAA1';

describe('salesforceAccountUrl', () => {
  it('builds the Lightning record path, not the classic bare-ID one', () => {
    expect(salesforceAccountUrl(ENTUR)).toBe(
      `https://figma.lightning.force.com/lightning/r/Account/${ENTUR}/view`,
    );
  });

  it('links a 15-char ID as readily as an 18-char one', () => {
    // `accounts` is 15-char and `whitespace.Id` is 18, and the export carries
    // whichever the row came from. Salesforce resolves both.
    expect(salesforceAccountUrl('0013u00001GP1HQ')).toBe(
      'https://figma.lightning.force.com/lightning/r/Account/0013u00001GP1HQ/view',
    );
  });

  it('trims, because a CSV round-trip leaves whitespace on an ID', () => {
    expect(salesforceAccountUrl(`  ${ENTUR}\n`)).toContain(`/Account/${ENTUR}/view`);
  });

  // Every one of these returns null so the card falls back to printing the raw
  // ID. A missing link still leaves the ID copyable; a wrong link does not.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['a lead ID, not an account', '00Q3u00001GP1HQAA1'],
    ['a contact ID, not an account', '0033u00001GP1HQAA1'],
    ['too short', '0013u0000'],
    ['16 chars — neither length', '0013u00001GP1HQA'],
    ['a name that got into the ID column', 'Entur AS'],
    ['a path traversal attempt', '001../../../etc'],
  ])('returns null for %s', (_label, input) => {
    expect(salesforceAccountUrl(input as string | null | undefined)).toBeNull();
  });
});
