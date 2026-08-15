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
import { replayPositionModel, DEFAULT_JOSTLE } from '@star/render';

/** ★製品の既定を輸入する（判定と製品で別々に持たない） */
const ji = process.argv.indexOf('--jostle');
const JOSTLE = ji >= 0 ? Number(process.argv[ji + 1]) : DEFAULT_JOSTLE;

const FIELD = 12, DIST = 1600, RACES = 200, SAMPLES = 120;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const pool = JSON.parse(readFileSync('docs/pool-staging.json', 'utf8'));
const arr = Array.isArray(pool) ? pool : (pool.horses ?? []);
const stock = arr.filter((h) => h.stats && Number.isFinite(h.stats.sp)).sort((a, b) => b.stats.sp - a.stats.sp);

/**
 * ★**通過順位で測ります。**
 *
 *   ⚠️ 最初は「隣り合う2頭の入れ替わり回数」を数えていました。**測るものが違いました。**
 *      馬群が密になるほど、わずかな動きで順位が入れ替わり、**回数は増えます**
 *      （実測: 隊列を 120m→26m に締めたら、追い抜きは 84.8→76.8 とほぼ変わらず）。
 *   ★実際のレースが「動かない」と言うときの単位は **通過順位** です:
 *      `8-8-8-4` … 1角・2角・3角・4角の順位。**前3つが同じ＝道中は動かない**。
 *   → **各コーナー相当の地点での順位**を取り、**その変化**を数えます。
 */
const CHECKPOINTS = [
  { left: 1300, name: '1角' },
  { left: 1000, name: '2角' },
  { left: 700, name: '3角' },
  { left: 400, name: '4角' },
  { left: 0, name: 'ゴール' },
];
const moves = CHECKPOINTS.slice(1).map(() => []);
const samples = [];

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
    jostle: JOSTLE, jostleSeed: seed,
  });

  const ranksAt = [];
  for (const cp of CHECKPOINTS) {
    let sec = model.raceSec;
    for (let i = 0; i <= 800; i += 1) {
      const t = (i / 800) * model.raceSec;
      const lead = Math.max(...model.at(t).map((h) => h.meters));
      if (DIST - lead <= cp.left) { sec = t; break; }
    }
    const order = [...model.at(sec)].sort((a2, b2) => b2.meters - a2.meters).map((h) => h.gate);
    const r = new Map();
    order.forEach((g, i) => r.set(g, i + 1));
    ranksAt.push(r);
  }
  for (let i = 1; i < CHECKPOINTS.length; i += 1) {
    let sum = 0;
    for (const g of ranksAt[0].keys()) sum += Math.abs(ranksAt[i].get(g) - ranksAt[i - 1].get(g));
    moves[i - 1].push(sum / FIELD);
  }
  if (seed <= 3) {
    samples.push([...ranksAt[0].keys()].slice(0, 4).map((g) => ranksAt.map((r) => r.get(g)).join('-')));
  }
}

const avg = (a) => a.reduce((s2, v) => s2 + v, 0) / a.length;
console.log('# ★通過順位の動き（' + RACES + ' レース・12頭）');
console.log('');
console.log('  区間          | 1頭あたりの順位変動（平均）');
for (let i = 1; i < CHECKPOINTS.length; i += 1) {
  const label = `${CHECKPOINTS[i - 1].name}→${CHECKPOINTS[i].name}`;
  console.log(`  ${label.padEnd(13)} | ${avg(moves[i - 1]).toFixed(2)} 着`);
}
console.log('');
console.log('  実際の表記の例（この実装から出したもの・1角-2角-3角-4角-ゴール）');
for (const s2 of samples) console.log(`    ${s2.join('  ')}`);
console.log('');

console.log('★実際のレース（中継の解説より）:');
console.log('  「前からシンガリまで**10馬身くらいで一団**で進んでいきます」');
console.log('  「**隊列特に変わらずに**（道中を）通過」');
console.log('  「先頭から最後方までは10馬身。**ひとかたまりで第4コーナーから直線に向かいます**」');
console.log('  通過順位 `8-8-8-4` — ★**前3つが同じ＝道中は動かない**。動くのは4角以降');
console.log('');
console.log('★つまり本来は: 道中の追い抜き ≒ 0 / 直線に集中 / 隊列は 10馬身（24m）');
