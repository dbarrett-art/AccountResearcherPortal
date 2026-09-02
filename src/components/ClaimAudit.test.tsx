/**
 * The claim-audit banner.
 *
 * Two assertions carry the weight, and they are opposites:
 *
 *  1. A brief WITH findings shows the banner, with the offending sentence in it.
 *     The pipeline does not block and does not rewrite, so the fabricated claim
 *     is still in the prose the AE is reading. If the banner does not render,
 *     nothing anywhere tells them.
 *
 *  2. A brief WITHOUT findings shows nothing at all. Not an empty box, not a
 *     "0 findings" line. A warning surface that appears on every brief is a
 *     warning surface nobody reads, and this one has to survive being right.
 */

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ClaimAuditBanner, ClaimAuditBadge, resolveBannerVariant,
  type ClaimAuditFinding, type ClaimAuditVariant,
} from './ClaimAudit';

const finding = (over: Partial<ClaimAuditFinding> = {}): ClaimAuditFinding => ({
  id: 1,
  pattern: 'non_customer',
  finding_kind: 'non_customer_claim',
  surface: 'pov',
  field_path: 'pov.why_figma.narrative',
  excerpt: 'Acme is not a Figma customer today.',
  data_state: 'no_record',
  audit_mode: 'no_record',
  ...over,
});

/**
 * A finding from the matched-brief audit, shaped like the real rows.
 *
 * These values are copied from the live findings for run 5d2511d8 (IKEA,
 * 2026-08-29) rather than invented — data_state 'enriched', audit_mode
 * 'supplied_figures', pattern 'unsupported_figure'. That run is the one that
 * exposed the bug, and a fixture that matches it is a fixture that would have
 * caught it.
 */
const suppliedFinding = (over: Partial<ClaimAuditFinding> = {}): ClaimAuditFinding => finding({
  pattern: 'unsupported_figure',
  finding_kind: 'supplied_figure_mismatch',
  surface: 'hooks',
  field_path: 'hooks.contacts[8].outreach_context',
  excerpt: 'where 400 Figma editors and 200+ product teams operate across web, iOS and Android.',
  data_state: 'enriched',
  audit_mode: 'supplied_figures',
  ...over,
});

