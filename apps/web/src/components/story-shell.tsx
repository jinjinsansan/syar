'use client';

import { usePathname } from 'next/navigation';
import { ArcadeNav } from './nav';
import { RaceStrip } from './uma/race-strip';

/**
 * ★**新しい画面へ切り替えました**（★2026-09-17・オーナー指示「★また新ルートに切り替えてください」）。
 *
 * ⚠️ ★**ナビはこの作業ツリーに 2 つあります。**
 *    ① ★`nav.tsx` の `ArcadeNav` — ★下の `themed` が**偽**のときだけ出ます
 *       （★`INTERIOR` にも `OWN_HEADER` にも入らない画面＝★ほぼ開発用の画面）
 *    ② ★**この `LINKS`** — ★`INTERIOR` の画面（★`/stable`・`/training`・`/races`・`/records`・
 *       ★`/prizes`・`/login`・`/signup`・`/setup`）＝ ★**旧い画面のほぼ全部**はこちらが出ます
 *
 * 🔴 ★2026-09-17: ★①だけ直して「★旧い画面に着いた人はナビから出られます」と報告しました。
 *    ★**嘘でした。** ★旧い画面のナビは 1 本も変わっていませんでした。★開発サーバーの
 *    ★`/records` を実際に引いて、★新しい行き先が 1 本も出ていないことで分かりました。
 *    → ★**ナビを直すときは、必ず両方**。★検査も両方を見ます。
 *
 * ⚠️ ★`paths` は「★完全一致 か `prefix/` で始まる」で見ます。★`'/train'` だけでは
 *    ★`/training` に当たりません（★別語）。★**旧い道も並べて**、旧い画面でも現在地が光るようにします。
 */
const LINKS = [
  { href: '/home', label: 'ホーム', paths: ['/home'] },
  { href: '/vote', label: 'レース', paths: ['/vote', '/races', '/entry', '/odds'] },
  { href: '/mypage', label: 'わたしの馬', paths: ['/mypage', '/stable'] },
  { href: '/train', label: '育てる', paths: ['/train', '/training'] },
  { href: '/exchange', label: '交換', paths: ['/exchange', '/records', '/prizes'] },
];
const INTERIOR = ['/stable', '/training', '/races', '/entry', '/records', '/prizes', '/login', '/signup', '/setup', '/design-preview'];
/**
 * ★**自前の見出しを持つページ**（★2026-09-13）。★ここには帯を足しません。
 *
 * ⚠️ ★`/lp-preview` に ★**アーケードの「STAR」帯が載っていました**（★本番で実測）。
 *    ★馬物語の LP は自分の `ms-nav` を持っているので、★帯が二重になります。
 *    ★`/` も同じ LP になったので、★両方ここに入れます。
 */
/**
 * ⚠️ ★`/race` もここです（★2026-09-13・オーナー評
 *    ★「★TOP は馬物語というグリーンな感じでした。★中継を押すと、ブルーで STAR と出ていました」）。
 *    ★中継は ★**画面いっぱいの映像**なので、★上に別の帯が載ると玄関と色が食い違います。
 */
/**
 * ⚠️ ★**馬物語 UI（R-14・2026-09-17）の画面もここです。**
 *    ★どの画面も ★**自前の上段バー**（戻る／画面名／停止スイッチ）を持つので、
 *    ★入れないと ★**帯が二重**になります（★引き渡し資料 §4.2 の A-1）。
 *    ★併せて下端 34px の安全領域も、各画面が自分で持ちます。
 */
