/**
 * ★V-17（走破タイムの分布・正典 §13.2 / §8.7）を測る
 *
 *   ① 勝ち時計が距離ごとに現実的な範囲（1600m で **93〜101 秒**）
 *   ② 1 着と最下位の差が **2〜4 秒**（1600m）
 *      ★上限だけでなく**下限も要る** — 0 にすると全馬同着になり、毎レース横一線という別の破綻になる
 *
 * 【なぜこの道具か（レビュー側裁定 2026-08-21）】
 *   > V-17 は「レース数」が要るだけで、**世代数も繁殖牝馬数も要りません。**
 *   > 40 年 × 400 頭 × 60,000 レースは V-1 / V-2 系のための条件です。
 *
 *   ★開発側は「全量で測るか、保留か」の二択を立てたが、**立て方が違っていた。**
 *     V-17 は 1 レースごとの統計なので、縮小条件のまま数分で出る。
 *
 * 【★横位置の広がりとの関係】
 *   D-064: `TIME_GAP_FACTOR` は**表示と記録にしか影響せず、着順・V-4/V-5/V-6・払戻に触れない**。
 *   → 帯を出ても `LANE_REVEAL_FULL_RUN` の否定にはならず、写像側を直せば済む。
 *
 * 【★既定は本番の条件（2026-09-15・指示書 VW §7-1・R-31）】
 *   ★10 場それぞれで、★走路の形は**凍結した形**（`frozenCourseOf` → `conditionsFromFrozen`）。★判定は場ごと。
 *   ★`--legacy-conditions` … ★旧来の条件（`DEFAULT_OVAL`）。★出力は従来と同じ
 *
 * 実行: npx tsx tools/verify-v17-time.mjs [--races 3000] [--distance 1600] [--legacy-conditions]
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, conditionsFromFrozen } from '@star/race-engine';
import { VENUES, frozenCourseOf } from '@star/scheduler';

const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const RACES = num('--races', 3000);
const DIST = num('--distance', 1600);
const LEGACY = argv.includes('--legacy-conditions');
const FIELD = 12;
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const SEEDS = [42, 7, 2026, 31337];

/** 正典 §13.2 の帯（1600m） */
const WIN_TIME = [93, 101];
const GAP = [2, 4];

/** ★1 つの走路の形で測る。★`frozen` を省くと旧来（`course` なし＝DEFAULT_OVAL） */
function collect(frozen) {
  const rows = [];
  for (const baseSeed of SEEDS) {
    for (let r = 0; r < Math.floor(RACES / SEEDS.length); r += 1) {
      const seed = baseSeed * 1_000_003 + r;
      const start = (seed * 13) % Math.max(1, POOL.length - FIELD);
      const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
        horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
        distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
        strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
        strategy: STRATS[(i + seed) % 4], condition: 3, fatigue: 20,
        weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
      }));
      const base = { raceId: `t${seed}`, distance: DIST, surface: 'turf', trackCondition: 'good' };
      const result = resolveRace({
        conditions: frozen === undefined
          ? { ...base, courseShape: 'oval', baseWeightKg: 55 }
          : conditionsFromFrozen(frozen, base),
        entrants, seed, balance: DEFAULT_RACE_BALANCE,
      });
      void paceOf;
      const times = result.order.map((e) => e.timeSec ?? e.finishSec ?? undefined).filter((t) => typeof t === 'number');
      if (times.length < 2) continue;
      rows.push({ win: times[0], gap: times[times.length - 1] - times[0] });
    }
  }
  return rows;
}

const stat = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
  return { mean, p01: q(0.01), p50: q(0.5), p99: q(0.99), min: s[0], max: s[s.length - 1] };
};
const inBand = (xs, [lo, hi]) => xs.filter((x) => x >= lo && x <= hi).length / xs.length;

/** ★表示と判定（★旧来の出力の形を保つ） */
function report(rows, title) {
  if (rows.length === 0) {
    console.error('★走破タイムが取れませんでした。`resolveRace` の返り値の項目名を確認してください');
    process.exit(2);
  }
  const w = stat(rows.map((r) => r.win));
  const g = stat(rows.map((r) => r.gap));
  console.log(`\n=== V-17 走破タイムの分布（${title}${DIST}m / ${rows.length} レース / 4 シード）===\n`);
  console.log(`① 勝ち時計   帯 ${WIN_TIME[0]}〜${WIN_TIME[1]} 秒`);
  console.log(`   平均 ${w.mean.toFixed(2)}s / 中央 ${w.p50.toFixed(2)}s / 1%点 ${w.p01.toFixed(2)}s / 99%点 ${w.p99.toFixed(2)}s`);
  console.log(`   帯の中に入っている割合: ${(inBand(rows.map((r) => r.win), WIN_TIME) * 100).toFixed(1)}%`);
  console.log('');
  console.log(`② 1着と最下位の差   帯 ${GAP[0]}〜${GAP[1]} 秒`);
  console.log(`   平均 ${g.mean.toFixed(2)}s / 中央 ${g.p50.toFixed(2)}s / 1%点 ${g.p01.toFixed(2)}s / 99%点 ${g.p99.toFixed(2)}s`);
  console.log(`   帯の中に入っている割合: ${(inBand(rows.map((r) => r.gap), GAP) * 100).toFixed(1)}%`);
  console.log('');
  const ok1 = w.mean >= WIN_TIME[0] && w.mean <= WIN_TIME[1];
  const ok2 = g.mean >= GAP[0] && g.mean <= GAP[1];
  console.log(`  ${ok1 ? '✅' : '🔴'} ① 勝ち時計の平均が帯の中`);
  console.log(`  ${ok2 ? '✅' : '🔴'} ② 着差の平均が帯の中`);
  return ok1 && ok2;
}

let allOk = true;
if (LEGACY) {
  allOk = report(collect(undefined), '');
} else {
  console.log(`条件: 本番（10 場・凍結した走路の形）。★旧来は --legacy-conditions`);
  for (const v of VENUES) {
    if (!report(collect(frozenCourseOf(v.id)), `${v.name} `)) allOk = false;
  }
}
console.log('\n  ⚠️ ★D-064: `TIME_GAP_FACTOR` は表示と記録にしか影響せず、着順・V-4/V-5/V-6・払戻に触れない。');
console.log('     帯を出ても横位置の広がり（`LANE_REVEAL_FULL_RUN`）の否定にはならず、写像側で直せる。');
if (!allOk) process.exit(1);
