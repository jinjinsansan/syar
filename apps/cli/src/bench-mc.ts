/**
 * ★オッズ算出の実費用を測る（D-035 の M が10分サイクルに収まるかの判断材料）。
 *   1試行あたりの費用には resolveRace だけでなく、
 *   **全7券種の的中目を数える簿記**も含まれます。本番の MC は両方やります。
 */
import { NICKS_GEN, deriveRng, VERIFY_PAYOUT_STREAM as S } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, resolveRace, type RaceEntrant, type RaceResult } from '@star/race-engine';
import { TICKET_KINDS, placeDepth, type TicketKind } from '@star/betting';
import { generateRace, sortPoolByClass } from './race-field.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';

const argv = process.argv.slice(2);
const i = argv.indexOf('--trials');
const TRIALS = i >= 0 ? Number(argv[i + 1]) : 200_000;

const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  { seed: 42, generations: POOL_GENERATIONS, population: POOL_MARES,
    stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
  balance, founders, NICKS_GEN,
);
const pool = sortPoolByClass(sim.finalPopulation ?? []);
const race = generateRace(pool, 0, deriveRng(42, S.FIELD, 0));
const entrants: RaceEntrant[] = race.entrants.map((e, k) => ({ ...e, horseId: `H${k + 1}` }));
const depth = placeDepth(entrants.length);
const orderOf = (r: RaceResult): number[] => r.order.map((x) => Number(x.horseId.replace(/^H/, '')));

function keysOf(kind: TicketKind, order: readonly number[]): string[] {
  const s = (xs: number[]): string => [...xs].sort((a, b) => a - b).join('-');
  switch (kind) {
    case 'win': return [String(order[0])];
    case 'place': return order.slice(0, depth).map(String);
    case 'quinella_place': {
      const top = order.slice(0, depth); const out: string[] = [];
      for (let a = 0; a < top.length; a += 1) for (let b = a + 1; b < top.length; b += 1) out.push(s([top[a]!, top[b]!]));
      return out;
    }
    case 'quinella': return [s([order[0]!, order[1]!])];
    case 'exacta': return [`${order[0]}>${order[1]}`];
    case 'trio': return [s([order[0]!, order[1]!, order[2]!])];
    case 'trifecta': return [`${order[0]}>${order[1]}>${order[2]}`];
    default: { const never: never = kind; throw new Error(String(never)); }
  }
}

console.log(`# オッズ MC の実費用  ${entrants.length}頭立て / 試行 ${TRIALS.toLocaleString()}`);

// ★暖機。JIT が効く前の値を報告すると遅く出る
const warm = deriveRng(42, S.ODDS, 0);
for (let t = 0; t < 20_000; t += 1) resolveRace({ conditions: race.conditions, entrants, seed: warm.nextUint32(), balance: DEFAULT_RACE_BALANCE });

{
  const rng = deriveRng(42, S.ODDS, 1);
  const t0 = process.hrtime.bigint();
  for (let t = 0; t < TRIALS; t += 1) resolveRace({ conditions: race.conditions, entrants, seed: rng.nextUint32(), balance: DEFAULT_RACE_BALANCE });
  const ns = Number(process.hrtime.bigint() - t0) / TRIALS;
  console.log(`  resolveRace のみ          ${ns.toFixed(2)} μs/試行`.replace('μs', 'ns'));
  console.log(`                            = ${(ns / 1000).toFixed(2)} μs/試行`);
}
{
  const counts = new Map<TicketKind, Map<string, number>>(TICKET_KINDS.map((k) => [k, new Map()]));
  const rng = deriveRng(42, S.ODDS, 2);
  const t0 = process.hrtime.bigint();
  for (let t = 0; t < TRIALS; t += 1) {
    const order = orderOf(resolveRace({ conditions: race.conditions, entrants, seed: rng.nextUint32(), balance: DEFAULT_RACE_BALANCE }));
    for (const kind of TICKET_KINDS) {
      const m = counts.get(kind)!;
      for (const key of keysOf(kind, order)) m.set(key, (m.get(key) ?? 0) + 1);
    }
  }
  const ns = Number(process.hrtime.bigint() - t0) / TRIALS;
  const us = ns / 1000;
  console.log(`  ★全7券種の簿記こみ        ${us.toFixed(2)} μs/試行  ← 本番のオッズ算出はこちら`);
  console.log('');
  for (const M of [10_000, 389_610, 3_896_104]) {
    const perRace = (us * M) / 1e6;
    console.log(`  M=${M.toLocaleString().padStart(9)}  1レース ${perRace.toFixed(1).padStart(7)}秒  2レース/周 ${(perRace * 2).toFixed(1).padStart(7)}秒  ${perRace * 2 < 600 ? '10分サイクルに収まる' : '★収まらない'}`);
  }
}
