/**
 * レース条件の決定（正典 §10.3・§10.4）
 *
 * 【なぜサイクル番号だけから決めるのか】
 *   乱数で決めると、再起動やロック競合のたびに条件が変わりえます。
 *   ★**commit は条件を含みません**（`sha256(HMAC(secret, "race:<cycleIndex>"))`・`apps/worker/src/seeding.ts`）。
 *   条件は**サイクル番号だけから決まる**ので、commit を公開した後に変わりません（§8.6 の前提）。
 *   → 番組表と同じく、**サイクル番号だけから決まる**ようにします。
 *   ★（2026-09-15 訂正: 以前ここには「commit は条件を含む前提で公開される」と書いてあり、実装と合っていませんでした）
 *
 * ⚠️ 馬場状態（track_condition）は本来 §10.4 の分布から引きますが、
 *    その分布（TRACK_CONDITION_CDF）は検証ハーネス側にあります。
 *    ここでは**同じ分布を再実装せず**、呼び出し側が渡す形にします
 *    （2つ目の置き場を作ると片方だけ更新される・L-2）。
 */

import { RACES_PER_DAY, classOf, gradeOf, type Grade, type RaceClass } from './programme.js';
import { VENUES, venueById } from './venues.js';

export type Surface = 'turf' | 'dirt';

/** 距離帯（正典 §8.2）。番組表がここから距離を選ぶ */
export const DISTANCE_MENU: readonly number[] = [1200, 1400, 1600, 1800, 2000, 2400, 3000];

/** ダート開催の割合（正典 §10.3 に規定が無いため暫定。照会中） */
export const DIRT_RATIO = 3 / 8;

export interface RaceConditions {
  readonly surface: Surface;
  readonly distance: number;
  /** ★競馬場の id（`venues.ts`・架空名・憲法 §0.1）。★2026-09-15 まで `'C1'`〜`'C4'` */
  readonly courseId: string;
}

/** ★馬場の周期。★`surfaceOfIndex` の `(i * 3) % 8` と同じ 8 */
const SURFACE_PERIOD = 8;

function surfaceOfIndex(i: number): Surface {
  // ★ダートの割合。7 と 8 は互いに素なので距離と独立に回る
  return (i * 3) % SURFACE_PERIOD < DIRT_RATIO * SURFACE_PERIOD ? 'dirt' : 'turf';
}

/**
 * ★**サイクル 0〜(i−1) の中に、同じ馬場のレースが何本あったか**（★閉じた式・i だけから決まる）。
 *
 * ★競馬場はこの通し番号で回します（下の `conditionsOf`）。★`i % 10` で回さない理由:
 *   ⚠️ ★馬場は `i` の周期 8 で決まり、★10 と 8 は 2 を共有します。★`i % 10` で回すと
 *   ★**偶数番の場にダートが偏ります**（ダートは i mod 8 ∈ {0,3,6} ＝ 偶数が 2/3）。
 *   → ★「その馬場のレースの何本目か」で回せば、★**馬場ごとに 10 場へ均等**に配れます（Q-2 の既定）。
 */
function surfaceOrdinal(i: number, surface: Surface): number {
  let perPeriod = 0;
  let head = 0;
  const rem = i % SURFACE_PERIOD;
  for (let r = 0; r < SURFACE_PERIOD; r += 1) {
    if (surfaceOfIndex(r) !== surface) continue;
    perPeriod += 1;
    if (r < rem) head += 1;
  }
  return Math.floor(i / SURFACE_PERIOD) * perPeriod + head;
}

/**
 * ★**1 日ごとに競馬場を何場ずらすか**（★その馬場の 1 日の本数が場の数で割り切れるときだけ）。
 *
 * ⚠️ ★芝は 1 日 90 本で ★**10 で割り切れます**。★通し番号だけで回すと、★**同じ枠に毎日同じ場**が来ます。
 *    ★番組表はクラスを枠で決めるので、★クラスが場に偏ります（★実測 1 週: 新馬が潮風 69 本・スターパーク 12 本）。
 *    ★（2026-09-15 の初版はこの註記に「芝 90 と ダート 54 はどちらも 10 で割り切れない」と誤って書いていました）
 * → ★1 日ごとに 3 場ずらします。★3 と 10 は互いに素なので、★**10 日で同じ枠が 10 場を 1 回ずつ**回ります。
 *   ★1 日 90 本は 10 場に 9 本ずつで、ずらしても均等は崩れません。
 * ⚠️ ★ダート（1 日 54 本 ≡ 4 mod 10）は通し番号だけで日ごとに 4 場ずつ自然にずれます。
 *    ★そこへさらにずらすと ★日の境目で均等が崩れる（★同じ 4 場が毎日 1 本多くなる）ので、★ずらしません。
 */
const DAY_ROTATION = 3;

