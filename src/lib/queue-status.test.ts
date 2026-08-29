/**
 * The queue copy.
 *
 * Worth testing because the failure mode is silent and the reason field is the
 * only thing telling the two waits apart. Until the admission-controller Worker
 * is deployed, `queued_reason` is absent on every response, so the generic
 * branch is not a fallback in theory — it is the branch that runs in production
 * today, and it has to keep saying what it always said.
 *
 * The other half is that 'no-token' must NOT say "when a slot frees up". Nothing
 * is occupied in that state; the run is being metered by a 40-second token drip.
 * Telling somebody to wait for a finish that is not coming turns a 90-second
 * wait into what reads as a stall — which is the bug this whole change exists
 * to fix, restated in words.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import { queueWaitCopy, queueShortLabel, queueProgress } from './queue-status';

afterEach(() => { vi.useRealTimers(); });

describe('queueWaitCopy', () => {
  test('no-token: starting shortly, and never "when a slot frees up"', () => {
    const copy = queueWaitCopy({ position: 2, waitMinutes: 2, reason: 'no-token', inFlight: 4 });
    expect(copy).toMatch(/#2/);
    expect(copy).toMatch(/starting shortly/i);
    expect(copy).toMatch(/~2 minutes/);
    expect(copy).not.toMatch(/slot frees up/i);
    // Four jobs running is not why this run is waiting; saying so would be wrong.
    expect(copy).not.toMatch(/4 briefs/);
  });

  test('ceiling: names the count, because that is what explains the wait', () => {
    const copy = queueWaitCopy({ position: 3, waitMinutes: 26, reason: 'ceiling', inFlight: 18 });
    expect(copy).toMatch(/waiting for capacity/i);
    expect(copy).toMatch(/18 briefs are currently running/);
    expect(copy).toMatch(/~26 minutes/);
    expect(copy).not.toMatch(/starting shortly/i);
  });

  test('ceiling with no count: says capacity without inventing a number', () => {
    const copy = queueWaitCopy({ position: 1, waitMinutes: 13, reason: 'ceiling', inFlight: null });
    expect(copy).toMatch(/at capacity/i);
    expect(copy).not.toMatch(/\d+ briefs? (is|are)/);
  });

  test('one brief running reads as singular', () => {
    expect(queueWaitCopy({ position: 1, waitMinutes: 13, reason: 'ceiling', inFlight: 1 }))
      .toMatch(/1 brief is currently running/);
  });

  // The branch production is on until the Worker ships.
  test('no reason at all: today’s copy, unchanged', () => {
    const copy = queueWaitCopy({ position: 2, waitMinutes: 24 });
    expect(copy).toMatch(/#2/);
    expect(copy).toMatch(/~24 minutes/);
    expect(copy).toMatch(/starts automatically when a slot frees up/i);
    expect(copy).toMatch(/notified when the brief is ready/i);
  });

  // A Worker NEWER than this bundle, or a reason nobody here has heard of. The
  // controller's degraded 'fallback-occupancy' is the live example.
  test('an unrecognised reason falls through to the generic copy', () => {
    for (const reason of ['fallback-occupancy', 'something-invented-later']) {
      const copy = queueWaitCopy({ position: 1, waitMinutes: 5, reason });
      expect(copy).toMatch(/starts automatically when a slot frees up/i);
      expect(copy).not.toMatch(/undefined|\[object/);
    }
  });

  test('missing position and wait still produce a sentence', () => {
    for (const reason of ['no-token', 'ceiling', null]) {
      const copy = queueWaitCopy({ position: null, waitMinutes: null, reason });
      expect(copy).toMatch(/queued|queue/i);
      expect(copy).not.toMatch(/null|undefined|NaN|#\?/);
    }
  });

  test('a one-minute wait is not "1 minutes"', () => {
    expect(queueWaitCopy({ position: 1, waitMinutes: 1, reason: 'no-token' })).toMatch(/~1 minute\b/);
  });
});

describe('queueShortLabel', () => {
  test('position and wait when both are known', () => {
    expect(queueShortLabel({ position: 3, waitMinutes: 12 })).toBe('#3 · ~12m');
  });

  // What the page shows against a Worker without /queue-status — the same "#?"
  // it shows today, rather than a number invented to fill the space.
  test('#? when nothing is known, and no invented wait', () => {
    expect(queueShortLabel({ position: null, waitMinutes: null })).toBe('#?');
  });

  test('a position with no estimate shows just the position', () => {
    expect(queueShortLabel({ position: 2, waitMinutes: null })).toBe('#2');
  });
});

describe('queueProgress', () => {
  const T0 = new Date('2026-08-29T12:00:00Z').getTime();

  test('null whenever there is nothing to measure against', () => {
    expect(queueProgress(null, 10)).toBeNull();
    expect(queueProgress('2026-08-29T12:00:00Z', null)).toBeNull();
    expect(queueProgress('2026-08-29T12:00:00Z', 0)).toBeNull();
    expect(queueProgress('not a date', 10)).toBeNull();
  });

  test('fills across the estimate', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 5 * 60_000);
    expect(queueProgress('2026-08-29T12:00:00Z', 10)).toBeCloseTo(0.5, 5);
  });

  // The one that matters: an estimate that has run out is still a queued run,
  // and a full bar next to the word "Queued" reads as finished.
  test('never reaches 1, however long the wait overruns', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 400 * 60_000);
    expect(queueProgress('2026-08-29T12:00:00Z', 10)).toBe(0.95);
  });

  test('a queued_at in the future is 0, not negative', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 - 60_000);
    expect(queueProgress('2026-08-29T12:00:00Z', 10)).toBe(0);
  });
});
