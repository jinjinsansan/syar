/**
 * ★**凍結した走路の形 → エンジンに渡すレース条件**（★2026-09-15・指示書 VW §5-3・D-055 / D-071 の適用）
 *
 * 【★なぜ 1 か所か】
 *   ⚠️ ★走路の形は ★**着順に効きます**（距離ロス・`courseShape` による枠の係数）。
 *   ★2026-09-15 まで、★オッズのモンテカルロと確定が ★**別々に条件を組んで**いました:
 *     ★オッズ … `generateRace` が 1400m 以下の 20% を `'straight'` にし、★`course` を渡さない（`DEFAULT_OVAL`）
 *     ★確定   … `pg-store.ts` が `courseShape: 'oval'` を**直書き**し、★`course` を渡さない
 *   → ★該当するレースは「★オッズを付けた模型」と「★着順を決めた模型」が違いました（指示書 F-6）。
 *   → ★**ワーカーの生成・確定、再計算の道具、測定器は、すべてこの関数を通します。**
 *
 * 【★凍結の形】（`races.course_frozen`・移行ファイル `0023`）
 *   `{ v: 1, venueId, lapM, homeStretchM, widthM, cornerRadiiM?, turn, courseShape }`
 *   ★`turn` はエンジンが使いません（描画だけ）。★将来の中継のために一緒に凍結します。
 *
 * 【★層の向き】
 *   ★この層（`@star/race-engine`）は `@star/sim-engine` 以外に依存しません。
 *   ★凍結するオブジェクトを**作る**のは `@star/scheduler` の `frozenCourseOf`（競馬場のデータを持つ側）で、
 *   ★型は向こうにも同じ形があります（★依存ゼロを保つため・`RaceCourseSpec` と同じ作法）。
 *   ★両方を引ける `apps/cli/test/course-frozen.test.ts` が、★10 場すべてで食い違わないことを見ます。
 *
 * 【★この層の約束】★純粋関数です。★時計も乱数も持ちません。
 */
import { DEFAULT_OVAL, ovalCornerPlan, type OvalSpec } from './lane.js';
import type { CourseShape, RaceConditions, Surface, TrackCondition } from './types.js';

export interface FrozenCourse {
  /** ★形の版。★項目を足すときは版を上げ、★古い版を読めることを検査に足すこと */
  readonly v: 1;
  /** ★競馬場の id（`races.course_id` と同じ値） */
  readonly venueId: string;
  readonly lapM: number;
  readonly homeStretchM: number;
  readonly widthM: number;
  /** ★場が持つときだけ（★2026-09-15 時点でどの場も持ちません） */
  readonly cornerRadiiM?: readonly [number, number, number, number];
  /** ★回り。★**エンジンは使いません**（描画だけ） */
  readonly turn: 'left' | 'right';
  readonly courseShape: CourseShape;
}

/**
 * ★凍結が**あるのに読めない・形が不正**（★確定しません）。
 * ⚠️ ★ワーカーは名前で判定して**開催中止・返還**の経路へ載せます（`UnfrozenRaceError` と同じ扱い）。
 */
export class InvalidFrozenCourseError extends Error {
  constructor(readonly why: string) {
    super(`走路の凍結が不正です: ${why}`);
    this.name = 'InvalidFrozenCourseError';
  }
}

const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'v', 'venueId', 'lapM', 'homeStretchM', 'widthM', 'cornerRadiiM', 'turn', 'courseShape',
]);

const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

/**
 * ★DB から読んだ値を**検める**。★不正なら `InvalidFrozenCourseError` を投げます（★黙って既定へ落とさない・R-27）。
 *
 * ⚠️ ★**知らない項目があっても投げます。** ★版を上げずに項目を足したとき、
 *    ★その項目を読まずに確定すると「凍結したのに使っていない」になるためです。
 * ★戻り値は**受け取ったオブジェクトそのもの**です（★作り直さない）。
 */
