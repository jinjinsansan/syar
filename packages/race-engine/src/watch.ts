/**
 * ★観戦の再生（正典 D-059）
 *
 * > `resolveRace` は既に時間軸を持っている。必要なのは新しいモデルではなく、
 * > **既にある内部状態の露出**である。
 * >
 * >   局面境界の位置 … ★エンジン＝真実
 * >   局面と局面の間 … 描画層が補間＝演出
 * >
 * > **補間は、境界の位置と最終着順を1頭も動かしてはいけない。**
 *
 * 【★位置は保存しません】
 *   D-055 で凍結した入力（`entrant_snapshot`）とシードから**再計算**します。
 *   同じものから出るので、**クライアントが再計算して検証できます**
 *   → **映像そのものが Provably Fair になります。**
 *
 *   現状は「着順は検証できるが、その過程で見えた動きは検証できない」状態でした。
 *   「自分の馬が前にいたのに急に下がった」に、何も言えませんでした。
 *
 * 【★この層が持たないもの】
 *   **局面ごとの速度をエンジンは持っていません。**
 *   `raceSec = 距離 ÷ 平均速度` の1本だけで、区間ごとのペースはありません。
 *   → **ここで速度を発明しません**（照会 Q-P4-11）。真実として出せるのは
 *     「各馬が各境界を通過する時刻」までで、**その導出に使えるのは走破タイムだけ**です。
 */

import { DEFAULT_INTERVENTION_BALANCE } from './intervention.js';
import type { Strategy } from '@star/sim-engine';
import type { Pace, RaceResult, RaceResultEntry } from './types.js';

/**
 * §8b の局面（正典 §13）。
 *
 * ★**値を再掲しません。** `DEFAULT_INTERVENTION_BALANCE` から取ります。
 *   ⚠️ ここで 800/400 を書き写すと**二重定義**になり、
 *      較正で片方だけ動いたとき**画面と機構で仕掛けの受付位置がずれます**
 *      （P3 で繰り返した「2か所で別々に持つ」と同じ形）。
 */
export const PHASE_METERS = {
  /** 勝負所に入る「残り距離」 */
  SPURT: DEFAULT_INTERVENTION_BALANCE.STAMINA_WINDOW_METER,
  /** 直線に入る「残り距離」 */
  STRAIGHT: DEFAULT_INTERVENTION_BALANCE.STAMINA_EMPTY_METER,
} as const;

export type Phase = 'cruise' | 'spurt' | 'straight';

/** 残り距離から局面を決める。★時刻ではなく位置で決まる */
export function phaseOfMetersLeft(metersLeft: number): Phase {
  if (metersLeft <= PHASE_METERS.STRAIGHT) return 'straight';
  if (metersLeft <= PHASE_METERS.SPURT) return 'spurt';
  return 'cruise';
}

/**
 * ★**ペース配分**（正典 D-059 / Q-P4-11 の裁定「B を採る。露出であって発明ではない」）
 *
 * 【なぜ発明ではないか（レビュー側の確認）】
 *   ① `strategyCoef` = 展開（ペース）× 脚質適性 が**結果に効いている**
 *   ② ペースは**逃げ馬の頭数**から決まる
 *   ③ `spurtAtMeter` は**距離上の位置**を持つ
 *   → 「逃げ馬が前半先行する」「追込馬が後方から来る」は、
 *     **エンジンが既に割り当てて結果に使っている属性の意味そのもの**です。
 *
 * 【★制約3件（裁定）】
 *   1. **新しい乱数を引かない** — 既に計算済みの値からの決定的導出のみ
 *   2. **最終着順と走破タイムを1ミリも動かさない** — これは**時間の再パラメータ化**であって、
 *      結果の再計算ではない
 *   3. **導出の前後で V-4/V-5/V-6/V-8/V-9a/V-13 が完全一致すること**
 *      → ★`resolveRace` を一切呼ばず、触らないので**構造上そうなります**。
 *        ただし**そう仮定せず、`watch.test.ts` で確かめます**。
 */