describe('ClaimAuditBanner', () => {
  test('renders for a brief with findings', () => {
    render(<ClaimAuditBanner findings={[finding()]} />);
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/1 unsourced claim about this account/i)).toBeDefined();
  });

  test('renders nothing for a brief without findings', () => {
    const { container } = render(<ClaimAuditBanner findings={[]} />);
    expect(container.innerHTML).toBe('');
  });

  test('shows the offending sentence, not just that something fired', () => {
    // "greenfield fired somewhere in this brief" is not actionable. The AE has
    // to read the sentence to judge whether to repeat it.
    render(<ClaimAuditBanner findings={[finding()]} />);
    expect(screen.getByText(/Acme is not a Figma customer today/)).toBeDefined();
  });

  test('names the detector in English rather than showing a slug', () => {
    render(<ClaimAuditBanner findings={[finding({ pattern: 'greenfield' })]} />);
    expect(screen.getByText(/Describes the account as greenfield/i)).toBeDefined();
    expect(screen.queryByText('greenfield')).toBeNull();
  });

  test('says where in the brief the sentence is', () => {
    render(<ClaimAuditBanner findings={[finding({
      surface: 'hooks', field_path: 'hooks.contacts[0].outreach_context',
    })]} />);
    expect(screen.getByText(/Contact hooks › contacts\[0\]\.outreach_context/)).toBeDefined();
  });

  test('lists every finding, not just the first', () => {
    render(<ClaimAuditBanner findings={[
      finding({ id: 1, excerpt: 'First offending sentence.' }),
      finding({ id: 2, pattern: 'greenfield', excerpt: 'Second offending sentence.' }),
      finding({ id: 3, pattern: 'figma_arr', excerpt: 'Third offending sentence.' }),
    ]} />);
    expect(screen.getByText(/3 unsourced claims/i)).toBeDefined();
    expect(screen.getByText(/First offending sentence/)).toBeDefined();
    expect(screen.getByText(/Second offending sentence/)).toBeDefined();
    expect(screen.getByText(/Third offending sentence/)).toBeDefined();
  });

  test('distinguishes "no record" from "lookup did not complete"', () => {
    // The confusion this whole feature exists to prevent. One is a statement
    // about the whitespace book, the other about our own plumbing, and only the
    // first is remotely about the company.
    const { unmount } = render(<ClaimAuditBanner findings={[finding()]} />);
    expect(screen.getByText(/no record in the whitespace book/i)).toBeDefined();
    unmount();

    render(<ClaimAuditBanner findings={[finding({ data_state: 'unknown' })]} />);
    expect(screen.getByText(/lookup for this account did not complete/i)).toBeDefined();
  });

  test('tells the reader what to do about it', () => {
    render(<ClaimAuditBanner findings={[finding()]} />);
    expect(screen.getByText(/Do not repeat it to the customer/i)).toBeDefined();
  });

  test('explains that absence from the book is not absence of usage', () => {
    // Without this the banner reads as "the brief is wrong about them not using
    // Figma", which is a different and equally unsupported claim.
    render(<ClaimAuditBanner findings={[finding()]} />);
    expect(screen.getByText(/not evidence that the account does not use Figma/i)).toBeDefined();
  });

  /* ---------------------------------------------------------------- */
  /*  The matched-brief audit                                          */
  /* ---------------------------------------------------------------- */

  describe('supplied_figures mode', () => {
    test('never claims the account has no whitespace record', () => {
      // THE REGRESSION. data_state 'enriched' is not 'unknown', so the old
      // two-way branch fell through to the no-record copy and told the AE that
      // a $700K customer was absent from the book. Everything else in this
      // describe block is detail; this is the assertion that must not go green
      // again by accident.
      render(<ClaimAuditBanner findings={[suppliedFinding()]} />);
      expect(screen.queryByText(/no record in the whitespace book/i)).toBeNull();
      expect(screen.queryByText(/had no Figma usage, seat or ARR data/i)).toBeNull();
    });

    test('says the opposite: the record was supplied and the figure disagrees', () => {
      render(<ClaimAuditBanner findings={[suppliedFinding()]} />);
      expect(screen.getByText(/supplied this brief with Figma’s own commercial record/i)).toBeDefined();
      expect(screen.getByText(/does not appear in that record/i)).toBeDefined();
    });

    test('headline does not call the figures unsourced', () => {
      // "Unsourced" is the inverse of what a supplied-figures finding means: the
      // source exists, was given to the pipeline, and the brief contradicted it.
      render(<ClaimAuditBanner findings={[suppliedFinding()]} />);
      expect(screen.queryByText(/unsourced claim/i)).toBeNull();
      expect(screen.getByText(/1 figure that does not match Figma’s record/i)).toBeDefined();
    });

    test('pluralises the headline', () => {
      render(<ClaimAuditBanner findings={[
        suppliedFinding({ id: 1 }),
        suppliedFinding({ id: 2, pattern: 'rounded_figure' }),
      ]} />);
      expect(screen.getByText(/2 figures that do not match Figma’s record/i)).toBeDefined();
    });

    test('names the matched-brief detectors in English rather than showing a slug', () => {
      render(<ClaimAuditBanner findings={[suppliedFinding({ pattern: 'rounded_figure' })]} />);
      expect(screen.getByText(/Rounds or restates a Figma figure from our record/i)).toBeDefined();
      expect(screen.queryByText('rounded_figure')).toBeNull();
    });

    test('points at the brief’s own figures instead of the absence-of-record note', () => {
      render(<ClaimAuditBanner findings={[suppliedFinding()]} />);
      expect(screen.queryByText(/Absence from the whitespace book/i)).toBeNull();
      expect(screen.getByText(/real figures are in the Figma usage section/i)).toBeDefined();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Exhaustiveness                                                   */
  /* ---------------------------------------------------------------- */

  describe('every state resolves to a deliberate variant', () => {
    // The bug was not that 'enriched' was handled wrongly. It was that an
    // unanticipated value had somewhere to fall — the else of a boolean, which
    // happened to be the strongest claim the banner can make. These tests pin
    // the property that fixes the class rather than the instance: nothing
    // unrecognised may reach copy that asserts something about the account.

    test('audit_mode decides, not data_state', () => {
      // The combination that proves which field is in charge: a supplied-figures
      // audit on a brief M1.5 could not resolve. M1 still HAD the record (that
      // is what auditModeFor keys on), so the no-data copy would be false.
      render(<ClaimAuditBanner findings={[
        suppliedFinding({ data_state: 'unknown', audit_mode: 'supplied_figures' }),
      ]} />);
      expect(screen.getByText(/supplied this brief with Figma’s own commercial record/i)).toBeDefined();
      expect(screen.queryByText(/lookup for this account did not complete/i)).toBeNull();
    });

    test('an audit_mode this build has never heard of makes no claim either way', () => {
      // A fourth mode added to the pipeline and deployed before the portal. It
      // must not inherit anybody else's copy.
      render(<ClaimAuditBanner findings={[
        finding({ audit_mode: 'some_future_mode', data_state: 'some_future_state' }),
      ]} />);
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/could not be determined from the stored findings/i)).toBeDefined();
      expect(screen.queryByText(/no record in the whitespace book/i)).toBeNull();
      expect(screen.queryByText(/lookup for this account did not complete/i)).toBeNull();
    });

    test('a data_state this build has never heard of makes no claim either way', () => {
      render(<ClaimAuditBanner findings={[
        finding({ audit_mode: 'no_record', data_state: 'some_future_state' }),
      ]} />);
      expect(screen.getByText(/could not be determined from the stored findings/i)).toBeDefined();
      expect(screen.queryByText(/no record in the whitespace book/i)).toBeNull();
    });

    test('legacy rows written before audit_mode existed still split correctly', () => {
      // Both tables were empty when the column was added, so this should be
      // unreachable in production — but the column is nullable and the fallback
      // is what keeps a null from landing in 'indeterminate' and losing copy
      // that data_state alone can still justify.
      const { unmount } = render(<ClaimAuditBanner findings={[
        finding({ audit_mode: null, data_state: 'no_record' }),
      ]} />);
      expect(screen.getByText(/no record in the whitespace book/i)).toBeDefined();
      unmount();

      render(<ClaimAuditBanner findings={[
        finding({ audit_mode: undefined, data_state: 'unknown' }),
      ]} />);
      expect(screen.getByText(/lookup for this account did not complete/i)).toBeDefined();
    });

    test('mixed states take the weaker claim, never the stronger one', () => {
      // 'unknown' alongside 'no_record': we could not find out about one of
      // them, so the banner may not say the book has no row.
      render(<ClaimAuditBanner findings={[
        finding({ id: 1, data_state: 'no_record' }),
        finding({ id: 2, data_state: 'unknown' }),
      ]} />);
      expect(screen.getByText(/lookup for this account did not complete/i)).toBeDefined();
      expect(screen.queryByText(/no record in the whitespace book/i)).toBeNull();
    });
  });
});