export function parseFrozenCourse(raw: unknown): FrozenCourse {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new InvalidFrozenCourseError(`オブジェクトではありません（${raw === null ? 'null' : typeof raw}）`);
  }
  const o = raw as Record<string, unknown>;
  const unknownKeys = Object.keys(o).filter((k) => !KNOWN_KEYS.has(k));
  if (unknownKeys.length > 0) throw new InvalidFrozenCourseError(`知らない項目: ${unknownKeys.join(', ')}`);
  if (o['v'] !== 1) throw new InvalidFrozenCourseError(`版が 1 ではありません: ${String(o['v'])}`);
  if (typeof o['venueId'] !== 'string' || o['venueId'] === '') throw new InvalidFrozenCourseError('venueId がありません');
  for (const k of ['lapM', 'homeStretchM', 'widthM'] as const) {
    if (!positive(o[k])) throw new InvalidFrozenCourseError(`${k} が正の数ではありません: ${String(o[k])}`);
  }
  const lapM = o['lapM'] as number;
  const homeStretchM = o['homeStretchM'] as number;
  /** ★`ovalCourse` / `ovalSegments` の前提（★直線 2 本が 1 周に収まる） */
  if (!(homeStretchM * 2 < lapM)) {
    throw new InvalidFrozenCourseError(`直線 ×2 が 1 周以上です: lapM=${lapM} homeStretchM=${homeStretchM}`);
  }
  if (o['turn'] !== 'left' && o['turn'] !== 'right') throw new InvalidFrozenCourseError(`turn が不正: ${String(o['turn'])}`);
  if (o['courseShape'] !== 'oval' && o['courseShape'] !== 'straight') {
    throw new InvalidFrozenCourseError(`courseShape が不正: ${String(o['courseShape'])}`);
  }
  const radii = o['cornerRadiiM'];
  if (radii !== undefined) {
    if (!Array.isArray(radii) || radii.length !== 4 || !radii.every(positive)) {
      throw new InvalidFrozenCourseError(`cornerRadiiM が正の数 4 つではありません: ${JSON.stringify(radii)}`);
    }
  }
  const frozen = raw as FrozenCourse;
  try {
    // ★1 周とコーナーの半径の整合（★食い違えば `ovalCornerPlan` が投げます）
    ovalCornerPlan(ovalSpecOf(frozen));
  } catch (e) {
    throw new InvalidFrozenCourseError(e instanceof Error ? e.message : String(e));
  }
  return frozen;
}

/** ★エンジンの `OvalSpec`（★`cornerRadiiM` は持っているときだけ運ぶ） */
function ovalSpecOf(f: FrozenCourse): OvalSpec {
  return {
    lapM: f.lapM, homeStretchM: f.homeStretchM, widthM: f.widthM,
    ...(f.cornerRadiiM === undefined ? {} : { cornerRadiiM: f.cornerRadiiM }),
  };
}

/** ★基準斤量（§8.3）。★`race-field.ts` の `generateRace` と同じ 55 */
const BASE_WEIGHT_KG = 55;

export interface FrozenRaceBase {
  readonly raceId: string;
  readonly distance: number;
  readonly surface: Surface;
  readonly trackCondition: TrackCondition;
}

/**
 * ★**凍結した走路の形からレース条件を作る**（★オッズ・確定・再計算・測定器の唯一の入口）。
 *
 * ★`frozen === null` … ★`0023` より前に生成されたレース。★それらは実際に
 *   ★`DEFAULT_OVAL`・`'oval'` で確定されてきたので、★**明示的に**その形で作ります。
 *   ⚠️ ★**呼び出し側は件数を数えて警報に出すこと**（★黙って落とさない・D-055 と同じ形・R-27）。
 * ★`frozen` がある … ★必ず `parseFrozenCourse` で検めます（★不正なら投げる）。
 */
export function conditionsFromFrozen(frozen: FrozenCourse | null, race: FrozenRaceBase): RaceConditions {
  const base = {
    raceId: race.raceId,
    distance: race.distance,
    surface: race.surface,
    trackCondition: race.trackCondition,
    baseWeightKg: BASE_WEIGHT_KG,
  };
  if (frozen === null) return { ...base, courseShape: 'oval', course: DEFAULT_OVAL };
  const f = parseFrozenCourse(frozen);
  return { ...base, courseShape: f.courseShape, course: ovalSpecOf(f) };
}
