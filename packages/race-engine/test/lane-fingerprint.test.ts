/**
 * ★**距離ロスの指紋が、直す前のコミットと 1 ビットも変わらない**（★ES 便 ES-1・2026-09-15）
 *
 * 【★見ている壊れ方】★ES 便で `lane.ts` を速くしたとき、★着順・スコア・距離ロス・走破タイム・画面の `w` が
 *   ★**わずかでも変わる**こと（★浮動小数の計算の順番を入れ替えた・1 レース 1 回の値を距離だけで決めた・馬ごとの値を別の枠で作った 等）。
 * 【★期待値】`lane-fingerprint.expected.json`（★`cfc3ad1` で `lane-fingerprint.gen.ts` が書いた値・★検査の中で作らない・R-16）。
 * 【★範囲】`lane-fingerprint.cases.ts` の註記（10 場・既定の楕円・半径 4 つ違い・直線 × 7 距離 × 8・18 頭 × シード 20）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fingerprintCases, fingerprintOf, FINGERPRINT_HEADS, FINGERPRINT_SEEDS, LANE_AT_STEP_M } from './lane-fingerprint.cases.js';

const file = JSON.parse(readFileSync(new URL('./lane-fingerprint.expected.json', import.meta.url), 'utf8')) as {
  engineCommit: string; heads: number[]; seeds: number; laneAtStepM: number; cases: number; expected: Record<string, string>;
};

describe('★距離ロスの指紋（ES 便）', () => {
  it('★期待値のファイルと、いまの対象の組が同じ（★範囲を黙って減らさない）', () => {
    const cases = fingerprintCases();
    expect(file.heads).toEqual([...FINGERPRINT_HEADS]);
    expect(file.seeds).toBe(FINGERPRINT_SEEDS);
    expect(file.laneAtStepM).toBe(LANE_AT_STEP_M);
    expect(cases.map((c) => c.key).sort()).toEqual(Object.keys(file.expected).sort());
    /** ★対照: 10 場・既定・半径 4 つ違い・直線 × 7 距離 × 2 頭数 */
    expect(cases.length).toBe((10 + 3) * 7 * 2);
  });

  it(`★すべての組で、直す前のコミット（${file.engineCommit}）と同じ指紋`, () => {
    const mismatches: string[] = [];
    for (const c of fingerprintCases()) {
      const got = fingerprintOf(c);
      if (got !== file.expected[c.key]) mismatches.push(`${c.key}: 期待 ${file.expected[c.key]} ／ いま ${got}`);
    }
    expect(mismatches.slice(0, 20), `★指紋が ${mismatches.length} 組で変わった`).toEqual([]);
  }, 300_000);
});
