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
/**
 * ⚠️ ★**測り方は `tools/lib/v18.mjs` の 1 か所**にあります（★2026-08-31・D-052）。
 *    ★検定（CI・R-32）と半径の地図（指示書 §4-2）も**同じ関数**を呼びます。
 *    ★ここに 2 つ目の実装を書き戻さないこと。
 */
import { VENUES, GRADED_RACES } from '@star/scheduler';
import { measureV18, loadV18Pool, V18_BAND } from './lib/v18.mjs';

const POOL = loadV18Pool();
const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const RACES = num('--races', 2000);
const FIELD = num('--field', 12);
const DISTANCES = [1200, 1600, 2000, 2400];
/**
 * ★`--venues` を付けると ★**競馬場 10 場 × 実際に組まれている距離**で測ります（★B案 ③）。
 * ⚠️ ★付けないときの出力は**従来と 1 文字も変わりません**。
 */
const VENUE_MODE = argv.includes('--venues');

/**
 * ★**1 つの（距離・走路の形）を測る。**
 * ⚠️ ★中身は `tools/lib/v18.mjs` にあります。★ここは引数の受け渡しだけです。
 */
function measureOne(dist, spec) {
  return measureV18(dist, spec, { races: RACES, field: FIELD, pool: POOL });
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
