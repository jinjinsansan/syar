/**
 * ★モバイルの直しが「黙って効かなくなる」のを防ぐメタテスト（2026-09-01）
 *
 * 【★なぜ要るか】
 *   ★モバイルの崩れは、★`page.tsx` の **inline style に直書きされた固定幅**が原因でした
 *     （★`flex: '0 0 250px'` / `minWidth: 420` など）。
 *   ★inline style はスタイルシートより強いので、★`globals.css` は
 *     ★**属性選択子でその値を名指しして**打ち消しています:
 *
 *       main [style*="flex:0 0 250px"] { flex: 1 1 100% !important; }
 *
 *   ⚠️ ★**ここが危ういところです。**
 *      ★誰かが `page.tsx` の `250px` を `260px` に変えると、
 *      ★**CSS は一致しなくなり、モバイルの直しが黙って効かなくなります。**
 *      ★画面は壊れますが、★テストも型検査も緑のままです。
 *
 *   ★この案件は同じ形で何度も焼かれています（★正典 D-082「挙げられなかった量は測られません」）。
 *   → ★**CSS が名指ししている値が、いまもソースに在るか**を検査します。
 *
 * 【★このテストが言えること／言えないこと】
 *   ★言える  … ★CSS の規則が**空振りしていない**（名指しした値がソースに在る）
 *   ★言えない … ★画面が実際に崩れていないこと。★それは `tools/verify-mobile-layout.mjs`
 *               （★実ブラウザで測る）の仕事です。★**このテストはその代わりにはなりません。**
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_SRC = fileURLToPath(new URL('../src', import.meta.url));
const CSS = fileURLToPath(new URL('../src/app/globals.css', import.meta.url));

/** ★`src` 配下の .tsx を全部読む */
function allTsx(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) { out.push(...allTsx(full)); continue; }
    if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * ★React が inline style を書き出す形（`flex:0 0 250px`）から、
 *   ★ソース上の形（`flex: '0 0 250px'` / `flex: \`0 0 ${X}px\``）へ戻して探します。
 */
/**
 * ★CSS が名指しした宣言（`flex:0 0 250px`）が、ソースに**その宣言として**在るか。
 *
 * ⚠️ ★**数字だけで照合してはいけません。** ★最初そうしたら、変異試験で落ちませんでした:
 *      ★`flex: '0 0 250px'` を `260px` に変えても、★同じ行の `width: 250,` が
 *      ★needle に引っかかって「生きている」と出ました。★**緩い検査は嘘をつきます。**
 *   → ★宣言の形（`0 0 <N>px` / `minWidth: <N>`）で照合します。
 *
 * ★定数から組み立てているものは、宣言の形が出ません（`` flex: `0 0 ${COL.name}px` ``）。
 *   ★それは下の `INDIRECT` に**定数名を書いて**除外します（★黙って通さない）。
 */
/**
 * ★CSS の宣言名 → ★ソース（JSX の inline style）での書かれ方。
 *   ★`height:560px` は `height: 560` と書かれています（★単位なしの数値）。
 * ⚠️ ★`\\b` が要ります。★無いと `height:\\s*56` が ★**`height: 560` にも当たり**、
 *    ★消えた値を「在る」と report してしまいます（★緩い検査は嘘をつく・2026-09-01）。
 */
const PX_PROP: Record<string, string> = {
  'min-width': 'minWidth',
  height: 'height',
  top: 'top',
  'font-size': 'fontSize',
};

function existsInSource(decl: string, sources: string): boolean {
  const m = /^(flex|min-width|height|top|font-size):(.+)$/.exec(decl);
  if (m === null) return true;
  const prop = m[1] as string;
  const value = (m[2] as string).trim();
  if (prop === 'flex') {
    /** ★`flex: '0 0 250px'` / `` `0 0 250px` `` の形 */
    return sources.includes(value);
  }
  /** ★`min-width:420px` → `minWidth: 420` ／ ★`height:560px` → `height: 560` の形 */
  const px = /^(\d+)px$/.exec(value)?.[1];
  if (px === undefined) return true;
  /** ⚠️ ★テンプレートリテラルの中では `\\s` と書くこと。★`\s` は「s」になり、一致しません */
  return new RegExp(`${PX_PROP[prop] as string}:\\s*${px}\\b`).test(sources);
}

