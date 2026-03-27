export default function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} style={{ padding: '10px 16px', textAlign: 'left' }}>
                <div style={{ height: 10, width: 60 + (i * 12) % 40, background: 'var(--bg-elevated)', borderRadius: 3 }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ borderBottom: '1px solid var(--border)' }}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} style={{ padding: '11px 16px' }}>
                  <div style={{
                    height: 12, borderRadius: 3, background: 'var(--bg-elevated)',
                    width: c === 0 ? '70%' : c === cols - 1 ? 40 : '50%',
                    opacity: 0.5 + (r % 3) * 0.15,
                  }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
