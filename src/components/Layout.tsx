import Sidebar from './Sidebar';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main
        style={{
          marginLeft: 220,
          flex: 1,
          padding: '32px 40px',
          maxWidth: 960 + 80,
          background: 'var(--bg-app)',
          minHeight: '100vh',
        }}
      >
        {children}
      </main>
    </div>
  );
}
