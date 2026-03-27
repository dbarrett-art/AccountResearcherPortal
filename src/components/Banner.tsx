type BannerType = 'info' | 'warning' | 'error' | 'success';

const styles: Record<BannerType, { bg: string; border: string; color: string }> = {
  info: { bg: 'var(--accent-subtle)', border: 'rgba(94,106,210,0.2)', color: '#a5b4fc' },
  warning: { bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.2)', color: 'var(--status-running-text)' },
  error: { bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)', color: 'var(--status-failed-text)' },
  success: { bg: 'rgba(22,163,74,0.08)', border: 'rgba(22,163,74,0.2)', color: 'var(--status-complete-text)' },
};

export default function Banner({ type, children, style }: {
  type: BannerType;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const s = styles[type];
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6, fontSize: 13,
      border: `1px solid ${s.border}`, background: s.bg, color: s.color,
      ...style,
    }}>
      {children}
    </div>
  );
}
