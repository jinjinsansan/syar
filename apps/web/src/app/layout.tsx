import './globals.css';
import { ArcadeNav } from '../components/nav';

export const metadata = { title: 'STAR', description: 'オンライン競馬育成' };

/**
 * ★グローバルヘッダー（アーケード筐体テーマ: design/hud-ds/components/program-board［アーケード］の実装表）
 *   青グロス帯 h56・下辺 3px 濃青／ロゴ 20px 字間 .22em 黄金＋影／ナビは錠剤（現在地 白地・青字）
 *   右に EP と PP を**別々の**カプセル（白＝EP／金＝PP）で表示（合算しない・憲法 §0.2）— ログイン導入まで表示しない
 *   HUD（/race のキャンバス）は暗色系のまま。body の data-theme="arcade" は DOM 画面用
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body data-theme="arcade">
        <header className="a-band" style={{ height: 56, padding: '0 26px', borderBottom: '3px solid var(--a-edge)' }}>
          <a href="/" style={{ fontSize: 20, fontWeight: 900, letterSpacing: '.22em', color: '#ffe37a', textShadow: '0 2px 0 rgba(0,0,0,.35)' }}>STAR</a>
          <ArcadeNav />
          <a href="/race" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,.86)' }}>中継（デモ）</a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
