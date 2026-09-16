/**
 * ★**標準誤差の出し方**（★2026-09-16・V-13 の測り方を改めるのに合わせて追加・D-112 ③）
 *
 * 【★見ている壊れ方】
 *   ① ★**母標準偏差（÷ n）を標本の SE に流用する**（★少ない標本で SE を過小に報告する）
 *   ② ★標本が 1 個以下のときに NaN や 0 割りを返す
 *   ③ ★`sd` と `sdSample` が同じ値を返す（＝どちらかが間違っている）
 */
import { describe, it, expect } from 'vitest';
import { sd, sdSample, standardError, mean } from '../src/stats.js';

/** ★手で計算できる小さな列（平均 5・偏差 −2,−1,0,1,2 → 平方和 10） */
const xs = [3, 4, 5, 6, 7];

describe('★標準誤差（V-13 の測り方・D-112 ③）', () => {
  it('★前提: 平均と平方和', () => {
    expect(mean(xs)).toBe(5);
  });

  it('①③ ★母標準偏差と不偏標準偏差は違う値', () => {
    /** ★母: √(10/5) = √2 */
    expect(sd(xs)).toBeCloseTo(Math.SQRT2, 12);
    /** ★不偏: √(10/4) = √2.5 */
    expect(sdSample(xs)).toBeCloseTo(Math.sqrt(2.5), 12);
    expect(sdSample(xs)).toBeGreaterThan(sd(xs));
  });

  it('★SE は 不偏 SD ÷ √n', () => {
    expect(standardError(xs)).toBeCloseTo(Math.sqrt(2.5) / Math.sqrt(5), 12);
    /** ★`sd` から出した値（＝誤り）より大きい＝過小報告になっていない */
    expect(standardError(xs)).toBeGreaterThan(sd(xs) / Math.sqrt(xs.length));
  });

  it('② ★標本が足りないときは 0（★NaN も 0 割りも返さない）', () => {
    expect(standardError([])).toBe(0);
    expect(standardError([1])).toBe(0);
    expect(sdSample([])).toBe(0);
    expect(sdSample([1])).toBe(0);
    expect(Number.isNaN(standardError([1]))).toBe(false);
  });

  it('★散らない列では SE が 0（★V-13 が「効果 0 の便」で通る形）', () => {
    expect(standardError([0.05, 0.05, 0.05, 0.05])).toBe(0);
  });

  it('★★「同じはずの値」でも丸め残りで SE は 0 にならない（★実データで踏んだ形）', () => {
    /**
     * ⚠️ ★2026-09-16 に踏みました。★`verify-race` の実行で
     *    ★**3.46×10¹⁵ σ** という無意味な数字が出力に出ました。
     *    ★原因: ★同じ計算をした値どうしでも ★**浮動小数の丸め残り**が残り、
     *    ★SE が 0 ちょうどにならないこと。★`0.2 ÷ 5.8e-17` が天文学的な σ になりました。
     * ⚠️ ★**上の人工の列（すべて同じリテラル）では再現しません** — ★だから検査は緑のままでした。
     *    → ★**「0 か」ではなく「無視できるほど小さいか」で見る**こと。
     */
    const xs = Array.from({ length: 300 }, (_, i) => (0.1 * 3 - 0.1 * i * 0 + (i % 2 === 0 ? 0 : 1e-17)));
    const se = standardError(xs);
    expect(se, '★丸め残りがあると SE は 0 にならない').toBeGreaterThan(0);
    expect(se, '★ただし無視できる大きさ').toBeLessThan(1e-12);
    /** ★この大きさで割ると、意味の無い σ が出る */
    expect(0.2 / se).toBeGreaterThan(1e12);
  });
});
