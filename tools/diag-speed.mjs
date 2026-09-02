/**
 * ★画面上の速さがどう変化しているかを測る（オーナー指摘 ⑤⑨）
 *
 *   ⑤「途中でグングンスピードが上がるが不自然」
 *   ⑨「他の馬に追いつく時も不自然」
 *
 * ★**目で見た違和感を、数字にします。** 見えるのは「画面上の速さ」なので、
 *   **表示1秒あたり何メートル進むか**を出します。
 *
 * 実行: npx tsx tools/diag-speed.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf } from '@star/race-engine';
import { replayPositionModel, timeWarpFor, knotsFor, DEFAULT_PHASE_RATES } from '@star/render';

const SEED = 42, OWN = 3, DIST = 1600, FIELD = 12;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));

const start = (SEED * 13) % Math.max(1, POOL.length - FIELD);
const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
  horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
  distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
  strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
  strategy: STRATS[(i + SEED) % 4], condition: 3, fatigue: 20,
  weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
}));
const conditions = { raceId: 'sp', distance: DIST, surface: 'turf', trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55 };
const result = resolveRace({ conditions, entrants, seed: SEED, balance: DEFAULT_RACE_BALANCE });
const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);

function profile(jostle, rates) {
  const model = replayPositionModel({
    distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
    jostle, jostleSeed: SEED * 2654435761,
  });
  const warp = timeWarpFor(knotsFor(boundaries, OWN, model.straightMeters), rates);
  const out = [];
  const dt = 0.2;
  for (let d = 0; d + dt <= warp.displaySec; d += dt) {
    const a = model.at(warp.raceSecAt(d)).find((h) => h.gate === OWN).meters;
    const b = model.at(warp.raceSecAt(d + dt)).find((h) => h.gate === OWN).meters;
    /**
     * ★ゴール線をまたぐ標本を除きます。
     *   ⚠️ 最初は「始点がゴール後」だけ除いていました。**終点がゴール後の標本**が残り、
     *      位置が頭打ちになるので **速度 0.4m/s** と出て、
     *      ★存在しない「馬が止まる不具合」を追いかけました。
     */
    if (a >= DIST - 1e-6 || b >= DIST - 1e-6) continue;
    out.push({ d, v: (b - a) / dt, m: a });
  }
  return { out, warp, model };
}

const show = (title, p) => {
  const vs = p.out.map((r) => r.v);
  // ★1標本ごとの変化（加速度）。ここが跳ねると「グングン」に見えます
  let maxJump = 0, jumpAt = 0;
  for (let i = 1; i < vs.length; i += 1) {
    const j = Math.abs(vs[i] - vs[i - 1]);
    if (j > maxJump) { maxJump = j; jumpAt = p.out[i].d; }
  }
  console.log(`  ${title}`);
  console.log(`    画面上の速さ: ${Math.min(...vs).toFixed(1)} 〜 ${Math.max(...vs).toFixed(1)} m/表示秒（${(Math.max(...vs) / Math.min(...vs)).toFixed(1)}倍）`);
  console.log(`    ★最大の段差: ${maxJump.toFixed(1)} m/s が 0.2秒で（表示 ${jumpAt.toFixed(1)}秒 / 残り${(DIST - p.out.find((r) => r.d === jumpAt).m).toFixed(0)}m）`);
};

console.log('# ★画面上の速さ（オーナー指摘 ⑤⑨）');
console.log('');
console.log('  ★実馬は 15〜17m/s。画面上でその2倍を超えると、1280px を 0.7秒未満で横切ります。');
console.log('');
console.log('  道中の送り | 最高速(m/表示秒) | 実馬比 | 最大の段差(0.2秒) | 総尺(秒)');
for (const cr of [1, 1.4, 1.8, 2.2, 2.6, 3]) {
  const p = profile(0.6, { cruise: cr, spurt: 1, straight: 0.7 });
  const vs = p.out.map((r) => r.v);
  let mj = 0;
  for (let i = 1; i < vs.length; i += 1) mj = Math.max(mj, Math.abs(vs[i] - vs[i - 1]));
  const mx = Math.max(...vs);
  console.log(`     ${String(cr).padStart(4)}倍  |      ${mx.toFixed(1).padStart(5)}       |  ${(mx / 16).toFixed(1)}倍  |      ${mj.toFixed(1).padStart(5)}        |  ${p.warp.displaySec.toFixed(0)}`);
}
console.log('');
console.log('  ★揺らぎの影響（道中1.8倍で固定）');
for (const j of [0, 0.05, 0.1, 0.2, 0.4, 0.6]) {
  const p = profile(j, { cruise: 1.4, spurt: 1, straight: 0.7 });
  const vs = p.out.map((r) => r.v);
  let mj = 0;
  for (let i = 1; i < vs.length; i += 1) mj = Math.max(mj, Math.abs(vs[i] - vs[i - 1]));
  console.log(`     揺らぎ ${j}: 最高速 ${Math.max(...vs).toFixed(1)} / 最低速 ${Math.min(...vs).toFixed(1)} / 段差 ${mj.toFixed(1)}`);
}