const OWN_HEADER = [
  '/', '/lp-preview', '/race',
  /**
   * ★馬物語 UI（R-14・2026-09-17）。★**画面を足したらここも足す**。
   *
   * 🔴 ★**3 度目の入れ忘れを直しました**（★2026-09-21）: ★`/login` と `/signup`。
   *   ✔ ★**本番の配信 HTML で実測**しました:
   *   ```
   *   /home /mypage /vote /train /exchange … 帯 1 つ（★正しい）
   *   /login /signup                       … 🔴 **帯が二重**（★story-shell ＋ 自前バー）
   *   ```
   *   ★オーナーの ★**「TOP からログインを押すと古いデザインが出る」**は、★これでした。
   *   ★★**世代の混在ではありません。** ★`/login` は新しい部品で描かれているのに、
   *   ★**上に 1 つ古い帯が載っていた**だけです。
   *
   * ✅ ★`/setup` も入れました（★2026-09-21・★オーナーの判断「**B**」）。
   *   ★**既存の部品で組み直した**ので（★`/login` `/signup` と同じ `uma-parts`）、
   *   ★自前バーを持つようになりました。★**新しい意匠は 1 つも作っていません。**
   *
   * ✅ ★**入れ忘れを網で止めます**: `apps/cli/test/own-header-coverage.test.ts`
   *   ★（★`uma-parts` を使う面が ★`OWN_HEADER` に在ること）。★4 度目は起きません。
   */
  '/home', '/howto', '/earn', '/watch-race', '/odds', '/exchange', '/mypage', '/vote', '/train',
  '/login', '/signup', '/forgot-password', '/reset-password', '/setup',
  /** ★デザイン確認の一覧（★2026-09-17）。★自前の見出しを持つので帯を足さない */
  '/design-check',
  /**
   * 🔴 ★**4 度目の入れ忘れ**（★2026-09-24・オーナー指摘
   *   ★「★古いデザインはこの外枠の白のエリア全てです」）。
   *   ★第 2 便の 3 画面（役割・配合・命名）は ★**自前の全画面の枠**を持つのに、
   *   ★`OWN_HEADER` に入れ忘れたため、★**白い旧い枠の中に収まって**いました。
   * ⚠️ ★網（`own-header-coverage.test.ts`）は ★**`uma-parts` を使う面**しか見ておらず、
   *    ★この 3 つは `uma-parts` を使わない（★自前の `Shell`）ので ★**通り抜けました**。
   *    → ★網を「自前の `Shell` を持つ面」にも広げます。
   */
  '/stable/roles', '/stable/breed', '/stable/name',
];

/** Presentation boundary: racing canvases, labs and both landing pages keep their own layout. */
export function StoryShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const themed = INTERIOR.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  /**
   * 🔴 ★**前方一致で見ます**（★2026-09-17・オーナー指摘
   *   ★「★デザイナーが以前作った STAR というデザインはもう使わないので反映すら不要」）。
   *
   * ⚠️ ★以前は ★**完全一致**（`includes(pathname)`）でした。★`/odds` は入っていたのに
   *    ★`/odds/demo` が外れ、★**アーケードの青い「STAR」の帯が馬物語の画面に載って**いました
   *    （★配信 HTML で `class="a-band"` と `STAR</a>` を実測）。
   * → ★**その下の階層もまとめて自前の見出し扱い**にします。
   */
  if (OWN_HEADER.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return <>{children}</>;
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
      {/*
        ★**案内 1 枚を通します**（★2026-09-17・ハンドオフ B-1）。
        ⚠️ ★`/race` を直接指すと ★**案内が飛ばされ**、★終了後の戻り先も決まりません
           （★`/race` は「どこから来たか」を知りません）。
      */}
      <a className="story-watch" href="/watch-race">▷ レースを観る</a>
    </header>
    {!pathname.startsWith('/design-preview') && <div data-theme="uma"><RaceStrip compact /></div>}
    <main id="story-content" className="story-content">
      <div className="story-breadcrumb"><a href="/">馬物語</a><span aria-hidden="true">／</span><span>あなたの物語のつづき</span></div>
      {children}
    </main>
    <footer className="story-app-footer"><a className="story-brand" href="/">馬物語<span>UMA MONOGATARI</span></a><p>育てる。走る。つながっていく。</p><a href="/login">ログイン</a><small>© 馬物語</small></footer>
  </div>;
}