/**
 * サイクル番号からレース条件を決める。
 *
 * ★互いに素な間隔でずらすことで、距離・馬場・コースの組が偏らないようにします。
 *   同じ番号からは必ず同じ条件が出ます（A-2・§8.6 の前提）。
 *
 * 【★競馬場（2026-09-15・指示書 VW-2）】
 *   ★**その回の馬場を持つ場だけ**から、★その馬場のレースの通し番号で順に回します（均等・Q-2 の既定）。
 *   ★1 日 144R のうち芝 90・ダート 54 なので、★どちらも 1 日で 10 場を一巡以上します。
 *   ★同じ枠に来る場は日ごとにずらします（`DAY_ROTATION` の註記）
 *   （★新馬・未勝利の枠が特定の場に偏らない — ★以前 `raceClass === 'maiden'` で 1 つずらしていた目的）。
 *   ⚠️ ★`raceClass` は競馬場の決定に使いません（★距離の決定に `grade` を使うだけ）。
 */
export function conditionsOf(cycleIndex: number, raceClass: RaceClass, grade: Grade | null): RaceConditions {
  void raceClass;
  const i = ((cycleIndex % 1_000_000) + 1_000_000) % 1_000_000;

  // ★重賞は距離を長めに寄せる（格上のレースが短距離ばかりになるのを避ける）
  const menu = grade !== null ? DISTANCE_MENU.slice(2) : DISTANCE_MENU;
  const distance = menu[i % menu.length]!;

  const surface = surfaceOfIndex(i);

  const eligible = VENUES.filter((v) => v.surfaces.includes(surface));
  // ★その馬場を持つ場が無ければ投げる（★黙って別の馬場の場へ落とさない・R-27）
  if (eligible.length === 0) throw new Error(`conditionsOf: ${surface} を持つ競馬場がありません`);
  const n = eligible.length;
  // ★1 日の本数（★144 は周期 8 で割り切れるので、どの日も同じ本数）
  const perDay = surfaceOrdinal(RACES_PER_DAY, surface);
  const day = Math.floor(i / RACES_PER_DAY);
  const shift = perDay % n === 0 ? day * DAY_ROTATION : 0;
  const courseId = eligible[(surfaceOrdinal(i, surface) + shift) % n]!.id;

  return { surface, distance, courseId };
}

/**
 * ★**凍結する走路の形**（`races.course_frozen`・移行ファイル `0023`・指示書 VW-3）。
 *
 * ⚠️ ★`@star/race-engine` の `FrozenCourse` と**同じ形**です（★依存ゼロを保つため型は向こうを引きません）。
 *    ★`apps/cli/test/course-frozen.test.ts` が 10 場すべてで `parseFrozenCourse` に通して突き合わせます。
 */
export interface FrozenCourseRecord {
  readonly v: 1;
  readonly venueId: string;
  readonly lapM: number;
  readonly homeStretchM: number;
  readonly widthM: number;
  readonly cornerRadiiM?: readonly [number, number, number, number];
  readonly turn: 'left' | 'right';
  readonly courseShape: 'straight' | 'oval';
}

/**
 * ★**競馬場の id から、凍結するオブジェクトを作る**（★ワーカーの生成と測定器が共有・R-30）。
 *
 * ★`courseShape` は **`'oval'`** です — ★10 場はすべて楕円で、★直線コースは番組に入れません
 *   （★照会 Q-1 の回答が出るまでの既定・R-27 の狭い側）。
 * ★知らない id は `venueById` が投げます（★既定の場へ落とさない）。
 */
export function frozenCourseOf(venueId: string): FrozenCourseRecord {
  const v = venueById(venueId);
  return {
    v: 1,
    venueId: v.id,
    lapM: v.lapM,
    homeStretchM: v.homeStretchM,
    widthM: v.widthM,
    ...(v.cornerRadiiM === undefined ? {} : { cornerRadiiM: v.cornerRadiiM }),
    turn: v.turn,
    courseShape: 'oval',
  };
}

export interface ProductionRace {
  readonly cycleIndex: number;
  readonly raceClass: RaceClass;
  readonly grade: Grade | null;
  /** ★番組表の条件（★ワーカーが `buildRace` に渡すものと同じ） */
  readonly programme: RaceConditions;
  /** ★その回に凍結される走路の形（★ワーカーの `buildRace` が作るものと同じ関数から） */
  readonly courseFrozen: FrozenCourseRecord;
}

/**
 * ★**本番の条件**（★サイクル番号 → 番組 → 条件 → 凍結オブジェクト）を 1 つにしたもの（指示書 VW §7-1）。
 *
 * ★測定器（V-4・V-5・V-6・V-10・V-17・V-18）は**既定でこれ**を使います（R-31）。
 * ★ワーカー（`apps/worker/src/main.ts`・`tools/seed-races.mjs`）は `conditionsOf(i, classOf(i), gradeOf(i))` を
 *   ★`buildRace` に渡し、★`buildRace` が `frozenCourseOf(courseId)` を 1 回だけ呼びます — ★同じ 2 つの関数です。
 */
export function productionRaceOf(cycleIndex: number): ProductionRace {
  const raceClass = classOf(cycleIndex);
  const grade = gradeOf(cycleIndex);
  const programme = conditionsOf(cycleIndex, raceClass, grade);
  return { cycleIndex, raceClass, grade, programme, courseFrozen: frozenCourseOf(programme.courseId) };
}
