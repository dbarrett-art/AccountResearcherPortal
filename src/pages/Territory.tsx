import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import TableSkeleton from '../components/TableSkeleton';
import usePageTitle from '../hooks/usePageTitle';
import { Target, Eye, Map } from 'lucide-react';

interface CompanyBrief {
  company: string;
  run_id: string;
  created_at: string;
  icp_score: string | null;
  pdf_url: string | null;
  brief_id: string | null;
}

const ICP_ORDER: Record<string, number> = { Strong: 0, Moderate: 1, Weak: 2 };
const ICP_COLORS: Record<string, { bg: string; text: string }> = {
  Strong:   { bg: 'rgba(34,197,94,0.1)',  text: '#22c55e' },
  Moderate: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
  Weak:     { bg: 'rgba(239,68,68,0.1)',  text: '#ef4444' },
};

export default function Territory() {
  usePageTitle('Territory');
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<CompanyBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamView, setTeamView] = useState(false);

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'manager';

  useEffect(() => {
    async function load() {
      let query = supabase
        .from('runs')
        .select('id, company, created_at, status, pdf_url, brief_id')
        .eq('status', 'complete')
        .order('created_at', { ascending: false });

      if (!teamView && userProfile) {
        query = query.eq('user_id', userProfile.id);
      }

      const { data } = await query;
      if (!data) { setLoading(false); return; }

      // Deduplicate by company — keep latest run only
      const seen: Record<string, any> = {};
      for (const run of data) {
        const key = run.company?.toLowerCase().trim();
        if (!seen[key]) seen[key] = run;
      }

      // Fetch ICP scores from briefs
      const entries: CompanyBrief[] = [];
      for (const run of Object.values(seen)) {
        let icpScore: string | null = null;
        if (run.brief_id) {
          const { data: brief } = await supabase
            .from('briefs')
            .select('pov_json')
            .eq('id', run.brief_id)
            .single();
          icpScore = brief?.pov_json?.icp_fit?.score || null;
        }
        entries.push({
          company: run.company,
          run_id: run.id,
          created_at: run.created_at,
          icp_score: icpScore,
          pdf_url: run.pdf_url,
          brief_id: run.brief_id,
        });
      }

      // Sort by ICP score then recency
      entries.sort((a, b) => {
        const aOrder = ICP_ORDER[a.icp_score || ''] ?? 3;
        const bOrder = ICP_ORDER[b.icp_score || ''] ?? 3;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setCompanies(entries);
      setLoading(false);
    }
    load();
  }, [userProfile, teamView]);

  const days = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Map size={18} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Territory</h1>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 4 }}>
            {companies.length} accounts
          </span>
        </div>
        {isAdmin && (
          <button onClick={() => setTeamView(v => !v)} style={{
            fontSize: 12, padding: '4px 12px', borderRadius: 4,
            background: teamView ? 'var(--accent)' : 'transparent',
            color: teamView ? '#fff' : 'var(--text-secondary)',
            border: teamView ? 'none' : '1px solid var(--border-strong)',
            cursor: 'pointer',
          }}>
            {teamView ? 'Team view' : 'My accounts'}
          </button>
        )}
      </div>

      {loading ? <TableSkeleton rows={6} cols={4} /> : companies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No completed briefs yet. Submit a research request to build your territory.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {companies.map((c) => {
            const icpColor = ICP_COLORS[c.icp_score || ''] || { bg: 'rgba(74,74,74,0.2)', text: 'var(--text-tertiary)' };
            const age = days(c.created_at);
            return (
              <div key={c.run_id} style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '16px 18px', cursor: 'pointer',
                transition: 'border-color 120ms',
              }}
                onClick={() => navigate(`/briefs/${c.run_id}`)}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.company}</div>
                  {c.icp_score && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: icpColor.bg, color: icpColor.text,
                    }}>
                      <Target size={10} /> {c.icp_score}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: age > 30 ? '#f59e0b' : 'var(--text-tertiary)' }}>
                    {age < 1 ? 'Today' : `${age}d ago`}
                  </span>
                  <Eye size={14} style={{ color: 'var(--text-tertiary)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
