/**
 * ★境界を守る位置モデル（正典 D-059）
 *
 * > 局面境界の位置 … エンジン＝真実
 * > 局面と局面の間 … 描画層が補間＝演出
 * > **補間は、境界の位置と最終着順を1頭も動かしてはいけない。**
 *
 * 【この層の約束】
 *   ★**境界時刻には、必ず境界の位置にいます。** 補間は「間」だけです。
 *   ⚠️ 補間の式を変えても、境界と着順は動きません。
 *      **それを機械で確かめるのが `replay-model.test.ts` です。**
 *
 * 【★位置は保存しません】
 *   凍結スナップショット＋シードから再計算します。
 *   ここは**その再計算結果を描画コマンドに変える**だけで、真実は持ちません。
 */

import type { HorseAt, PositionModel } from './scene.js';

/** エンジンが出す境界時刻（`@star/race-engine` の `BoundaryTimes` と同じ形） */
export interface Boundaries {
  readonly gate: number;
  readonly startSec: number;
  readonly spurtSec: number;
  readonly straightSec: number;
  readonly finishSec: number;
}

export interface ReplayInput {
  readonly distanceMeter: number;
  /** 勝負所・直線に入る「残り距離」（正典 §13: 800 / 400） */
  readonly spurtMetersLeft: number;
  readonly straightMetersLeft: number;
  readonly boundaries: readonly Boundaries[];
  /**
   * ★**演出の強さ**（0 で補間なし＝等速）。
   *   ⚠️ ここをいくら動かしても、**境界と着順は動きません**。
   *      動くのは「局面の間でどれだけ前後するか」だけです。
   */
  readonly jostle?: number | undefined;
}

/**
 * 区間の中だけ前後させる。
 *
 * ★**単調増加でなければなりません。** 位置が後戻りすると、
 *   画面では**馬が下がって見えます**。実際に踏みました
 *   （185.768 → 185.697 と戻り、テストが落ちました）。
 *
 * 【なぜ後戻りしたか】
 *   `t + a·sin(πt)·sin(2πt+φ)` は、**微分が負になる領域**があります。
 *   端で 0 になる（＝境界を動かさない）ことだけを見て、
 *   **途中で戻らないことを確かめていませんでした。**
 *
 * 【★直し方】
 *   **速度を歪めて、それを積分します。** 速度を必ず正に保てば、位置は必ず増えます。
 *     速度 v(t) = 1 + a·sin(2πt+φ)   （|a| < 1 なら v > 0）
 *     位置 x(t) = ∫v = t + (a/2π)·(cos(φ) − cos(2πt+φ))
 *   ★端で x(0)=0・x(1)=1 になるので、**境界も動きません**。
 */
function easeWithin(t: number, amount: number, seed: number): number {
  if (amount === 0) return t;
  // ★速度を正に保つため 0.9 で頭打ち（1 以上だと速度が 0 以下になりうる）
  const a = Math.max(-0.9, Math.min(0.9, amount));
  const k = a / (2 * Math.PI);
  const x = t + k * (Math.cos(seed) - Math.cos(2 * Math.PI * t + seed));
  // ★x(1) は t=1 で 1 に戻る（cos が一周するため）。数値誤差だけ丸める
  return Math.max(0, Math.min(1, x));
}

/**
 * 境界時刻から位置モデルを作る。
 *
 * ★**同じ入力から同じ位置**が出ます（乱数を使いません）。
 *   ゆらぎは馬番から決まる位相で作ります。
 */
export function replayPositionModel(input: ReplayInput): PositionModel {
  const {
    distanceMeter, spurtMetersLeft, straightMetersLeft, boundaries,
  } = input;
  const jostle = input.jostle ?? 0.06;
  if (boundaries.length === 0) throw new Error('境界時刻がありません');

  const spurtM = distanceMeter - spurtMetersLeft;
  const straightM = distanceMeter - straightMetersLeft;
  const raceSec = Math.max(...boundaries.map((b) => b.finishSec));

  /** 1頭ぶんの位置。★区切りごとに線形、区切りの中だけ演出 */
  const metersOf = (b: Boundaries, sec: number): number => {
    // ★区間を [時刻, 距離] の折れ線として持つ。**折れ点＝境界＝真実**
    const pts: readonly [number, number][] = [
      [b.startSec, 0],
      [b.spurtSec, spurtM],
      [b.straightSec, straightM],
      [b.finishSec, distanceMeter],
    ];
    if (sec <= 0) return 0;
    if (sec >= b.finishSec) return distanceMeter;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [t0, m0] = pts[i]!;
      const [t1, m1] = pts[i + 1]!;
      if (sec < t0 || sec > t1) continue;
      if (t1 <= t0) return m1;
      const t = (sec - t0) / (t1 - t0);
      // ★演出はここだけ。両端で必ず 0 になるので境界は動かない
      const e = easeWithin(t, jostle, b.gate * 1.7);
      return m0 + (m1 - m0) * e;
    }
    return distanceMeter;
  };

  /**
   * ★余力（§12.6 のゲージ）。
   *   正典 §13 は「**減るのは勝負所（残り800m）以降**」と定めています。
   *   その前は 1 のままです。
   */
  const staminaOf = (b: Boundaries, sec: number): number => {
    if (sec <= b.spurtSec) return 1;
    const span = Math.max(1e-6, b.finishSec - b.spurtSec);
    return Math.max(0, 1 - (sec - b.spurtSec) / span);
  };

  return {
    raceSec,
    distanceMeter,
    at(sec: number): readonly HorseAt[] {
      return boundaries.map((b) => ({
        gate: b.gate,
        meters: metersOf(b, sec),
        staminaRatio: staminaOf(b, sec),
      }));
    },
  };
}

/**
 * ★**ゲート**: この位置モデルから出る最終順が、確定済みの着順と一致すること（D-059）。
 *   ⚠️ 「近い」では通しません。1頭でも違えば false です。
 */
export function finalOrderOf(model: PositionModel): number[] {
  const last = model.at(model.raceSec);
  return [...last]
    .sort((a, b) => {
      if (b.meters !== a.meters) return b.meters - a.meters;
      return a.gate - b.gate;   // ★同着は馬番順（確定側と同じ規則）
    })
    .map((h) => h.gate);
}
