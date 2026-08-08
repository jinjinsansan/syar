export const metadata = { title: 'STAR', description: 'オンライン競馬育成' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#0f1115', color: '#e8eaed' }}>
        <header style={{ padding: '12px 20px', borderBottom: '1px solid #262b35' }}>
          <a href="/" style={{ color: '#e8eaed', textDecoration: 'none', fontWeight: 700, letterSpacing: '0.08em' }}>
            STAR
          </a>
        </header>
        <main style={{ padding: '20px', maxWidth: 980, margin: '0 auto' }}>{children}</main>
      </body>
    </html>
  );
}
