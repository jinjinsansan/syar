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
/** ★格（★`races_public.grade`）。★実レースの `RealRaceSetup` が持ちます */
import type { Grade } from './programme.js';

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

/**
 * ★**走路の形を 1 か所で組む**（★2026-09-26 に切り出しました）。
 *   ⚠️ ★`raceSetupById`（★鞍）と ★`raceSetupFor`（★実レース）の ★**両方がここを通ります**。
 *      ★2 か所で組むと ★離れます（★台帳 B-6 の形 — ★走路の形を 2 か所で持って実際に離れました）。
 */
function specOf(venue: Venue): RaceCourseSpec {
  return {
    lapM: venue.lapM, homeStretchM: venue.homeStretchM, widthM: venue.widthM,
    /** ⚠️ ★持っている場だけ運びます。★いまは 0 場（指示書 §3） */
    ...(venue.cornerRadiiM === undefined ? {} : { cornerRadiiM: venue.cornerRadiiM }),
  };
}

/** ★`?venue=<id>` を「走らせる形」に開く。★知らない id は既定へ落とさず**投げます**（R-27） */
export function raceSetupById(raceId: string = DEFAULT_RACE_ID): RaceSetup {
  const race = gradedRaceById(raceId);
  const venue = venueById(race.venueId);
  return {
    race,
    venue,
    distanceM: race.distanceM,
    surface: race.surface,
    spec: specOf(venue),
    turn: venue.turn,
    meta: { venue: venue.name, raceName: race.name, raceNo: GRADED_RACE_NO },
  };
}

/**
 * ★**実レース 1 本を「走らせる形」に開く**（★段 2・2026-09-26・
 *   ★裁定 `REVIEW_RACE_WIRING_20260926.md`・計画 `PLAN_RACE_REAL_WIRING_20260926.md`）
 *
 * 【🔴 ★なぜ `RaceSetup` と別の型か】
 *   ★`RaceSetup.race` は ★`GradedRace` 必須で、★**実レースには存在しません**。
 *   ★`GradedRace` は ★`month`（★季節）・`age`・`fillies`・`series` を持ちますが、
 *   ★これらは ★**重賞の条件**で、★実レースの公開データには ★在りません
 *   （★実測: `race/page.tsx` が `.month` を 4 か所・`.age`/`.fillies`/`.series` を 3 か所で読んでいます）。
 *   🔴 ★そこで ★**偽の `GradedRace` を作りません**（★「重賞ではないもの」を重賞の形に詰めると、
 *      ★`month` に嘘の月が入り、★**季節の見た目が嘘になります**）。
 *   → ★**走らせるのに要る分だけ**を持つ別の型にしました。
 *
 * 【⚠️ ★季節を持ちません】
 *   ★実レースが持つのは ★`scheduled_at`（★実時刻）だけで、★**ゲーム内の月は正典に在りません**
 *   （★1 週 ＝ 4 時間・D-007。★`records-screen.ts` が ★同じ理由で「今月」を持っていません）。
 *   → ★★**季節は決めません**（★照会 Q-RACE-4・★簿 `REPLAY-SEASON-UNKNOWN-FOR-REAL-RACE`）。
 *   ★描く側が ★**既定の見た目**で描きます。★ここで暦月から推測しないこと。
 *
 * ⚠️ ★**着順に効くのは `spec` だけ**です（★`RaceConditions.course`・D-071）。
 *    ★`turn` は描画層だけが使います。
 */
export interface RealRaceSetup {
  readonly venue: Venue;
  readonly distanceM: number;
  readonly surface: VenueSurface;
  /** ★**エンジンへ渡すもの**（★着順に効きます・D-071） */
  readonly spec: RaceCourseSpec;
  readonly turn: 'left' | 'right';
  /** ★格（★`races_public.grade`。★重賞でなければ `null`） */
  readonly grade: Grade | null;
  readonly meta: {
    readonly venue: string;
    readonly raceName: string;
    readonly raceNo: string;
  };
  /**
   * 🔴 ★**季節は決まっていません**（★常に `null`）。
   *   ★この欄が在るのは ★「★決まっていないことを、★呼ぶ側に必ず見せる」ためです
   *   （★`gauge: … | null` と同じ形。★任意にすると ★書き忘れても通ります）。
   */
  readonly gameMonth: null;
}

/**
 * ★`races_public` の 1 行から組みます。★知らない場は ★**投げます**（★R-27・既定へ落とさない）。
 *
 * @param courseId ★`races_public.course_id`（★`VENUES` の id）
 */
export function raceSetupFor(input: {
  readonly courseId: string;
  readonly distanceM: number;
  readonly surface: VenueSurface;
  readonly grade: Grade | null;
  readonly raceName: string;
  readonly raceNo: string;
}): RealRaceSetup {
  if (!Number.isFinite(input.distanceM) || input.distanceM <= 0) {
    throw new Error(`距離が読めません: ${String(input.distanceM)}`);
  }
  const venue = venueById(input.courseId);
  return {
    venue,
    distanceM: input.distanceM,
    surface: input.surface,
    spec: specOf(venue),
    turn: venue.turn,
    grade: input.grade,
    meta: { venue: venue.name, raceName: input.raceName, raceNo: input.raceNo },
    gameMonth: null,
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
