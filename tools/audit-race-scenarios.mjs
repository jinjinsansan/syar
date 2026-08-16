/** High-volume race truth/motion audit. Does not render bitmaps. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt } from '@star/race-engine';
import { replayPositionModel, finalOrderOf } from '@star/render';

const numberArg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const listArg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1].split(',').map(Number) : fallback;
};
const stringArg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const SEEDS = numberArg('seeds', 16);
const FIELD = numberArg('field', 12);
const STEP = numberArg('step', 0.1);
const DISTANCES = listArg('distances', [1200, 1600, 2000, 2400, 3000]);
const SURFACE = stringArg('surface', 'turf'), CONDITION = stringArg('condition', 'good');
const OUT = path.resolve(`out/reference-audit/scenario-matrix-${SURFACE}-${CONDITION}.json`);
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const PROFILES = {
  middle: ['nige', 'senko', 'sashi', 'oikomi', 'senko', 'oikomi'],
  high: ['nige', 'nige', 'nige', 'senko'],
  slow: ['senko', 'sashi', 'oikomi', 'oikomi'],
};

const failures = [];
const summaries = [];
const paceCounts = { high: 0, middle: 0, slow: 0 };
const winnerStrategyCounts = { nige: 0, senko: 0, sashi: 0, oikomi: 0 };
let sampledStates = 0;

for (const distance of DISTANCES) {
  for (const [profile, pattern] of Object.entries(PROFILES)) {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const start = (seed * 13) % Math.max(1, POOL.length - FIELD);
      const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
        horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
        distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
        strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
        strategy: pattern[(i + seed) % pattern.length], condition: 3, fatigue: 20,
        weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
      }));
      const conditions = { raceId: `scenario-${profile}-${distance}-${seed}-${SURFACE}-${CONDITION}`, distance, surface: SURFACE, trackCondition: CONDITION, courseShape: 'oval', baseWeightKg: 55 };
      const result = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
      const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
      paceCounts[pace] += 1;
      const boundaries = replayOf(result, (gate) => entrants[gate - 1].strategy, pace);
      const expected = result.order.map((entry) => Number(entry.horseId));
      const model = replayPositionModel({
        distanceMeter: distance, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
        strategyOf: (gate) => entrants[gate - 1].strategy, pace,
        laneOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, distance, seed),
        formationSeed: seed * 2654435761,
      });

      const errors = [];
      if (!finalOrderMatches(result, boundaries)) errors.push('boundary-order');
      const actual = finalOrderOf(model);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push('model-order');
      for (const entry of result.order) {
        const gate = Number(entry.horseId);
        const atFinish = model.at(entry.timeSec).find((h) => h.gate === gate);
        const justBefore = model.at(Math.max(0, entry.timeSec - 1e-5)).find((h) => h.gate === gate);
        if (!atFinish || atFinish.meters < distance - 1e-7) errors.push(`finish-missing:${gate}`);
        if (!justBefore || justBefore.meters >= distance) errors.push(`finish-early:${gate}`);
      }

      let backwardM = 0, maxForwardM = 0, maxLaneM = 0;
      let previous = model.at(0);
      for (let sec = STEP; sec <= model.raceSec + 1e-9; sec += STEP) {
        const current = model.at(Math.min(sec, model.raceSec));
        sampledStates += 1;
        for (const horse of current) {
          const before = previous.find((h) => h.gate === horse.gate);
          if (!before) continue;
          const forward = horse.meters - before.meters;
          backwardM = Math.min(backwardM, forward);
          maxForwardM = Math.max(maxForwardM, forward);
          maxLaneM = Math.max(maxLaneM, Math.abs((horse.w ?? 0) - (before.w ?? 0)));
        }
        previous = current;
      }
      if (backwardM < -1e-7) errors.push(`backward:${backwardM}`);

      const winnerGate = expected[0];
      const winnerStrategy = entrants[winnerGate - 1].strategy;
      winnerStrategyCounts[winnerStrategy] += 1;
      const winningGapSec = result.order[1]?.timeSec - result.order[0].timeSec ?? 0;
      const summary = { distance, profile, seed, pace, winnerGate, winnerStrategy, winningGapSec, backwardM, maxForwardM, maxLaneM, errors };
      summaries.push(summary);
      if (errors.length > 0) failures.push(summary);
    }
  }
}

const maxima = summaries.reduce((acc, row) => ({
  maxStepForwardM: Math.max(acc.maxStepForwardM, row.maxForwardM),
  maxStepLaneM: Math.max(acc.maxStepLaneM, row.maxLaneM),
  minStepForwardM: Math.min(acc.minStepForwardM, row.backwardM),
  maxWinningGapSec: Math.max(acc.maxWinningGapSec, row.winningGapSec),
}), { maxStepForwardM: 0, maxStepLaneM: 0, minStepForwardM: 0, maxWinningGapSec: 0 });
const output = { generatedAt: new Date().toISOString(), config: { seeds: SEEDS, fieldSize: FIELD, stepRaceSec: STEP, distances: DISTANCES, profiles: Object.keys(PROFILES), surface: SURFACE, trackCondition: CONDITION }, races: summaries.length, sampledStates, paceCounts, winnerStrategyCounts, maxima, failures };
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(output, null, 2)}\n`);
console.table({ races: output.races, sampledStates, failures: failures.length, ...maxima });
console.log('pace', paceCounts, 'winners', winnerStrategyCounts);
console.log(OUT);
if (failures.length > 0) throw new Error(`Scenario gate failed: ${failures.length}; first=${JSON.stringify(failures[0])}`);
