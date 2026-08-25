import { describe, it, expect } from 'vitest';
import { rankDomains, labelMatchesName, reasonText } from './domain-rank';

/**
 * The named cases from the brief, plus the boundaries of the two rules.
 *
 * These are the accounts that motivated the change, so they are the assertion
 * rather than the illustration: if Toyota, LVMH, HSBC or Nets stop coming out
 * the way the sign-off screenshots show, the ranking has drifted from what was
 * agreed and not from what happened to be typed.
 */

const first = (domains: string[], name: string) => rankDomains(domains, name)[0].domain;

describe('rule 1 — apex beats subdomain when both are on the record', () => {
  it('puts hsbc.com above noexternalmail.hsbc.com', () => {
    const ranked = rankDomains(['noexternalmail.hsbc.com', 'hsbc.com'], 'HSBC Holdings plc');
    expect(ranked[0].domain).toBe('hsbc.com');
    expect(ranked[0].reasons).toContain('apex');
    expect(ranked[1].domain).toBe('noexternalmail.hsbc.com');
  });

  it('beats a name match on the subdomain — rule 1 dominates rule 2', () => {
    // Both labels match "HSBC", so only the apex rule can separate them.
    const ranked = rankDomains(['hsbc.noexternalmail.hsbc.com', 'hsbc.com'], 'HSBC');
    expect(ranked[0].domain).toBe('hsbc.com');
  });

  it('claims no apex reason for a lone domain', () => {
    // "apex domain" has to mean "this one rather than the subdomain below it".
    // A single domain has beaten nothing, and saying otherwise next to
    // mail.toyota.co.jp would be the invisible default all over again.
    const ranked = rankDomains(['mail.toyota.co.jp'], 'Toyota Motor Corporation');
    expect(ranked[0].reasons).not.toContain('apex');
    expect(reasonText(ranked[0])).toBe('matches account name');
  });

  it('cannot help a record holding only a mail subdomain', () => {
    // Stated as a limit, not a bug: no relative rule can see that a lone host
    // is a mail server. The advisory page check is what covers this.
    expect(first(['mail.toyota.co.jp'], 'Toyota Motor Corporation')).toBe('mail.toyota.co.jp');
  });

  it('does help once the apex is also on the record', () => {
    expect(first(['mail.toyota.co.jp', 'toyota.co.jp'], 'Toyota Motor Corporation'))
      .toBe('toyota.co.jp');
  });
});

describe('rule 2 — a domain label matching the account name', () => {
  it('puts nets.eu above nexigroup.com for "Nets"', () => {
    const ranked = rankDomains(['nexigroup.com', 'nets.eu'], 'Nets A/S');
    expect(ranked[0].domain).toBe('nets.eu');
    expect(ranked[0].reasons).toEqual(['name_match']);
  });

  it('puts lvmh.com above sephora.com', () => {
    expect(first(['sephora.com', 'lvmh.com'], 'LVMH Moët Hennessy Louis Vuitton'))
      .toBe('lvmh.com');
  });

  it('matches an abbreviation of a long name', () => {
    expect(labelMatchesName('lvmh.com', 'LVMH Moët Hennessy Louis Vuitton')).toBe(true);
  });

  it('matches a domain that extends the name', () => {
    expect(labelMatchesName('hsbcnet.com', 'HSBC')).toBe(true);
  });

  it('does not match an unrelated domain that merely shares letters', () => {
    expect(labelMatchesName('nexigroup.com', 'Nets A/S')).toBe(false);
    expect(labelMatchesName('accenture.com', 'Entur AS')).toBe(false);
  });

  it('ignores the TLD and compound-suffix labels', () => {
    // 'co' and 'jp' must never count as a company name.
    expect(labelMatchesName('mail.co.jp', 'Co')).toBe(false);
  });

  it('folds diacritics on the account name', () => {
    expect(labelMatchesName('ossur.com', 'Össur hf.')).toBe(true);
  });
});

describe('rule 3 — otherwise the order they arrived in', () => {
  it('keeps the record order when nothing distinguishes the options', () => {
    const domains = ['alpha-services.io', 'beta-holdings.io', 'gamma-labs.io'];
    expect(rankDomains(domains, 'Zeta Industries').map(r => r.domain)).toEqual(domains);
  });

  it('is a stable tiebreak, not a name sort', () => {
    const ranked = rankDomains(['zzz.example', 'aaa.example'], 'Unrelated Co');
    expect(ranked.map(r => r.domain)).toEqual(['zzz.example', 'aaa.example']);
  });
});

describe('shaping', () => {
  it('never drops or truncates an option', () => {
    const five = ['a.example', 'b.example', 'c.example', 'd.example', 'e.example'];
    expect(rankDomains(five, 'Whoever')).toHaveLength(5);
  });

  it('dedupes and normalises before ranking', () => {
    const ranked = rankDomains(['Example.COM', 'www.example.com', 'example.com.', null, ''], 'Example');
    expect(ranked.map(r => r.domain)).toEqual(['example.com']);
  });

  it('returns an empty list for an account with no domains', () => {
    expect(rankDomains([], 'Nobody')).toEqual([]);
  });

  it('reports no reason when there is nothing to say', () => {
    expect(reasonText(rankDomains(['unrelated.io'], 'Something Else')[0])).toBeNull();
  });
});
