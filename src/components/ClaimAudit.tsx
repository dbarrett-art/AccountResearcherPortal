/**
 * Surfacing claim-audit findings.
 *
 * What a finding is
 * ─────────────────
 * The pipeline had NO whitespace record for this account. The whitespace book
 * covers roughly 7,000 accounts filtered to target segments and regions, so an
 * account missing from it can still be running Figma today — Pro teams, free
 * signups, seats recorded under another domain, a reseller. Absence from the
 * book is a gap in our data and nothing at all about the company.
 *
 * A finding means a sentence in the delivered brief converted that gap into a
 * fact: "not a Figma customer", "greenfield account", or an invented Figma seat
 * or ARR figure. The pipeline detects these after generation and reports them.
 * It does not block the run and does not rewrite the prose — deleting a clause
 * leaves a half-sentence that reads worse than the claim did — so the brief the
 * AE is reading still contains the sentence.
 *
 * Which is why this is a banner and not an icon. If seeing the finding requires
 * already suspecting it, it will not be seen, and the AE repeats the claim in
 * front of a customer who has been paying for Figma for three years.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface ClaimAuditFinding {
  id: number;
  pattern: string;
  finding_kind: string;
  surface: string;
  field_path: string;
  excerpt: string;
  data_state: string;
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

/**
 * Findings for one run.
 *
 * Fails open on every error path. RLS restricts the table to the brief's owner,
 * their manager and admins; a reader without access gets an empty list, which
 * renders as no banner. The table may also not exist yet — the SQL is applied by
 * hand in the Supabase SQL Editor — and a brief page that 500s because an
 * observability table is missing would be a worse outcome than a missing banner.
 */
export function useClaimAuditFindings(runId: string | undefined) {
  const [findings, setFindings] = useState<ClaimAuditFinding[]>([]);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('claim_audit_findings')
        .select('id, pattern, finding_kind, surface, field_path, excerpt, data_state')
        .eq('run_id', runId)
        .order('id', { ascending: true });

      if (cancelled) return;
      if (error) {
        console.warn('[claim-audit] findings fetch failed:', error.message);
        return;
      }
      setFindings((data ?? []) as ClaimAuditFinding[]);
    })();

    return () => { cancelled = true; };
  }, [runId]);

  return findings;
}

/**
 * run_id -> finding count, for a list page.
 *
 * One query for the whole page rather than one per row. Returns {} on failure,
 * and the caller treats a missing entry as zero — undercounting is the safe
 * direction: a brief showing no flag is the status quo, a flag on a clean brief
 * would be a false accusation.
 */
export function useClaimAuditCounts(runIds: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = runIds.join(',');

  useEffect(() => {
    if (runIds.length === 0) { setCounts({}); return; }
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('claim_audit_findings')
        .select('run_id')
        .in('run_id', runIds);

      if (cancelled) return;
      if (error) {
        console.warn('[claim-audit] counts fetch failed:', error.message);
        return;
      }
      const next: Record<string, number> = {};
      for (const row of (data ?? []) as { run_id: string }[]) {
        next[row.run_id] = (next[row.run_id] ?? 0) + 1;
      }
      setCounts(next);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return counts;
}

/* ------------------------------------------------------------------ */
/*  Presentation                                                       */
/* ------------------------------------------------------------------ */

/** Plain-English name for each detector, so the reader is not shown a slug. */
const PATTERN_LABELS: Record<string, string> = {
  non_customer:       'States the account is not a Figma customer',
  new_logo:           'Describes the account as a new logo',
  greenfield:         'Describes the account as greenfield',
  untouched:          'Describes the account as untouched or untapped',
  cold_account:       'Describes the account as cold',
  no_figma_presence:  'Asserts there is no Figma presence',
  does_not_use_figma: 'States the account does not use Figma',
  not_using_figma:    'States the account is not using Figma',
  zero_figma:         'States zero Figma spend or seats',
  figma_seat_count:   'Quotes a Figma seat or licence count',
  figma_seats_number: 'Quotes a Figma seat or licence count',
  figma_arr:          'Quotes a Figma ARR or spend figure',
  arr_near_figma:     'Quotes a Figma ARR or spend figure',
  whitespace_value:   'Quotes a whitespace opportunity value',
  penetration_pct:    'Quotes a seat penetration or occupancy percentage',
};

const SURFACE_LABELS: Record<string, string> = {
  pov: 'Brief',
  hooks: 'Contact hooks',
  personas: 'Contacts',
};

function describePattern(pattern: string) {
  return PATTERN_LABELS[pattern] ?? pattern.replace(/_/g, ' ');
}

/**
 * Where a finding sits, in words a reader can act on.
 *
 * The stored path is `hooks.contacts[0].outreach_context`. Prefixing it with the
 * surface name is what makes it findable — `pov` and `hooks` both have a
 * `narrative`, and a bare path does not say which half of the brief to scroll to.
 */
function describePath(surface: string, fieldPath: string) {
  const label = SURFACE_LABELS[surface] ?? surface;
  const rest = fieldPath.startsWith(`${surface}.`)
    ? fieldPath.slice(surface.length + 1)
    : fieldPath;
  return `${label} › ${rest}`;
}

/**
 * The small red flag for list pages.
 *
 * Deliberately reuses the failed-status colour rather than introducing a new
 * one: the portal already means "something here is wrong" by that red, and a
 * fourth signal colour would need learning before it could be read.
 */
export function ClaimAuditBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  if (!count) return null;
  return (
    <span
      title={
        `${count} unsupported Figma claim${count === 1 ? '' : 's'} — this brief had no ` +
        `whitespace record, so any statement about the account's Figma usage or spend ` +
        `is unsourced. Open the brief for detail.`
      }
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: compact ? '1px 5px' : '2px 7px',
        borderRadius: 5, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
        border: '1px solid rgba(220,38,38,0.25)',
        background: 'rgba(220,38,38,0.08)',
        color: 'var(--status-failed-text)',
      }}
    >
      <AlertTriangle size={11} strokeWidth={2.2} />
      {compact ? count : `${count} unsourced claim${count === 1 ? '' : 's'}`}
    </span>
  );
}