/**
 * 脚質ごとの「進み方の形」。
 *
 * ★`x(τ)` は**正規化した時刻 τ∈[0,1] → 正規化した距離 x∈[0,1]**。
 *   **必ず x(0)=0 / x(1)=1**（＝走破タイムが動かない・制約2）。
 *
 *   逃げ … 前半で先に出る（x が上に凸）
 *   追込 … 前半は後ろ（x が下に凸）
 *   先行・差し … その中間
 *
 * ⚠️ ここは**演出の強さではありません**。脚質という**機構の属性**の見え方です。
 *    値を動かすと「逃げが逃げに見えない」ことになります。
 */
/**
 * ★脚質ごとの前後の振り分け。
 *
 * 【★強すぎました。実測で分かりました】
 *   以前は nige 0.10 / senko 0.05 / sashi −0.05 / oikomi −0.10。
 *   ハイペース（×1.3）で b = 0.13 になり、速度は x'(τ) = 1 + bπ·cos(πτ) なので
 *   ★**前後で ±41%** 振れていました。実測した区間平均速度:
 *
 *     逃げ  17.2 → 13.0 → ★**8.9 m/s**（駆け足ではなく速歩の速さ）
 *     追込  11.5 → 17.9 → ★**19.7 m/s**（72%の加速）
 *
 *   ★オーナーの指摘「**途中でグングンスピードが上がるが不自然**」
 *     「**他の馬に追いつく時も不自然**」の根っこはここです。
 *
 * 【★決め方】
 *   実際の1600m戦は、区間平均が概ね **15〜17m/s**（振れ幅 ±10%程度）に収まります。
 *   速度の振れは `bπ·gain` なので、**±12% に収めるには b·gain ≤ 0.12/π ≈ 0.038**。
 *   → 最大の `nige × high`（gain 1.3）で 0.038 になるよう決めます。
 *
 *   ⚠️ **着順は変わりません。** ここが決めるのは「**いつ境界を通るか**」だけで、
 *      `finishSec`（＝走破タイム）には触れていません。
 */
const STRATEGY_BIAS: Record<Strategy, number> = {
  nige: 0.029, senko: 0.015, sashi: -0.015, oikomi: -0.029,
};

/** ★速度の振れの上限（実測に基づく。超えたら起動時に止める） */
export const MAX_SPEED_SWING = 0.12;

/**
 * ペースが脚質の効き方を増減させる（§8.4 と同じ向き）。
 *   ハイペースなら逃げは前半さらに速く出て、そのぶん終いが甘くなる。
 */
const PACE_GAIN: Record<Pace, number> = { high: 1.3, middle: 1.0, slow: 0.7 };

/**
 * ★進み方の形。**単調増加で、両端が固定**。
 *
 *   x(τ) = τ + b·sin(πτ)
 *     b>0 … 前半で先に出る（逃げ）
 *     b<0 … 前半は遅れる（追込）
 *   x(0)=0 / x(1)=1 は sin(0)=sin(π)=0 から自動的に成り立ちます。
 *
 *   ★単調性: x'(τ) = 1 + bπ·cos(πτ) なので、**|b| < 1/π ≈ 0.318** なら常に正。
 *     上の係数は最大 0.10×1.3 = 0.13 で、余裕があります。
 */
export function paceShape(strategy: Strategy, pace: Pace): (tau: number) => number {
  const b = STRATEGY_BIAS[strategy] * PACE_GAIN[pace];
  /**
   * ★上限は「後戻りしないこと」ではなく「**馬の速さに見えること**」で決めます。
   *   ⚠️ 1/π（≈0.318）まで許すと、単調ではあっても**速度が ±100% 振れます**。
   *      実際に ±41% で「不自然」と判定されました。
   */
  const LIMIT = MAX_SPEED_SWING / Math.PI;
  if (Math.abs(b) > LIMIT + 1e-9) {
    throw new Error(
      `ペース配分の係数が大きすぎます（${b}）。速度の振れが ±${(Math.abs(b) * Math.PI * 100).toFixed(0)}% になります`
      + `（上限 ±${(MAX_SPEED_SWING * 100).toFixed(0)}%）`,
    );
  }
  return (tau: number): number => {
    const t = Math.max(0, Math.min(1, tau));
    return Math.max(0, Math.min(1, t + b * Math.sin(Math.PI * t)));
  };
}

