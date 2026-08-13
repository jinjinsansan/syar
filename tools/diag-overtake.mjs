/**
 * ★「映像に抜き差しはあるか」を測る
 *
 * 【なぜ測るか】
 *   画面ボットの特徴を「位置の順位」と「脚質」の2つに絞っても、
 *   ★**スタート直後から AUC 0.928 で、レース中ずっと平坦**でした。
 *   情報なら増えるはずです。**増えないのは、最初から答えが映っているから**です。
 *
 *   D-059 は「位置は境界時刻から再計算する」と定めています。
 *   境界時刻は**確定した結果から**作られるので（`replayOf(result, …)`）、
 *   ★`位置(t) = f(走破タイム, 脚質, ペース)` になります。
 *
 *   → **測定の問題である前に、映像の問題ではないか**を直接見ます。
 *     抜き差しが無ければ、レースは「並んで流れているだけ」です。
 *
 * 実行: npx tsx tools/diag-overtake.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf } from '@star/race-engine';
import { replayPositionModel } from '@star/render';

const FIELD = 12, DIST = 1600, RACES = 200, SAMPLES = 120;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const pool = JSON.parse(readFileSync('docs/pool-staging.json', 'utf8'));
const arr = Array.isArray(pool) ? pool : (pool.horses ?? []);
const stock = arr.filter((h) => h.stats && Number.isFinite(h.stats.sp)).sort((a, b) => b.stats.sp - a.stats.sp);

let totalSwaps = 0, totalLeadChanges = 0;
/** ★局面ごとに数える（道中に無いのか、全体に無いのかを分けるため） */
const byPhase = { cruise: 0, spurt: 0, straight: 0 };

for (let seed = 1; seed <= RACES; seed += 1) {
  const off = (seed * 13) % Math.max(1, stock.length - FIELD);
  const entrants = stock.slice(off, off + FIELD).map((h, i) => ({
    horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
    strategy: STRATS[(i + seed) % 4], condition: 3, fatigue: 20,
    weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes ?? [],
  }));
  const conditions = {
    raceId: `o${seed}`, distance: DIST, surface: 'turf',
    trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
  };
  const result = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
  const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
  const model = replayPositionModel({
    distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400,
    boundaries: replayOf(result, (g) => entrants[g - 1].strategy, pace),
  });

  let prev = null, prevLead = null;
  for (let i = 0; i <= SAMPLES; i += 1) {
    const sec = (i / SAMPLES) * model.raceSec;
    const at = [...model.at(sec)].sort((a, b) => b.meters - a.meters);
    const order = at.map((h) => h.gate);
    const lead = order[0];
    // ★局面は先頭の残り距離で見る
    const left = DIST - at[0].meters;
    const ph = left <= 400 ? 'straight' : left <= 800 ? 'spurt' : 'cruise';
    if (prev !== null) {
      // 隣り合う2頭の前後が入れ替わった回数
      let swaps = 0;
      for (let a = 0; a < order.length; a += 1) {
        for (let b = a + 1; b < order.length; b += 1) {
          const wasBefore = prev.indexOf(order[a]) < prev.indexOf(order[b]);
          if (!wasBefore) swaps += 1;
        }
      }
      totalSwaps += swaps;
      byPhase[ph] += swaps;
      if (lead !== prevLead) totalLeadChanges += 1;
    }
    prev = order;
    prevLead = lead;
  }
}

console.log('# ★映像に抜き差しはあるか（' + RACES + ' レース × ' + SAMPLES + ' 標本）');
console.log('');
console.log(`  1レースあたりの追い抜き   : ${(totalSwaps / RACES).toFixed(1)} 回`);
console.log(`  1レースあたりの先頭交代   : ${(totalLeadChanges / RACES).toFixed(2)} 回`);
console.log('');
console.log('  局面ごとの追い抜き（1レースあたり）');
for (const [k, v] of Object.entries(byPhase)) {
  console.log(`    ${k.padEnd(9)}: ${(v / RACES).toFixed(1)} 回`);
}
console.log('');
console.log('★読み方: 追い抜きがほとんど無ければ、映像は「並んで流れているだけ」です。');
console.log('  そのとき、最初に見えた並びが最後の並びなので、**見ても新しいことが起きません。**');
