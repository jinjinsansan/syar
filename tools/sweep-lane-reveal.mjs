/**
 * ★`LANE_REVEAL_FULL_RUN` の帯を掃引する（読むだけ）
 *
 * 【なぜ要るか（レビュー側裁定 2026-08-21）】
 *   > 8m は視覚側の下限で、**上限は V-4/V-17 が決めます。**
 *   > 先に掃引して帯があるかを確かめ、余裕を pp で報告してください。
 *   > **値を先に決めて後から正当化する形は採りません。**
 *
 * 【この道具が出すもの】
 *   ① 視覚側 … 中盤（発走 180m〜900m 相当）の 12 頭の**横の広がりの最小値**
 *   ② 幾何側 … **枠と距離ロスの相関**（V-18 が見る量。枠順ゲーム化の指標）
 *   ③ 分散側 … 距離ロスの**ばらつき**（V-4 / V-17 が効く量。裁定の指摘どおり
 *              「有利さ」ではなく「分散」が増えるので、ここを先に見る）
 *
 *   ⚠️ ★V-4 / V-17 / V-1 そのものは**この道具では判定しません**。
 *      ここは候補を絞るための下見で、合否は `npm run verify:race` / `npm run verify` が出します。
 *      **この道具が通ったことを合格と書かないこと。**
 *
 * 実行: npx tsx tools/sweep-lane-reveal.mjs [--distance 1600] [--seeds 42,7,2026,31337]
 */
import { laneAt, laneExtraM, TRACK_WIDTH_M } from '@star/race-engine';

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const DIST = Number(flag('--distance', 1600));
/**
 * ★相関は**多数シードをプールして 1 つ**出します。
 *   ⚠️ 4 シードで 12 点ずつの相関を取って最大値を拾う形にしていましたが、
 *      12 点の相関は雑音が大きく、現状値でも 0.473 が出て**実測 0.127 と桁が合いません**でした。
 *      枠ごとのロスは**シードで大きく振れる**ので、点を増やさないと意味を持ちません。
 */
const CORR_SEEDS = Number(flag('--corr-seeds', 400));
const SEEDS = String(flag('--seeds', '42,7,2026,31337')).split(',').map(Number);
const FIELD = 12;

/** ★掃引する候補。1.0 が現状 */
const CANDIDATES = [1.0, 0.7, 0.5, 0.35, 0.25, 0.18, 0.12, 0.08];

/** 中盤の定義: 発走 180m 〜 900m（オーナーが不合格と言った 12〜27 秒に対応） */
const MID_FROM = 180, MID_TO = 900;
const STEP = 20;

/**
 * ★距離ロスは**エンジンの `laneExtraM` を呼びます**。
 *
 * ⚠️ 最初は「走路全体の平均 `w`」で自作しましたが、**発走直後の枠の広がりを丸ごと拾う**ので、
 *    現状値（1.00）でも相関 0.600 が出ました。却下の目安 0.127 と桁が違い、**指標が誤りでした。**
 *    ロスが出るのは**コーナーだけ**で、直線では出ません。自作しないこと。
 */
const lossOf = (gate, seed, reveal) =>
  laneExtraM(gate, FIELD, DIST, seed, undefined, 10, reveal);

const pearson = (xs, ys) => {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
};

console.log(`\n=== LANE_REVEAL_FULL_RUN の掃引（${DIST}m / ${FIELD}頭 / シード ${SEEDS.join(',')}）===`);
console.log('  ★これは下見です。合否は verify:race / verify が出します\n');
console.log('  候補   中盤の広がり(最小)  中盤の広がり(平均)   枠×ロスの相関   ロスのばらつき(SD)');
for (const reveal of CANDIDATES) {
  const mins = [], means = [], corrs = [], sds = [];
  for (const seed of SEEDS) {
    const spreads = [];
    for (let ran = MID_FROM; ran <= MID_TO; ran += STEP) {
      const ws = Array.from({ length: FIELD }, (_, i) => laneAt(i + 1, FIELD, DIST - ran, DIST, seed, TRACK_WIDTH_M, reveal));
      spreads.push(Math.max(...ws) - Math.min(...ws));
    }
    mins.push(Math.min(...spreads));
    means.push(spreads.reduce((a, b) => a + b, 0) / spreads.length);
  }
  // ★相関とばらつきは多数シードをプールして 1 回だけ
  {
    const gs = [], ls = [];
    for (let k = 0; k < CORR_SEEDS; k += 1) {
      const seed = 1000 + k * 7919;
      for (let g = 1; g <= FIELD; g += 1) { gs.push(g); ls.push(lossOf(g, seed, reveal)); }
    }
    corrs.push(pearson(gs, ls));
    const m = ls.reduce((a, b) => a + b, 0) / ls.length;
    sds.push(Math.sqrt(ls.reduce((a, b) => a + (b - m) ** 2, 0) / ls.length));
  }
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const worstCorr = corrs[0];
  const visual = Math.min(...mins) >= 8 ? '✅' : '  ';
  console.log(`  ${reveal.toFixed(2)}  ${visual}${Math.min(...mins).toFixed(2).padStart(12)}m`
    + `${avg(means).toFixed(2).padStart(16)}m`
    + `${worstCorr.toFixed(3).padStart(16)}`
    + `${avg(sds).toFixed(3).padStart(20)}`);
}
console.log('\n  視覚側の下限: 中盤の広がり **8m 以上**（合格した 2 区間は 11.3m / 9.2m）');
console.log('  ★枠×ロスの相関は、枠 5% を残したときに 0.127 が出て却下された量。ここが上がるなら即やめる');
console.log('  ★ロスのばらつきが増えると V-4（1番人気の勝率）と V-17（タイム差）が動く。');
console.log('    上限はこの道具では決められない。候補を 2〜3 に絞って verify:race / verify を回すこと');
