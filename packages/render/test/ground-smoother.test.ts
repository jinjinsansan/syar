import { describe, expect, it } from 'vitest';
import { createGroundSmoother } from '../src/visual-scroll.js';

/**
 * ★芝の最後の安全網（★2026-10-02 オーナー「今のレース 芝がおかしい」・本番 race 344d9140 d=62.11 毎秒 37m／d=81.51 毎秒 91m）。
 *   ★見た目の約束: ★芝は 1 コマで跳ねない・止まらない・戻らない（★`[race-ground]` と同じ境目: 前のコマの 50% かつ 5m/秒）。
 */
const FPS = 60;
const STEP = 1 / FPS;

/** ★表どおりの芝の位置の列（`rawAt`）を 安全網に通し、★毎コマの速さを返す */
function run(rawAt: (d: number) => number, cutAt: (d: number) => boolean = () => false, from = 0, to = 3): number[] {
  const s = createGroundSmoother();
  const speeds: number[] = [];
  let prev: number | null = null;
  for (let i = 0; from + i * STEP <= to; i += 1) {
    const d = from + i * STEP;
    const x = s.step(d, rawAt(d), cutAt(d));
    if (prev !== null) speeds.push((x - prev) / STEP);
    prev = x;
  }
  return speeds;
}
/** ★隣のコマとの速さの変化が 境目を超えたコマの数 */
const jolts = (v: readonly number[]): number => v.slice(1).filter((s, i) => s < 0 || Math.abs(s - v[i]!) > Math.max(5, Math.abs(v[i]!) * 0.5)).length;

describe('芝の最後の安全網', () => {
  it('★1 コマだけの跳ね（★本番 d=81.51 の形: 補正 +1.25m）を消す', () => {
    const raw = (d: number): number => d * 16.4 + (d >= 1.5 ? 1.25 : 0);
    expect(jolts(run(raw, () => false)), '★網を通すと跳ねない').toBe(0);
    /** ★対照: ★網を通さないと跳ねる */
    const plain: number[] = [];
    for (let d = STEP; d <= 3; d += STEP) plain.push((raw(d) - raw(d - STEP)) / STEP);
    expect(jolts(plain)).toBeGreaterThan(0);
  });

  it('★3 コマ止まる（★10-01 の形）・★逆に動く を消す', () => {
    const stall = (d: number): number => (d < 1.5 ? d * 16 : d < 1.55 ? 1.5 * 16 : d * 16 - 0.8);
    expect(jolts(run(stall))).toBe(0);
    const back = (d: number): number => d * 16 - (d >= 1.5 ? 2 : 0);
    expect(run(back).every((v) => v >= 0), '★戻った').toBe(true);
  });

  it('★カメラの切り替わりで 注視点が跳んでも 芝の速さは途切れない', () => {
    const raw = (d: number): number => d * 15 + (d >= 1.2 ? 8 : 0);
    expect(jolts(run(raw, (d) => Math.abs(d - 1.2) < STEP / 2 || (d >= 1.2 && d < 1.2 + STEP)))).toBe(0);
  });

  it('★本当の速さの変化（★発走の加速・直線の減速）は そのまま通す', () => {
    /** ★0 → 16m/秒 を 3 秒で（★1 コマの変化は 0.09m/秒） */
    const accel = (d: number): number => (16 / 3) * d * d / 2;
    const v = run(accel, () => false, 0, 3);
    expect(v[v.length - 1]!).toBeGreaterThan(15.5);
    /** ★段のある変化（★16 → 11m/秒）も ★0.4 秒の後には受け入れる（★ずっと前の速さのままにならない） */
    const stepDown = (d: number): number => (d < 1 ? d * 16 : 16 + (d - 1) * 9);
    const w = run(stepDown, () => false, 0, 2);
    expect(w[w.length - 1]!).toBeCloseTo(9, 0);
  });

  it('★時計が戻ったら（★見直し）測り直す・★決定論', () => {
    const s = createGroundSmoother();
    s.step(1, 16, false);
    s.step(1 + STEP, 16 + 16 * STEP, false);
    expect(Number.isFinite(s.step(0.2, 3, false))).toBe(true);
    expect(run((d) => d * 16 + (d >= 1.5 ? 1.25 : 0))).toEqual(run((d) => d * 16 + (d >= 1.5 ? 1.25 : 0)));
  });
});
