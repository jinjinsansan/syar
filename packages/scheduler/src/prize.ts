/**
 * 賞金テーブル（正典 §11.1）
 *
 * 【★これが PP の主な発行源でなければならない（§9.3）】
 *   「PP の主な稼ぎ口は**育成した馬の賞金**であり、この関係を絶対に維持する
 *   （逆転すると育成が飾りになる）」と正典が定めています。
 *   馬券の払戻が賞金を上回る状態は、その逆転です。
 *
 * 【★クラスが上がるほど跳ねる（D-020）】
 *   育成の報酬は「昇級」として現れるので、
 *   格の差が賞金の差として体感できないと育成が報われて見えません。
 */

import type { Grade, RaceClass } from './programme.js';

/** 賞金の格。番組表のクラスと重賞の格を1つに畳む */
export type PrizeTier = 'G1' | 'G2' | 'G3' | 'open' | 'win3' | 'win2' | 'win1' | 'maiden';

/** 正典 §11.1 の写し。1〜5着（PP） */
// prettier-ignore
export const PRIZE_TABLE: Readonly<Record<PrizeTier, readonly number[]>> = {
  G1:     [100_000, 40_000, 25_000, 15_000, 10_000],
  G2:     [ 50_000, 20_000, 12_000,  7_000,  5_000],
  G3:     [ 30_000, 12_000,  7_000,  4_000,  3_000],
  open:   [ 18_000,  7_000,  4_000,  2_500,  1_800],
  win3:   [ 12_000,  4_800,  2_800,  1_700,  1_200],
  win2:   [  8_000,  3_000,  1_800,  1_100,    800],
  win1:   [  5_000,  2_000,  1_200,    700,    500],
  maiden: [  3_000,  1_200,    700,    400,    300],
};

/** クラスと格から賞金の格を決める */
export function prizeTierOf(raceClass: RaceClass, grade: Grade | null): PrizeTier {
  if (raceClass === 'graded') {
    // ★重賞なのに格が無いのは番組表の不整合。黙って最低額にしない
    if (grade === null) throw new Error('prizeTierOf: 重賞に格がありません');
    return grade;
  }
  return raceClass as PrizeTier;
}

/**
 * 着順に対する賞金（PP）。6着以下は 0。
 * ⚠️ 同着の分割は呼び出し側の責務（§9.1 と違い、賞金の同着規則は正典に未規定）。
 */
export function prizeFor(tier: PrizeTier, finishPosition: number): number {
  if (!Number.isInteger(finishPosition) || finishPosition < 1) return 0;
  return PRIZE_TABLE[tier][finishPosition - 1] ?? 0;
}

/** そのレースの賞金総額（purse）。races.purse に入れる */
export function purseOf(tier: PrizeTier): number {
  return PRIZE_TABLE[tier].reduce((a, b) => a + b, 0);
}
