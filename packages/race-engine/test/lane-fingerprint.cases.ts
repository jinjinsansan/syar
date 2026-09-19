/**
 * ★**距離ロスの指紋の対象と計算**（★ES 便 ES-1・2026-09-15・回答 `REVIEW_QUESTIONS_ENGINE_LANE_SPEED_ANSWER_20260915.md` §Q-3）
 *
 * 【★何のためか】
 *   ★ES 便は `lane.ts` を**速くするだけ**で、★結果を 1 ビットも変えてはいけません（着順に効く・D-071）。
 *   ★その「変わらない」を、★**直す前のコミット（`cfc3ad1`）で取った値**と比べて固定します。
 *   ★期待値は `lane-fingerprint.expected.json`（★`lane-fingerprint.gen.ts` が 1 回だけ書く）で、
 *   ★検査の中で同じコードから作りません（★自分を自分と比べない・R-16）。
 *
 * 【★範囲】（回答 §Q-3 の 2）
 *   ★10 場の凍結した形（`frozenCourseOf` → `conditionsFromFrozen`・★ワーカーの生成と確定の入口）
 *   ★`DEFAULT_OVAL`（★凍結の無いレース）／ ★半径が 4 つとも違う形（`ovalSpecFromCornerRadii`）／ ★直線（`laneExtraM` を通らない対照）
 *   × 本番の 7 距離（`DISTANCE_MENU`）× 8 頭・18 頭 × シード 20
 *
 * 【★中身】（回答 §Q-3 の 3）
 *   ★`resolveRace` の結果（馬・着順・スコア・距離ロス・走破タイム・着差の秒と言葉）
 *   ★＋ ★`laneExtraM` を直接呼んだ値 ＋ ★`laneAt` を 50m 刻みで直接呼んだ値（★画面の経路・★シード 0 だけ）
 *
 * ⚠️ ★数は `toString()`（★最短の往復表現）で文字にします。★丸めません（★1 ビットの違いも拾うため）。
 * ⚠️ ★出走馬は ★決定的に作ります（★`watch-pool.json` は apps 側の素材なのでエンジンの検査から読まない）。
 */
import { createHash } from 'node:crypto';
import { DISTANCE_MENU, VENUES, frozenCourseOf } from '@star/scheduler';
import type { Strategy } from '@star/sim-engine';
import {
  resolveRace, DEFAULT_RACE_BALANCE, DEFAULT_OVAL, conditionsFromFrozen, laneAt, laneExtraM,
  ovalSpecFromCornerRadii, type OvalSpec, type RaceBalance, type RaceConditions, type RaceEntrant,
} from '../src/index.js';
import { neutralEntrant } from './helpers.js';

export const FINGERPRINT_HEADS: readonly number[] = [8, 18];
export const FINGERPRINT_SEEDS = 20;
/** ★`laneAt` を直接呼ぶ刻み [m] */
export const LANE_AT_STEP_M = 50;

/** ★半径が 4 つとも違う形（★どの場もまだ持たないが器はある・回答 §Q-3 の 2） */
export const UNEVEN_RADII_SPEC: OvalSpec = ovalSpecFromCornerRadii(400, [70, 85, 100, 120], 20);

const STRATEGIES: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];

/** ★決定的な出走馬（★能力・適性・脚質を枠から算術で散らす・乱数を使わない） */
export function fingerprintField(size: number): RaceEntrant[] {
  return Array.from({ length: size }, (_, i) => neutralEntrant(`H${String(i + 1).padStart(3, '0')}`, {
    gate: i + 1,
    strategy: STRATEGIES[i % STRATEGIES.length]!,
    stats: {
      sp: 420 + ((i * 37) % 160), st: 420 + ((i * 53) % 160), pw: 420 + ((i * 71) % 160),
      gt: 420 + ((i * 89) % 160), iq: 420 + ((i * 97) % 160),
    },
    distanceCenter: 1400 + ((i * 173) % 1400),
    distanceRange: 500 + ((i * 41) % 300),
    condition: 1 + (i % 5),
  }));
}

export interface FingerprintCase {
  readonly key: string;
  readonly distance: number;
  readonly heads: number;
  readonly conditions: RaceConditions;
}

/** ★対象の組をすべて並べる（★並びは期待値のファイルと同じ順・キーで引く） */
export function fingerprintCases(): FingerprintCase[] {
  const out: FingerprintCase[] = [];
  const base = (distance: number) => ({ raceId: 'fp', distance, surface: 'turf' as const, trackCondition: 'good' as const });
  for (const distance of DISTANCE_MENU) {
    for (const heads of FINGERPRINT_HEADS) {
      for (const v of VENUES) {
        out.push({ key: `venue:${v.id}|${distance}|${heads}`, distance, heads, conditions: conditionsFromFrozen(frozenCourseOf(v.id), base(distance)) });
      }
      out.push({ key: `default-oval|${distance}|${heads}`, distance, heads, conditions: conditionsFromFrozen(null, base(distance)) });
      out.push({ key: `uneven-radii|${distance}|${heads}`, distance, heads, conditions: { ...base(distance), baseWeightKg: 55, courseShape: 'oval', course: UNEVEN_RADII_SPEC } });
      out.push({ key: `straight|${distance}|${heads}`, distance, heads, conditions: { ...base(distance), baseWeightKg: 55, courseShape: 'straight' } });
    }
  }
  return out;
}

