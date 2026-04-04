import usePageTitle from '../hooks/usePageTitle';

export default function SharedBriefView() {
  usePageTitle('Shared Brief');

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      height: '100vh', flexDirection: 'column', gap: 16, padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        maxWidth: 420, textAlign: 'center',
      }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: '#e5e5e5', margin: '0 0 12px' }}>
          This sharing link is no longer active
        </h1>
        <p style={{ fontSize: 14, color: '#888', lineHeight: 1.7, margin: 0 }}>
          If you need access to this brief, please contact the person who shared it
          and ask them to send you a new access link.
        </p>
      </div>
    </div>
  );
}
