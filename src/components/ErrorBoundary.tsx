import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: 'var(--bg-app)',
        }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 32, maxWidth: 420, textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Something went wrong</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </div>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/AccountResearcherPortal/'; }}
              style={{
                background: 'var(--accent)', color: '#fff', padding: '6px 14px',
                fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none',
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
