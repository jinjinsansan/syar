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
function existsInSource(decl: string, sources: string): boolean {
  const m = /^(flex|min-width):(.+)$/.exec(decl);
  if (m === null) return true;
  const prop = m[1] as string;
  const value = (m[2] as string).trim();
  if (prop === 'flex') {
    /** ★`flex: '0 0 250px'` / `` `0 0 250px` `` の形 */
    return sources.includes(value);
  }
  /** ★`min-width:420px` → `minWidth: 420` の形 */
  const px = /^(\d+)px$/.exec(value)?.[1];
  if (px === undefined) return true;
  /** ⚠️ ★テンプレートリテラルの中では `\\s` と書くこと。★`\s` は「s」になり、一致しません */
  return new RegExp(`minWidth:\\s*${px}\\b`).test(sources);
}

/**
 * ★定数から組み立てていて、宣言の形がソースに出ないもの。
 *   ★**どの定数から来るかを書きます**（★書けないものは除外しません）。
 */
const INDIRECT: Record<string, string> = {
  'flex:0 0 230px': 'races/[id]/page.tsx などの COL.name = 230',
  'flex:0 0 186px': 'races/page.tsx の COL.grade = 186',
  'min-width:130px': 'races/[id]/bet/page.tsx の minWidth: 130（馬名の下限）',
};

describe('★モバイル CSS が名指ししている値が、いまもソースに在る', () => {
  const css = readFileSync(CSS, 'utf8');
  const sources = allTsx(WEB_SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
  /** ★`[style*="..."]` の中身を全部拾う */
  const anchors = [...new Set([...css.matchAll(/\[style\*="([^"]+)"\]/g)].map((m) => m[1] as string))];

  it('★名指ししている値が 1 つ以上ある（★検査が空振りしていない）', () => {
    expect(anchors.length).toBeGreaterThan(5);
  });

  it('★どの値も `apps/web/src` の中に実在する', () => {
    /** ★`display:flex` のような「値」ではないものは、実在の確認をしません */
    const measured = anchors.filter((a) => /^(flex|min-width):/.test(a));
    const dead = measured
      .filter((a) => INDIRECT[a] === undefined)
      .filter((a) => !existsInSource(a, sources));
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
