/**
 * ★V-18 — **枠順が結果を決めないこと・ただし距離ロスは実在すること**（正典 §13.2・D-071）
 *
 * ```
 * ① 枠順と着順の順位相関 |ρ| ≤ 0.10   （★枠で決まるゲームにしない）
 * ② 最内と最外の走行距離差が 4〜12 馬身
 *    ★下限が無いと「w を全部ゼロにする」のが最大余裕になり、
 *      D-065 が何もしていない状態を通してしまう
 * ```
 *
 * 【★なぜ「馬身」ではなく「相関」で縛るか】（裁定）
 *   > **枠で決まるゲームになっていないか**が、本当に問いたいことだから。
 *
 * 実行: npx tsx tools/verify-v18.mjs [--races 2000] [--field 12]
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, laneExtraM, HORSE_LENGTH_M } from '@star/race-engine';

const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const RACES = num('--races', 2000);
const FIELD = num('--field', 12);
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const DISTANCES = [1200, 1600, 2000, 2400];

/** スピアマンの順位相関 */
function spearman(xs, ys) {
  const n = xs.length;
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - mx, dy = ry[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

console.log(`# ★V-18 — 枠順が結果を決めないこと・ただし距離ロスは実在すること`);
console.log(`  ${RACES} レース × ${DISTANCES.length} 距離 / ${FIELD}頭\n`);

const fails = [];
console.log('  距離   ①枠順と着順の相関   ②内外差（馬身）        判定');
for (const dist of DISTANCES) {
  const gates = [];
  const places = [];
  const spreads = [];
  for (let r = 0; r < RACES; r++) {
    const seed = r * 2654435761 + dist;
    /**
     * ⚠️ ★**枠に入れる馬を混ぜます。**
     *    最初は `POOL` の順にそのまま枠 1〜12 へ入れ、脚質も `(i + r) % 4` で振っていました。
     *    → ★**枠と「馬の能力・脚質」が相関**し、
     *      **距離ロスを入れる前から 枠と着順の相関が 0.102** と出ました。
     *    ★**道具が作った相関でした。** 測っていたのはエンジンではありません。
     */
    const startIdx = (r * 13) % Math.max(1, POOL.length - FIELD);
    const picked = POOL.slice(startIdx, startIdx + FIELD);
    const order = picked.map((_, i) => i);
    /**
     * ⚠️ ★**最初は「弱いハッシュの剰余」でシャッフルしていました。**
     *    `(seed ^ imul(i+1, 定数)) % (i+1)` — 混ぜが足りず、
     *    ★**枠と馬の能力が均されず**、距離ロスを入れる前から相関 0.078 が出ました。
     *    ★**測っていたのはエンジンではなく、私のシャッフルでした**（道具に裏切られた3件目）。
     * → ★**まともな擬似乱数**（mulberry32）で Fisher-Yates。
     */
    let st = (seed ^ 0x6d2b79f5) >>> 0;
    const rnd = () => {
      st = (st + 0x6d2b79f5) >>> 0;
      let t = st;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const entrants = order.map((src, i) => {
      const h = picked[src];
      return {
        horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
        distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
        strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
        strategy: STRATS[(src + r) % 4], condition: 3, fatigue: 20,
        weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
      };
    });
    const conditions = {
      raceId: `v18-${dist}-${r}`, distance: dist, surface: 'turf',
      trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
    };
    const res = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
    for (const e of res.order) {
      gates.push(Number(e.horseId));
      places.push(e.finishPosition);
    }
    const extras = entrants.map((e) => laneExtraM(e.gate, FIELD, dist, seed));
    spreads.push(Math.max(...extras) - Math.min(...extras));
  }
  const rho = spearman(gates, places);
  const meanSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const lengths = meanSpread / HORSE_LENGTH_M;
  const ok1 = Math.abs(rho) <= 0.10;
  const ok2 = lengths >= 4 && lengths <= 12;
  if (!ok1) fails.push(`${dist}m ① 枠順と着順の相関 ${rho.toFixed(3)}（許容 ±0.10）`);
  if (!ok2) fails.push(`${dist}m ② 内外差 ${lengths.toFixed(1)}馬身（許容 4〜12）`);
  console.log(`  ${String(dist).padStart(4)}m      ${(rho >= 0 ? '+' : '') + rho.toFixed(3)}  ${ok1 ? '○' : '★×'}`
    + `      ${lengths.toFixed(1).padStart(5)} 馬身（${meanSpread.toFixed(1)}m） ${ok2 ? '○' : '★×'}`
    + `     ${ok1 && ok2 ? 'PASS' : '★FAIL'}`);
}

console.log('');
if (fails.length > 0) {
  console.log('★★FAIL — V-18');
  for (const f of fails) console.log(`  ${f}`);
  process.exit(1);
}
console.log('★PASS — 枠順は結果を決めておらず、距離ロスは実在しています');
