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

import {
  DEFAULT_INTERVENTION_BALANCE,
  staminaAtMeter,
  type InterventionBalance,
  type StaminaTrack,
} from './intervention.js';
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
 【★決め方 — 2回目の較正（2026-08-14）】
 *   1回目は「区間平均速度が ±12% に収まること」で決めました（0.029）。
 *   ⚠️ **それでも隊列が 120m に広がりました**。実際の中継の解説では:
 *     「前からシンガリまで**10馬身くらいで一団**で進んでいきます」
 *     「先頭から最後方までは10馬身。**ひとかたまりで第4コーナーから直線に向かいます**」
 *   ★**10馬身 ＝ 24m** です。120m は**5倍**でした。
 *
 *   隊列の広がりは `(b_逃げ − b_追込) × 距離` なので、24m にするには
 *   **b の幅 = 24/1600 = 0.015**、つまり **±0.0075**（gain 1.3 込み）。
 *   → `nige = 0.006`（0.006 × 1.3 = 0.0078 → 片側 12.5m → 隊列 25m ≒ 10.4馬身）。
 *
 * 【★正直に書きます】
 *   これで**区間平均速度の振れは ±2.4%** になり、1回目に置いた ±12% より**平坦**です。
 *   実際の逃げ馬は終いがもっと甘くなります。
 *   ⚠️ **両方は同時に満たせません**（同じ b が「隊列の広がり」と「速度の振れ」の
 *      両方を決めているため）。★**隊列を優先しました** — 画面で見えるのは隊列だからです。
 *      区間ごとに別の係数を持たせれば両立できますが、**それは正典の領域**です。
 *
 *   ⚠️ **着順は変わりません。** ここが決めるのは「**いつ境界を通るか**」だけで、
 *      `finishSec`（＝走破タイム）には触れていません。
 */
