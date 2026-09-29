/**
 * ★**レース名**（★2026-09-29・オーナー「R12345 のようなおかしなレース名なので、ちゃんと決まったレース名に」・レビュー側 規則 3）
 *
 * 【★決まり】
 *   ★重賞 … ★既存の架空の 50 鞍（`GRADED_RACES`）の名前を使う。
 *     ★どの鞍かは ★重賞の暦（`programme.ts` の `gradedRaceAt`・★1 ゲーム年に 50 鞍が 1 回ずつ）が決める。
 *   ★平場 … ★「場の名 ＋ クラス ＋ 距離」（例「スターパーク 1勝クラス 芝1600m」）。
 *   ★`R12345` は ★内部の番号（`cycle_index`）として残す。★名前には入れない。
 *
 * ⚠️ ★名前は ★架空の競馬場名・重賞名からだけ作る（★§0.1・実在の名前を ここで書かない）。
 */
import { gradedRaceAt } from './programme.js';
import { venueById, type VenueSurface } from './venues.js';
import type { Grade, RaceClass } from './programme.js';

/** ★平場の名前に入れるクラスの呼び方 */
const CLASS_NAME: Readonly<Record<Exclude<RaceClass, 'graded'>, string>> = {
  maiden: '未勝利', win1: '1勝クラス', win2: '2勝クラス', win3: '3勝クラス', open: 'オープン',
};
const SURFACE_NAME: Readonly<Record<VenueSurface, string>> = { turf: '芝', dirt: 'ダート' };

/** ★「スターパーク競馬場」→「スターパーク」 */
export function venueShortName(venueId: string): string {
  return venueById(venueId).name.replace(/競馬場$/, '');
}

export function raceNameOf(input: {
  readonly cycleIndex: number;
  readonly raceClass: RaceClass;
  readonly grade: Grade | null;
  readonly venueId: string;
  readonly surface: VenueSurface;
  readonly distanceM: number;
}): string {
  const { cycleIndex, grade, venueId, surface, distanceM } = input;
  const course = `${SURFACE_NAME[surface]}${distanceM}m`;
  if (grade !== null) {
    /** ★重賞は ★暦の鞍の名前（★2026-09-29・1 ゲーム年に 50 鞍が 1 回ずつ・`programme.ts` の gradedRaceAt） */
    const race = gradedRaceAt(cycleIndex);
    if (race !== null) return race.name;
    return `${venueShortName(venueId)} ${grade} ${course}`;
  }
  const cls = input.raceClass === 'graded' ? 'オープン' : CLASS_NAME[input.raceClass];
  return `${venueShortName(venueId)} ${cls} ${course}`;
}
