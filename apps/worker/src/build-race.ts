/**
 * 出走表とオッズを作る（正典 §10.4・§9.2）
 *
 * 【★較正済みロジックを再利用する】
 *   出走馬の構成は `apps/cli/src/race-field.ts` の `generateRace` に P1 で較正済みです。
 *   ここで組み直すと出走頭数分布（§10.4）が崩れ、V-4/V-6 に波及します。
 */

import { Rng, deriveRng, type HorseRecord } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, resolveRace, type RaceEntrant } from '@star/race-engine';
import { TICKET_KINDS, placeDepth, type TicketKind } from '@star/betting';
import { generateRace, sortPoolByClass } from '../../cli/src/race-field.js';
import { ODDS_MC_TRIALS, buildOddsRows, winningKeys } from './odds.js';
import type { OddsSpec, RaceEntrantSpec } from './cycle-runner.js';

/** ★オッズ算出用のサブストリーム。§9.2 で本番確定とは別系列 */
const STREAM = { FIELD: 61, ODDS: 62 } as const;

export interface BuiltRace {
  readonly entrants: RaceEntrantSpec[];
  readonly odds: OddsSpec[];
}

/**
 * @param seed 開催全体のマスターシード（サイクル番号ではない）
 * @param trials モンテカルロ試行数。テストでは小さくする
 */
export function buildRace(
  pool: readonly HorseRecord[],
  cycleIndex: number,
  seed: number,
  trials: number = ODDS_MC_TRIALS,
): BuiltRace {
  const sorted = sortPoolByClass(pool);
  const race = generateRace(sorted, cycleIndex, deriveRng(seed, STREAM.FIELD, cycleIndex));

  // 馬番を 1..n に振る（馬券は馬番で買う）
  const numbered: RaceEntrant[] = race.entrants.map((e, i) => ({ ...e, horseId: `H${i + 1}` }));
  const depth = placeDepth(numbered.length);

  // --- §9.2 モンテカルロ（★本番確定とは別系列） ---
  const counts = new Map<TicketKind, Map<string, number>>(
    TICKET_KINDS.map((k) => [k, new Map<string, number>()]),
  );
  const rng: Rng = deriveRng(seed, STREAM.ODDS, cycleIndex);
  for (let t = 0; t < trials; t += 1) {
    const sim = resolveRace({
      conditions: race.conditions,
      entrants: numbered,
      seed: rng.nextUint32(),
      balance: DEFAULT_RACE_BALANCE,
    });
    const order = sim.order.map((r) => Number(r.horseId.replace(/^H/, '')));
    for (const kind of TICKET_KINDS) {
      const m = counts.get(kind)!;
      for (const key of winningKeys(kind, order, depth)) m.set(key, (m.get(key) ?? 0) + 1);
    }
  }

  // 人気順（§9.2: モンテカルロ勝率順位）
  const winCounts = counts.get('win')!;
  const ranked = [...winCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => Number(k));

  const entrants: RaceEntrantSpec[] = race.entrants.map((e, i) => ({
    // ★DB の horse_id は元の馬の UUID。馬番は gate で表す
    horseId: e.horseId,
    gate: i + 1,
    weightKg: e.weightKg,
    strategy: e.strategy,
    popularity: ranked.indexOf(i + 1) >= 0 ? ranked.indexOf(i + 1) + 1 : undefined,
  }));

  return { entrants, odds: buildOddsRows(counts, trials) as OddsSpec[] };
}
