/**
 * ★**近景の芝の段割り**（★2026-09-17・オーナー指示「★芝をあなたが治してください」）
 *
 * 【★なぜ検査するか】
 *   ★オーナーの苦情は「★芝も雑な芝です」でした。★原因は ★**縦方向のタイル貼り**で、
 *   ★1500×**90** の帯を画面の 58〜74% に `repeat` で敷いていたため、
 *   ★**同じ明暗が 90px ごとに等間隔で並んで**いました。
 *   → ★各段を ★**縦に 1 枚だけ**にして直しました。★その割り付けをここで固定します。
 *
 * 【★このテストが言えること／言えないこと】
 *   ★言える  … ★段が ★**隙間なく・重なりなく**並び、★手前ほど背が高く速いこと。
 *              ★`uma-parts.tsx` が ★**この計算を使っている**こと（★二重帳簿にしない・D-052）。
 *   ★言えない … ★画面が実際に綺麗に見えること。★それは ★**オーナーの目**が決めます
 *              （★見た目の合否をこちらで宣言しない）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nearBands } from '../src/components/uma/turf-bands';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/**
 * ★**コメントを空白にしてから見ます。**
 *
 * ⚠️ ★2026-09-17: ★これを入れ忘れ、★「★`chibi-horse.png` に戻っていないか」の検査が
 *    ★**差し替えの理由を書いた自分の註記**（★「以前は `chibi-horse.png` を…」）に当たりました。
 *    ★配信されている HTML には 0 回で、★実装は正しかったのに落ちました。
 *    ★`entry-freeze.test.ts`（★「馬券」）・`uma-ui-wiring.test.ts`（★「馬券」）に続く
 *    ★**同じ罠の 3 回目**です。★新しい文字列検査を書くときは、★まずここを写します。
 */
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');
const read = (rel: string): string => strip(readFileSync(path.join(HERE, '..', rel), 'utf8'));

describe('★近景の芝の段割り（遠近 4 段）', () => {
  /** ★TOP は内柵の下から（42%）、★画面版はもっと上から（26%） */
  const CASES = [42, 26] as const;

  it('★段が隙間なく・重なりなく、画面の下端まで届く', () => {
    for (const regionTop of CASES) {
      const rows = nearBands(regionTop);
      expect(rows.length, '★段の数').toBe(4);
      expect(rows[0]!.top, '★先頭が近景の開始位置から始まっていない').toBeCloseTo(regionTop, 9);
      for (let i = 1; i < rows.length; i += 1) {
        /** ⚠️ ★隙間があると素の背景色が線になって見えます（★継ぎ目より目立ちます） */
        expect(rows[i]!.top, `★${i} 段目が前の段と接していない`)
          .toBeCloseTo(rows[i - 1]!.top + rows[i - 1]!.height, 9);
      }
      const last = rows[rows.length - 1]!;
      expect(last.top + last.height, '★最後の段が画面下端で終わっていない').toBeCloseTo(100, 9);
    }
  });

  it('★手前ほど背が高く、速く流れる（★遠近）', () => {
    const rows = nearBands(42);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.height, `★${i} 段目が前の段より低い（★遠近が逆）`)
        .toBeGreaterThan(rows[i - 1]!.height);
      expect(rows[i]!.dur, `★${i} 段目が前の段より遅い（★遠近が逆）`)
        .toBeLessThan(rows[i - 1]!.dur);
    }
  });

  it('★画面の外を渡されたら黙って通さない（★R-21・読み取れない値で判定しない）', () => {
    for (const bad of [-1, 100, 140, Number.NaN]) {
      expect(() => nearBands(bad), `★${bad} が通ってしまう`).toThrow();
    }
  });

  /**
   * ⚠️ ★**切り出したのに使われていない**と、★`uma-parts.tsx` の中に
   *    ★別の段割りが生き続けます（★二重帳簿・D-052）。
   */
  it('★★`uma-parts.tsx` がこの計算を使っている（★二重帳簿にしない・D-052）', () => {
    const parts = read('src/components/uma/uma-parts.tsx');
    expect(parts, '★段割りを取り込んでいない').toContain("from './turf-bands'");
    expect(parts, '★段割りを使っていない').toMatch(/nearBands\(regionTop\)/);
    expect(parts, '★`uma-parts.tsx` の中に段割りが二重に残っている').not.toMatch(/const NEAR_BANDS/);
  });

  /**
   * ★**縦のタイルに戻っていないこと**（★苦情の原因そのもの）。
   * ★段の高さは `100%`＝縦 1 枚。★`repeat`（縦横とも）に戻すと、また等間隔の横筋が出ます。
   */
  it('★★近景が縦のタイルに戻っていない（★「雑な芝」の再発を止める）', () => {
    const parts = read('src/components/uma/uma-parts.tsx');
    const near = parts.slice(parts.indexOf('nearBands(regionTop)'));
    expect(near, '★近景が縦にも繰り返している（★等間隔の横筋が戻る）')
      .not.toMatch(/turf-near\.webp'\) repeat /);
    expect(near, '★近景が横方向の繰り返しになっていない').toMatch(/turf-near\.webp'\) repeat-x/);
    /** ★1 タイル＝`150cqw` を ★**ちょうど**流すので、★輪に戻るときの跳ねが出ません */
    expect(near, '★タイル幅が `150cqw` でない（★流れの継ぎ目が跳ねる）').toContain("'150cqw 100%'");
    const css = read('src/components/uma/uma-theme.css');
    expect(css, '★流れがタイル 1 枚ぶんちょうどでない').toMatch(/u-turf\s*\{\s*to\s*\{\s*background-position-x:\s*-150cqw/);
  });

  /**
   * ★**真横 6 コマ**（★オーナー指示「★真横カメラワーク６コマに差し替えて」）。
   * ⚠️ ★`steps(6)` の終点は **120%** でなければコマの境界に乗りません（★`u-gallop` の註記）。
   */
  it('★★TOP の馬が真横 6 コマになっている', () => {
    const top = read('src/components/uma/uma-top.tsx');
    expect(top, '★斜め前向きの 1 枚絵に戻っている').not.toContain('chibi-horse.png');
    expect(top, '★真横の 6 コマを使っていない').toContain('horse-gallop.webp');
    expect(top, '★6 コマを横に並べていない').toContain("'600% 100%'");
    expect(top, '★コマ送りになっていない').toMatch(/u-gallop [\d.]+s steps\(6\)/);
    /** ⚠️ ★6 コマに上下動が入っているので、★跳ねを重ねると二重になります */
    expect(top, '★跳ね（u-rush）が二重に掛かっている').not.toContain('u-rush');
    const css = read('src/components/uma/uma-theme.css');
    expect(css, '★`steps(6)` の終点が 120% でない（★コマの境界に乗らない）')
      .toMatch(/u-gallop[\s\S]{0,160}background-position-x:\s*120%/);
  });
});
