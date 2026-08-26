/**
 * The domain row rule, signed off 2026-08-26.
 *
 * One rule, applied per row, with no comparison across the options:
 *
 *   passes             no chip, description shown
 *   different company  red chip, description shown
 *   not a website      neutral chip, description shown
 *   couldn't check     neutral chip, description shown
 *
 * Both halves are worth locking down, because both replace something that was
 * deliberately there before and would look like a regression on the way back in.
 *
 * The chip: a green "Entur's site" chip used to sit on every passing row. Three
 * of them down a list of three Entur domains is three chips carrying nothing the
 * AE did not already know, so the chip is now reserved for rows with a problem
 * and its ABSENCE is how a row says it is fine. A test that only asserts the
 * three problem chips would pass with the green one restored.
 *
 * The description: there used to be a rule hiding it when every option returned
 * the same line. It was aimed at Entur, where both domains pass, and it left the
 * AE choosing between two bare domains — the redundant element was the chip, not
 * the line. So the description is asserted present even when it repeats.
 */

import { describe, test, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AccountSearch, { type AccountSelection, type WhitespaceCandidate, type DomainVerdict } from './AccountSearch';
import { rankDomains } from '../lib/domain-rank';

const base: Omit<WhitespaceCandidate, 'account_id' | 'name' | 'domains' | 'primary_domain' | 'website'> = {
  arr: 58020,
  sales_segment: 'MM',
  region: 'UKINN',
  billing_country: 'Norway',
  total_whitespace: 49482,
  account_owner: 'George Harding',
  employees: 227,
  full_seats: 69,
  dev_seats: 36,
  loaded_at: '2026-08-26T07:52:08.733542+00:00',
  rank_tier: 1,
  match: 'name_exact',
  matched_on: 'name',
};

/** Entur AS and Nets, both real rows at load 11. */
const ENTUR: WhitespaceCandidate = {
  ...base,
  account_id: '0013u00001GP1HQAA1',
  name: 'Entur AS',
  website: 'www.entur.no',
  domains: ['entur.org', 'entur.no'],
  primary_domain: 'entur.org',
};

const NETS: WhitespaceCandidate = {
  ...base,
  account_id: '001PX00000QVdcQYAT',
  name: 'Nets',
  website: 'www.nets.eu',
  domains: ['external.nexigroup.com', 'nets.eu', 'nexigroup.com'],
  primary_domain: 'external.nexigroup.com',
};

/**
 * Answers /domain-check off a table, the way the screenshot harness does.
 * Anything not in the table comes back `couldnt_check`, which is what the
 * endpoint does too.
 */
type CheckRow = { verdict: DomainVerdict; description: string; relation?: string | null };

function fetcherFor(table: Record<string, CheckRow>) {
  return (async (_path: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as { domain?: string };
    const hit = table[body.domain || ''];
    return new Response(JSON.stringify({
      domain: body.domain,
      verdict: hit?.verdict ?? 'couldnt_check',
      relation: hit?.relation ?? null,
      description: hit?.description ?? 'No such host — DNS did not resolve',
      page: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as never;
}

function selectionFor(candidate: WhitespaceCandidate): AccountSelection {
  const domain_options = rankDomains(candidate.domains, candidate.name, candidate.website);
  return {
    kind: 'whitespace_account',
    account_id: candidate.account_id,
    name: candidate.name,
    domain: domain_options[0]?.domain ?? null,
    domain_confirmed: false,
    domain_options,
    candidate,
  };
}

const renderPicker = (
  candidate: WhitespaceCandidate,
  table: Record<string, CheckRow>,
) => render(
  <AccountSearch
    label="Company"
    value={selectionFor(candidate)}
    onChange={() => {}}
    fetcher={fetcherFor(table)}
    domainCheck
  />,
);

const ENTUR_CHECKS = {
  'entur.no': { verdict: 'looks_right' as const, description: "Norway's national journey planner for public transport" },
  'entur.org': { verdict: 'looks_right' as const, description: "Redirects to entur.no — Norway's national journey planner" },
};

const NETS_CHECKS = {
  'nets.eu': { verdict: 'looks_right' as const, description: 'Payment solutions and services for financial institutions and merchants' },
  // Measured through the endpoint 2026-08-26, five reps out of five:
  // related_company / parent. Nexi acquired Nets in 2021, so this was never a
  // different company — it is the case the fifth verdict exists for. The
  // description no longer restates the relationship, because the chip says it.
  'nexigroup.com': {
    verdict: 'related_company' as const, relation: 'parent',
    description: 'Nexi — European payments and digital transaction technology',
  },
  'external.nexigroup.com': { verdict: 'couldnt_check' as const, description: 'No such host — DNS did not resolve' },
};

describe('a row that passes', () => {
  test('carries no chip, and the description is still printed', async () => {
    renderPicker(ENTUR, ENTUR_CHECKS);

    await waitFor(() => {
      expect(screen.getByText(ENTUR_CHECKS['entur.no'].description)).toBeTruthy();
    });
    expect(screen.getByText(ENTUR_CHECKS['entur.org'].description)).toBeTruthy();

    // The chip that used to sit on every passing row, in either of the two forms
    // it took. Both domains pass, so neither may appear.
    expect(screen.queryByText(/’s site$/)).toBeNull();
    expect(screen.queryByText('this account’s site')).toBeNull();
    // Nor any of the three problem chips.
    expect(screen.queryByText('different company')).toBeNull();
    expect(screen.queryByText('not a website')).toBeNull();
    expect(screen.queryByText('couldn’t check')).toBeNull();
    // Nor the fifth. A passing row carries no chip of any kind.
    expect(screen.queryByText('parent company')).toBeNull();
    expect(screen.queryByText('related company')).toBeNull();
  });

  test('a description repeated across every option is still shown on both rows', async () => {
    const same = "Norway's national journey planner for public transport";
    renderPicker(ENTUR, {
      'entur.no': { verdict: 'looks_right', description: same },
      'entur.org': { verdict: 'looks_right', description: same },
    });

    // Two rows, two copies. The deleted suppression rule showed zero.
    await waitFor(() => expect(screen.getAllByText(same)).toHaveLength(2));
  });
});

describe('a row with a problem', () => {
  test('Nets: one passing, one parent company, one couldn’t check', async () => {
    renderPicker(NETS, NETS_CHECKS);

    // The chip names the RELATION, not the verdict. "related company" would be
    // true of all four directions and useful for none of them — the AE choosing
    // between nets.eu and nexigroup.com needs to know which way it runs.
    await waitFor(() => {
      expect(screen.getByText('parent company')).toBeTruthy();
    });
    expect(screen.getByText('couldn’t check')).toBeTruthy();
    // Exactly one of each: nets.eu is the passing row and contributes no chip.
    expect(screen.getAllByText('parent company')).toHaveLength(1);
    expect(screen.getAllByText('couldn’t check')).toHaveLength(1);
    // And it is not the fourth verdict wearing a new name.
    expect(screen.queryByText('different company')).toBeNull();

    // All three descriptions, including the one on the row with no chip.
    for (const { description } of Object.values(NETS_CHECKS)) {
      expect(screen.getByText(description)).toBeTruthy();
    }
  });

  test('the parent chip reads as caution, not as neutral and not as red', async () => {
    renderPicker(NETS, NETS_CHECKS);

    const chip = await screen.findByText('parent company');
    // Filled amber. The two neutral chips are transparent with a hairline, and
    // red is reserved for a genuinely unrelated company — an AE inside the right
    // corporate group who picked the wrong entity has made a different mistake.
    expect(chip.style.background).toBe('var(--badge-yellow-bg)');
    expect(chip.style.color).toBe('var(--badge-yellow-text)');
    expect(chip.style.background).not.toBe('transparent');
    expect(chip.style.color).not.toBe('var(--badge-red-text)');
  });

  test('each relation gets its own wording, and an unknown one falls back', async () => {
    const cases: Array<[string, string]> = [
      ['parent', 'parent company'],
      ['subsidiary', 'subsidiary'],
      ['sibling', 'sibling brand'],
      ['unclear', 'related company'],
      // Not one of the four. Falls back rather than printing the raw value —
      // a Worker that grows a fifth direction must not put an unknown word in
      // a chip.
      ['affiliate', 'related company'],
      [null as unknown as string, 'related company'],
    ];
    for (const [relation, label] of cases) {
      const { unmount } = renderPicker(NETS, {
        ...NETS_CHECKS,
        'nexigroup.com': { verdict: 'related_company', relation, description: 'Nexi — European payments' },
      });
      expect(await screen.findByText(label)).toBeTruthy();
      unmount();
    }
  });

  test('a relation on a passing verdict is discarded, not shown', async () => {
    // The Worker forces this to null already. This asserts the portal does not
    // depend on that, because a "parent company" chip on the account's own
    // domain is the worst thing this feature could print.
    renderPicker(NETS, {
      ...NETS_CHECKS,
      'nets.eu': { verdict: 'looks_right', relation: 'parent', description: 'Payment solutions for financial institutions' },
    });

    await waitFor(() => expect(screen.getByText('parent company')).toBeTruthy());
    // One, from nexigroup.com. Not two.
    expect(screen.getAllByText('parent company')).toHaveLength(1);
  });

  test('the fifth verdict is never the suggested option', async () => {
    // Ranking is verdict-blind and this task did not change it. The assertion is
    // that the suggested chip and the caution chip never land on one row —
    // stated as a test because "we did not change the ranking" is not a property
    // anyone can see from the ranking code six months from now.
    renderPicker(NETS, NETS_CHECKS);

    const chip = await screen.findByText('parent company');
    const row = chip.closest('label');
    expect(row).toBeTruthy();
    expect(row!.textContent).not.toContain('suggested');
  });

  test('not a website reads neutral, not as a warning', async () => {
    renderPicker(NETS, {
      ...NETS_CHECKS,
      'nexigroup.com': { verdict: 'not_a_website', description: 'Default nginx welcome page' },
    });

    const chip = await screen.findByText('not a website');
    // The neutral treatment is a hairline and no fill, the same as couldn’t
    // check. A yellow --badge-yellow-bg here would be the old styling back.
    expect(chip.style.background).toBe('transparent');
    expect(chip.style.color).toBe('var(--badge-muted-text)');
    expect(screen.getByText('Default nginx welcome page')).toBeTruthy();
  });
});
