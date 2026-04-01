export default function DashboardShell({ title, children }:{ title: string; children: React.ReactNode }) {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>{title}</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginTop: 16 }}>
        {children}
      </div>
    </main>
  );
}
