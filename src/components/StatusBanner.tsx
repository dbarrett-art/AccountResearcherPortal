import { useState } from 'react';
import { useStatus } from '../context/StatusContext';

const DISMISSED_KEY = 'status_banner_dismissed';

export default function StatusBanner() {
  const { indicator } = useStatus();
  const [dismissed, setDismissed] = useState(
    sessionStorage.getItem(DISMISSED_KEY) === '1'
  );

  if (indicator === 'none' || dismissed) return null;

  const isCritical = indicator === 'major' || indicator === 'critical';

  return (
    <div style={{
      background: isCritical ? 'rgba(220,38,38,0.12)' : 'rgba(245,158,11,0.12)',
      borderBottom: `1px solid ${isCritical ? 'rgba(220,38,38,0.3)' : 'rgba(245,158,11,0.3)'}`,
      padding: '10px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 13,
      color: isCritical ? '#dc2626' : '#92400e',
    }}>
      <span>{'\u26A0'}</span>
      <span style={{ flex: 1 }}>
        {isCritical
          ? 'Anthropic API is currently experiencing issues \u2014 research briefs may fail. '
          : 'Anthropic API has degraded performance \u2014 briefs may take longer than usual. '}
        <a href="https://status.claude.com" target="_blank" rel="noopener"
           style={{ color: 'inherit', textDecoration: 'underline' }}>
          Check status {'\u2197'}
        </a>
      </span>
      <button
        onClick={() => { sessionStorage.setItem(DISMISSED_KEY, '1'); setDismissed(true); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16, padding: '0 4px' }}
      >
        {'\u2715'}
      </button>
    </div>
  );
}
