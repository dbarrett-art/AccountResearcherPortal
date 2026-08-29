import { workerFetch } from './supabase';

/**
 * One queued run's live place in the queue.
 *
 * Everything here comes from `GET /queue-status/:runId`, which recomputes on
 * every call. Nothing reads `runs.queue_position` any more, and that column is
 * still never written — measured 2026-08-29, 0 of 346 rows hold one, which is
 * why `Position #{run.queue_position || '?'}` rendered literally "Position #?"
 * for the whole life of the feature.
 *
 * Writing the column would have been the smaller change and the worse one: a
 * position stored at INSERT is right until the run in front of it dispatches,
 * and then it is a confident lie. "#?" at least looked like ignorance.
 */

/**
 * Which gate is holding the queue.
 *
 * The first three come from the Worker's admission controller and are the same
 * strings `/submit` and `/retry` return on a queued response, so there is one
 * mapping from reason to copy rather than two. The `(string & {})` arm is not
 * decoration: this field arrives from a deployed Worker that may be OLDER than
 * this bundle — GitHub Pages and the Worker deploy separately, by hand, on
 * different days — so an unrecognised value has to fall through to generic copy
 * rather than render `undefined`.
 */
export type QueuedReason = 'ceiling' | 'no-token' | 'fallback-occupancy' | (string & {});

export interface QueueStatus {
  run_id: string;
  /** Whatever `runs.status` says now — the poll learns "stop asking" from this. */
  status: string;
  queue_position: number | null;
  estimated_wait_minutes: number | null;
  queued_reason: QueuedReason | null;
  in_flight: number | null;
  ceiling?: number | null;
  queue_length?: number | null;
  queued_at?: string | null;
  computed_at?: string;
}

/** The subset Submit's confirmation and MyBriefs' row both need. */
export interface QueueView {
  position: number | null;
  waitMinutes: number | null;
  reason?: QueuedReason | null;
  inFlight?: number | null;
}

/**
 * The wait, in words.
 *
 * Three shapes, and the third is the one that matters most today:
 *
 *   'no-token'   the bucket is empty and refilling on a 40s drip. The wait is
 *                short and nothing has to finish first — "starting shortly" is
 *                literally true, and "when a slot frees up" is not.
 *   'ceiling'    18 jobs are in flight. Something genuinely has to finish, and
 *                the count is worth showing because it explains the wait.
 *   anything else, or nothing
 *                Today's generic line. This is the branch that runs until the
 *                admission-controller Worker is deployed, because a Worker
 *                without it returns no `queued_reason` at all. It is not a
 *                degraded state so much as the current one.
 */
export function queueWaitCopy(view: QueueView): string {
  const { position, waitMinutes, reason, inFlight } = view;

  const place = position != null ? `You’re #${position} in the queue` : 'Your run is queued';
  const eta = waitMinutes != null ? `estimated wait ~${waitMinutes} minute${waitMinutes === 1 ? '' : 's'}` : null;
  const tail = 'You’ll be notified when the brief is ready.';

  if (reason === 'no-token') {
    // Deliberately no "when a slot frees up": nothing is occupied. The run is
    // being metered, not blocked, and telling somebody to wait for a finish that
    // is not coming is how a 90-second wait reads as a stall.
    return `${place} — starting shortly${eta ? `, ${eta}` : ''}. Submissions are released a few at a time. ${tail}`;
  }

  if (reason === 'ceiling') {
    const busy = inFlight != null
      ? `${inFlight} brief${inFlight === 1 ? ' is' : 's are'} currently running`
      : 'the system is at capacity';
    return `${place} — waiting for capacity; ${busy}. It starts automatically when one finishes${eta ? `, ${eta}` : ''}. ${tail}`;
  }

  // Unknown reason, or none. Today's copy, unchanged.
  return `${place}${eta ? ` — ${eta}` : ''}. It starts automatically when a slot frees up, and ${tail.charAt(0).toLowerCase()}${tail.slice(1)}`;
}

/**
 * The same thing at list width — MyBriefs shows this beside the status badge,
 * where there is room for a position and a wait and nothing else.
 */
export function queueShortLabel(view: QueueView): string {
  const { position, waitMinutes } = view;
  const place = position != null ? `#${position}` : '#?';
  return waitMinutes != null ? `${place} · ~${waitMinutes}m` : place;
}

/** Hover text for that short label — the reason, spelled out. */
export function queueShortTitle(view: QueueView): string {
  return queueWaitCopy(view);
}

/**
 * Fraction of the estimated wait already served, 0–1, or null when there is
 * nothing to measure against. Drives the queued badge's fill.
 *
 * Clamped BELOW 1 on purpose. An estimate that has run out is still a queued
 * run, and a bar sitting at 100% next to the word "Queued" reads as finished;
 * the cap says "any moment now" instead, which is the truth.
 */
export function queueProgress(queuedAt: string | null | undefined, waitMinutes: number | null | undefined): number | null {
  if (!queuedAt || waitMinutes == null || !(waitMinutes > 0)) return null;
  const started = new Date(queuedAt).getTime();
  if (!Number.isFinite(started)) return null;
  const elapsedMin = (Date.now() - started) / 60000;
  if (elapsedMin < 0) return 0;
  return Math.max(0, Math.min(0.95, elapsedMin / waitMinutes));
}

/**
 * Fetch one run's live queue status. Returns null on any failure — a poll that
 * throws would take out the whole page, and a missing position is a cosmetic
 * loss, not a correctness one.
 *
 * Also returns null against a Worker that does not have the route yet (404),
 * which is exactly what production answers until the admission-controller build
 * is deployed. Callers keep whatever they had.
 */
export async function fetchQueueStatus(runId: string, signal?: AbortSignal): Promise<QueueStatus | null> {
  try {
    const res = await workerFetch(`/queue-status/${runId}`, { signal });
    if (!res.ok) return null;
    return (await res.json()) as QueueStatus;
  } catch {
    return null;
  }
}
