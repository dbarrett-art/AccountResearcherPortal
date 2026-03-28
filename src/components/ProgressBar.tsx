interface ProgressBarProps {
  step: number;
  total: number;
  module: string | null;
  pct: number;
}

export default function ProgressBar({ step, total, module, pct }: ProgressBarProps) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        height: 3,
        background: 'var(--bg-elevated)',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 4,
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--status-running)',
          borderRadius: 2,
          transition: 'width 500ms ease',
        }} />
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11,
        color: 'var(--text-tertiary)',
      }}>
        <span>{module || 'Starting\u2026'}</span>
        <span>{step}/{total}</span>
      </div>
    </div>
  );
}
