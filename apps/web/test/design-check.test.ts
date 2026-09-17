/**
 * ★**デザイン確認の一覧が正本とズレていない**（★2026-09-17・オーナー指示
 *   ★「★デザイナーが作った全てのページを（略）見れるようにしてください」）
 *
 * 【★見ている壊れ方】
 *   ① ★デザイナーがカードを足したのに ★**一覧に出ない**（★オーナーが見られない）
 *   ② ★一覧に在るのに ★**正本が無い**（★オーナーには空の枠が見える）
 *   ③ ★配信先（`apps/web/public/ds/`）への写しが ★**古い**
 *
 * ⚠️ ★**中身が空のカードは数えません。** ★デザイナーが枠だけ作った所が 7 つあります
 *    （★`horse-detail-mobile` など）。★空の枠を並べても確認になりません。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const COMPONENTS = path.join(ROOT, 'design/hud-ds/components');
const PUBLIC_DS = path.join(ROOT, 'apps/web/public/ds');
const PAGE = path.join(ROOT, 'apps/web/src/app/design-check/page.tsx');

/** ★正本のうち ★**中身のあるもの**だけ */
function realCards(): readonly string[] {
  return readdirSync(COMPONENTS)
    .filter((n) => statSync(path.join(COMPONENTS, n)).isDirectory())
    .filter((n) => existsSync(path.join(COMPONENTS, n, 'index.html')))
    .sort();
}

/** ★一覧が並べている slug（★`{ slug: '…'` を拾う） */
function listedSlugs(): readonly string[] {
  const src = readFileSync(PAGE, 'utf8');
  return [...src.matchAll(/\{\s*slug:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]!).sort();
}

describe('★デザイン確認の一覧', () => {
  it('★前提: 正本のカードが在る（★空振りしていない）', () => {
    expect(realCards().length, '★中身のあるカードが 1 枚も無い').toBeGreaterThan(20);
  });

  /**
   * 🔴 ★**アーケード（青い「STAR」）の 12 枚は、もう一覧に出しません**（★2026-09-17・オーナー指摘
   *   ★「★STAR というデザインはもう使わないので**反映すら不要**」
   *   ★「★このブルー系の表示はもう使わない。★**新しいハンドオフ通り**です」）。
   * ⚠️ ★ファイルは `design/hud-ds` に残っています。★**一覧に出さないだけ**です。
   *    ★だから「1 対 1」では見ません。★**「余分が無い」と「アーケードが出ていない」**の 2 つで見ます。
   */
  const ARCADE = (): readonly string[] => realCards().filter((s) => {
    const html = readFileSync(path.join(COMPONENTS, s, 'index.html'), 'utf8');
    return html.includes('data-theme="arcade"');
  });

  it('★★一覧に、正本の無いカードが混ざっていない（★空の枠が見える）', () => {
    const real = realCards();
    const extra = listedSlugs().filter((s) => !real.includes(s));
    expect(extra, `★一覧に在るのに正本が無い: ${extra.join(', ')}`).toEqual([]);
  });

  it('★★アーケード（青い STAR）のカードを一覧に出していない', () => {
    const arcade = ARCADE();
    expect(arcade.length, '★アーケードのカードが 1 枚も見つからない（★検査が空振り）').toBeGreaterThan(5);
    const leaked = listedSlugs().filter((s) => arcade.includes(s));
    expect(leaked, `★もう使わないアーケードのカードが一覧に出ている: ${leaked.join(', ')}`).toEqual([]);
  });

  it('★★アーケード以外の正本は、すべて一覧に出ている', () => {
    const arcade = ARCADE();
    const listed = listedSlugs();
    const missing = realCards().filter((s) => !arcade.includes(s) && !listed.includes(s));
    expect(missing, `★正本に在るのに一覧に出ていない（★オーナーが見られない）: ${missing.join(', ')}`).toEqual([]);
  });

  /**
   * ⚠️ ★`design/` は Next の配信対象外なので、★`public/ds/` への写しが要ります。
   *    ★写しが古いと、★**直したはずのカードが古いまま見えます**。
   *    → ★`npm run sync:ds` で入れ直せます。
   */
  it('★★配信先の写しが正本と一致している（★`npm run sync:ds`）', () => {
    const real = realCards();
    const notCopied = real.filter((s) => !existsSync(path.join(PUBLIC_DS, s, 'index.html')));
    expect(notCopied, `★写されていないカード（★空の枠が見える）: ${notCopied.join(', ')}`).toEqual([]);
    const stale = real.filter((s) => {
      const a = readFileSync(path.join(COMPONENTS, s, 'index.html'), 'utf8');
      const b = readFileSync(path.join(PUBLIC_DS, s, 'index.html'), 'utf8');
      return a !== b;
    });
    expect(stale, `★写しが古いカード（★「npm run sync:ds」を流してください）: ${stale.join(', ')}`).toEqual([]);
  });

  /**
   * ★カードは `../../styles.css` を見ます。
   * ⚠️ ★`public/ds/<名>/index.html` から見た `../../styles.css` は ★**`public/styles.css`** です。
   *    ★`public/ds/styles.css` だけに置くと ★**字も色も当たりません**（★一度そうなりました）。
   */
  it('★★カードが見る先に土台の CSS が在る', () => {
    expect(existsSync(path.join(ROOT, 'apps/web/public/styles.css')), '★public/styles.css が無い（★カードの字と色が当たらない）').toBe(true);
    const a = readFileSync(path.join(ROOT, 'design/hud-ds/styles.css'), 'utf8');
    const b = readFileSync(path.join(ROOT, 'apps/web/public/styles.css'), 'utf8');
    expect(b, '★土台の CSS の写しが古い').toBe(a);
  });

  /** ★実装した画面の一覧も、★足したら並べる（★`/design-check` に出ないと確認できません） */
  it('★★実装した馬物語の画面が一覧に並んでいる', () => {
    const src = readFileSync(PAGE, 'utf8');
    for (const p of ['/', '/home', '/howto', '/earn', '/watch-race', '/vote', '/train', '/mypage', '/exchange']) {
      expect(src, `★${p} が一覧に無い（★オーナーが確認できない）`).toContain(`path: '${p}'`);
    }
    /** ★オッズは見本で出します（★手元の接続先に発売中のレースが無いため） */
    expect(src, '★オッズの見本が一覧に無い').toContain("path: '/odds/demo?demo=1'");
  });
});