const STRATEGY_BIAS: Record<Strategy, number> = {
  nige: 0.006, senko: 0.003, sashi: -0.003, oikomi: -0.006,
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
/**
 * ★**レースの律動**（全馬に共通）。速度の振れだけを作り、**隊列の広がりには効きません**。
 *
 * 【なぜ係数を分けたか — 裁定 Q-P4-28】
 *   > つまみが1つで目標が2つです。**係数を2つに分けてください。**
 *   > 隊列の広がりは**位置の散らばり**、速度の振れは**時間の変動**。
 *   > **同じ係数を共有している理由がありません。**
 *
 * 【★分け方】
 *   位置 x(τ) = τ + a·sin(πτ) + (d/2π)·sin(2πτ)
 *   速度 x'(τ) = 1 + aπ·cos(πτ) + d·cos(2πτ)
 *
 *     `a`（脚質ごと）… **半周期**。τ=0.5 で最大 a ずれる → ★**隊列の広がりを決める**
 *     `d`（全馬共通）… **1周期**。★**τ=0.5 でずれが 0** → 隊列に効かない。速度だけ振れる
 *
 *   ★`d` の形（速い→落ち着く→また速い）は、実際のレースの流れそのものです
 *     （前半は速く入り、道中は息を入れ、直線で伸びる）。
 *
 * ⚠️ **単調性**: 速度が正であるには `aπ + d < 1`。**構造で確かめます。**
 */
const RACE_RHYTHM = 0.085;

/** ★速度の振れの上限（実測に基づく。超えたら起動時に止める） */
export const MAX_SPEED_SWING_TOTAL = 0.14;

export function paceShape(strategy: Strategy, pace: Pace): (tau: number) => number {
  const a = STRATEGY_BIAS[strategy] * PACE_GAIN[pace];
  const d = RACE_RHYTHM;
  const swing = Math.abs(a) * Math.PI + Math.abs(d);
  if (swing > MAX_SPEED_SWING_TOTAL + 1e-9) {
    throw new Error(
      `ペース配分の係数が大きすぎます（速度の振れが ±${(swing * 100).toFixed(0)}%）`
      + `。上限 ±${(MAX_SPEED_SWING_TOTAL * 100).toFixed(0)}%`,
    );
  }
  // ★速度が正であること（位置が後戻りしないこと）を、ここで保証します
  if (swing >= 1) throw new Error('速度が負になりえます');
  return (tau: number): number => {
    const t = Math.max(0, Math.min(1, tau));
    const x = t + a * Math.sin(Math.PI * t) + (d / (2 * Math.PI)) * Math.sin(2 * Math.PI * t);
    return Math.max(0, Math.min(1, x));
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
 * ★**残り距離 → 時刻**。`x(τ)` の逆関数を二分探索で求めます。
 *   閉じた式が無いので数値解ですが、**単調増加なので必ず1点に収束**します。
 *
 * ⚠️ ★**切り出した理由**: 境界時刻（位置）とゲージ（D-072）の**両方**がこの変換を要ります。
 *    2か所で書けば必ず離れ、★**ゲージだけ別の時間軸で動く**ことになります。
 */
export function secAtMetersLeftOf(
  finishSec: number,
  distanceMeter: number,
  strategy: Strategy,
  pace: Pace,
): (metersLeft: number) => number {
  const shape = paceShape(strategy, pace);
  return (metersLeft: number): number => {
    const target = Math.max(0, Math.min(1, (distanceMeter - metersLeft) / distanceMeter));
    if (target <= 0) return 0;
    if (target >= 1) return finishSec;
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (shape(mid) < target) lo = mid; else hi = mid;
    }
    return ((lo + hi) / 2) * finishSec;
  };
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
  const secAt = secAtMetersLeftOf(entry.timeSec, distanceMeter, strategy, pace);
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

// ---------------------------------------------------------------------------
// ★ゲージ（D-072）— 境界で内部状態を露出する
// ---------------------------------------------------------------------------

/**
 * ★ゲージの節目。**残量と減り方**だけ（D-070）。
 *
 * ⚠️ ★`emptyAtMeter`（＝いつ尽きるか）は**入れていません**。
 *    入れるとゲージが「状態」ではなく「予言」になります。
 */
export interface StaminaKnot {
  /** 残り距離 m */
  readonly metersLeft: number;
  /** その時点の時刻（秒）。★`BoundaryTimes` と**同じ変換**で出している */
  readonly sec: number;
  /**
   * ★残量。⚠️ **0 未満になりえます**（＝使い切った先）。
   *
   *   ★**ここで 0 で止めません。** 止めてから線を引くと、
   *     ★**0 を跨ぐ区間だけ元の式と合わなくなります**（実測で 0.017 ずれました）。
   *   → 止めるのは読み出しの一箇所（`staminaAt`）だけにしてあります。
   */
  readonly left: number;
  /** ★減り方。ここから次の節目まで、1m 進むごとに減る量 */
  readonly drainPerMeter: number;
}

/**
 * ★**自馬のゲージ**（§12.6 は「自馬にのみ表示」なので、これ1頭ぶんで足ります）。
 *
 * 【★描画層の仕事】
 *   節目の**間は線で結ぶだけ**です（D-059 と同じ分担）。
 *   ⚠️ ★**それで元の式と完全に一致します。** 区間の中では減り方が一定だからです。
 *   ★**式を描画層に書かないでください。** 一度それをやって**符号が逆**になりました
 *     （残り200m で順位相関 −0.653 ＝ 勝つ馬ほどバテて見えていた）。
 */
export interface StaminaGauge {
  readonly gate: number;
  /** 発走時の残量 */
  readonly initial: number;
  /** ★発走 → ゴールの順 */
  readonly knots: readonly StaminaKnot[];
}

/**
 * ゲージの状態を、**境界の時刻に載せて**出す（D-072）。
 *
 * ★節目に採るのは:
 *   - 4つの境界（発走 / 勝負所 800m / 直線 400m / ゴール）… ★仕掛けの判断がここで起きる
 *   - ★**減り方が変わる点**（＝仕掛けた地点）… ⚠️ これが無いと、800m と 400m の間で
 *     率が切り替わったことが**線で結んでも再現できません**
 */
export function staminaGaugeOf(
  track: StaminaTrack,
  times: BoundaryTimes,
  distanceMeter: number,
  strategy: Strategy,
  pace: Pace,
): StaminaGauge {
  const secAt = secAtMetersLeftOf(times.finishSec, distanceMeter, strategy, pace);
  const marks = new Set<number>([distanceMeter, PHASE_METERS.SPURT, PHASE_METERS.STRAIGHT, 0]);
  // ★率が変わる点を必ず入れる
  for (const seg of track.segments) {
    marks.add(seg.fromMetersLeft);
    marks.add(seg.toMetersLeft);
  }
  const metersLeftDesc = [...marks]
    .filter((m) => m >= 0 && m <= distanceMeter)
    .sort((a, b) => b - a);
  const knots: StaminaKnot[] = metersLeftDesc.map((metersLeft) => ({
    metersLeft,
    sec: secAt(metersLeft),
    left: staminaAtMeter(track, metersLeft),
    drainPerMeter: drainAt(track, metersLeft),
  }));
  return { gate: times.gate, initial: track.initial, knots };
}

/** その地点で効いている減り方（区間の中では一定） */
function drainAt(track: StaminaTrack, metersLeft: number): number {
  for (const seg of track.segments) {
    // ★節目そのものは「これから進む側」の率を返す（次の節目までの傾き）
    if (metersLeft <= seg.fromMetersLeft && metersLeft > seg.toMetersLeft) return seg.drainPerMeter;
  }
  return track.segments[track.segments.length - 1]?.drainPerMeter ?? 0;
}

/**
 * ★ゲージが「息を入れられる状態か」を、**残量と減り方だけ**から言う。
 *
 * ⚠️ ★これは**判断の材料**であって、判断ではありません。
 *    「いつ仕掛けるべきか」を出すと、C-6（人間が読んで押せるか）を測れなくなります
 *    — 画面が答えを出していたら、押せて当たり前だからです。
 */
export function staminaAt(
  gauge: StaminaGauge,
  metersLeft: number,
): { readonly left: number; readonly drainPerMeter: number } {
  // ★棒が裏返らないよう、0 で止めるのは**ここだけ**（節目は生の値を持っている）
  const done = (left: number, drainPerMeter: number) => ({ left: Math.max(0, left), drainPerMeter });
  const ks = gauge.knots;
  const first = ks[0];
  const last = ks[ks.length - 1];
  if (first === undefined || last === undefined) return done(0, 0);
  if (metersLeft >= first.metersLeft) return done(first.left, first.drainPerMeter);
  for (let i = 0; i + 1 < ks.length; i += 1) {
    const a = ks[i]!;
    const b = ks[i + 1]!;
    if (metersLeft <= a.metersLeft && metersLeft >= b.metersLeft) {
      const span = a.metersLeft - b.metersLeft;
      // ★線で結ぶだけ。区間の中では率が一定なので、これで厳密
      const t = span > 0 ? (a.metersLeft - metersLeft) / span : 1;
      return done(a.left + (b.left - a.left) * t, a.drainPerMeter);
    }
  }
  return done(last.left, last.drainPerMeter);
}

/** 較正の型が要るので再輸出（ゲージの定数は §8b.2 側にある） */
export type { InterventionBalance };
