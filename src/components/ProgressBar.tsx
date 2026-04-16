interface ProgressBarProps {
  step: number;
  total: number;
  module: string | null;
  pct: number;
}

export default function ProgressBar({ step, total, module, pct }: ProgressBarProps) {
  const indeterminate = step === 0;

  return (
    <div style={{ width: '100%' }}>
      <div style={{
        height: 3,
        background: 'var(--bg-elevated)',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 4,
      }}>
        {indeterminate ? (
          <div style={{
            height: '100%',
            width: '40%',
            background: 'var(--status-running)',
            borderRadius: 2,
            animation: 'progressPulse 1.5s ease-in-out infinite',
          }} />
        ) : (
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--status-running)',
            borderRadius: 2,
            transition: 'width 500ms ease',
          }} />
        )}
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11,
        color: 'var(--text-tertiary)',
      }}>
        <span>{module || 'Running\u2026'}</span>
        {!indeterminate && <span>{step}/{total}</span>}
      </div>
      {indeterminate && (
        <style>{`
          @keyframes progressPulse {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(350%); }
          }
        `}</style>
      )}
    </div>
  );
}
