/**
 * ★V-17 — **レースがレースに見えるか**（裁定 2026-08-13）
 *
 *   ① 勝ち時計が距離ごとに現実的な範囲（**1600m で 93〜101秒**）
 *   ② 1着と最下位の差が **2〜4秒**（1600m）
 *
 * 【★②に下限があるのはなぜか】（裁定より）
 *   > 上限だけなら `TIME_GAP_FACTOR = 0` が最大余裕になり、**全馬同着**という別の破綻を通します。
 *   > 毎レース横一線の写真判定も、415m 差と同じくらい壊れています。
 *   ★R-16（「この基準を最も安易に満たす方法は何か」）を通した基準です。
 *
 * 【★この道具が言えないこと】
 *   着順の正しさは見ていません。**タイムの見え方**だけです。
 *   ⚠️ `TIME_GAP_FACTOR` は**表示と記録にしか影響しません**（着順・V-4/V-5/V-6・払戻に触れない）。
 *
 * 実行: npx tsx tools/verify-v17.mjs [--factor 0.05] [--races 200]
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace } from '@star/race-engine';

const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const RACES = num('--races', 200);
const FACTOR = num('--factor', DEFAULT_RACE_BALANCE.TIME_GAP_FACTOR);
const FIELD = 12;
const S = ['nige', 'senko', 'sashi', 'oikomi'];
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));

/** ★1600m の基準は裁定で決まっています。他の距離は**速度**が同じ範囲に入るかで見ます */
const V17_1600 = { winMin: 93, winMax: 101, gapMin: 2, gapMax: 4 };
const DISTANCES = [1200, 1600, 2000, 2400];

const balance = { ...DEFAULT_RACE_BALANCE, TIME_GAP_FACTOR: FACTOR };
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor((s.length - 1) * p)))];
};

console.log('# ★V-17 — レースがレースに見えるか');
console.log(`  TIME_GAP_FACTOR = ${FACTOR} / ${RACES} レース / ${FIELD}頭`);
console.log('');
console.log('  距離 | 勝ち時計(中央) | 速度   | 1着〜最下位の差  p10 / 中央 / p90');

const rows = [];
for (const dist of DISTANCES) {
  const wins = [], gaps = [];
  for (let seed = 1; seed <= RACES; seed += 1) {
    const st = (seed * 13) % Math.max(1, POOL.length - FIELD);
    const ent = POOL.slice(st, st + FIELD).map((h, i) => ({
      horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
      distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
      strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
      strategy: S[(i + seed) % 4], condition: 3, fatigue: 20,
      weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
    }));
    const c = {
      raceId: `v17-${dist}-${seed}`, distance: dist, surface: 'turf',
      trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
    };
    const r = resolveRace({ conditions: c, entrants: ent, seed, balance });
    const ts = r.order.map((e) => e.timeSec).filter(Number.isFinite);
    if (ts.length < 2) continue;
    wins.push(Math.min(...ts));
    gaps.push(Math.max(...ts) - Math.min(...ts));
  }
  const w = pct(wins, 0.5);
  const row = {
    dist, win: w, speed: dist / w,
    g10: pct(gaps, 0.1), g50: pct(gaps, 0.5), g90: pct(gaps, 0.9),
  };
  rows.push(row);
  console.log(`  ${String(dist).padStart(4)} | ${w.toFixed(1).padStart(9)}秒   | ${row.speed.toFixed(2)}m/s | `
    + `${row.g10.toFixed(2).padStart(5)} / ${row.g50.toFixed(2).padStart(5)} / ${row.g90.toFixed(2).padStart(5)} 秒`);
}

console.log('');
const r16 = rows.find((x) => x.dist === 1600);
const fails = [];
// ① 勝ち時計（1600m は裁定の範囲そのもの）
if (!(r16.win >= V17_1600.winMin && r16.win <= V17_1600.winMax)) {
  fails.push(`① 1600m の勝ち時計 ${r16.win.toFixed(1)}秒（範囲 ${V17_1600.winMin}〜${V17_1600.winMax}）`);
}
/**
 * ★**他の距離は判定しません。**
 *
 *   ⚠️ 最初は「速度が 1600m と同じ範囲に入るか」で落としていました。
 *      ★**その範囲は私が作った数字です。** 裁定にあるのは 1600m の 93〜101秒だけで、
 *      実際の競走も距離が伸びるほど平均速度は落ちます（`SPEED_DISTANCE_DECAY_PER_1000M`）。
 *      **発明した基準でゲートを落とすのは、通すのと同じくらい悪い**ので、やめました。
 *   → 数字は**出すだけ**にして、距離ごとの範囲は照会に回します（Q-P4-26）。
 */
// ② 1着〜最下位の差（★上限だけでなく下限も見る）
if (!(r16.g50 >= V17_1600.gapMin && r16.g50 <= V17_1600.gapMax)) {
  fails.push(`② 1600m の差（中央）${r16.g50.toFixed(2)}秒（範囲 ${V17_1600.gapMin}〜${V17_1600.gapMax}）`);
}
if (r16.g10 < V17_1600.gapMin * 0.5) {
  fails.push(`② ★下側が潰れている: p10 ${r16.g10.toFixed(2)}秒（毎レース横一線は別の破綻）`);
}
if (r16.g90 > V17_1600.gapMax * 2) {
  fails.push(`② ★上側が伸びすぎ: p90 ${r16.g90.toFixed(2)}秒`);
}

console.log('【判定】');
if (fails.length === 0) console.log('  ★V-17 PASS（①②）');
else for (const f of fails) console.log(`  ★★FAIL — ${f}`);
console.log('');
console.log('★注意: これはタイムの**見え方**だけを見ています。着順は見ていません。');
process.exit(fails.length === 0 ? 0 : 1);
