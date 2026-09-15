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
  ovalSpecFromCornerRadii, type OvalSpec, type RaceConditions, type RaceEntrant,
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

/** ★1 つの組の指紋（★16 進 32 文字） */
export function fingerprintOf(c: FingerprintCase): string {
  const h = createHash('sha256');
  const entrants = fingerprintField(c.heads);
  const spec = c.conditions.course ?? DEFAULT_OVAL;
  for (let s = 0; s < FINGERPRINT_SEEDS; s += 1) {
    const seed = 12345 + s * 7919;
    const r = resolveRace({ conditions: c.conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
    h.update(r.order.map((o) => [o.horseId, o.finishPosition, num(o.finalScore), num(o.laneExtraM), num(o.timeSec), num(o.timeGapSec), o.marginLabel].join(',')).join(';'));
    if (c.conditions.courseShape !== 'oval') continue;
    /** ★エンジンの経路（`race.ts` と同じ引数） */
    h.update(`|lx:${entrants.map((e) => num(laneExtraM(e.gate, c.heads, c.distance, seed, c.conditions.course))).join(',')}`);
    /** ★画面の経路（`laneAt` を直接・★幅と走路の形を渡す）。★重いのでシード 0 だけ */
    if (s !== 0) continue;
    const ws: string[] = [];
    for (const e of entrants) {
      for (let ml = c.distance; ml >= 0; ml -= LANE_AT_STEP_M) ws.push(num(laneAt(e.gate, c.heads, ml, c.distance, seed, spec.widthM, undefined, spec)));
    }
    h.update(`|la:${ws.join(',')}`);
  }
  return h.digest('hex').slice(0, 32);
}
