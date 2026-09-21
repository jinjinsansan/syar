/**
 * 🔴 ★**結果が世界に残る場所で、★`localeCompare` を使わない**（★憲法 §1-4・簿 `LOCALE-SORT-IN-MATING`）
 *
 * ============================================================================
 * 【🔴 ★「理論上の穴」ではありませんでした】
 *   ★簿には ★**「環境で結果が変わりえます」「同点のときだけ効くので普段は表に出ません」**
 *   ★とだけ書いてあり、★**1 年 近く そのまま**でした。★2026-09-21 に測りました:
 *
 *   ```
 *   16 進 2 文字の総当たり（Intl.Collator）
 *     da-DK … 10 組 逆転（例 aa/ab  aa/ac  aa/ad）
 *     nb-NO … 10 組 逆転（同じ）
 *   ```
 *   ★デンマーク語・ノルウェー語は ★**`aa` を `å` として扱い、★`z` の後ろに置きます**。
 *   → ★★**`aa` を含む uuid は、★その機械では別の順に並びます。**
 *     ★着順ではありませんが、★**配合の相手**と ★**血の濃縮の親（`topAncestorId`・§6.5）**が変わります。
 *
 * 【✅ ★直しても世界は変わりませんでした（★簿の推測は外れ）】
 *   ★簿は ★**「直せば `preseed-golden` が落ちます」**と書いていました。★落ちませんでした。
 *   ✔ ★理由（★先に測ってから直しました）:
 *     ```
 *     DB の uuid 7,370 件      … locale 順と符号位置順で 差 0
 *     プリシードの id 8,000 件  … 差 0（★10 ロケールすべてで）
 *     ```
 *     ★いまの機械は `ja-JP` で、★**この 2 つの id の形では両者が一致します**。
 *   → ★★**「世界を作り直さないと直せない」と思われていたものが、★ただで直りました。**
 *
 * 【★この検査が見る範囲】
 *   ✅ ★見る: ★`packages/<pkg>/src`・★`apps/worker/src`・★`apps/cli/src`（★結果が世界に残る側）
 *   ⚠️ ★見ない: ★`apps/web`（★画面の並べ替え。★人に読みやすい順でよい）
 *
 * ⚠️ ★**註記の中の文字列は数えません** — ★この検査自身や `stable-order.ts` が
 *    ★`localeCompare` という語を説明のために書いているので。★**コードの行だけ**を見ます。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

/** ★結果が世界に残る側（★画面は入れません） */
const SCOPES = [
  'packages/*/src/**/*.ts',
  'apps/worker/src/**/*.ts',
  'apps/cli/src/**/*.ts',
];

/**
 * ★**行から註記を落とす**（★`//` 以降と、★`*` で始まる行）。
 * ⚠️ ★完全な構文解析ではありません。★**過剰に落とす側**に倒しています
 *    （★見逃すほうが危ないので、★見逃したら別の行が拾います）。
 */
function codeLines(src: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    if (line.startsWith('//') || line.startsWith('*')) continue;
    out.push(raw.replace(/\/\/.*$/, ''));
  }
  return out;
}

describe('🔴 ★決定論: 結果が世界に残る場所で `localeCompare` を使わない', () => {
  const files = SCOPES.flatMap((g) => globSync(g, { cwd: ROOT }).map((f) => path.join(ROOT, f)));

  it('★対象を読めている（★0 件 通過を合格にしない・CK-14）', () => {
    expect(files.length, '🔴 ★1 枚も読めていません。★探し方が壊れています').toBeGreaterThan(30);
  });

  it('🔴 ★`localeCompare` / `Intl.Collator` が、★コードに 1 つも無い', () => {
    const hits: string[] = [];
    let scanned = 0;
    for (const f of files) {
      const lines = codeLines(readFileSync(f, 'utf8'));
      scanned += lines.length;
      lines.forEach((l, i) => {
        if (/\blocaleCompare\b|\bIntl\.Collator\b/.test(l)) {
          hits.push(`${path.relative(ROOT, f)}:${i + 1}  ${l.trim().slice(0, 80)}`);
        }
      });
    }
    /** ★対照: ★行を 1 行も読めていないなら、★この検査は何も見ていません */
    expect(scanned, '🔴 ★コードの行を 1 行も読めていません').toBeGreaterThan(1000);
    expect(hits, `🔴 ★決定論の穴（★憲法 §1-4）:\n  ${hits.join('\n  ')}\n`
      + '  ★`compareIds`（`@star/sim-engine`）を使ってください').toEqual([]);
  });

  it('🔴 ★`compareIds` が、★実在のロケールでの逆転を実際に直している（★対照）', async () => {
    const { compareIds } = await import('../../../packages/sim-engine/src/stable-order.js');
    /**
     * ★`da-DK` / `nb-NO` は `aa` を `å` として `z` の後ろに置きます。
     * → ★**`localeCompare` なら逆転し、★`compareIds` なら逆転しない**ことを、
     *   ★**同じ 1 つの検査の中で対にして**見ます（★片方だけだと「効いた気がする」で終わる）。
     */
    const a = 'aa000000-0000-0000-0000-000000000000';
    const b = 'ab000000-0000-0000-0000-000000000000';
    const da = new Intl.Collator('da-DK');
    expect(Math.sign(da.compare(a, b)), '🔴 ★da-DK が逆転しない＝この対照は前提が崩れています')
      .toBe(1);
    expect(Math.sign(compareIds(a, b)), '🔴 ★compareIds が符号位置順になっていない').toBe(-1);
  });
});
