type Status = 'queued' | 'running' | 'complete' | 'failed';

const statusStyles: Record<Status, { bg: string; text: string; dot: string }> = {
  queued: {
    bg: 'rgba(59,130,246,0.12)',
    text: '#3b82f6',
    dot: '#3b82f6',
  },
  running: {
    bg: 'rgba(217,119,6,0.15)',
    text: 'var(--status-running-text)',
    dot: 'var(--status-running)',
  },
  complete: {
    bg: 'rgba(22,163,74,0.12)',
    text: 'var(--status-complete-text)',
    dot: 'var(--status-complete)',
  },
  failed: {
    bg: 'rgba(220,38,38,0.12)',
    text: 'var(--status-failed-text)',
    dot: 'var(--status-failed)',
  },
};

const labels: Record<Status, string> = {
  queued: 'Queued',
  running: 'Running',
  complete: 'Complete',
  failed: 'Failed',
};

interface Props {
  status: Status;
  /**
   * 0–1, how much of the estimated wait a queued run has served. Fills the badge
   * from the left, so a run that has been waiting looks like it is getting
   * somewhere. Ignored on every other status.
   *
   * Optional because the number depends on `/queue-status`, and a Worker without
   * that route returns nothing — in which case the badge still breathes, it just
   * does not fill. Never let the fill be the only sign of life.
   */
  progress?: number | null;
}

/**
 * `queued` used to be a static grey dot while `running` pulsed, which put a
 * waiting run in the same visual family as the two terminal states. An AE
 * looking at "Queued · 15 minutes ago · #?" reasonably read it as stuck.
 *
 * It now breathes on a slower, differently-shaped animation than running (see
 * `.pulse-wait` in index.css) and can carry a fill toward its estimated wait.
 * Distinct from running, and clearly not stopped.
 */
export default function StatusBadge({ status, progress }: Props) {
  const s = statusStyles[status] || statusStyles.queued;
  const fill = status === 'queued' && progress != null
    ? Math.max(0, Math.min(1, progress))
    : null;

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
        background: s.bg,
        color: s.text,
        overflow: 'hidden',
      }}
    >
      {fill != null && (
        // Behind the label, not beside it — the badge is already the smallest
        // thing on the row and a second element would push the timestamp along.
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0, top: 0, bottom: 0,
            width: `${fill * 100}%`,
            background: s.dot,
            opacity: 0.18,
            transition: 'width 1s linear',
            pointerEvents: 'none',
          }}
        />
      )}
      <span
        className={status === 'running' ? 'pulse' : status === 'queued' ? 'pulse-wait' : undefined}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: s.dot,
          // `pulse-wait` expands a `currentColor` ring; without this it would
          // inherit the label colour, which is the same hue today and would not
          // be if anyone retunes `text`.
          color: s.dot,
          flexShrink: 0,
          position: 'relative',
        }}
      />
      <span style={{ position: 'relative' }}>{labels[status]}</span>
    </span>
  );
}
