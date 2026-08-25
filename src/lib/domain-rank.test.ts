import { describe, it, expect } from 'vitest';
import {
  rankDomains, labelMatchesName, reasonText, bareHost, matchesWebsite, websiteRelation,
} from './domain-rank';

/**
 * The named cases from the brief, plus the boundaries of every rule.
 *
 * These are the accounts that motivated the change, so they are the assertion
 * rather than the illustration: if Toyota, LVMH, HSBC or Nets stop coming out
 * the way the sign-off screenshots show, the ranking has drifted from what was
 * agreed and not from what happened to be typed.
 */

const first = (domains: string[], name: string) => rankDomains(domains, name)[0].domain;

describe('rule 0 — the domain Salesforce\u2019s Website field names', () => {
  // The case the whole feature exists for and the one rules 1-3 cannot answer.
  // Both domains are apex and both match the name, so rule 1 and rule 2 tie and
  // ordering falls through to whatever came first out of the DOMAINS__C cell --
  // which is entur.org. Salesforce says entur.no, and so does the AE.
  const ENTUR = ['entur.org', 'entur.no'];

  it('locks entur.no for Entur AS', () => {
    const ranked = rankDomains(ENTUR, 'Entur AS', 'https://www.entur.no/');
    expect(ranked[0].domain).toBe('entur.no');
    expect(ranked[0].reasons).toContain('salesforce_website');
    expect(reasonText(ranked[0])).toBe('Salesforce website');
    expect(ranked[1].domain).toBe('entur.org');
  });

  it('is the tie that record order used to break the wrong way', () => {
    // Same input, no website: entur.org, because it is first. This is the
    // before-and-after in one pair of assertions.
    expect(rankDomains(ENTUR, 'Entur AS')[0].domain).toBe('entur.org');
    expect(rankDomains(ENTUR, 'Entur AS', 'entur.no')[0].domain).toBe('entur.no');
  });

  it('beats rule 1 — the website wins even against an apex sibling', () => {
    // toyota.co.jp is the apex of mail.toyota.co.jp AND matches the name, so it
    // scores 3. Salesforce says global.toyota, which is on the record and is
    // neither. Rule 0 has to clear that.
    const ranked = rankDomains(
      ['mail.toyota.co.jp', 'toyota.co.jp', 'global.toyota'],
      'Toyota Motor Corporation',
      'https://global.toyota/',
    );
    expect(ranked[0].domain).toBe('global.toyota');
    expect(reasonText(ranked[0])).toBe('Salesforce website');
  });

  it('beats rule 1 even for a domain rule 1 actively demotes', () => {
    // The pathological direction: Salesforce names the SUBDOMAIN, and the apex
    // is also on the record so it satisfies rule 0 too, as the parent. The named
    // host has to win anyway -- carrying SHADOWED_BY_SIBLING against a rival
    // carrying APEX_OF_SIBLING and NAME_MATCH. That is what the exact/related
    // split in SCORE buys.
    const ranked = rankDomains(
      ['hsbc.com', 'us.hsbc.com'],
      'HSBC Holdings plc',
      'https://www.us.hsbc.com/',
    );
    expect(ranked[0].domain).toBe('us.hsbc.com');
    // Both fire; only the order distinguishes them.
    expect(ranked[1].domain).toBe('hsbc.com');
    expect(ranked[1].reasons).toContain('salesforce_website');
  });

  it('prefers the host named exactly over one merely related to it', () => {
    expect(websiteRelation('entur.no', 'entur.no')).toBe('exact');
    expect(websiteRelation('entur.no', 'tickets.entur.no')).toBe('related');
    expect(websiteRelation('tickets.entur.no', 'entur.no')).toBe('related');
    expect(websiteRelation('entur.org', 'entur.no')).toBeNull();
  });

  it('matches through a www, a scheme, a path and a trailing slash', () => {
    for (const website of [
      'entur.no', 'www.entur.no', 'http://entur.no', 'https://www.entur.no/',
      'https://entur.no/en/about', 'HTTPS://WWW.ENTUR.NO', 'entur.no.',
      'https://entur.no:443/x', ' https://www.entur.no/ ',
    ]) {
      expect(rankDomains(ENTUR, 'Entur AS', website)[0].domain).toBe('entur.no');
    }
  });

  it('matches a domain the website is a subdomain of', () => {
    // Salesforce holds a deeper host than the record does. The record's domain
    // is still the one it names.
    const ranked = rankDomains(['entur.org', 'entur.no'], 'Entur AS', 'https://tickets.entur.no/');
    expect(ranked[0].domain).toBe('entur.no');
  });
});

