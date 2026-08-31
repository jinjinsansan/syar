/**
 * ★**1 鞍を「走らせる形」に開く**（正典 §10.3 / D-071）
 *
 * 【★なぜ 1 か所に置くか】
 *   ⚠️ ★走路の形は ★**2 か所で使われます**:
 *     ★① エンジン … `RaceConditions.course` → `laneExtraM`（★**着順に効きます**・憲法 3）
 *     ★② 描画層 … `ovalCourse(distance, opts)`（★絵）
 *   ★**2 か所で別々に組むと必ず離れます**（`jostle` 0.06/0.25・走路の幅 20m/25m の前科）。
 *
 * ⚠️ ★実際に離れていた例（★2026-08-31 に発見）:
 *   ★`page.tsx:931` は `ovalCourse(DIST, { turn: 'left' })` と**直書き**で、
 *   ★他の 3 箇所は画面の `turn` 状態を使っていました。★右回りを選ぶと**片方だけ左**でした。
 *
 * ⚠️ ★レビュー側の指摘（台帳 B-6）:
 *   > ★`venue-course.test.ts` は**両辺とも自分で spec を渡す**ので、
 *   > ★**呼び出し側が渡し忘れた**ことは捕まえられない。
 *   → ★**渡し忘れようがない形にします** — ★呼び出し側は `spec` と `turn` を
 *   　★**この 1 つの戻り値から取る**しかありません。
 *
 * 【★この層の約束】★依存ゼロ・純粋関数。★時計も乱数も持ちません。
 */
import { GRADED_RACES, gradedRaceById, type GradedRace } from './graded-races.js';
import { VENUES, venueById, type Venue, type VenueSurface } from './venues.js';

/**
 * ★走路の形（1周・直線・幅）。
 * ⚠️ ★`@star/race-engine` の `OvalSpec` と**同じ形**です。★依存ゼロを保つため型は持ちません
 *    （★`apps/cli/test/venue-course.test.ts` が実際に両方へ渡して突き合わせます）。
 */
export interface RaceCourseSpec {
  readonly lapM: number;
  readonly homeStretchM: number;
  readonly widthM: number;
  /**
   * ★**コーナーごとの半径 [m]**（★`[1角, 2角, 3角, 4角]`・★2026-08-31・段階①「器」）。
   * ⚠️ ★**いまはどの競馬場も持っていません**（★指示書 §3「10 場の数値を決めない」）。
   *    ★運べることだけを通してあります。★数を入れるのは帯の見直しのあとです。
   */
  readonly cornerRadiiM?: readonly [number, number, number, number];
}

export interface RaceSetup {
  readonly race: GradedRace;
  readonly venue: Venue;
  readonly distanceM: number;
  readonly surface: VenueSurface;
  /** ★**エンジンへ渡すもの**（`RaceConditions.course`）。★着順に効きます */
  readonly spec: RaceCourseSpec;
  /** ★回り。★**描画層だけ**が使います（`ovalSegments` は回りを見ません） */
  readonly turn: 'left' | 'right';
  /** ★見出し */
  readonly meta: {
    readonly venue: string;
    readonly raceName: string;
    readonly raceNo: string;
  };
}

/**
 * ★**既定の 1 鞍**。★`?race=` が無いときはこれです。
 * ⚠️ ★これは ★**2026-08-31 まで画面に直書きされていた 1 鞍**そのものです
 *    （スターパーク競馬場・桜星賞・芝 1600m・左回り・幅 20m）。
 *    → ★`?race=` を付けない画面は、★**配線の前後で 1 ビットも変わりません。**
 */
export const DEFAULT_RACE_ID = 'g1-ousei';

/**
 * ★重賞はその日のメインレースなので 11R。
 * ⚠️ ★番組表（`programme.ts`）が R 番号を持つようになったら、★そちらから引くこと。
 *    ★いまは 1 か所に置いてあるだけで、★較正値ではありません。
 */
const GRADED_RACE_NO = '11R';

/** ★`?race=<id>` を「走らせる形」に開く。★知らない id は既定へ落とさず**投げます**（R-27） */
export function raceSetupById(raceId: string = DEFAULT_RACE_ID): RaceSetup {
  const race = gradedRaceById(raceId);
  const venue = venueById(race.venueId);
  return {
    race,
    venue,
    distanceM: race.distanceM,
    surface: race.surface,
    spec: {
      lapM: venue.lapM, homeStretchM: venue.homeStretchM, widthM: venue.widthM,
      /** ⚠️ ★持っている場だけ運びます。★いまは 0 場（指示書 §3） */
      ...(venue.cornerRadiiM === undefined ? {} : { cornerRadiiM: venue.cornerRadiiM }),
    },
    turn: venue.turn,
    meta: { venue: venue.name, raceName: race.name, raceNo: GRADED_RACE_NO },
  };
}

/**
 * ★画面から呼ぶ入口。★**知らない id は既定へ落とします**（★URL は人が打つので）。
 * ⚠️ ★**黙って落としません** — ★落ちたことを呼び出し側が判別できるように返します（R-27 の系）。
 */
export function raceSetupFromParam(raw: string | null | undefined): { setup: RaceSetup; fellBack: boolean } {
  if (raw === null || raw === undefined || raw === '') return { setup: raceSetupById(), fellBack: false };
  const found = GRADED_RACES.some((r) => r.id === raw);
  return { setup: raceSetupById(found ? raw : DEFAULT_RACE_ID), fellBack: !found };
}

/** ★1 つの競馬場と、そこで組まれている鞍 */
export interface VenueRaces {
  readonly venue: Venue;
  readonly races: readonly GradedRace[];
}

/**
 * ★**競馬場ごとに 50 鞍を並べる**（★画面のレース選択のため・2026-08-31）
 *
 * 【★なぜ画面側に書かないか】
 *   ★「どの競馬場にどの鞍があるか」は ★**`VENUES` と `GRADED_RACES` から決まる**ものです。
 *   ★画面側で組み直すと、★**鞍を足したときに画面が古いまま**になります
 *   （★走路の形を 2 か所で持って離れた B-6 と同じ形）。
 *
 * ⚠️ ★**並び順は `VENUES` の順です。** ★ここで並べ替えないこと —
 *    ★競馬場の一覧が 2 か所で違う順になります。★鞍の中では格 → 距離の順に並べます。
 *
 * ⚠️ ★**鞍が 1 つも無い競馬場は返しません。** ★空の選択肢を出さないためです。
 *    ★いまは 10 場すべてに鞍がありますが、★その前提を検査には書きません
 *    （★`graded-races.test.ts` が「10 場すべてが使われていること」を別に見ています）。
 */
export function gradedRacesByVenue(): readonly VenueRaces[] {
  const GRADE_ORDER: Readonly<Record<string, number>> = { G1: 0, G2: 1, G3: 2 };
  return VENUES.map((venue) => ({
    venue,
    races: GRADED_RACES
      .filter((r) => r.venueId === venue.id)
      .slice()
      .sort((a, b) => (GRADE_ORDER[a.grade]! - GRADE_ORDER[b.grade]!) || (a.distanceM - b.distanceM)),
  })).filter((v) => v.races.length > 0);
}
