/**
 * ★裾混合（案D）の機構そのものを固定する（Q-P3-42 の裁定）
 *
 * 【なぜ下流の帯では守れないか — 実測】
 *   `TAIL_MIX_P_DEFAULT` を 0.03 → 0 に壊すと、**V-6 は 1.21% → 0.59%（51%）動く**のに、
 *   帯（0.5〜2%）の**内側に留まるので落ちません**（60,000本 × 4シードで確認）。
 *
 *   > 「効いている」は必要条件で、十分条件ではない。
 *   > 帯に余裕があれば、大きく効く定数でも壊れたまま通る。
 *
 *   ★下流の帯には余裕がありますが、**機構の直接の性質には余裕がありません。**
 *     だからここでは「V-6 が動くか」ではなく
 *     **「広い成分から引かれる割合が P に一致するか」**を見ます。
 */
import { describe, it, expect } from 'vitest';
import { deriveRng } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, TAIL_MIX_P_DEFAULT, TAIL_MIX_M_DEFAULT } from '../src/balance.js';

/**
 * `race.ts` の §8.7 と**同じ引き方**をする。
 *   const heavyTail = finalRng.bool(balance.TAIL_MIX_P);
 *   const spread    = balance.RACE_RANDOM_K * (heavyTail ? balance.TAIL_MIX_M : 1);
 *   const randomMult = 1 + finalRng.gaussian(0, spread);
 */
function sample(n: number, p: number, m: number, k: number): { wide: number; values: number[] } {
  let wide = 0;
  const values: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const rng = deriveRng(20260812, 99, i);
    const heavyTail = rng.bool(p);
    if (heavyTail) wide += 1;
    values.push(rng.gaussian(0, k * (heavyTail ? m : 1)));
  }
  return { wide, values };
}

const N = 200_000;
const K = DEFAULT_RACE_BALANCE.RACE_RANDOM_K;

describe('★案D 裾混合の機構（V-6 の帯では守れない）', () => {
  it('★広い成分から引かれる割合が TAIL_MIX_P に一致する', () => {
    const { wide } = sample(N, TAIL_MIX_P_DEFAULT, TAIL_MIX_M_DEFAULT, K);
    const ratio = wide / N;
    // ★P=0.03 に対し ±0.004。P=0 に壊せば 0 になるので必ず落ちる
    expect(ratio).toBeGreaterThan(TAIL_MIX_P_DEFAULT - 0.004);
    expect(ratio).toBeLessThan(TAIL_MIX_P_DEFAULT + 0.004);
    // ★「割合が 0 でない」ことを別に言う（上の帯だけだと P=0.001 でも通る幅がありうる）
    expect(wide).toBeGreaterThan(0);
  });

  it('★広い成分の幅が狭い成分の TAIL_MIX_M 倍である', () => {
    const sd = (xs: number[]): number => {
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    };
    // 同じ引き方で、片方は必ず広い成分・片方は必ず狭い成分になるようにする
    const wideOnly = sample(20_000, 1, TAIL_MIX_M_DEFAULT, K).values;
    const narrowOnly = sample(20_000, 0, TAIL_MIX_M_DEFAULT, K).values;
    const ratio = sd(wideOnly) / sd(narrowOnly);
    // ★M=5 に対し ±0.25。M=1 に壊せば 1.0 になるので必ず落ちる
    expect(ratio).toBeGreaterThan(TAIL_MIX_M_DEFAULT - 0.25);
    expect(ratio).toBeLessThan(TAIL_MIX_M_DEFAULT + 0.25);
  });

  it('★裾の厚みが単一正規分布より明確に大きい（混合が効いている）', () => {
    const { values } = sample(N, TAIL_MIX_P_DEFAULT, TAIL_MIX_M_DEFAULT, K);
    const beyond3 = values.filter((v) => Math.abs(v) > 3 * K).length / N;
    // 単一正規なら 3σ 超は約 0.27%。混合なら P × （M 倍の裾）が乗るので数倍になる
    const single = sample(N, 0, TAIL_MIX_M_DEFAULT, K).values
      .filter((v) => Math.abs(v) > 3 * K).length / N;
    expect(beyond3).toBeGreaterThan(single * 2);
    // ★「単一より大きい」だけでなく**絶対量**も固定する（single が壊れても気づけるように）
    expect(beyond3).toBeGreaterThan(0.01);
  });

  it('★分岐しても乱数の消費数が変わらない（決定論・Provably Fair）', () => {
    // ★`bool` を必ず1回消費する設計。ここが崩れると seed 公開後の再現ができなくなる
    const a = deriveRng(1, 2, 3);
    a.bool(0);
    const afterNarrow = a.gaussian(0, K);
    const b = deriveRng(1, 2, 3);
    b.bool(1);
    const afterWide = b.gaussian(0, K);
    // 同じ位置の乱数を使っているので、幅が同じなら値も同じになる
    expect(afterNarrow).toBeCloseTo(afterWide, 12);
  });
});
