/**
 * ★**安全網（`globals.css` の 44px の下限・はみ出し止め）が ★画面の本体に届いている**（★2026-09-27・裁定 §6-2 の 1）
 *
 * 【★見ている壊れ方】
 *   🔴 ★安全網は ★`main …` で書かれています（★2026-09-01・全画面が枠の `<main>` の中に居た頃）。
 *      ★後から ★自前の上段バーを持って ★枠の外へ出た画面（`OWN_HEADER`）は ★`<main>` を持たず、
 *      ★**黙って網の外**に居ました（★`/home` `/train` `/login` など 9 面）。
 *   → ★枠の外の画面は ★`<main>` か ★`data-page-body` の ★どちらかを持つこと。★`globals.css` は両方に同じ下限を掛けます。
 *
 * ★対象: ★`OWN_HEADER`（★枠が `<main>` で包まない道）にある ★本番の画面（★開発用・自分で 404 の画面を除く）。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { OWN_HEADER } from '../../web/src/components/shell-routes.js';
import { DEV_ONLY_ROUTES } from '../../web/src/middleware.js';

const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(ROOT, 'apps/web/src/app');
const CSS = readFileSync(path.join(APP, 'globals.css'), 'utf8');

function routesOnDisk(): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, `${prefix}/${e.name}`); continue; }
      if (e.name === 'page.tsx') out.push(prefix === '' ? '/' : prefix);
    }
  };
  walk(APP, '');
  return out.sort();
}
const pageFileOf = (route: string): string => path.join(APP, route === '/' ? 'page.tsx' : `${route.slice(1)}/page.tsx`);
const SELF_GATED = /if \(process\.env\.NODE_ENV (?:=== 'production'|!== 'development')\) notFound\(\);/;
const isDev = (route: string): boolean => DEV_ONLY_ROUTES.some((d) => route === d || route.startsWith(`${d}/`))
  || SELF_GATED.test(readFileSync(pageFileOf(route), 'utf8'));
const ownHeader = (route: string): boolean => OWN_HEADER.some((p) => route === p || route.startsWith(`${p}/`));

/** ★画面の原文 ＋ 相対で読む部品（★1 段）に ★`<main` か ★`data-page-body` が在るか */
function hasBody(route: string): boolean {
  const file = pageFileOf(route);
  const srcs = [readFileSync(file, 'utf8')];
  for (const m of srcs[0]!.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) {
    const base = path.resolve(path.dirname(file), m[1]!);
    const local = ['.tsx', '.ts'].map((ext) => `${base}${ext}`).find((f) => existsSync(f));
    if (local !== undefined) srcs.push(readFileSync(local, 'utf8'));
  }
  return srcs.some(bodyIn);
}
/** ★1 つの原文が ★本体の印（`<main` か `data-page-body`）を持つか */
const bodyIn = (s: string): boolean => /<main[\s>]/.test(s) || /\bdata-page-body\b/.test(s);

/**
 * ★**網に入れない画面**（★理由つき・★足すときは理由を書く）
 *   `/` … ★LP（★自前の全幅の組み・`.lp-bleed`）。★本体の下限は ★LP の組みが持つ
 */
const EXEMPT: Readonly<Record<string, string>> = {
  '/': 'LP（自前の全幅の組み）',
};

