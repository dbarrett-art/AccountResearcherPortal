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
  /**
   * Which of the two audits produced this row: 'supplied_figures' when the
   * pipeline HAD Figma's commercial record and the figure failed to match it,
   * 'no_record' when it had nothing and the claim was unsourced by construction.
   *
   * Optional on the type, not because the column is nullable — every row the
   * pipeline writes sets it — but because rows written before
   * sql/claim-audit-matched-briefs.sql added the column would not have it, and a
   * required field would make those rows unrepresentable rather than handled.
   * resolveBannerVariant() falls back to data_state for exactly that case.
   */
  audit_mode?: string | null;
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
        .select('id, pattern, finding_kind, surface, field_path, excerpt, data_state, audit_mode')
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

  // The matched-brief detectors (audit_mode 'supplied_figures'). These describe
  // a figure that CONTRADICTS a record we hold, not one invented out of nothing,
  // so the wording deliberately differs from the no-record labels above. Without
  // them these three rendered as 'unsupported figure' — the slug with its
  // underscores swapped for spaces, which reads like a category rather than a
  // finding.
  unsupported_figure: 'Quotes a Figma figure that is not in our record',
  rounded_figure:     'Rounds or restates a Figma figure from our record',
  hedged_figure:      'Hedges a Figma figure our record states exactly',
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
 *
 * "Flagged", not "unsourced". This takes a count and nothing else — useClaimAuditCounts
 * fetches one column for a whole page — so it cannot know which audit produced
 * the findings, and "unsourced" is only true of one of the two. A component that
 * cannot tell the modes apart must use wording that is true of both rather than
 * pick the stronger one and be wrong half the time. Teaching it the modes would
 * mean fetching audit_mode per row on every list page, which is a real cost for
 * a tooltip; saying less is free.
 */
export function ClaimAuditBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  if (!count) return null;
  return (
    <span
      title={
        `${count} Figma claim${count === 1 ? '' : 's'} in this brief could not be matched ` +
        `to our record of the account. Open the brief for detail.`
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
      {compact ? count : `${count} flagged claim${count === 1 ? '' : 's'}`}
    </span>
  );
}

/**
 * What the banner is actually reporting.
 *
 * This used to be a boolean — `findings.some(f => f.data_state === 'unknown')` —
 * with "not unknown" standing in for "no record". That inference held for exactly
 * as long as the audit ran on two states. When the matched-brief audit shipped
 * (src/utils/whitespace-claim-audit.mjs `auditSuppliedFigures`, and
 * sql/claim-audit-matched-briefs.sql widening the CHECK), findings started
 * arriving with data_state 'enriched' — and 'enriched' is not 'unknown', so every
 * one of them fell into the else and the banner told the AE that a paying
 * customer had no record in the whitespace book. IKEA, a $700K account, was the
 * first brief to exercise that path and it read as a net-new prospect.
 *
 * So the branch is now explicit and keyed on `audit_mode`, which states the
 * answer outright instead of leaving it to be deduced from what a value is NOT.
 * The two are different questions: `audit_mode` is which audit ran, `data_state`
 * is what M1.5 resolved, and only the first determines what the banner may claim.
 *
 * Anything unrecognised resolves to 'indeterminate' rather than to a default with
 * an opinion. That is the actual lesson from the bug: the old code had no neutral
 * branch, so a value it had never heard of did not degrade — it asserted the
 * strongest possible claim about the account with full confidence.
 */
export type ClaimAuditVariant = 'supplied_figures' | 'no_record' | 'unknown' | 'indeterminate';

export function resolveBannerVariant(findings: ClaimAuditFinding[]): ClaimAuditVariant {
  if (!findings.length) return 'indeterminate';

  // `audit_mode` is authoritative where present. A run is audited in exactly one
  // mode (auditModeFor picks one per run), so a mixed array should not occur —
  // but if one ever does, 'supplied_figures' wins. That is the safe direction:
  // it means the pipeline HELD the commercial record, and the failure being
  // guarded against is claiming "no record" about an account that has one.
  const modes = new Set(findings.map(f => f.audit_mode).filter(Boolean) as string[]);
  if (modes.has('supplied_figures')) return 'supplied_figures';

  if (modes.has('no_record') || modes.size === 0) {
    // Either the pipeline said so, or these are legacy rows from before the
    // column existed and data_state is all there is. Same two-way split as
    // before, but now reached deliberately rather than by falling through.
    //
    // 'unknown' wins over 'no_record' on a mixed array: "we could not find out"
    // is the weaker claim, and overstating it into "the book has no row" is the
    // confusion this feature was built to prevent.
    if (findings.some(f => f.data_state === 'unknown')) return 'unknown';
    if (findings.every(f => f.data_state === 'no_record')) return 'no_record';
    return 'indeterminate';
  }

  // An audit_mode this build has never heard of. Say less, not more.
  return 'indeterminate';
}

