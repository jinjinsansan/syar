/**
 * ★**レース名**（★2026-09-29・オーナー「R12345 のようなおかしなレース名なので、ちゃんと決まったレース名に」・レビュー側 規則 3）
 *
 * 【★決まり】
 *   ★重賞 … ★既存の架空の 50 鞍（`GRADED_RACES`）の名前を使う。
 *     ★選び方: ★同じ格・同じ競馬場・同じ馬場 → ★同じ格・同じ競馬場 の順に探し、★サイクル番号で 1 つに決める（★決定論・憲法 4）。
 *     ★どちらも無ければ ★平場と同じ組み立てに格を添える（★別の競馬場の重賞名を ここで名乗らない）。
 *   ★平場 … ★「場の名 ＋ クラス ＋ 距離」（例「スターパーク 1勝クラス 芝1600m」）。
 *   ★`R12345` は ★内部の番号（`cycle_index`）として残す。★名前には入れない。
 *
 * ⚠️ ★名前は ★架空の競馬場名・重賞名からだけ作る（★§0.1・実在の名前を ここで書かない）。
 */
import { GRADED_RACES } from './graded-races.js';
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
  const at = (n: number): number => ((cycleIndex % n) + n) % n;
  if (grade !== null) {
    const sameVenue = GRADED_RACES.filter((r) => r.grade === grade && r.venueId === venueId);
    const exact = sameVenue.filter((r) => r.surface === surface);
    const pool = exact.length > 0 ? exact : sameVenue;
    if (pool.length > 0) return pool[at(pool.length)]!.name;
    return `${venueShortName(venueId)} ${grade} ${course}`;
  }
  const cls = input.raceClass === 'graded' ? 'オープン' : CLASS_NAME[input.raceClass];
  return `${venueShortName(venueId)} ${cls} ${course}`;
}
