/**
 * ★`w`（内/外）による**距離ロスの大きさ**を測る（D-065 の手順①・D-069）
 *
 * 【なぜ要るか】D-065 の手順:
 *   ★**①まず大きさを測る → ②実装して全ゲートの差分を報告 → ③帯を出たときだけ再較正**
 *
 *   ★**エンジンに入れる前に測ります。** `resolveRace` を触ると着順が動き、
 *   V-4 の較正に響くためです。
 *
 * 【何を測るか】
 *   いまの `w` の生成器（★シードから引き、段階的に開く・D-069）が作る横位置で、
 *   ★**1頭ぶんの余計な距離**が何メートルになるか。
 *   `laneExtraMeters` は**コーナーだけ**で `(w − 中心) × Δθ` を積みます。
 *
 * 実行: npx tsx tools/diag-lane-loss.mjs [--distance 1600] [--races 200]
 */
import { ovalCourse, laneExtraMeters, laneAt, TRACK_WIDTH_M, HORSE_LENGTH_M } from '@star/render';

const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const DIST = num('--distance', 1600);
const RACES = num('--races', 200);
const FIELD = 12;
const STEP = 20;

const course = ovalCourse(DIST);
console.log(`# ★距離ロスの大きさ（${DIST}m・${FIELD}頭・${RACES}レース）\n`);
console.log(`  走路の幅 ${course.widthM}m　1馬身 ${HORSE_LENGTH_M}m`);

/** 1レースぶん: 各馬の余計な距離 */
function lossOf(seed) {
  const out = [];
  for (let gate = 1; gate <= FIELD; gate++) {
    let extra = 0;
    for (let s = 0; s < DIST; s += STEP) {
      const w = laneAt(gate, FIELD, TRACK_WIDTH_M, DIST - s, DIST, seed);
      extra += laneExtraMeters(course, s, Math.min(DIST, s + STEP), w);
    }
    out.push({ gate, extra });
  }
  return out;
}

const perGate = Array.from({ length: FIELD }, () => []);
const spreads = [];
for (let r = 0; r < RACES; r++) {
  const l = lossOf((r + 1) * 2654435761);
  l.forEach((x, i) => perGate[i].push(x.extra));
  spreads.push(Math.max(...l.map((x) => x.extra)) - Math.min(...l.map((x) => x.extra)));
}

console.log('\n★枠ごとの余計な距離（平均 ± 幅）');
console.log('  枠   平均      最小 〜 最大        レース距離に対する割合');
for (let i = 0; i < FIELD; i++) {
  const v = perGate[i];
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  console.log(`  ${String(i + 1).padStart(2)}  ${mean.toFixed(1).padStart(6)}m`
    + `  ${Math.min(...v).toFixed(1).padStart(6)} 〜 ${Math.max(...v).toFixed(1).padStart(6)}m`
    + `     ${(mean / DIST * 100).toFixed(2)}%`);
}

const meanSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
console.log(`\n★1レースの中の「いちばん内を通った馬」と「いちばん外を回った馬」の差`);
console.log(`  平均 ${meanSpread.toFixed(1)}m = ★**${(meanSpread / HORSE_LENGTH_M).toFixed(1)}馬身**`
  + ` = レース距離の ${(meanSpread / DIST * 100).toFixed(2)}%`);
console.log(`  最大 ${Math.max(...spreads).toFixed(1)}m（${(Math.max(...spreads) / HORSE_LENGTH_M).toFixed(1)}馬身）`);

/** ★枠ごとの偏りがあるか（内枠が有利になりすぎていないか） */
const gateMeans = perGate.map((v) => v.reduce((a, b) => a + b, 0) / v.length);
const bias = Math.max(...gateMeans) - Math.min(...gateMeans);
console.log(`\n★枠による偏り ${bias.toFixed(1)}m（${(bias / HORSE_LENGTH_M).toFixed(1)}馬身）`);
console.log(`  ⚠️ ★大きすぎると「枠順で決まるゲーム」になります。`);
console.log(`     小さすぎると「外を回すと不利」が働きません。`);

console.log(`\n★D-065 の見積もり（正典）: 内外差 26.2馬身 ≒ 63m ≒ 1600m の 3.9%`);
console.log(`   RACE_RANDOM_K = 0.22 の雑音に対して小さいので、K の再較正まで要らない見込み`);
console.log(`\n⚠️ ★これは「もし w を着順に効かせたら」の見積もりです。**まだエンジンに入れていません。**`);
