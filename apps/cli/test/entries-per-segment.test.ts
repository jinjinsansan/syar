/**
 * ★**区間ごとの申し込みの合計は、キャリア上限と一致する**（★**CC-1 ⑤ 波及**・2026-09-19）
 *
 * 【🔴 ★何が起きていたか】
 *   ★`verify-initial-band.ts`（★帯の下のゲート・D-079 ④）は
 *   ★`CAREER_RACE_LIMIT / SEGMENTS` を区間ごとの枠にしていました。
 *   ★24 ÷ 6 ＝ 4 のときは整数でしたが、★**CC-1 ③ で 40 になり 6.666…**。
 *   ★残り枠は `> 0` で判定して 1 ずつ引くので、★**0.667 でもう 1 回 通り**、
 *   → 🔴 ★**42 戦**。★**上限を 2 戦 超えて測っていました**（★表示は「40 戦」）。
 *
 * 【★この検査の要点】
 *   ★**合計を数えること**です。★今回 42 になったのは ★**割り算の結果を誰も数えなかった**から。
 *   → ★**次に上限を動かした人は、ここで止まります。**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CAREER_RACE_LIMIT } from '@star/scheduler';
import { entriesPerSegment } from '../src/measurement.js';
import { stripComments } from './lib/ts-blocks.js';

describe('★CC-1 ⑤ 波及: 区間ごとの申し込み', () => {
  it('🔴 ★合計が、いまのキャリア上限と一致する', () => {
    const xs = entriesPerSegment(CAREER_RACE_LIMIT, 6);
    expect(xs.reduce((a, b) => a + b, 0)).toBe(CAREER_RACE_LIMIT);
  });

  it('🔴 ★端数は **後ろの区間**へ（★早期引退の馬に多く枠を与えない・R-27）', () => {
    /**
     * ⚠️ ★`verify-initial-band.ts` は ★**区間の頭で引退済みの馬を登録しません**。
     *    → ★早く引退する馬ほど**前の区間しか使えない**ので、★前に厚くすると ★**ゲートが甘くなります**。
     */
    expect(entriesPerSegment(40, 6), '★40 ÷ 6 の端数が後ろに行っていない').toEqual([6, 6, 7, 7, 7, 7]);
    expect(entriesPerSegment(24, 6), '★割り切れるときは全部 同じ').toEqual([4, 4, 4, 4, 4, 4]);
    expect(entriesPerSegment(41, 6)).toEqual([6, 7, 7, 7, 7, 7]);
  });

  it('★対照: ★どの上限でも合計は合う（★端数が 0〜5 のどれでも）', () => {
    for (let total = 6; total <= 120; total += 1) {
      const xs = entriesPerSegment(total, 6);
      expect(xs.reduce((a, b) => a + b, 0), `★合計が合わない: total=${total}`).toBe(total);
      // ★前の区間が後ろより厚くならない（★単調に増える形）
      for (let i = 1; i < xs.length; i += 1) {
        expect(xs[i]! >= xs[i - 1]!, `★前が厚い: total=${total} → ${xs.join(',')}`).toBe(true);
      }
    }
  });

  it('⚠️ ★おかしな入力は黙って通さない（★0 や小数で「合計 0」を返さない）', () => {
    expect(() => entriesPerSegment(0, 6)).toThrow();
    expect(() => entriesPerSegment(40, 0)).toThrow();
    expect(() => entriesPerSegment(40.5, 6)).toThrow();
  });

  it('🔴 ★`verify-initial-band.ts` が、この 1 本を使っている（★割り算に戻っていない）', () => {
    /**
     * ⚠️ ★**註記を数えないこと。** ★この検査は最初 ★**自分が書いた説明文に当たって落ちました**
     *    （★「`CAREER_RACE_LIMIT / SEGMENTS` は 24 のときは 4 でした」という★過去形の説明）。
     *    → ★`stripComments` を通してから見ます（★註記の記号がファイルを壊すのと同じ族）。
     */
    const src = stripComments(readFileSync(
      path.resolve(__dirname, '../src/verify-initial-band.ts'), 'utf8',
    ));
    expect(src, '★`entriesPerSegment` を使っていない').toContain('entriesPerSegment(CAREER_RACE_LIMIT, SEGMENTS)');
    expect(src, '🔴 ★割り算が戻っている').not.toMatch(/CAREER_RACE_LIMIT\s*\/\s*SEGMENTS/);
  });
});
