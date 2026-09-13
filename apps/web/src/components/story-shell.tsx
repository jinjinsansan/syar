'use client';

import { usePathname } from 'next/navigation';
import { ArcadeNav } from './nav';

const LINKS = [
  { href: '/stable', label: 'わたしの牧場', paths: ['/stable'] },
  { href: '/training', label: '育てる', paths: ['/training'] },
  { href: '/races', label: '番組表・オッズ', paths: ['/races', '/entry'] },
  { href: '/records', label: '記録', paths: ['/records'] },
  { href: '/prizes', label: '景品', paths: ['/prizes'] },
];
const INTERIOR = ['/stable', '/training', '/races', '/entry', '/records', '/prizes', '/login', '/signup', '/setup', '/design-preview'];
/**
 * ★**自前の見出しを持つページ**（★2026-09-13）。★ここには帯を足しません。
 *
 * ⚠️ ★`/lp-preview` に ★**アーケードの「STAR」帯が載っていました**（★本番で実測）。
 *    ★馬物語の LP は自分の `ms-nav` を持っているので、★帯が二重になります。
 *    ★`/` も同じ LP になったので、★両方ここに入れます。
 */
const OWN_HEADER = ['/', '/lp-preview'];

/** Presentation boundary: racing canvases, labs and both landing pages keep their own layout. */
export function StoryShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const themed = INTERIOR.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (OWN_HEADER.includes(pathname)) return <>{children}</>;
  if (!themed) return <>
    <header className="a-band" style={{ height: 56, padding: '0 26px', borderBottom: '3px solid var(--a-edge)' }}>
      <a href="/" style={{ fontSize: 20, fontWeight: 900, letterSpacing: '.22em', color: '#ffe37a', textShadow: '0 2px 0 rgba(0,0,0,.35)' }}>STAR</a>
      <ArcadeNav />
    </header>
    <main>{children}</main>
  </>;
  return <div className="story-shell">
    <a className="story-skip" href="#story-content">本文へ移動</a>
    <header className="story-header">
      <a href="/" className="story-brand">馬物語<span>UMA MONOGATARI</span></a>
      <nav className="story-navigation" aria-label="ゲームメニュー">
        {LINKS.map((link) => {
          const active = link.paths.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
          return <a key={link.href} href={link.href} aria-current={active ? 'page' : undefined}>{link.label}</a>;
        })}
      </nav>
      <a className="story-watch" href="/race">▷ レースを観る</a>
    </header>
    <main id="story-content" className="story-content">
      <div className="story-breadcrumb"><a href="/">馬物語</a><span aria-hidden="true">／</span><span>あなたの物語のつづき</span></div>
      {children}
    </main>
    <footer className="story-app-footer"><a className="story-brand" href="/">馬物語<span>UMA MONOGATARI</span></a><p>育てる。走る。つながっていく。</p><a href="/login">ログイン</a><small>© 馬物語</small></footer>
  </div>;
}
