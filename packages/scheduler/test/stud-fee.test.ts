/**
 * ★**NPC 種牡馬の式**（★正典 §10.5・1354 行／★D-102 ③・D-107・T-11）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**係数が動く**（★正典の式。★動かすなら正典の改訂）
 *   ② 🔴 ★**素質が入力に入る**（★D-102 ③「価格からの逆算が原理的に起きない」が壊れる）
 *   ③ 🔴 ★**壊れた入力が安い馬に化ける**（★負の値を黙って 0 にしない・R-27）
 */
import { describe, it, expect } from 'vitest';
import {
  npcStudFee, STUD_FEE_BASE_EP, STUD_FEE_PER_G1_EP, STUD_FEE_EARNINGS_DIVISOR,
} from '../src/stud-fee.js';

describe('★① 正典の式のまま', () => {
  it('🔴 ★係数が 1 つも動いていない', () => {
    expect(STUD_FEE_BASE_EP).toBe(3_000);
    expect(STUD_FEE_PER_G1_EP).toBe(8_000);
    expect(STUD_FEE_EARNINGS_DIVISOR).toBe(20);
  });

  it('★走っていない馬は基礎額だけ', () => {
    expect(npcStudFee(0, 0)).toBe(3_000);
  });

  it('★G1 1 勝で +8,000', () => {
    expect(npcStudFee(1, 0)).toBe(11_000);
    expect(npcStudFee(3, 0)).toBe(27_000);
  });

  it('★総獲得賞金は 20 で割って足す（★切り捨て）', () => {
    expect(npcStudFee(0, 20_000)).toBe(4_000);
    expect(npcStudFee(0, 19)).toBe(3_000);
    expect(npcStudFee(0, 39)).toBe(3_001);
  });

  it('★正典の式と一致する（★総当たりに近い形で）', () => {
    for (const g1 of [0, 1, 2, 5, 12]) {
      for (const pp of [0, 1, 19, 20, 5_000, 123_457, 10_000_000]) {
        expect(npcStudFee(g1, pp)).toBe(3_000 + g1 * 8_000 + Math.floor(pp / 20));
      }
    }
  });
});

describe('★② 素質を入力に取らない（D-102 ③）', () => {
  it('🔴 ★引数は 2 つだけ（★素質・帯・段を足せない形）', () => {
    /**
     * ⚠️ ★**価格が素質から決まると、価格を見れば中身が分かります**。
     *    ★買っては売ってを繰り返す「振り直し」が成立し、★D-102 ③ が壊れます。
     *    → ★引数が増えていないことを、★**関数の姿**で見ます。
     */
    expect(npcStudFee.length, '★引数が増えている（★素質を入れていないか）').toBe(2);
  });

  it('★同じ戦績なら同じ価格（★中身が違っても）', () => {
    expect(npcStudFee(2, 50_000)).toBe(npcStudFee(2, 50_000));
  });
});

describe('★③ 壊れた入力を黙って通さない（R-27）', () => {
  it('🔴 ★負・小数・NaN は投げる', () => {
    expect(() => npcStudFee(-1, 0)).toThrow();
    expect(() => npcStudFee(0, -1)).toThrow();
    expect(() => npcStudFee(1.5, 0)).toThrow();
    expect(() => npcStudFee(0, 1.5)).toThrow();
    expect(() => npcStudFee(Number.NaN, 0)).toThrow();
    expect(() => npcStudFee(0, Number.NaN)).toThrow();
  });
});
