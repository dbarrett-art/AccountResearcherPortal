/**
 * TOTAL WHITESPACE — one arithmetic, one answer.
 *
 * Deliberate port of the pipeline's `src/utils/whitespace-total.mjs`. Change one
 * and change the other in the same commit; `scripts/verify-whitespace-total-parity.mjs`
 * in that repo asserts they agree.
 *
 * Before this the figure was inlined in six places across the two repos, with
 * six slightly different arithmetics — which is how the services stacking defect
 * survived as long as it did. Two of those places were in this file's callers.
 *
 * Note the rounding: the seat gap is rounded to a whole seat before pricing.
 * BriefView and Territory previously multiplied the raw fractional gap, which
 * made them disagree with 06_pdf.js by up to $835 on the same account.
 */

import { servicesContribution } from './services-value';

export const SEAT_PRICE = { devMode: 35, fullSeat: 90 };

const seat = (bucket: any, monthly: number) =>
  Math.max(0, Math.round(bucket?.gap || 0)) * monthly * 12;

/** Seat and tier buckets — everything except services. */
export function whitespaceBuckets(ws: any): number {
  const kg = ws?.key_gaps || {};

  if (Array.isArray(kg)) {
    let total = 0;
    for (const item of kg) {
      const prod = (item.product || '').toLowerCase();
      if (prod.includes('dev mode')) total += seat(item, SEAT_PRICE.devMode);
      else if (prod.includes('pm') || prod.includes('make')) total += seat(item, SEAT_PRICE.fullSeat);
      else if (prod.includes('enterprise')) total += Math.max(0, item.estimated_value || item.incremental_value || item.value || 0);
      else if (prod.includes('governance')) total += Math.max(0, item.estimated_value || item.value || 0);
    }
    return total;
  }

  let total = seat(kg.dev_mode, SEAT_PRICE.devMode)
    + seat(kg.full_seats_designers, SEAT_PRICE.fullSeat)
    + seat(kg.make_pm, SEAT_PRICE.fullSeat);

  const gov = kg.governance_plus || ws?.governance_plus;
  if (gov?.value > 0) total += gov.value;

  const eu = kg.enterprise_upgrade || ws?.enterprise_upgrade;
  if (eu?.eligible && eu.value > 0) total += (eu.incremental_value || eu.value);

  return total;
}

/**
 * TOTAL WHITESPACE for a brief. Null — never 0 — when the brief carries no
 * whitespace section, because "never measured" is not "measured at zero".
 */
export function whitespaceTotalValue(pov: any): number | null {
  const ws = pov?.whitespace_section;
  if (!ws) return null;
  return whitespaceBuckets(ws) + servicesContribution(ws);
}

/**
 * The figure to show for a run: the stored column when it is there, the
 * computation when it is not.
 *
 * `runs.whitespace_total_value` is written by the pipeline and backfilled by
 * scripts/backfill-whitespace-total.mjs, but sql/whitespace-total-value.sql is
 * hand-applied — so the column may be absent, null, or not yet backfilled. In
 * every one of those cases this falls back to computing from pov_json, which the
 * portal already has loaded. The two agree by construction; the column exists so
 * consumers that DON'T hold the brief read the same number.
 */
export function resolveWhitespaceTotal(run: any, pov: any): number | null {
  const stored = run?.whitespace_total_value;
  if (stored != null && Number.isFinite(Number(stored))) return Number(stored);
  return whitespaceTotalValue(pov);
}