const num = (x: number): string => x.toString();

/** ★1 つの組の中身（★数のまま・★ES-5 で許容差つきの比較に使う） */
export interface FingerprintSeedRow {
  readonly order: readonly {
    readonly horseId: string; readonly finishPosition: number; readonly finalScore: number; readonly laneExtraM: number;
    readonly timeSec: number; readonly timeGapSec: number; readonly marginLabel: string;
  }[];
  /** ★`laneExtraM` を直接呼んだ値（★楕円だけ） */
  readonly lx?: readonly number[];
  /** ★`laneAt` を 50m 刻みで呼んだ値（★楕円のシード 0 だけ） */
  readonly la?: readonly number[];
}

/** ★`laneExtraM` の呼び方（★`race.ts` と同じ引数）。★既定は本番の `laneExtraM` */
export type LaneExtraOf = (gate: number, heads: number, distance: number, seed: number, course: OvalSpec | undefined) => number;
const productionLaneExtra: LaneExtraOf = (gate, heads, distance, seed, course) => laneExtraM(gate, heads, distance, seed, course);

export function fingerprintRowsOf(
  c: FingerprintCase,
  laneExtraOf: LaneExtraOf = productionLaneExtra,
  /**
   * ★**使う較正値**（★2026-09-19・**M-9** のときに足しました）。
   *
   * 🔴 ★以前は `DEFAULT_RACE_BALANCE` を直書きしていました。
   *   → ★**較正を 1 つ変えるだけで、★指紋が全部 落ちました**（★M-9 で 182 組）。
   *   ★しかしこの番人の主張は ★**「`lane.ts` の 2 経路が一致する」**であって、
   *   ★**較正値の主張ではありません** — ★測定器が主張と違う入力を読んでいました（**R-30**）。
   * → ★①（過去との繋がり）は ★**凍結した較正**で、★②（2 経路の一致）は ★**生きた較正**で回します。
   */
  balance: RaceBalance = DEFAULT_RACE_BALANCE,
): FingerprintSeedRow[] {
  const rows: FingerprintSeedRow[] = [];
  const entrants = fingerprintField(c.heads);
  const spec = c.conditions.course ?? DEFAULT_OVAL;
  for (let s = 0; s < FINGERPRINT_SEEDS; s += 1) {
    const seed = 12345 + s * 7919;
    const r = resolveRace({ conditions: c.conditions, entrants, seed, balance });
    const order = r.order.map((o) => ({
      horseId: o.horseId, finishPosition: o.finishPosition, finalScore: o.finalScore, laneExtraM: o.laneExtraM,
      timeSec: o.timeSec, timeGapSec: o.timeGapSec, marginLabel: o.marginLabel,
    }));
    if (c.conditions.courseShape !== 'oval') { rows.push({ order }); continue; }
    /** ★エンジンの経路（`race.ts` と同じ引数） */
    const lx = entrants.map((e) => laneExtraOf(e.gate, c.heads, c.distance, seed, c.conditions.course));
    /** ★画面の経路（`laneAt` を直接・★幅と走路の形を渡す）。★重いのでシード 0 だけ */
    if (s !== 0) { rows.push({ order, lx }); continue; }
    const la: number[] = [];
    for (const e of entrants) {
      for (let ml = c.distance; ml >= 0; ml -= LANE_AT_STEP_M) la.push(laneAt(e.gate, c.heads, ml, c.distance, seed, spec.widthM, undefined, spec));
    }
    rows.push({ order, lx, la });
  }
  return rows;
}

/** ★中身から指紋を作る（★ES-1 の `fingerprintOf` と同じ文字の並び・同じ順番で足す） */
export function digestOfRows(rows: readonly FingerprintSeedRow[]): string {
  const h = createHash('sha256');
  for (const row of rows) {
    h.update(row.order.map((o) => [o.horseId, o.finishPosition, num(o.finalScore), num(o.laneExtraM), num(o.timeSec), num(o.timeGapSec), o.marginLabel].join(',')).join(';'));
    if (row.lx !== undefined) h.update(`|lx:${row.lx.map(num).join(',')}`);
    if (row.la !== undefined) h.update(`|la:${row.la.map(num).join(',')}`);
  }
  return h.digest('hex').slice(0, 32);
}

/** ★1 つの組の指紋（★16 進 32 文字） */
export function fingerprintOf(c: FingerprintCase, laneExtraOf: LaneExtraOf = productionLaneExtra): string {
  return digestOfRows(fingerprintRowsOf(c, laneExtraOf));
}
