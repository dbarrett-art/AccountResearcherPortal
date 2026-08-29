/**
 * The queued badge.
 *
 * `queued` was a static grey dot while `running` pulsed, which put a waiting run
 * in the same visual family as `complete` and `failed` — both terminal. Combined
 * with a position that always rendered "#?", what an AE saw after fifteen
 * minutes was a stopped-looking badge next to a question mark, and read it as
 * broken.
 *
 * Two things have to stay true, and both are the sort that a later restyle
 * silently undoes: queued must animate, and it must not animate the same way
 * running does.
 */

import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import StatusBadge from './StatusBadge';

/**
 * The dot is the first child span that is neither the progress fill (which is
 * aria-hidden) nor the label (which has text). Selected that way rather than by
 * position, because the fill is conditionally rendered ahead of it and a
 * positional selector would quietly start asserting about the wrong element.
 */
const dot = (container: HTMLElement) =>
  [...container.querySelectorAll('span > span')].find(
    el => !el.hasAttribute('aria-hidden') && !el.textContent,
  ) as HTMLElement;

describe('the queued badge reads as waiting', () => {
  test('queued animates', () => {
    const { container } = render(<StatusBadge status="queued" />);
    expect(dot(container).className).toBe('pulse-wait');
  });

  test('queued and running do not share an animation', () => {
    const q = render(<StatusBadge status="queued" />).container;
    const r = render(<StatusBadge status="running" />).container;
    expect(dot(q).className).not.toBe(dot(r).className);
    expect(dot(r).className).toBe('pulse');
  });

  test('the terminal states stay still', () => {
    for (const status of ['complete', 'failed'] as const) {
      const { container } = render(<StatusBadge status={status} />);
      expect(dot(container).className).toBe('');
    }
  });
});

describe('the fill toward the estimated wait', () => {
  const fillEl = (container: HTMLElement) =>
    container.querySelector('[aria-hidden="true"]') as HTMLElement | null;

  test('fills proportionally on a queued run', () => {
    const { container } = render(<StatusBadge status="queued" progress={0.4} />);
    expect(fillEl(container)?.style.width).toBe('40%');
  });

  // The Worker route may not exist yet, in which case there is no estimate. The
  // badge still breathes; only the fill is missing.
  test('no progress means no fill, not a zero-width artefact', () => {
    const { container } = render(<StatusBadge status="queued" />);
    expect(fillEl(container)).toBeNull();
    expect(dot(container).className).toBe('pulse-wait');
  });

  test('the dot keeps breathing behind the fill', () => {
    const { container } = render(<StatusBadge status="queued" progress={0.4} />);
    expect(dot(container).className).toBe('pulse-wait');
  });

  test('out-of-range values are clamped rather than rendered', () => {
    expect(fillEl(render(<StatusBadge status="queued" progress={4} />).container)?.style.width).toBe('100%');
    expect(fillEl(render(<StatusBadge status="queued" progress={-1} />).container)?.style.width).toBe('0%');
  });

  // A running brief has a real ProgressBar under it; a second, different bar
  // inside its badge would be two answers to the same question.
  test('other statuses ignore progress entirely', () => {
    for (const status of ['running', 'complete', 'failed'] as const) {
      const { container } = render(<StatusBadge status={status} progress={0.5} />);
      expect(fillEl(container)).toBeNull();
    }
  });
});
