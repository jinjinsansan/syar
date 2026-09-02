'use client';
import { usePathname } from 'next/navigation';

const APP_LINKS: ReadonlyArray<{ href: string; label: string; match: (p: string) => boolean }> = [
  { href: '/races', label: '番組表', match: (p) => p.startsWith('/races') },
  { href: '/stable', label: 'わたしの馬', match: (p) => p.startsWith('/stable') },
  { href: '/training', label: '育成', match: (p) => p.startsWith('/training') || p.startsWith('/entry') },
  { href: '/records', label: '記録', match: (p) => p.startsWith('/records') || p.startsWith('/prizes') },
];
/** LP（未ログインの `/`）のナビ — ページ内アンカー */
const LP_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/', label: 'はじめての方へ' },
  { href: '/#points', label: 'あそびかた' },
  { href: '/#fairness', label: '公正性' },
  { href: '/#tools', label: 'よくある質問' },
];

const pill = (on: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', height: 34, padding: '0 16px', borderRadius: 8,
  fontSize: 14, fontWeight: 900, whiteSpace: 'nowrap',
  background: on ? '#fff' : 'transparent',
  color: on ? 'var(--a-blue-d)' : 'rgba(255,255,255,.95)',
  boxShadow: on ? '0 2px 0 rgba(0,0,0,.25)' : 'none',
});

/**
 * ★グローバルヘッダーの中身（アーケード筐体: 錠剤ナビ、現在地は白地・青字）— 正本 program-board／landing
 *   `/`（LP・未ログイン）では LP 用のナビ＋右端に「ログイン」「無料ではじめる」。
 *   それ以外はアプリのナビ＋「中継（デモ）」。EP/PP カプセルはログイン導入まで出さない（合算しない・憲法 §0.2）。
 */
export function ArcadeNav(): React.ReactElement {
  const path = usePathname() ?? '/';
  if (path === '/') {
    return (
      <>
        {/*
          ⚠️ ★**モバイルでは出しません**（2026-09-02・オーナー要望①）。
             ★これは頁内アンカー（はじめての方へ／あそびかた／公正性／よくある質問）で、
             ★モバイルでは ★**そのまま下へ送れば同じ場所に着きます。**
             ★実測で、★このナビを含むヘッダーが ★**最初の一画の約 3 割（約 200px）**を占め、
             ★「開いた瞬間に馬が大きく」の一番の邪魔になっていました。
          ★デザイナーのモバイル版 TOP にも ★**グローバルヘッダーはありません**
            （★ヒーロー自身が左上に STAR を持つ形）。★その意図に寄せます。
        */}
        <nav className="lp-nav" style={{ display: 'flex', gap: 6, marginLeft: 24 }}>
          {LP_LINKS.map((l, i) => <a key={l.href} href={l.href} style={pill(i === 0)}>{l.label}</a>)}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <a className="a-btn" href="/login" style={{ height: 38, padding: '0 20px', fontSize: 14 }}>ログイン</a>
          <a className="a-btn a-btn-gold" href="/signup" data-event="cta_header_signup" style={{ height: 38, padding: '0 22px', fontSize: 15 }}>無料ではじめる</a>
        </div>
      </>
    );
  }
  return (
    <>
      <nav style={{ display: 'flex', gap: 6, marginLeft: 24 }}>
        {APP_LINKS.map((l) => <a key={l.href} href={l.href} style={pill(l.match(path))}>{l.label}</a>)}
      </nav>
      <a href="/race" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,.95)' }}>中継（デモ）</a>
    </>
  );
}
