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
import { VENUES, GRADED_RACES } from '@star/scheduler';

const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const RACES = num('--races', 2000);
const FIELD = num('--field', 12);
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const DISTANCES = [1200, 1600, 2000, 2400];
/**
 * ★`--venues` を付けると ★**競馬場 10 場 × 実際に組まれている距離**で測ります（★B案 ③）。
 * ⚠️ ★付けないときの出力は**従来と 1 文字も変わりません**。
 */
const VENUE_MODE = argv.includes('--venues');

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

/**
 * ★**1 つの（距離・走路の形）を測る。**
 *
 * ⚠️ ★`spec` を省くと `DEFAULT_OVAL`。★**省いたときの値は 2026-08-30 以前と完全に同じ**です
 *    （★関数に切り出しただけで、中身は 1 行も変えていません）。
 *
 * ★`spec` を渡すと、★**その競馬場の走路**で着順まで判定します（B案 ②）。
 */
function measureOne(dist, spec) {
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
      /** ★競馬場の走路の形。★省くと `DEFAULT_OVAL`（＝従来と同じ） */
      course: spec,
    };
    const res = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
    for (const e of res.order) {
      gates.push(Number(e.horseId));
      places.push(e.finishPosition);
    }
    const extras = entrants.map((e) => laneExtraM(e.gate, FIELD, dist, seed, spec));
    spreads.push(Math.max(...extras) - Math.min(...extras));
  }
  const rho = spearman(gates, places);
  const meanSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const lengths = meanSpread / HORSE_LENGTH_M;
  return { rho, meanSpread, lengths, ok1: Math.abs(rho) <= 0.10, ok2: lengths >= 4 && lengths <= 12 };
}

const fails = [];

if (VENUE_MODE) {
  /**
   * ★**10 場 × その競馬場に実際に組まれている距離**で測ります（★B案 ③）。
   *
   * ⚠️ ★ここは ★**着順まで**見ています（`resolveRace`）。★`_venueverify.mjs` の「①の前身」
   *    （枠順と距離ロス）ではなく、★**V-18 ① そのもの**です。
   */
  console.log(`# ★V-18 — ★競馬場 10 場（★実際に組まれている距離だけ）`);
  console.log(`  ${RACES} レース / ${FIELD}頭\n`);
  console.log('  競馬場        距離   ①枠順と着順   ②内外差（馬身）      判定');
  for (const v of VENUES) {
    const spec = { lapM: v.lapM, homeStretchM: v.homeStretchM, widthM: v.widthM };
    const dists = [...new Set(GRADED_RACES.filter((r) => r.venueId === v.id).map((r) => r.distanceM))].sort((a, b) => a - b);
    for (const dist of dists) {
      const m = measureOne(dist, spec);
      if (!m.ok1) fails.push(`${v.name} ${dist}m ① 枠順と着順の相関 ${m.rho.toFixed(3)}（許容 ±0.10）`);
      if (!m.ok2) fails.push(`${v.name} ${dist}m ② 内外差 ${m.lengths.toFixed(1)}馬身（許容 4〜12）`);
      console.log(`  ${v.name.padEnd(11)} ${String(dist).padStart(4)}m   ${(m.rho >= 0 ? '+' : '') + m.rho.toFixed(3)} ${m.ok1 ? '○' : '★×'}`
        + `      ${m.lengths.toFixed(1).padStart(5)} 馬身 ${m.ok2 ? '○' : '★×'}`
        + `     ${m.ok1 && m.ok2 ? 'PASS' : '★FAIL'}`);
    }
  }
} else {
  console.log(`# ★V-18 — 枠順が結果を決めないこと・ただし距離ロスは実在すること`);
  console.log(`  ${RACES} レース × ${DISTANCES.length} 距離 / ${FIELD}頭\n`);
  console.log('  距離   ①枠順と着順の相関   ②内外差（馬身）        判定');
  for (const dist of DISTANCES) {
    const m = measureOne(dist, undefined);
    if (!m.ok1) fails.push(`${dist}m ① 枠順と着順の相関 ${m.rho.toFixed(3)}（許容 ±0.10）`);
    if (!m.ok2) fails.push(`${dist}m ② 内外差 ${m.lengths.toFixed(1)}馬身（許容 4〜12）`);
    console.log(`  ${String(dist).padStart(4)}m      ${(m.rho >= 0 ? '+' : '') + m.rho.toFixed(3)}  ${m.ok1 ? '○' : '★×'}`
      + `      ${m.lengths.toFixed(1).padStart(5)} 馬身（${m.meanSpread.toFixed(1)}m） ${m.ok2 ? '○' : '★×'}`
      + `     ${m.ok1 && m.ok2 ? 'PASS' : '★FAIL'}`);
  }
}

console.log('');
if (fails.length > 0) {
  console.log('★★FAIL — V-18');
  for (const f of fails) console.log(`  ${f}`);
  process.exit(1);
}
console.log('★PASS — 枠順は結果を決めておらず、距離ロスは実在しています');
