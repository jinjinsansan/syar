/**
 * ★距離ロスが着順に与える影響の大きさ（★実装前の見積もり・D-065 手順1）
 *
 * 【裁定より】
 *   > 実装の前に、大きさを測ってください
 *   > 内外差 26.2馬身 ≒ 63m ≒ 1600m の 3.9% ／ RACE_RANDOM_K = 0.22 の雑音 ＝ 22%
 *   > 3.9% は 22% の雑音に十分収まります。K の再較正までは要らない見込みです。
 *
 * 【★この道具が測ること】
 *   「距離が 3.9% 増える」ことを**スコアの目減り**に置き換えたとき、
 *   ★**着順がどれだけ動くか**を、実際に resolveRace を回して見ます。
 *   ⚠️ **まだ実装しません。** 影響の大きさだけを見ます。
 *
 * 実行: npx tsx tools/diag-lane-impact.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace } from '@star/race-engine';
import { ovalCourse, laneExtraMeters, HORSE_LENGTH_M } from '@star/render';

const DIST = 1600, FIELD = 12, RACES = 300;
const S = ['nige', 'senko', 'sashi', 'oikomi'];
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const course = ovalCourse(DIST);

/** ★横位置ごとの、余計に走る距離と、その割合 */
const LANES = [2, 5, 8, 11, 14, 17];
console.log('# ★距離ロスの大きさ（実装前の見積もり）');
console.log('');
console.log('  内ラチから | 余計に走る | 距離に対する割合');
for (const w of LANES) {
  const ex = laneExtraMeters(course, 0, DIST, w);
  console.log(`  ${String(w).padStart(6)}m   | ${ex >= 0 ? '+' : ''}${ex.toFixed(1)}m (${(ex / HORSE_LENGTH_M).toFixed(1)}馬身) | ${((ex / DIST) * 100).toFixed(2)}%`);
}
const span = laneExtraMeters(course, 0, DIST, 17) - laneExtraMeters(course, 0, DIST, 2);
console.log('');
console.log(`  ★内外差 ${span.toFixed(1)}m ＝ ${(span / HORSE_LENGTH_M).toFixed(1)}馬身 ＝ 距離の ${((span / DIST) * 100).toFixed(2)}%`);
console.log(`  乱数の幅 RACE_RANDOM_K = ${DEFAULT_RACE_BALANCE.RACE_RANDOM_K} ＝ ${(DEFAULT_RACE_BALANCE.RACE_RANDOM_K * 100).toFixed(0)}%`);
console.log('');

/**
 * ★**スコアを「距離の割合」だけ目減りさせたら、着順はどれだけ動くか。**
 *   ⚠️ 本実装ではありません。**影響の大きさを見るための当て木**です。
 */
function run(penaltyOf) {
  let moved = 0, n = 0, winnerChanged = 0;
  for (let seed = 1; seed <= RACES; seed += 1) {
    const st = (seed * 13) % Math.max(1, POOL.length - FIELD);
    const mk = () => POOL.slice(st, st + FIELD).map((h, i) => ({
      horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
      distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
      strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
      strategy: S[(i + seed) % 4], condition: 3, fatigue: 20,
      weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
    }));
    const c = { raceId: `l${seed}`, distance: DIST, surface: 'turf', trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55 };
    const a = resolveRace({ conditions: c, entrants: mk(), seed, balance: DEFAULT_RACE_BALANCE });
    // ★当て木: 距離ロスぶんだけ「実質的に長い距離を走った」とみなし、能力を割り引く
    const ent = mk().map((e) => {
      const p = penaltyOf(e.gate);
      return { ...e, stats: Object.fromEntries(Object.entries(e.stats).map(([k, v]) => [k, v * (1 - p)])) };
    });
    const b = resolveRace({ conditions: c, entrants: ent, seed, balance: DEFAULT_RACE_BALANCE });
    const ra = new Map(a.order.map((e, i) => [e.horseId, i]));
    const rb = new Map(b.order.map((e, i) => [e.horseId, i]));
    for (const [id, i] of ra) { moved += Math.abs(i - rb.get(id)); n += 1; }
    if (a.order[0].horseId !== b.order[0].horseId) winnerChanged += 1;
  }
  return { move: moved / n, win: winnerChanged / RACES };
}

console.log('【★スコアを目減りさせたときの着順の動き（300レース）】');
console.log('  目減り | 1頭あたりの着順変動 | 勝ち馬が替わる割合');
for (const p of [0, 0.01, 0.02, 0.039, 0.06, 0.10]) {
  const r = run(() => p);   // ★全馬同じ目減り＝対照（着順は動かないはず）
  console.log(`  一律 ${(p * 100).toFixed(1)}% | ${r.move.toFixed(2)} 着 | ${(r.win * 100).toFixed(0)}%  ${p === 0 ? '★対照（0 のはず）' : '★一律なら動かないはず'}`);
}
console.log('');
console.log('  ★馬ごとに違う目減り（枠順を横位置に見立てる）');
for (const scale of [1, 2, 3]) {
  const r = run((gate) => {
    const w = 2 + ((gate - 1) / (FIELD - 1)) * 15;
    return (laneExtraMeters(course, 0, DIST, w) / DIST) * scale;
  });
  console.log(`  ×${scale} | ${r.move.toFixed(2)} 着 | ${(r.win * 100).toFixed(0)}%`);
}
