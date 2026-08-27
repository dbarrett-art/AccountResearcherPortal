/**
 * The services figure for an account — counted once.
 *
 * Deliberate port of the pipeline's `src/utils/services-value.mjs`. Change one
 * and change the other in the same commit, the way domain-rank.ts and
 * domain-rank.mjs are kept in step.
 *
 * Multiple services triggers are routes in, not separate line items. Three
 * triggers firing means an AE has three ways to open the same conversation, not
 * three engagements to sell. Before 2026-08-27 this file's callers each did
 * `services.length * 125000`, which stacked the same engagement per trigger AND
 * used a hardcoded price the ARR floor overtakes on any account above $500K ARR
 * — so the portal's TOTAL WHITESPACE disagreed with both PDF renderers, which at
 * least added the real floor.
 */

/** The floor's floor. An account below $500K ARR gets exactly this. */
export const SERVICES_MINIMUM = 125000;

/** `max(ARR x 0.25, 125000)` — preferring the figure M1.5 stored. */
export function servicesArrFloor(ws: any): number {
  const stored = Number(ws?.services_arr_floor);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const arr = Number(ws?.current_arr ?? ws?.arr_floor ?? 0);
  return Math.max(Number.isFinite(arr) ? arr * 0.25 : 0, SERVICES_MINIMUM);
}

/** The triggers that fired. Rendered as rows; priced as nothing. */
export function foundServiceTriggers(ws: any): any[] {
  return (ws?.services_opportunities || []).filter((s: any) => s?.found);
}

/** The floor once if any trigger fired, zero if none did. */
export function servicesContribution(ws: any): number {
  return foundServiceTriggers(ws).length > 0 ? servicesArrFloor(ws) : 0;
}
