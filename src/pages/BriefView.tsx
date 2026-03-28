import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import usePageTitle from '../hooks/usePageTitle';

export default function BriefView() {
  const { run_id } = useParams<{ run_id: string }>();
  usePageTitle('Brief');

  return (
    <Layout>
      <div style={{ padding: '32px 0', color: 'var(--text-primary)' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Brief view coming soon — run ID: {run_id}
        </p>
      </div>
    </Layout>
  );
}
