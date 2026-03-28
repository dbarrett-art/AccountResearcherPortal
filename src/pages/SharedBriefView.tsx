import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';

export default function SharedBriefView() {
  const { token } = useParams<{ token: string }>();
  usePageTitle('Shared Brief');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`https://go.accountresearch.workers.dev/share-brief/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed to load' }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#888', fontSize: 13 }}>
        Loading shared brief...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 14, color: '#ef4444', fontWeight: 500 }}>{error}</div>
        <div style={{ fontSize: 13, color: '#888' }}>This share link may have expired or been revoked.</div>
      </div>
    );
  }

  const pov = data?.pov_json;
  const run = data?.run;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #333' }}>
        <div style={{ fontSize: 11, color: '#888', letterSpacing: '0.06em', marginBottom: 8 }}>SHARED BRIEF</div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: '#e5e5e5' }}>
          {pov?.company_name || run?.company || 'Brief'}
        </h1>
        {run?.created_at && (
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Generated {new Date(run.created_at).toLocaleDateString()}
          </div>
        )}
        {run?.pdf_url && (
          <a href={run.pdf_url} target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-block', marginTop: 8, fontSize: 13, color: '#818cf8',
          }}>
            Download PDF
          </a>
        )}
      </div>

      {pov?.icp_fit && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: pov.icp_fit.score === 'Strong' ? '#22c55e' : pov.icp_fit.score === 'Moderate' ? '#f59e0b' : '#ef4444' }}>
            {pov.icp_fit.score} ICP
          </div>
          <p style={{ fontSize: 14, color: '#ccc', lineHeight: 1.8 }}>{pov.icp_fit.rationale}</p>
        </div>
      )}

      {pov?.why_figma?.strongest_angle && (
        <div style={{ background: 'rgba(94,106,210,0.08)', border: '1px solid rgba(94,106,210,0.2)', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#818cf8', marginBottom: 4 }}>STRONGEST ANGLE</div>
          <p style={{ fontSize: 14, color: '#e5e5e5', lineHeight: 1.8, margin: 0 }}>{pov.why_figma.strongest_angle}</p>
        </div>
      )}

      {pov?.why_now?.triggers?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.08em', marginBottom: 12 }}>WHY NOW</div>
          {pov.why_now.triggers.map((t: any, i: number) => (
            <div key={i} style={{ background: 'rgba(40,40,40,0.5)', border: '1px solid #333', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#e5e5e5' }}>{t.trigger}</div>
              {t.evidence && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{t.evidence}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: '#666', marginTop: 48, textAlign: 'center' }}>
        Shared from Figma Account Intelligence. This link expires after 30 days.
      </div>
    </div>
  );
}