describe('rule 0 — falling back', () => {
  it('a null website is byte-for-byte the old behaviour', () => {
    // Every case below is asserted elsewhere in this file without a website
    // argument. Here they are again with an explicit null, undefined and empty
    // string, because "the fallback is identical" is the actual requirement and
    // not something to infer from an optional parameter.
    const cases: [string[], string][] = [
      [['noexternalmail.hsbc.com', 'hsbc.com'], 'HSBC Holdings plc'],
      [['nexigroup.com', 'nets.eu'], 'Nets A/S'],
      [['sephora.com', 'lvmh.com'], 'LVMH Mo\u00ebt Hennessy Louis Vuitton'],
      [['mail.toyota.co.jp'], 'Toyota Motor Corporation'],
      [['alpha-services.io', 'beta-holdings.io', 'gamma-labs.io'], 'Zeta Industries'],
      [['entur.org', 'entur.no'], 'Entur AS'],
    ];
    for (const [domains, name] of cases) {
      const base = rankDomains(domains, name);
      for (const website of [null, undefined, '']) {
        expect(rankDomains(domains, name, website)).toEqual(base);
      }
    }
  });

  it('a website matching nothing on the record changes nothing', () => {
    // The 194 sub/parent agreements and the 1,010 disagreements are not the only
    // shapes: a Website can name a domain the whitespace cell simply does not
    // hold. Rule 0 must go quiet, not suppress rules 1-3.
    const domains = ['noexternalmail.hsbc.com', 'hsbc.com'];
    const ranked = rankDomains(domains, 'HSBC Holdings plc', 'https://www.hsbc.co.uk/');
    expect(ranked).toEqual(rankDomains(domains, 'HSBC Holdings plc'));
    expect(ranked[0].domain).toBe('hsbc.com');
    expect(ranked[0].reasons).toContain('apex');
    expect(ranked[0].reasons).not.toContain('salesforce_website');
  });

  it('a website that is not a URL at all reads as no website', () => {
    const domains = ['nexigroup.com', 'nets.eu'];
    const base = rankDomains(domains, 'Nets A/S');
    for (const junk of ['n/a', 'none', '-', 'TBC', 'no website', '.', 'http://', '1234']) {
      expect(rankDomains(domains, 'Nets A/S', junk)).toEqual(base);
    }
  });

  it('does not fire on a sibling subdomain under a shared apex', () => {
    // The one case a relative test gives up on that an apex comparison would
    // catch. Asserted so the limit is recorded rather than discovered.
    expect(matchesWebsite('b.example.com', 'a.example.com')).toBe(false);
    const ranked = rankDomains(['b.example.com'], 'Example', 'https://a.example.com/');
    expect(ranked[0].reasons).not.toContain('salesforce_website');
  });
});

describe('bareHost', () => {
  it('reduces the shapes Salesforce actually holds', () => {
    expect(bareHost('https://www.hsbc.com/')).toBe('hsbc.com');
    expect(bareHost('hsbc.com')).toBe('hsbc.com');
    expect(bareHost('HTTP://Global.Toyota')).toBe('global.toyota');
    expect(bareHost('www.isbank.com.tr')).toBe('isbank.com.tr');
    expect(bareHost('https://user:pw@example.com:8443/x?y#z')).toBe('example.com');
  });

  it('returns empty for anything not shaped like a host', () => {
    for (const v of [null, undefined, '', '  ', 'n/a', 'localhost', 'a b.com', 'http://', '.com']) {
      expect(bareHost(v)).toBe('');
    }
  });
});

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
