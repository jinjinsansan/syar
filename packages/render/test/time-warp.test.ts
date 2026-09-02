/**
 * ★時間配分（正典 D-062）— **配分を変えても真実は動かないこと**
 *
 * > 道中は速く送り、勝負所以降を実時間かそれ以上に伸ばす。
 * > 描画層（D-059 の補間）だけで実装でき、**境界時刻・着順・ゲートに一切触れません**。
 *
 * ★ここが見るのは「触っていないこと」です。**触っていないと書いてあること**ではなく。
 */
import { describe, it, expect } from 'vitest';
import {
  timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
  replayPositionModel, finalOrderOf, type Boundaries,
} from '../src/index.js';

const knots = { startSec: 0, spurtSec: 60, straightSec: 85, finishSec: 96 };

describe('★時間配分（D-062）', () => {
  it('★折れ点は、配分を変えても1秒もずれない', () => {
    // ★ここがずれると「勝負所に入った瞬間」が配分で動きます
    for (const rates of [
      { cruise: 1, spurt: 1, straight: 1 },
      DEFAULT_PHASE_RATES,
      { cruise: 8, spurt: 2, straight: 0.25 },
    ]) {
      const w = timeWarpFor(knots, rates);
      for (const t of [knots.startSec, knots.spurtSec, knots.straightSec, knots.finishSec]) {
        expect(w.raceSecAt(w.displaySecAt(t))).toBeCloseTo(t, 9);
      }
    }
  });

  it('★等速なら、表示時間はレース時間と同じ（対照）', () => {
    const w = timeWarpFor(knots, { cruise: 1, spurt: 1, straight: 1 });
    expect(w.displaySec).toBeCloseTo(96, 9);
    for (const t of [10, 30, 55, 70, 90]) expect(w.raceSecAt(t)).toBeCloseTo(t, 9);
  });

  it('★道中は縮み、直線は伸びる（配分が実際に効いている）', () => {
    const w = timeWarpFor(knots, DEFAULT_PHASE_RATES);
    const cruiseDisplay = w.displaySecAt(knots.spurtSec) - w.displaySecAt(knots.startSec);
    const straightDisplay = w.displaySecAt(knots.finishSec) - w.displaySecAt(knots.straightSec);
    /**
     * ★**ぴったり 60÷3 にはなりません。** 境目を滑らかに繋いでいるためです
     *   （段で切り替えると、実測で **0.2秒に 31.3m/s** の速度変化が出ました）。
     *   → 見るのは「**縮んだか**」で、正確な値ではありません。
     */
    expect(cruiseDisplay).toBeLessThan(knots.spurtSec - knots.startSec);
    // ★2026-08-18: 直線は 0.7 → 1.0（実時間）。「伸びる」ではなく「縮まない（実時間以上）」を見る
    expect(straightDisplay).toBeGreaterThanOrEqual((knots.finishSec - knots.straightSec) * 0.999);
  });

  it('★★送り速さが跳ばない（境目で速度が段にならない）', () => {
    /**
     * ★オーナーの指摘「**途中でグングンスピードが上がるが不自然**」。
     *   段で切り替えていたときの実測は **0.2秒あたり 31.3m/s** の変化でした。
     *   ここでは「表示1秒あたりに進むレース秒数」の変化率を見ます。
     */
    const w = timeWarpFor(knots, DEFAULT_PHASE_RATES);
    const dt = 0.05;
    let prev = Number.NaN;
    let maxJump = 0;
    for (let d = 0; d + dt <= w.displaySec; d += dt) {
      const rate = (w.raceSecAt(d + dt) - w.raceSecAt(d)) / dt;
      if (Number.isFinite(prev)) maxJump = Math.max(maxJump, Math.abs(rate - prev));
      prev = rate;
    }
    // ★段で切り替えると 2.0 近い跳びが出ます（3倍速 → 1倍）
    expect(maxJump).toBeLessThan(0.05);
  });

  it('★時間は必ず前に進む（戻ると馬が下がって見える）', () => {
    const w = timeWarpFor(knots, DEFAULT_PHASE_RATES);
    let prev = -1;
    for (let d = 0; d <= w.displaySec; d += 0.05) {
      const t = w.raceSecAt(d);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('★端は必ず端（最後まで送れば必ずゴール時刻）', () => {
    const w = timeWarpFor(knots, DEFAULT_PHASE_RATES);
    expect(w.raceSecAt(-5)).toBe(knots.startSec);
    expect(w.raceSecAt(0)).toBe(knots.startSec);
    expect(w.raceSecAt(w.displaySec)).toBe(knots.finishSec);
    expect(w.raceSecAt(w.displaySec + 99)).toBe(knots.finishSec);
  });

  it('★送り速さが 0 や負や無限なら止める（時間が止まる・戻る）', () => {
    for (const bad of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() => timeWarpFor(knots, { ...DEFAULT_PHASE_RATES, cruise: bad })).toThrow();
      expect(() => timeWarpFor(knots, { ...DEFAULT_PHASE_RATES, straight: bad })).toThrow();
    }
  });

  it('★折れ点が順序どおりでなければ止める', () => {
    expect(() => timeWarpFor({ startSec: 0, spurtSec: 80, straightSec: 60, finishSec: 96 })).toThrow();
  });
});

describe('★★配分をどう変えても、着順は1頭も動かない（D-062 の約束）', () => {
  const boundaries: readonly Boundaries[] = [
    { gate: 1, startSec: 0, spurtSec: 61, straightSec: 86, finishSec: 97.4 },
    { gate: 2, startSec: 0, spurtSec: 59, straightSec: 84, finishSec: 96.1 },
    { gate: 3, startSec: 0, spurtSec: 62, straightSec: 87, finishSec: 96.8 },
    { gate: 4, startSec: 0, spurtSec: 58, straightSec: 85, finishSec: 98.2 },
  ];
  const model = replayPositionModel({
    distanceMeter: 1600, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  });

  it('★着順は配分に依存しない', () => {
    const expected = [2, 3, 1, 4];   // finishSec の順
    expect(finalOrderOf(model)).toEqual(expected);

    // ★時計を読み替えても、位置モデルそのものは変わりません（構造で保証）
    for (const rates of [
      { cruise: 1, spurt: 1, straight: 1 },
      DEFAULT_PHASE_RATES,
      { cruise: 12, spurt: 3, straight: 0.1 },
    ]) {
      const w = timeWarpFor(knotsFor(boundaries, 2, model.straightMeters), rates);
      // 表示の最後まで送ったとき、全馬の位置がゴール後であること
      const at = model.at(w.raceSecAt(w.displaySec));
      expect(at.every((h) => h.meters >= 1600 - 1e-6)).toBe(true);
      // ★着順は読み替えの影響を受けない
      expect(finalOrderOf(model)).toEqual(expected);
    }
  });

  it('★局面の折れ点は基準の馬・終点は最後の1頭', () => {
    // 局面（寄る位置）は基準の馬に合わせる ＝ カメラと揃う
    expect(knotsFor(boundaries, 4, model.straightMeters).spurtSec).toBe(58);
    expect(knotsFor(boundaries, 2, model.straightMeters).spurtSec).toBe(59);
    // 指定なし＝先頭（最も早くゴールした馬）を基準にする
    expect(knotsFor(boundaries, undefined, model.straightMeters).spurtSec).toBe(59);
    // ★居ない馬を指定したら先頭に落とす（落ちない）
    expect(knotsFor(boundaries, 99, model.straightMeters).spurtSec).toBe(59);

    /**
     * ★**終点は誰を基準にしても同じ**（最後の1頭）。
     *   ⚠️ ここを基準の馬にすると、**自馬がゴールした瞬間に表示が終わり**、
     *      後続がまだ走っている状態になります。実際にそう書いて検査に落ちました。
     */
    for (const g of [undefined, 1, 2, 3, 4, 99]) {
      expect(knotsFor(boundaries, g, model.straightMeters).finishSec).toBe(98.2);
    }
  });

  it('★境界時刻がなければ止める', () => {
    expect(() => knotsFor([], undefined, 400)).toThrow();
  });
});
