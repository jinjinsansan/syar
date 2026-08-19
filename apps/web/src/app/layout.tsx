import './globals.css';

export const metadata = { title: 'STAR', description: 'オンライン競馬育成' };

/**
 * ★グローバルヘッダー（design/hud-ds/components/program-board の実装表）
 *   h56・padding 0 40／ロゴ 18px 字間 .22em 金／ナビ 14px（現在地は紙色、他は 70%）
 *   右に EP と PP を**別々に**表示（合算しない・憲法 §0.2）— ログイン導入まで表示しない
 *   ナビの未実装画面（わたしの馬・育成・記録）はリンクにしない（存在しない導線を置かない）
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 40px', borderBottom: '1px solid var(--rule)' }}>
          <a href="/" style={{ fontSize: 18, fontWeight: 900, letterSpacing: '.22em', color: 'var(--gold)' }}>STAR</a>
          <nav style={{ display: 'flex', gap: 26, marginLeft: 36, fontSize: 14 }}>
            <a href="/" style={{ color: 'var(--paper)' }}>番組表</a>
            <span style={{ color: 'var(--paper-45)' }} title="準備中">わたしの馬</span>
            <span style={{ color: 'var(--paper-45)' }} title="準備中">育成</span>
            <span style={{ color: 'var(--paper-45)' }} title="準備中">記録</span>
          </nav>
          <a href="/race" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--paper-70)' }}>中継（デモ）</a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
