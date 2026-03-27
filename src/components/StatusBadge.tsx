type Status = 'queued' | 'running' | 'complete' | 'failed';

const statusStyles: Record<Status, { bg: string; text: string; dot: string }> = {
  queued: {
    bg: 'rgba(74,74,74,0.3)',
    text: 'var(--status-queued-text)',
    dot: 'var(--status-queued)',
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

export default function StatusBadge({ status }: { status: Status }) {
  const s = statusStyles[status] || statusStyles.queued;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
        background: s.bg,
        color: s.text,
      }}
    >
      <span
        className={status === 'running' ? 'pulse' : undefined}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: s.dot,
          flexShrink: 0,
        }}
      />
      {labels[status]}
    </span>
  );
}
