/**
 * ★V-14 ③ の判定を振る舞いで守る（変異試験 CAL-DOMINANCE_MARGIN_RATIO）
 *
 * 【なぜ要るか】
 *   変異試験で `DOMINANCE_MARGIN_RATIO` は**値照合テストしか落ちていません**でした。
 *   ★`toBe(1.02)` は摂動すれば必ず落ちるので、「守られている」とは言えません（R-14）。
 *
 * 【③ が何を見ているか（D-047）】
 *   **水準の差ではありません。** 「**同じ EP でどちらが強くなるか**」だけです。
 *   EP を多く注いだほうが強くなるのは設計として正しい（D-048）。
 *
 *   ★2026-08-11 まで、この判定は**時間軸の水準差**で出ていました。
 *     定義を書いたコメントのすぐ下で、その定義と違う実装になっていました。
 *     その結果「V-14 ③ FAIL」を何便も報告し、正典値 menuIntensity を
 *     動かそうとしていました。**同じ取り違えが再発しないよう固定します。**
 */
import { describe, expect, it } from 'vitest';
import { DOMINANCE_MARGIN_RATIO, isNotDominant } from '../src/verify-v14.js';

describe('★V-14 ③ 同一 EP 予算下で支配的でない（D-047）', () => {
  it('★EP あたり効率が明確に上なら支配的と判定する（落とせる）', () => {
    expect(isNotDominant(1.5)).toBe(false);
    expect(isNotDominant(2.0)).toBe(false);
    expect(isNotDominant(10)).toBe(false);
  });

  it('★EP あたり効率が下なら支配的でない（実測は 0.68倍）', () => {
    expect(isNotDominant(0.68)).toBe(true);
    expect(isNotDominant(0.5)).toBe(true);
  });

  it('★互角（1.00倍）は通す — EP あたりが同じなら支配していない', () => {
    expect(isNotDominant(1.0)).toBe(true);
  });

  it('★境界の両側（R-2）', () => {
    expect(isNotDominant(DOMINANCE_MARGIN_RATIO)).toBe(true);
    expect(isNotDominant(DOMINANCE_MARGIN_RATIO + 1e-9)).toBe(false);
  });

  it('★判定幅は互角の近傍にある（100 のような値だと何倍でも通ってしまう）', () => {
    expect(DOMINANCE_MARGIN_RATIO).toBeGreaterThan(1);
    expect(DOMINANCE_MARGIN_RATIO).toBeLessThan(1.2);
  });
});