/**
 * Headline and explanation per variant.
 *
 * A `switch` over the union with no `default`, plus an EXPLICIT return type that
 * does not include `undefined`. Those two together are the guard: add a fifth
 * variant to ClaimAuditVariant without giving it copy here and the switch is no
 * longer exhaustive, so the function can fall off the end — which the annotation
 * forbids. `tsc -b` fails with TS2366 ("Function lacks ending return statement"),
 * and `npm run build` runs `tsc -b`, so it cannot reach a deploy. Verified by
 * adding a fifth variant and watching the build break, not assumed.
 *
 * A `default` case would defeat this entirely, which is why there isn't one. That
 * is the compile-time half of "a new state cannot silently take the wrong
 * branch"; the runtime half is resolveBannerVariant()'s 'indeterminate' fallback,
 * for a value that arrives from the database rather than from this file.
 */
function bannerCopy(variant: ClaimAuditVariant, n: number): {
  headline: string;
  lead: string;
  /** The closing note. Null where none of them is true for this variant. */
  footnote: string | null;
} {
  const s = n === 1 ? '' : 's';
  const sentences = `The sentence${s} below assert${n === 1 ? 's' : ''}`;
  switch (variant) {
    case 'supplied_figures':
      return {
        // NOT "unsourced". These findings mean the opposite: the pipeline was
        // given Figma's own record for this account and the brief quoted a
        // number that is not in it. Calling that unsourced tells the AE the
        // account has no data, which is the error this banner caused.
        headline: `${n} figure${s} that do${n === 1 ? 'es' : ''} not match Figma’s record for this account`,
        lead: 'The pipeline supplied this brief with Figma’s own commercial record for this '
          + `account, so its seat, ARR and usage figures are known. ${sentences} a figure that `
          + 'does not appear in that record — invented, rounded, or hedged into something the '
          + 'record does not say. ',
        footnote: 'The account’s real figures are in the Figma usage section of this brief. '
          + 'A mismatch here is the brief contradicting itself, not a gap in our data.',
      };
    case 'unknown':
      return {
        headline: `${n} unsourced claim${s} about this account’s Figma usage`,
        lead: 'The whitespace lookup for this account did not complete, so the pipeline had no '
          + `Figma usage, seat or ARR data when this brief was written. ${sentences} something `
          + 'it had no basis for. ',
        footnote: 'A failed lookup is not evidence about the account either way. It may well be '
          + 'in the whitespace book; we were unable to ask.',
      };
    case 'no_record':
      return {
        headline: `${n} unsourced claim${s} about this account’s Figma usage`,
        lead: 'This account has no record in the whitespace book, so the pipeline had no Figma '
          + `usage, seat or ARR data when this brief was written. ${sentences} something it had `
          + 'no basis for. ',
        footnote: 'Absence from the whitespace book is not evidence that the account does not use '
          + 'Figma. The book covers a filtered set of accounts; a company outside it can hold Pro '
          + 'teams, free signups, or seats recorded under another domain.',
      };
    case 'indeterminate':
      return {
        // Deliberately makes no claim about the whitespace book in either
        // direction, because in this branch we do not know which is true.
        headline: `${n} flagged claim${s} about this account’s Figma usage`,
        lead: `The claim audit flagged ${n === 1 ? 'this sentence' : 'these sentences'}, but the `
          + 'reason it flagged them could not be determined from the stored findings. ',
        footnote: 'Check the figures against the Figma usage section of this brief before '
          + 'repeating them.',
      };
  }
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
  const copy = bannerCopy(resolveBannerVariant(findings), n);

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
          {copy.headline}
        </strong>
      </div>

      <p style={{ margin: '0 0 10px', color: 'var(--text-secondary)' }}>
        {copy.lead}
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

      {copy.footnote && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          {copy.footnote}
        </p>
      )}
    </div>
  );
}
