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
  /**
   * ★**揺らぎのシード**（D-061 改訂・憲法4「乱数は必ず注入する」）。
   *
   *   ⚠️ `Math.random()` は**呼びません**。同じシード → 同じ映像です。
   *   ★これが**別ストリーム**であることが要点です:
   *     `resolveRace` の乱数には一切触れないので、**着順も較正も動きません**。
   *
   * 【なぜ要るか — 実測】
   *   揺らぎが「馬番だけで決まる固定の形」だったとき、
   *   画面ボットは **位置の順位と脚質の2つだけで、スタート直後から AUC 0.928**、
   *   しかも**レース中ずっと平坦**でした。★**最初から答えが映っていた**わけです。
   *   位置(t) = f(走破タイム, 脚質, ペース) が**可逆**だったためです。
   *
   *   → レースごと・馬ごとに違う揺らぎを入れて、**可逆性を壊します**。
   *     ★ゴールでは揺らぎが 0 になるので、**着順は厳密に一致します**。
   */
  readonly jostleSeed?: number | undefined;
  /**
   * ★**中間の境界（残り800m / 400m）を、位置として厳守するか。**
   *
   *   `'exact'`（既定・**D-059 の明文どおり**）
   *     境界時刻には必ず境界の位置にいます。揺らぎは区間の中だけ。
   *     ⚠️ ★**境界では `位置 + 脚質` から走破タイムが厳密に逆算できます。**
   *        実測: 揺らぎをいくら強くしても、残り800m の AUC は **0.931 で動きません**
   *        （道中は 0.923 → 0.731 まで落ちるのに）。
   *
   *   `'shape'`（★D-061 改訂の含意）
   *     揺らぎを**レース全体に1本**かけます。0 になるのは**スタートとゴールだけ**。
   *     > その時刻自体が結果から導出されたものです。
   *     > つまり道中に「忠実であるべき真実」は最初から存在しません。（裁定）
   *     ★**着順は厳密に一致します**（端で揺らぎが 0 になるため）。
   *
   * 【★なぜ既定を変えていないか】
   *   D-059 は「**境界の位置と最終着順を1頭も動かしてはいけない**」と明文で定めています。
   *   裁定の訂正はこれを含意しますが、★**批准済みの決定を実装側の判断で崩しません**。
   *   両方を測って出します（Q-P4-20）。
   */
  readonly boundaryFidelity?: 'exact' | 'shape' | undefined;
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
/**
 * ★**別ストリームの決定的な乱数**（正典 D-061 改訂）
 *
 * > 正しくは「**結果に影響する乱数を引かない**」でした。
 * > 別ストリームから引く揺らぎは、シードから再計算できるので Provably Fair は保たれ、
 * > `resolveRace` に触れないので**再較正も要りません**。
 *
 * ⚠️ **`Math.random()` を呼びません**（憲法4）。シードは**必ず注入**されます。
 *    同じシード → 同じ揺らぎ。だから**リプレイは完全に再現します**。
 */
