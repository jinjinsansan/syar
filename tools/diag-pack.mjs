/**
 * ★馬群の広がりを測る（オーナー指摘 ②「馬が画面から消えてまた出る」）
 *
 *   実際の競馬は**接戦**で、12頭が数馬身〜十数馬身に収まります。
 *   ★画面に映るのは 1280px ÷ 55px/m ＝ **約23m** です。
 *     馬群がそれを超えて広がると、**馬が画面から消えます**。
 *
 * 実行: npx tsx tools/diag-pack.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf } from '@star/race-engine';
import { replayPositionModel, SPRITE } from '@star/render';

const DIST = 1600, FIELD = 12, RACES = 60;
const S = ['nige', 'senko', 'sashi', 'oikomi'];
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const PX_PER_M = SPRITE.width / 4;
const SCREEN_M = 1280 / PX_PER_M;

/** ★馬体1つぶん ≒ 2.4m。「馬身」で言うと分かりやすい */
const LENGTH_M = 2.4;

const buckets = [1500, 1200, 900, 600, 300, 100];
const acc = new Map(buckets.map((b) => [b, []]));

for (let seed = 1; seed <= RACES; seed += 1) {
  const st = (seed * 13) % Math.max(1, POOL.length - FIELD);
  const ent = POOL.slice(st, st + FIELD).map((h, i) => ({
    horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
    strategy: S[(i + seed) % 4], condition: 3, fatigue: 20,
    weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
  }));
  const c = { raceId: `p${seed}`, distance: DIST, surface: 'turf', trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55 };
  const r = resolveRace({ conditions: c, entrants: ent, seed, balance: DEFAULT_RACE_BALANCE });
  const { pace } = paceOf(ent, DEFAULT_RACE_BALANCE);
  const model = replayPositionModel({
    distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400,
    boundaries: replayOf(r, (g) => ent[g - 1].strategy, pace), jostle: 0.25, jostleSeed: seed,
  });
  for (const left of buckets) {
    let sec = 0;
    for (let i = 0; i <= 600; i += 1) {
      const t = (i / 600) * model.raceSec;
      const lead = Math.max(...model.at(t).map((h) => h.meters));
      if (DIST - lead <= left) { sec = t; break; }
    }
    const ms = model.at(sec).map((h) => h.meters);
    acc.get(left).push(Math.max(...ms) - Math.min(...ms));
  }
}

console.log('# ★馬群の広がり（' + RACES + ' レース）');
console.log(`  画面に映るのは ${SCREEN_M.toFixed(0)}m ぶん（1280px ÷ ${PX_PER_M}px/m）`);
console.log('');
console.log('  残りm | 先頭〜最後尾 | 馬身 | 画面に入る？');
for (const [left, vs] of acc) {
  const m = vs.reduce((s, v) => s + v, 0) / vs.length;
  const fits = m <= SCREEN_M;
  console.log(`  ${String(left).padStart(5)} | ${m.toFixed(0).padStart(6)}m     | ${(m / LENGTH_M).toFixed(0).padStart(3)} | ${fits ? '入る' : `★入らない（${(m / SCREEN_M).toFixed(1)}倍）`}`);
}
console.log('');
console.log('★実際のレースは、道中で概ね 10〜20馬身（24〜48m）に収まります。');