describe('★安全網が ★枠の外の画面の本体に届く（★裁定 §6-2 の 1）', () => {
  const targets = routesOnDisk().filter((r) => !isDev(r) && ownHeader(r) && !(r in EXEMPT));

  it('★走査が空でない', () => {
    expect(targets.length, '★枠の外の画面を読めていない').toBeGreaterThan(10);
  });

  it('🔴 ★枠の外の画面は ★`<main>` か ★`data-page-body` を持つ', () => {
    expect(targets.filter((r) => !hasBody(r))).toEqual([]);
  });

  it('★対照: ★判定が ★両方の値を返す', () => {
    expect(hasBody('/home'), '★/home は data-page-body').toBe(true);
    expect(hasBody('/race'), '★/race は <main>').toBe(true);
    /** ★印の無い原文は ★偽（★判定が常に真でない）・★似た語に当たらない */
    expect(bodyIn('<div data-theme="uma" style={{}}>'), '★判定が常に真').toBe(false);
    expect(bodyIn('<mainframe>'), '★<main で始まる別の語に当たる').toBe(false);
    expect(bodyIn('data-page-bodyish'), '★似た属性に当たる').toBe(false);
  });

  /**
   * 🔴 ★**画面の根で見ます**（★2026-09-27・レビュー側「★網が緑で実物が違う」）。
   *   ★上の検査は ★「画面のどこかに `<main` が在る」でした。★`/mypage` は ★`<main>` を持つのに、
   *   ★**エラーの帯（「再読み込み」）が `<main>` の外**に居て、★390px の実測で ★74x22px のままでした。
   *   → ★馬物語の根（★`data-theme="uma"` を持つ要素）は ★それ自体が ★`<main>` か ★`data-page-body` を持つこと。
   *   ★例外は ★帯を包むだけの入れ子 `<div data-theme="uma"><RaceStrip /></div>`（★印の付いた根の中に居る）。
   */
  it('🔴 ★馬物語の根は ★それ自体が 本体の印を持つ（★画面の一部が網の外に出ない）', () => {
    const offenders: string[] = [];
    for (const r of targets) {
      const file = pageFileOf(r);
      const files = [file];
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) {
        const base = path.resolve(path.dirname(file), m[1]!);
        const local = ['.tsx', '.ts'].map((ext) => `${base}${ext}`).find((f) => existsSync(f));
        if (local !== undefined) files.push(local);
      }
      for (const f of files) {
        const text = readFileSync(f, 'utf8');
        for (const m of text.matchAll(/<(\w+)\s+data-theme="uma"(\s+data-page-body)?(>?)/g)) {
          if (m[1] === 'main' || m[2] !== undefined) continue;
          /** ★帯を包むだけの入れ子（★同じファイルに印の付いた根が在ること） */
          const at = m.index ?? 0;
          if (text.startsWith('<div data-theme="uma"><RaceStrip />', at) && /\bdata-page-body\b/.test(text)) continue;
          offenders.push(`${r}: ${path.relative(ROOT, f)}:${text.slice(0, at).split('\n').length}`);
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('🔴 ★`globals.css` が ★`data-page-body` に ★44px の下限を掛けている', () => {
    const block = /@media \(pointer: coarse\), \(max-width: 720px\) \{([\s\S]*?)\n\}/.exec(CSS);
    expect(block, '★44px の塊が見つからない').not.toBeNull();
    expect(block![1]).toMatch(/\[data-page-body\] button, \[data-page-body\] select/);
    expect(block![1]).toMatch(/min-height: 44px;\s*min-width: 44px;/);
  });

  it('🔴 ★ボタンの形のリンクの 44px は ★2 通りの綴りで当てる（★画面側で描いた要素は `display: inline-block;`）', () => {
    for (const d of ['inline-block', 'block', 'inline-flex', 'flex']) {
      for (const scope of ['main', '[data-page-body]']) {
        expect(CSS, `★${scope} a の display:${d}（空白なし）が無い`).toContain(`${scope} a[style*="display:${d}"]`);
        expect(CSS, `★${scope} a の display: ${d}（空白あり）が無い`).toContain(`${scope} a[style*="display: ${d}"]`);
      }
    }
  });

  it('🔴 ★誤りの帯の「再読み込み」が ★素の白いボタンでない（★2026-09-28・レビュー側の指摘）', () => {
    const bare: string[] = [];
    for (const r of targets) {
      const src = readFileSync(pageFileOf(r), 'utf8');
      for (const m of src.matchAll(/<button\b([^>]*)>再読み込み<\/button>/g)) {
        if (!/style=\{NOTICE_ACTION\}/.test(m[1]!)) bare.push(`${r}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it('★`data-page-body` には ★意匠を動かす規則（★折り返し・高さ）を掛けない', () => {
    expect(CSS, '★枠の外の画面の flex を折り返している').not.toMatch(/\[data-page-body\] \[style\*="display:flex"\]/);
    expect(CSS, '★枠の外の画面の padding を変えている').not.toMatch(/\[data-page-body\] \{[^}]*padding/);
  });
});
