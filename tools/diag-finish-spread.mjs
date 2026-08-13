/**
 * ★走破タイムの差はどこから来るか（オーナー指摘 ②の根源）
 *
 *   実測: 同クラス12頭・1600m で **1着〜最下位の差 35秒（415m）**。
 *   実際の1600m戦は **2〜4秒（30〜60m）**。
 *
 * ★丸投げにしないため、**どの要素が差を作っているか**を切り分けます。
 *
 * 実行: npx tsx tools/diag-finish-spread.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace } from '@star/race-engine';

const DIST = 1600, FIELD = 12, RACES = 40;
const S = ['nige', 'senko', 'sashi', 'oikomi'];
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));

/** @param mut 出走馬をどう揃えるか */
function measure(label, mut) {
  const spreads = [], firsts = [], scoreGaps = [];
  for (let seed = 1; seed <= RACES; seed += 1) {
    const st = (seed * 13) % Math.max(1, POOL.length - FIELD);
    let ent = POOL.slice(st, st + FIELD).map((h, i) => ({
      horseId: String(i + 1), stats: { ...h.stats }, surfaceAptitude: h.surfaceAptitude,
      distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
      strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
      strategy: S[(i + seed) % 4], condition: 3, fatigue: 20,
      weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
    }));
    ent = mut(ent);
    const c = { raceId: 'q', distance: DIST, surface: 'turf', trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55 };
    const r = resolveRace({ conditions: c, entrants: ent, seed, balance: DEFAULT_RACE_BALANCE });
    const ts = r.order.map((e) => e.timeSec).filter(Number.isFinite);
    if (ts.length < 2) continue;
    spreads.push(Math.max(...ts) - Math.min(...ts));
    firsts.push(Math.min(...ts));
    const sc = r.order.map((e) => e.finalScore).filter(Number.isFinite);
    if (sc.length >= 2) scoreGaps.push((Math.max(...sc) - Math.min(...sc)) / Math.max(...sc));
  }
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  console.log(`  ${label.padEnd(34)} 差 ${avg(spreads).toFixed(1)}秒 / ★1着〜最下位のスコア差 ${(avg(scoreGaps) * 100).toFixed(1)}%`);
}

console.log('# ★走破タイムの差はどこから来るか（' + RACES + 'レース・1600m・12頭）');
console.log('');
measure('① そのまま（同クラス上位）', (e) => e);
measure('② 脚質を全部 senko に揃える', (e) => e.map((x) => ({ ...x, strategy: 'senko' })));
measure('③ 能力を全馬同一にする', (e) => e.map((x) => ({ ...x, stats: { ...e[0].stats } })));
measure('④ 距離適性を全馬同一にする', (e) => e.map((x) => ({
  ...x, distanceCenter: e[0].distanceCenter, distanceRange: e[0].distanceRange,
})));
measure('⑤ 脚質適性を全馬同一にする', (e) => e.map((x) => ({ ...x, strategyAptitude: e[0].strategyAptitude })));
measure('⑥ 能力・距離・脚質すべて同一', (e) => e.map((x) => ({
  ...x, stats: { ...e[0].stats }, distanceCenter: e[0].distanceCenter,
  distanceRange: e[0].distanceRange, strategyAptitude: e[0].strategyAptitude,
})));
console.log('');
console.log('');
console.log('★§8.7: timeGap = (1着のスコア − その馬のスコア)/1着のスコア × baseTime × TIME_GAP_FACTOR(0.55)');
console.log('  → **スコア差がそのまま時間差になります。**');
console.log('');
console.log('  実際の1600m戦に合わせるなら（差 2〜4秒 ÷ 勝ち時計 99.9秒 ＝ 2〜4%）:');
console.log('    スコア差 64% のままなら TIME_GAP_FACTOR は 0.03〜0.06 が要る（いまの 1/10 以下）');
console.log('    TIME_GAP_FACTOR 0.55 のままなら スコア差を 4〜7% に抑える必要がある');
console.log('  ★どちらを直すかは正典 §8.7 の領域です。');
