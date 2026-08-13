/**
 * ★ゲージ（余力）は正しい向きを向いているか
 *
 * 【疑い】
 *   `staminaRatio = 1 − (sec − spurtSec) / (finishSec − spurtSec)`
 *   ★分母は「勝負所からゴールまでの所要時間」です。
 *     **上がりが速い馬ほど分母が小さい → 同じ時刻で余力が低く見えます。**
 *   つまり**勝つ馬ほどバテて見える**のではないか。
 *
 * 【なぜ重い疑いか】
 *   ゲージは §12.6 の**自馬の唯一の読み取り**で、C-6（仕掛け）の判断材料そのものです。
 *   ★向きが逆なら、**仕掛けの判断を毎回裏切ります**。
 *
 * 実行: npx tsx tools/diag-gauge.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf } from '@star/race-engine';
import { replayPositionModel } from '@star/render';

const FIELD = 12, DIST = 1600, RACES = 400;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const pool = JSON.parse(readFileSync('docs/pool-staging.json', 'utf8'));
const arr = Array.isArray(pool) ? pool : (pool.horses ?? []);
const stock = arr.filter((h) => h.stats && Number.isFinite(h.stats.sp)).sort((a, b) => b.stats.sp - a.stats.sp);

/** ★順位相関（スピアマン）。+ なら「余力が高い馬ほど上位」＝正しい向き */
function spearman(xs, ys) {
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length);
    idx.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const n = xs.length;
  const mx = (n - 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i += 1) {
    num += (rx[i] - mx) * (ry[i] - mx);
    dx += (rx[i] - mx) ** 2; dy += (ry[i] - mx) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

const byLeft = new Map([[800, []], [600, []], [400, []], [200, []]]);

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
    raceId: `g${seed}`, distance: DIST, surface: 'turf',
    trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
  };
  const result = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
  const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
  const model = replayPositionModel({
    distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400,
    boundaries: replayOf(result, (g) => entrants[g - 1].strategy, pace),
    jostle: 0,
  });
  const order = result.order.map((e) => Number(e.horseId));

  for (const left of byLeft.keys()) {
    // 先頭が残り left m になる時刻
    let sec = 0;
    for (let i = 0; i <= 600; i += 1) {
      const t = (i / 600) * model.raceSec;
      const lead = Math.max(...model.at(t).map((h) => h.meters));
      if (DIST - lead <= left) { sec = t; break; }
    }
    const at = model.at(sec);
    const stam = at.map((h) => h.staminaRatio);
    // ★着順（小さいほど上位）→ 符号を反転して「良さ」にする
    const good = at.map((h) => -order.indexOf(h.gate));
    byLeft.get(left).push(spearman(stam, good));
  }
}

console.log('# ★ゲージ（余力）は正しい向きを向いているか（' + RACES + ' レース）');
console.log('');
console.log('  余力と「最終的な良さ」の順位相関');
console.log('  ★+ なら「余力が高い馬ほど上位」＝正しい向き / − なら**逆**');
console.log('');
console.log('  ⚠️ ★**負になるのは式の選び方の問題ではありません。**');
console.log('     `BoundaryTimes` から作れる「余力」は、どう書いても**進捗の言い換え**です。');
console.log('     そして進んでいる馬が勝つので、**「残り」を示すバーは必ず逆を向きます。**');
console.log('     → 本当の余力は `intervention.ts` の `emptyAtMeter`（どこでバテるか）で、');
console.log('       ★**描画層に渡されていません**（Q-P4-21）。');
console.log('');
for (const [left, vs] of byLeft) {
  const m = vs.reduce((s, v) => s + v, 0) / vs.length;
  const mark = m < -0.1 ? '  ★★逆を向いています' : m > 0.1 ? '' : '  ★ほぼ無相関';
  console.log(`    残り${String(left).padStart(4)}m : ${m >= 0 ? '+' : ''}${m.toFixed(3)}${mark}`);
}