/**
 * The banner, at the top of the brief.
 *
 * Not below the fold and not collapsed by default. The count, then every finding
 * with the sentence that triggered it, because the AE has to read the sentence
 * to judge it — "greenfield fired somewhere in this brief" is not actionable and
 * a warning nobody can act on is a warning everybody learns to scroll past.
 */
export function ClaimAuditBanner({ findings }: { findings: ClaimAuditFinding[] }) {
  if (!findings.length) return null;

  const n = findings.length;
  // no_record: the book was searched and has no row. unknown: the lookup did not
  // complete. Different sentences — only the first is a statement about the
  // account, and collapsing them is the exact confusion this feature exists to
  // prevent.
  const unresolved = findings.some(f => f.data_state === 'unknown');

  return (
    <div
      role="alert"
      style={{
        border: '1px solid rgba(220,38,38,0.25)',
        background: 'rgba(220,38,38,0.07)',
        borderRadius: 8,
        padding: '14px 16px',
        marginBottom: 20,
        fontSize: 13,
        lineHeight: 1.55,
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <AlertTriangle size={16} strokeWidth={2.2} style={{ color: 'var(--status-failed-text)', flexShrink: 0 }} />
        <strong style={{ color: 'var(--status-failed-text)', fontSize: 13.5 }}>
          {n} unsourced claim{n === 1 ? '' : 's'} about this account&rsquo;s Figma usage
        </strong>
      </div>

      <p style={{ margin: '0 0 10px', color: 'var(--text-secondary)' }}>
        {unresolved
          ? 'The whitespace lookup for this account did not complete, so the pipeline had no Figma usage, seat or ARR data when this brief was written. '
          : 'This account has no record in the whitespace book, so the pipeline had no Figma usage, seat or ARR data when this brief was written. '}
        The sentence{n === 1 ? '' : 's'} below assert{n === 1 ? 's' : ''} something it had no basis for.
        {' '}
        <strong style={{ color: 'var(--text-primary)' }}>
          Do not repeat {n === 1 ? 'it' : 'them'} to the customer.
        </strong>
      </p>

      <ul style={{ margin: '0 0 10px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {findings.map(f => (
          <li
            key={f.id}
            style={{
              borderLeft: '2px solid rgba(220,38,38,0.3)',
              paddingLeft: 10,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--status-failed-text)', fontWeight: 500 }}>
              {describePattern(f.pattern)}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '1px 0 3px' }}>
              {describePath(f.surface, f.field_path)}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              &ldquo;{f.excerpt}&rdquo;
            </div>
          </li>
        ))}
      </ul>

      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
        Absence from the whitespace book is not evidence that the account does not use Figma.
        The book covers a filtered set of accounts; a company outside it can hold Pro teams,
        free signups, or seats recorded under another domain.
      </p>
    </div>
  );
}