function streamAt(seed: number, gate: number, index: number): number {
  // ★mulberry32 相当。**この層で乱数の質を追いません**（揺らぎの位相を散らすだけ）
  let h = (seed | 0) ^ Math.imul(gate | 0, 0x9e3779b1) ^ Math.imul(index | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/** ★1区間ぶんの揺らぎの係数（振幅と位相）。**同じ入力から必ず同じ係数** */
interface Harmonics {
  readonly amps: readonly number[];
  readonly phases: readonly number[];
}

/** ★区間ごと・馬ごとに違う揺らぎを引く（レースが違えば違う） */
function harmonicsFor(seed: number, gate: number, segment: number, amount: number): Harmonics {
  if (amount === 0) return { amps: [], phases: [] };
  /**
   * ★**3つの倍音**。1つだけだと「山が1つ」の同じ形になり、
   *   ★**学習すれば取り除けます**（＝漏洩が残る）。
   */
  const K = 3;
  const raw: number[] = [];
  const phases: number[] = [];
  for (let k = 0; k < K; k += 1) {
    raw.push(streamAt(seed, gate, segment * 16 + k * 2) * 2 - 1);
    phases.push(streamAt(seed, gate, segment * 16 + k * 2 + 1) * 2 * Math.PI);
  }
  /**
   * ★**速度を正に保つ**: v(t) = 1 + Σ aₖ·sin(2πk·t + φₖ) が正であるには Σ|aₖ| < 1。
   *   ⚠️ ここを外すと**位置が後戻りし、画面では馬が下がって見えます**（前に踏みました）。
   *   → 合計が `amount`（≤0.9）になるよう正規化します。**構造で単調性を保証します。**
   */
  const total = raw.reduce((s2, v) => s2 + Math.abs(v), 0);
  const scale = total === 0 ? 0 : Math.max(-0.9, Math.min(0.9, amount)) / total;
  return { amps: raw.map((v) => v * scale), phases };
}

/**
 * 区間の中だけ前後させる。★**端では必ず 0**（境界も着順も動かない）。
 *
 *   v(t) = 1 + Σ aₖ·sin(2πk·t + φₖ)
 *   x(t) = ∫v = t + Σ (aₖ/2πk)·(cos φₖ − cos(2πk·t + φₖ))
 *   ★x(0)=0・x(1)=1（cos が一周する）。**Σ|aₖ| < 1 なら v > 0 なので単調増加。**
 */
function easeWithin(t: number, h: Harmonics): number {
  if (h.amps.length === 0) return t;
  let x = t;
  for (let k = 0; k < h.amps.length; k += 1) {
    const n = k + 1;
    const a = h.amps[k]!;
    const p = h.phases[k]!;
    x += (a / (2 * Math.PI * n)) * (Math.cos(p) - Math.cos(2 * Math.PI * n * t + p));
  }
  // ★数値誤差だけ丸める
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
  const jostleSeed = input.jostleSeed ?? 0;
  const fidelity = input.boundaryFidelity ?? 'exact';
  if (boundaries.length === 0) throw new Error('境界時刻がありません');

  const spurtM = distanceMeter - spurtMetersLeft;
  const straightM = distanceMeter - straightMetersLeft;
  const raceSec = Math.max(...boundaries.map((b) => b.finishSec));

  /**
   * 1頭ぶんの位置。
   *
   * ★**揺らぎが 0 になるのは、スタートとゴールだけです。**
   *
   * 【なぜ区間ごとにしないのか — 裁定の訂正を受けて】
   *   > その時刻自体が結果から導出されたものです。
   *   > つまり**道中に「忠実であるべき真実」は最初から存在しません。**
   *
   *   ⚠️ 最初は**区間ごと**に揺らぎを入れていました。すると
   *      **境界（残り800m / 400m）ではちょうど 0** になります。
   *      → そこでは `位置 + 脚質` から走破タイムが**厳密に逆算でき**、
   *        ★実測で**揺らぎをいくら強くしても AUC 0.931 / 0.963 のまま**でした
   *        （道中は 0.923 → 0.731 まで落ちたのに、境界だけ動かない）。
   *
   *   ★**守るべき真実は着順だけ**なので、揺らぎは**レース全体に1本**かけます。
   *     端（t=0, t=1）で 0 になるので、**ゴール時刻＝着順は厳密に一致**します。
   *
   * 【★局面の合図はずれません】
   *   カメラも仕掛けの受付も**残り距離**で決まります（`phaseOf` / §13）。
   *   ★時刻ではないので、揺らぎで**「勝負所に入った位置」は動きません**。
   */
  const metersOf = (b: Boundaries, sec: number): number => {
    // ★区間を [時刻, 距離] の折れ線として持つ。**折れ点＝境界＝真実**
    const pts: readonly [number, number][] = [
      [b.startSec, 0],
      [b.spurtSec, spurtM],
      [b.straightSec, straightM],
      [b.finishSec, distanceMeter],
    ];
    if (sec <= b.startSec) return 0;
    if (sec >= b.finishSec) return distanceMeter;

    if (fidelity === 'exact') {
      // ★D-059 の明文どおり: 境界時刻には必ず境界の位置にいる（揺らぎは区間の中だけ）
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [t0, m0] = pts[i]!;
        const [t1, m1] = pts[i + 1]!;
        if (sec < t0 || sec > t1) continue;
        if (t1 <= t0) return m1;
        const t = (sec - t0) / (t1 - t0);
        return m0 + (m1 - m0) * easeWithin(t, harmonicsFor(jostleSeed, b.gate, i, jostle));
      }
      return distanceMeter;
    }

    /**
     * ★**レース全体を1本の時間として歪めます。**
     *   端（0 と 1）で必ず 0 になるので、**ゴール時刻は動きません**。
     */
    const span = b.finishSec - b.startSec;
    if (span <= 0) return distanceMeter;
    const tau = (sec - b.startSec) / span;
    const warped = easeWithin(tau, harmonicsFor(jostleSeed, b.gate, 0, jostle));
    const at = b.startSec + warped * span;

    // ★歪めた時刻を、脚質の形（折れ線）に通す。**形は残り、いつ通るかが揺れる**
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [t0, m0] = pts[i]!;
      const [t1, m1] = pts[i + 1]!;
      if (at < t0 || at > t1) continue;
      if (t1 <= t0) return m1;
      return m0 + (m1 - m0) * ((at - t0) / (t1 - t0));
    }
    return distanceMeter;
  };

  /**
   * ★余力（§12.6 のゲージ）。
   *   正典 §13 は「**減るのは勝負所（残り800m）以降**」と定めています。
   *   その前は 1 のままです。
   */
  const staminaOf = (b: Boundaries, sec: number): number => {
    /**
     * ★**ここは「余力」ではありません。「勝負所をどこまで進んだか」です。**
     *
     * 【★以前の式は逆を向いていました（実測で確認）】
     *   `1 − (sec − spurtSec) / (finishSec − spurtSec)`
     *   分母は**その馬が勝負所からゴールまでにかかる時間**です。
     *   → **上がりが速い馬ほど分母が小さく、同じ時刻で余力が低く見えます。**
     *   ★つまり**勝つ馬ほどバテて見えていました。**
     *
     *   実測（400レース・余力と最終着順の順位相関。+ が正しい向き）:
     *     残り800m −0.142 / 600m −0.101 / 400m −0.349 / ★**200m −0.653**
     *
     *   ⚠️ ゲージは §12.6 の**自馬の唯一の読み取り**で、C-6（仕掛け）の判断材料です。
     *      向きが逆なら、**仕掛けの判断を毎回裏切ります。**
     *
     * 【★なぜ「正しい余力」にしていないか】
     *   本当の余力は `intervention.ts` の `emptyAtMeter`（どこでバテるか）です。
     *   ★**`BoundaryTimes` に載っていないので、ここからは作れません。**
     *   → **発明しません**（Q-P4-21 で照会）。
     *     いまは**位置だけで決まる形**にして、**嘘をつかない状態**にしてあります。
     *     ⚠️ この形は**馬ごとの情報を持ちません**。V-16 の材料にはなりません。
     */
    if (sec <= b.spurtSec) return 1;
    const m = metersOf(b, sec);
    if (m <= spurtM) return 1;
    const span = Math.max(1e-6, distanceMeter - spurtM);
    return Math.max(0, Math.min(1, 1 - (m - spurtM) / span));
  };;

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
 *
 * 【★1度間違えました】
 *   最初は `model.at(raceSec)` の**位置**で並べていました。
 *   → **レース終了時刻には全馬がゴール線上にいる**ので位置に差が無く、
 *     同着扱いで**馬番順（1,2,3,…）**が返っていました。
 *   ★**着順は「どこにいるか」ではなく「いつ着いたか」で決まります。**
 *
 * → 各馬が**ゴールに到達した時刻**を二分探索で求め、その順に並べます。
 *   ⚠️ 「近い」では通しません。1頭でも違えば呼び出し側が落とします。
 */
export function finalOrderOf(model: PositionModel): number[] {
  const gates = model.at(0).map((h) => h.gate);
  const finishSecOf = (gate: number): number => {
    // ★位置は単調増加なので、二分探索が必ず1点に収束します
    let lo = 0, hi = model.raceSec;
    const at = (sec: number): number => {
      const h = model.at(sec).find((x) => x.gate === gate);
      if (h === undefined) throw new Error(`馬番 ${gate} が位置モデルにありません`);
      return h.meters;
    };
    if (at(hi) < model.distanceMeter - 1e-6) return Number.POSITIVE_INFINITY;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(mid) < model.distanceMeter - 1e-9) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return gates
    .map((gate) => ({ gate, sec: finishSecOf(gate) }))
    .sort((a, b) => {
      if (a.sec !== b.sec) return a.sec - b.sec;
      return a.gate - b.gate;   // ★同着は馬番順（確定側と同じ規則）
    })
    .map((r) => r.gate);
}