/**
 * ★定数から組み立てていて、宣言の形がソースに出ないもの。
 *   ★**どの定数から来るかを書きます**（★書けないものは除外しません）。
 */
/**
 * ★**どのファイルに在るはずか**を書く（★書いたものはそのファイルの中だけで探す）。
 *
 * ⚠️ ★これが無いと ★**偶然の一致で緑になります。** ★実例（2026-09-01・変異試験で発覚）:
 *    ★LP のヒーロー `height: 560` を `561` に変えても検査は通りました。
 *    ★`apps/web/src/app/camera/page.tsx:25` の ★**`const VP = { width: 1180, height: 560 }`**
 *    ★（★LP と何の関係もない定数）に当たっていたためです。
 *    → ★全ソースを 1 本に繋いで探すと、★**別ページの無関係な値が身代わりになります。**
 *    ★前便も同じ形で焼かれています（★同じ行の `width: 250,` が身代わりになった）。
 *
 * ★規則が CSS 側でページに限定されているもの（`.lp-bleed` / `#steps` = TOP だけ）は、
 *   ★ここに対象ファイルを書きます。
 */
const SCOPE: Record<string, string> = {
  'height:560px': 'app/page.tsx',
  'height:300px': 'app/page.tsx',
  'height:56px': 'app/page.tsx',
  'height:120px': 'app/page.tsx',
  'top:56px': 'app/page.tsx',
  'top:50px': 'app/page.tsx',
  'font-size:96px': 'app/page.tsx',
  'font-size:56px': 'app/page.tsx',
  'font-size:26px': 'app/page.tsx',
};

const INDIRECT: Record<string, string> = {
  'flex:0 0 230px': 'races/[id]/page.tsx などの COL.name = 230',
  'flex:0 0 186px': 'races/page.tsx の COL.grade = 186',
  'min-width:130px': 'races/[id]/bet/page.tsx の minWidth: 130（馬名の下限）',
};

describe('★モバイル CSS が名指ししている値が、いまもソースに在る', () => {
  const css = readFileSync(CSS, 'utf8');
  const files = allTsx(WEB_SRC).map((f) => ({ path: f.replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }));
  const sources = files.map((f) => f.text).join('\n');
  /** ★`SCOPE` に書いたアンカーは、★そのファイルの中だけで探す（★身代わりを断つ） */
  const scopedSource = (anchor: string): string => {
    const want = SCOPE[anchor];
    if (want === undefined) return sources;
    return files.filter((f) => f.path.endsWith(want)).map((f) => f.text).join('\n');
  };
  /** ★`[style*="..."]` の中身を全部拾う */
  const anchors = [...new Set([...css.matchAll(/\[style\*="([^"]+)"\]/g)].map((m) => m[1] as string))];

  it('★名指ししている値が 1 つ以上ある（★検査が空振りしていない）', () => {
    expect(anchors.length).toBeGreaterThan(5);
  });

  it('★どの値も `apps/web/src` の中に実在する', () => {
    /** ★`display:flex` のような「値」ではないものは、実在の確認をしません */
    const measured = anchors.filter((a) => /^(flex|min-width|height|top|font-size):/.test(a));
    const dead = measured
      .filter((a) => INDIRECT[a] === undefined)
      .filter((a) => !existsInSource(a, scopedSource(a)));
    expect(
      dead.join('\n'),
      '★globals.css が名指ししている inline の値が、ソースから消えています。\n'
      + '★その規則は**黙って効かなくなっています**（画面は崩れますが、他の検査は緑のままです）。\n'
      + '★`page.tsx` 側で値を変えたなら、`globals.css` の @media の中も直してください:\n'
      + `${dead.join('\n')}`,
    ).toBe('');
  });

  it('★モバイルの規則を消せない（★@media ごと消えたら落ちる）', () => {
    expect(css, '★`@media (max-width: 720px)` のブロックが消えています').toContain('@media (max-width: 720px)');
    expect(
      css,
      '★指で押せる大きさの規則が消えています。★幅ではなく `pointer: coarse` で決める形です',
    ).toContain('@media (pointer: coarse), (max-width: 720px)');
    expect(
      css,
      '★キャンバスの固有幅（1280px）が版面を押し広げるのを止める規則が消えています',
    ).toMatch(/main canvas[^{]*\{[^}]*min-width:\s*0/);
  });
});
