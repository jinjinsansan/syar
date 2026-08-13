/**
 * ★「レースに不確定さはあるか」を測る
 *
 * 【なぜ測るか】（REVIEW_P4_QUALITY_VERDICT）
 *   > 面白さは③予想と④当たり外れから出る
 *   ★**当たり外れが起きるには、まだ決まっていないことが要ります。**
 *
 *   実測で、レースの結果は**スタート直後（残り1500m）に AUC 0.928 で読めます**。
 *   能力の幅を変えても変わりません。
 *   → **出走表の時点で決まっているのではないか**を直接確かめます。
 *
 * 実行: npx tsx tools/diag-uncertainty.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf } from '@star/race-engine';

const FIELD = 12, DIST = 1600, TRIALS = 200;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const pool = JSON.parse(readFileSync('docs/pool-staging.json', 'utf8'));
const arr = Array.isArray(pool) ? pool : (pool.horses ?? []);
const stock = arr.filter((h) => h.stats && Number.isFinite(h.stats.sp))
  .sort((a, b) => b.stats.sp - a.stats.sp);

/** ★同じ出走表で、乱数だけ変える */
function trial(offset) {
  const picked = stock.slice(offset, offset + FIELD);
  const entrants = picked.map((h, i) => ({
    horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
    strategy: STRATS[i % 4], condition: 3, fatigue: 20,
    weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes ?? [],
  }));
  const conditions = {
    raceId: 'u', distance: DIST, surface: 'turf',
    trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
  };
  const winners = new Map(), top3 = new Map();
  const times = [];
  for (let seed = 1; seed <= TRIALS; seed += 1) {
    const r = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
    const order = r.order.map((e) => Number(e.horseId));
    winners.set(order[0], (winners.get(order[0]) ?? 0) + 1);
    for (const g of order.slice(0, 3)) top3.set(g, (top3.get(g) ?? 0) + 1);
    times.push(r.order[0].timeSec ?? 0);
  }
  return { winners, top3, pace: paceOf(entrants, DEFAULT_RACE_BALANCE).pace, times };
}

console.log('# ★レースに不確定さはあるか（同じ出走表・乱数だけ ' + TRIALS + ' 通り）');
console.log('');
for (const off of [0, 40, 120]) {
  const { winners, top3, pace } = trial(off);
  const top = [...winners.entries()].sort((a, b) => b[1] - a[1]);
  const distinctWinners = winners.size;
  const favShare = (top[0][1] / TRIALS);
  // ★3着以内が「毎回同じ3頭」なら、不確定さはゼロ
  const alwaysTop3 = [...top3.values()].filter((v) => v === TRIALS).length;
  console.log(`  【プール ${off}〜】ペース ${pace}`);
  console.log(`    勝った馬の種類      : ${distinctWinners} 頭 / ${FIELD} 頭`);
  console.log(`    ★最多勝ち馬の占有率 : ${(favShare * 100).toFixed(1)}%（1頭が何割勝つか）`);
  console.log(`    ★毎回3着以内の馬    : ${alwaysTop3} 頭（3なら**着順は完全に固定**）`);
  console.log('');
}
console.log('★読み方: 勝ち馬が1〜2頭に集中し、毎回3着以内の馬が3頭なら、');
console.log('  **乱数を変えても結果が動かない＝観戦に予想の余地がない**ということです。');
