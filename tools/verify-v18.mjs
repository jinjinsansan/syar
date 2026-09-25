// @ts-check
/**
 * ★V-18 — **枠順が結果を決めないこと・ただし距離ロスは実在すること**（正典 §13.2・D-071）
 *
 * ```
 * ① 枠順と着順の順位相関 |ρ| ≤ 0.10   （★枠で決まるゲームにしない）
 * ② 最内と最外の走行距離差が 4〜12 馬身
 *    ★下限が無いと「w を全部ゼロにする」のが最大余裕になり、
 *      D-065 が何もしていない状態を通してしまう
 * ②b 枠間の平均差 ≤ 1 馬身（D-090）
 * ```
 *
 * 【★なぜ「馬身」ではなく「相関」で縛るか】（裁定）
 *   > **枠で決まるゲームになっていないか**が、本当に問いたいことだから。
 *
 * 実行: npx tsx tools/verify-v18.mjs [--races 2000] [--field 12] [--legacy-conditions | --venues]
 */
/**
 * ⚠️ ★**測り方は `tools/lib/v18.mjs` の 1 か所**にあります（★2026-08-31・D-052）。
 *    ★検定（CI・R-32）と半径の地図（指示書 §4-2）も**同じ関数**を呼びます。
 *    ★ここに 2 つ目の実装を書き戻さないこと。
 *
 * 【★既定は本番の条件（2026-09-15・指示書 VW §7-1・R-31）】
 *   ★本番の番組に現れる（場 × 距離）の組すべて（`productionV18Combos`・1 週分）を、★**凍結した走路の形**で測ります。
 *   ★`--legacy-conditions` … ★旧来（`DEFAULT_OVAL` × 4 距離）。★出力は従来と同じ
 *   ★`--venues` … ★重賞 50 鞍の（場 × 距離）。★凍結した形で測るので `cornerRadiiM` も運びます（F-11 の是正）
 */
import { VENUES, GRADED_RACES, frozenCourseOf, venueById } from '@star/scheduler';
import {
  measureV18, gateBiasV18, loadV18Pool, productionV18Combos, V18_BAND,
} from './lib/v18.mjs';

const POOL = loadV18Pool();
const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const RACES = num('--races', 2000);
const FIELD = num('--field', 12);
const DISTANCES = [1200, 1600, 2000, 2400];
const LEGACY = argv.includes('--legacy-conditions');
const VENUE_MODE = argv.includes('--venues');

const fails = [];

/** ★（場 × 距離）の組を凍結した形で測って 1 行出す */
function measureCombo(label, dist, frozen) {
  const m = measureV18(dist, undefined, { races: RACES, field: FIELD, pool: POOL, frozen });
  const b = gateBiasV18(dist, undefined, { field: FIELD, frozen });
  if (!m.ok1) fails.push(`${label} ${dist}m ① 枠順と着順の相関 ${m.rho.toFixed(3)}（許容 ±${V18_BAND.rhoMax}）`);
  if (!m.ok2) fails.push(`${label} ${dist}m ②a 内外差 ${m.lengths.toFixed(1)}馬身（許容 ${V18_BAND.lengthsMin}〜${V18_BAND.lengthsMax}）`);
  if (!b.ok) fails.push(`${label} ${dist}m ②b 枠間の平均差 ${b.lengths.toFixed(3)}馬身（許容 ≤${V18_BAND.gateBiasMax}）`);
  console.log(`  ${label.padEnd(11)} ${String(dist).padStart(4)}m   ${(m.rho >= 0 ? '+' : '') + m.rho.toFixed(3)} ${m.ok1 ? '○' : '★×'}`
    + `      ${m.lengths.toFixed(1).padStart(5)} 馬身 ${m.ok2 ? '○' : '★×'}`
    + `      ${b.lengths.toFixed(3)} 馬身 ${b.ok ? '○' : '★×'}`
    + `     ${m.ok1 && m.ok2 && b.ok ? 'PASS' : '★FAIL'}`);
}

if (LEGACY) {
  console.log(`# ★V-18 — 枠順が結果を決めないこと・ただし距離ロスは実在すること（★旧来の条件: DEFAULT_OVAL）`);
  console.log(`  ${RACES} レース × ${DISTANCES.length} 距離 / ${FIELD}頭\n`);
  console.log('  距離   ①枠順と着順の相関   ②内外差（馬身）        判定');
  for (const dist of DISTANCES) {
    const m = measureV18(dist, undefined, { races: RACES, field: FIELD, pool: POOL });
    if (!m.ok1) fails.push(`${dist}m ① 枠順と着順の相関 ${m.rho.toFixed(3)}（許容 ±0.10）`);
    if (!m.ok2) fails.push(`${dist}m ② 内外差 ${m.lengths.toFixed(1)}馬身（許容 4〜12）`);
    console.log(`  ${String(dist).padStart(4)}m      ${(m.rho >= 0 ? '+' : '') + m.rho.toFixed(3)}  ${m.ok1 ? '○' : '★×'}`
      + `      ${m.lengths.toFixed(1).padStart(5)} 馬身（${m.meanSpread.toFixed(1)}m） ${m.ok2 ? '○' : '★×'}`
      + `     ${m.ok1 && m.ok2 ? 'PASS' : '★FAIL'}`);
  }
} else if (VENUE_MODE) {
  /**
   * ★**10 場 × その競馬場に実際に組まれている距離**で測ります（★B案 ③）。
   *
   * ⚠️ ★ここは ★**着順まで**見ています（`resolveRace`）。★`_venueverify.mjs` の「①の前身」
   *    （枠順と距離ロス）ではなく、★**V-18 ① そのもの**です。
   */
  console.log(`# ★V-18 — ★競馬場 10 場（★重賞に組まれている距離だけ・凍結した走路の形）`);
  console.log(`  ${RACES} レース / ${FIELD}頭\n`);
  console.log('  競馬場        距離   ①枠順と着順   ②a内外差（馬身）   ②b枠間の平均差   判定');
  for (const v of VENUES) {
    const dists = [...new Set(GRADED_RACES.filter((r) => r.venueId === v.id).map((r) => r.distanceM))].sort((a, b) => a - b);
    for (const dist of dists) measureCombo(v.name, dist, frozenCourseOf(v.id));
  }
} else {
  const combos = productionV18Combos();
  console.log(`# ★V-18 — ★本番の番組の（場 × 距離）${combos.length} 組（凍結した走路の形）`);
  console.log(`  ${RACES} レース / ${FIELD}頭 ／ ★旧来の条件は --legacy-conditions\n`);
  console.log('  競馬場        距離   ①枠順と着順   ②a内外差（馬身）   ②b枠間の平均差   判定');
  for (const c of combos) measureCombo(venueById(c.venueId).name, c.distance, c.frozen);
}

console.log('');
if (fails.length > 0) {
  console.log('★★FAIL — V-18');
  for (const f of fails) console.log(`  ${f}`);
  process.exit(1);
}
console.log('★PASS — 枠順は結果を決めておらず、距離ロスは実在しています');
