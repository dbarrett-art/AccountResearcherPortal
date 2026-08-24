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
import { ClaimAuditBanner, ClaimAuditBadge, type ClaimAuditFinding } from './ClaimAudit';

const finding = (over: Partial<ClaimAuditFinding> = {}): ClaimAuditFinding => ({
  id: 1,
  pattern: 'non_customer',
  finding_kind: 'non_customer_claim',
  surface: 'pov',
  field_path: 'pov.why_figma.narrative',
  excerpt: 'Acme is not a Figma customer today.',
  data_state: 'no_record',
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
});

describe('ClaimAuditBadge', () => {
  test('renders nothing at zero', () => {
    const { container } = render(<ClaimAuditBadge count={0} />);
    expect(container.innerHTML).toBe('');
  });

  test('renders a count above zero', () => {
    render(<ClaimAuditBadge count={3} />);
    expect(screen.getByText('3 unsourced claims')).toBeDefined();
  });

  test('singular at one', () => {
    render(<ClaimAuditBadge count={1} />);
    expect(screen.getByText('1 unsourced claim')).toBeDefined();
  });

  test('compact form shows the number alone', () => {
    render(<ClaimAuditBadge count={4} compact />);
    expect(screen.getByText('4')).toBeDefined();
  });
});