/**
 * ★1頭が各境界を通過する時刻（秒）。**これがエンジンの真実**です。
 *
 *   ⚠️ **`atSec` を描画側で作らないこと。** ここから受け取ってください。
 *      境界を動かすと、仕掛けの受付時刻が画面と機構でずれます。
 */
export interface BoundaryTimes {
  readonly gate: number;
  /** 発走（常に 0） */
  readonly startSec: 0;
  /** 勝負所（残り800m）に入る時刻 */
  readonly spurtSec: number;
  /** 直線（残り400m）に入る時刻 */
  readonly straightSec: number;
  /** ゴール。★`RaceResultEntry.timeSec` そのもの */
  readonly finishSec: number;
}

/**
 * 各馬の境界通過時刻を出す。
 *
 * ★**走破タイムは動きません**（制約2）。動くのは「途中でどこにいるか」だけです。
 */
export function boundaryTimesOf(
  entry: RaceResultEntry,
  distanceMeter: number,
  gate: number,
  strategy: Strategy,
  pace: Pace,
): BoundaryTimes {
  if (!Number.isFinite(entry.timeSec) || entry.timeSec <= 0) {
    throw new Error(`走破タイムが不正です: ${entry.timeSec}`);
  }
  if (!Number.isFinite(distanceMeter) || distanceMeter <= 0) {
    throw new Error(`距離が不正です: ${distanceMeter}`);
  }
  const shape = paceShape(strategy, pace);
  /**
   * 距離 → 時刻。`x(τ)` の逆関数を二分探索で求めます。
   * ★閉じた式が無いので数値解ですが、**単調増加なので必ず1点に収束**します。
   */
  const secAt = (metersLeft: number): number => {
    const target = Math.max(0, Math.min(1, (distanceMeter - metersLeft) / distanceMeter));
    if (target <= 0) return 0;
    if (target >= 1) return entry.timeSec;
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (shape(mid) < target) lo = mid; else hi = mid;
    }
    return ((lo + hi) / 2) * entry.timeSec;
  };
  return {
    gate,
    startSec: 0,
    spurtSec: secAt(PHASE_METERS.SPURT),
    straightSec: secAt(PHASE_METERS.STRAIGHT),
    finishSec: entry.timeSec,   // ★1ミリも動かさない
  };
}

/**
 * レース全体の境界時刻。★**馬番で引けるようにする**（D-056 と同じ単位）。
 */
export function replayOf(
  result: RaceResult,
  /** 馬番 → 脚質。★出走表（凍結スナップショット）から取る */
  strategyOf: (gate: number) => Strategy,
  pace: Pace,
): readonly BoundaryTimes[] {
  const out: BoundaryTimes[] = [];
  for (const e of result.order) {
    // ★`horseId` は確定処理で馬番に振り替えられている（D-056）
    const gate = Number(e.horseId);
    if (!Number.isInteger(gate) || gate < 1) {
      throw new Error(`馬番として読めません: ${e.horseId}`);
    }
    out.push(boundaryTimesOf(e, result.conditions.distance, gate, strategyOf(gate), pace));
  }
  // ★馬番順に揃える。順位順のまま返すと、描画側の並びが着順に依存する
  return [...out].sort((a, b) => a.gate - b.gate);
}

/**
 * ★**ゲート**: 再計算した位置の最終順が、確定済みの着順と完全一致すること（D-059）。
 *
 *   描画層が少しでもずれたら必ず落ちます。
 *   ⚠️ 「近い」では通しません。**1頭でも違えば false** です。
 */
export function finalOrderMatches(
  result: RaceResult,
  recomputed: readonly { gate: number; finishSec: number }[],
): boolean {
  const settled = result.order.map((e) => Number(e.horseId));
  const byTime = [...recomputed].sort((a, b) => {
    if (a.finishSec !== b.finishSec) return a.finishSec - b.finishSec;
    // ★同着は馬番の小さい順（確定側と同じ規則にする。ここが違うと再現しない）
    return a.gate - b.gate;
  }).map((r) => r.gate);
  if (byTime.length !== settled.length) return false;
  for (let i = 0; i < settled.length; i += 1) if (byTime[i] !== settled[i]) return false;
  return true;
}