/**
 * The resolver on its own.
 *
 * Tested directly as well as through the rendered banner because the branch is
 * the part that broke, and asserting it through copy means a future rewording
 * silently stops testing it.
 */
describe('resolveBannerVariant', () => {
  const cases: Array<[string, Partial<ClaimAuditFinding>, ClaimAuditVariant]> = [
    ['matched brief',            { audit_mode: 'supplied_figures', data_state: 'enriched' },              'supplied_figures'],
    ['matched, zero opportunity',{ audit_mode: 'supplied_figures', data_state: 'record_no_opportunity' }, 'supplied_figures'],
    ['no record',                { audit_mode: 'no_record', data_state: 'no_record' },                    'no_record'],
    ['lookup failed',            { audit_mode: 'no_record', data_state: 'unknown' },                      'unknown'],
    ['legacy row, no record',    { audit_mode: null, data_state: 'no_record' },                           'no_record'],
    ['legacy row, unknown',      { audit_mode: null, data_state: 'unknown' },                             'unknown'],
    ['unknown mode',             { audit_mode: 'future_mode', data_state: 'no_record' },                  'indeterminate'],
    ['unknown state',            { audit_mode: 'no_record', data_state: 'future_state' },                 'indeterminate'],
  ];

  for (const [label, over, expected] of cases) {
    test(`${label} → ${expected}`, () => {
      expect(resolveBannerVariant([finding(over)])).toBe(expected);
    });
  }

  test('empty is indeterminate rather than throwing', () => {
    expect(resolveBannerVariant([])).toBe('indeterminate');
  });

  test('supplied_figures wins a mixed array', () => {
    // Should not occur — auditModeFor picks one mode per run — but if it does,
    // the safe direction is the one that does not deny the record exists.
    expect(resolveBannerVariant([
      finding({ id: 1, audit_mode: 'no_record', data_state: 'no_record' }),
      finding({ id: 2, audit_mode: 'supplied_figures', data_state: 'enriched' }),
    ])).toBe('supplied_figures');
  });
});

describe('ClaimAuditBadge', () => {
  test('renders nothing at zero', () => {
    const { container } = render(<ClaimAuditBadge count={0} />);
    expect(container.innerHTML).toBe('');
  });

  test('renders a count above zero', () => {
    render(<ClaimAuditBadge count={3} />);
    expect(screen.getByText('3 flagged claims')).toBeDefined();
  });

  test('singular at one', () => {
    render(<ClaimAuditBadge count={1} />);
    expect(screen.getByText('1 flagged claim')).toBeDefined();
  });

  test('compact form shows the number alone', () => {
    render(<ClaimAuditBadge count={4} compact />);
    expect(screen.getByText('4')).toBeDefined();
  });
});
