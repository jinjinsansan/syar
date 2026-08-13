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
import type { RaceResult, RaceResultEntry } from './types.js';

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
 * ★**走破タイムからの按分**です。エンジンが区間ごとの速度を持たないので、
 *   それ以上のことは言えません。**発明しないための選択**です。
 *
 * ⚠️ このため **境界での順位は最終着順と一致します**（追い抜きは局面の間でしか起きない）。
 *    実際のレースは境界でも順位が入れ替わるので、そこは Q-P4-11 の裁定待ちです。
 */
export function boundaryTimesOf(
  entry: RaceResultEntry,
  distanceMeter: number,
  gate: number,
): BoundaryTimes {
  if (!Number.isFinite(entry.timeSec) || entry.timeSec <= 0) {
    throw new Error(`走破タイムが不正です: ${entry.timeSec}`);
  }
  if (!Number.isFinite(distanceMeter) || distanceMeter <= 0) {
    throw new Error(`距離が不正です: ${distanceMeter}`);
  }
  const at = (metersLeft: number): number => {
    // ★距離が短くて境界が存在しない場合（例 400m 戦）は 0 に潰す
    const covered = Math.max(0, distanceMeter - metersLeft);
    return (covered / distanceMeter) * entry.timeSec;
  };
  return {
    gate,
    startSec: 0,
    spurtSec: at(PHASE_METERS.SPURT),
    straightSec: at(PHASE_METERS.STRAIGHT),
    finishSec: entry.timeSec,
  };
}

/**
 * レース全体の境界時刻。★**馬番で引けるようにする**（D-056 と同じ単位）。
 */
export function replayOf(result: RaceResult): readonly BoundaryTimes[] {
  const out: BoundaryTimes[] = [];
  for (const e of result.order) {
    // ★`horseId` は確定処理で馬番に振り替えられている（D-056）
    const gate = Number(e.horseId);
    if (!Number.isInteger(gate) || gate < 1) {
      throw new Error(`馬番として読めません: ${e.horseId}`);
    }
    out.push(boundaryTimesOf(e, result.conditions.distance, gate));
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
