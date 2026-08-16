/**
 * ★**引きのカットに必要な「馬の向き」の数を数える**（Q-P4-46 の裁定・手順①）
 *
 * 【なぜ数えるか】（裁定）
 *   > ★実装前に「引きに必要な向きの数」を数えてください。
 *   > 4種以下なら進めてよく、増えるなら報告を。
 *   > 中継の実際のカメラのように「走路の決まった位置に据えた数台を切り替える」形なら
 *   > 向きの数が抑えられます。★D-065 の手順①と同じです。
 *
 * 【★何が問題か】
 *   いま（案A）は**カメラが馬群と一緒に回る**ので、馬は常に真横を向きます → ★**向きは1種**。
 *   案B（カメラを据える）にすると、馬がコーナーを回るあいだ
 *   ★**画面上で馬の向きが変わります** → 向きの数だけスプライトが要ります。
 *
 * 【★数え方】
 *   カメラを K 台、コースに等間隔で据える。各カメラは自分の担当区間だけを写す。
 *   その区間で「馬の進行方向 − カメラの向き」がどれだけ振れるかを測り、
 *   **量子化の刻み**で割って、必要な向きの数を出す。
 *
 * 実行: npx tsx tools/count-headings.mjs [--distance 1600]
 */
import { ovalCourse, posOf } from '@star/render';

const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const DIST = num('--distance', 1600);
const COURSE = ovalCourse(DIST);
const DEG = 180 / Math.PI;

/** −180〜180 に畳む */
const wrap = (a) => {
  let x = ((a + 180) % 360 + 360) % 360;
  return x - 180;
};

const headingAt = (s) => posOf(COURSE, s, COURSE.widthM / 2).heading * DEG;

console.log('# ★引きのカットに必要な「馬の向き」の数（Q-P4-46 手順①）');
console.log(`  ${DIST}m・オーバル\n`);

// ★まず、コース全体で進行方向がどれだけ回るか
let minH = Infinity, maxH = -Infinity;
const STEP = 2;
for (let s = 0; s <= DIST; s += STEP) {
  const h = headingAt(s);
  if (h < minH) minH = h;
  if (h > maxH) maxH = h;
}
console.log(`  ★コース全体で進行方向が回る量: ${(maxH - minH).toFixed(0)}°`);
console.log('  （★案A＝カメラが馬群と一緒に回る、では**向きは1種**。馬は常に真横）\n');

/**
 * ★**量子化の刻み**。
 *
 * ⚠️ ここは**発明していません**。D-058（整数倍でしか拡大しない）と同じ考えで、
 *    ★**far は 124×96 と小さい**ので、細かい角度差は描き分けられません。
 *    実際のドット絵の常識的な刻みである 45°／30°／22.5° の3通りを並べて出します。
 *    **どれを採るかは裁定**です。
 */
const STEPS_DEG = [45, 30, 22.5];

console.log('  案B（カメラを据える）— カメラの台数ごとに必要な向きの数');
console.log('  台数   1台が担当する区間   向きの振れ    45°刻み  30°刻み  22.5°刻み');
const rows = [];
for (const K of [1, 2, 3, 4, 6, 8, 12]) {
  const seg = DIST / K;
  let worst = 0;
  const need = new Set();
  for (let k = 0; k < K; k += 1) {
    const s0 = k * seg, s1 = (k + 1) * seg;
    // ★カメラは担当区間の中央に、そこの進行方向を向けて据える
    const camH = headingAt((s0 + s1) / 2);
    let lo = Infinity, hi = -Infinity;
    for (let s = s0; s <= s1; s += STEP) {
      const d = wrap(headingAt(s) - camH);
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    worst = Math.max(worst, hi - lo);
  }
  const counts = STEPS_DEG.map((q) => Math.max(1, Math.round(worst / q) + 1));
  rows.push({ K, seg, worst, counts });
  console.log(`  ${String(K).padStart(3)}台  ${String(Math.round(seg)).padStart(6)}m`
    + `          ${worst.toFixed(0).padStart(4)}°`
    + `      ${String(counts[0]).padStart(4)}種  ${String(counts[1]).padStart(4)}種  ${String(counts[2]).padStart(6)}種`);
}

console.log('');
const ok = rows.filter((r) => r.counts[0] <= 4);
if (ok.length > 0) {
  const best = ok[0];
  console.log(`★45°刻みなら **${best.K}台** で **${best.counts[0]}種**（裁定の「4種以下」を満たします）`);
} else {
  console.log('★★どの台数でも 45°刻みで4種を超えます。→ 報告して裁定をもらいます');
}
console.log('');
console.log('⚠️ ★これは**向きの数**だけです。台数を増やすと');
console.log('   ・カメラの切り替えが増える（★中継らしさは上がるが、酔いやすくなる）');
console.log('   ・1台あたりの担当が短くなり、★**同じコーナーを別カメラで割る**ことになる');
console.log('   → ★**絵にして見てから決めます**（数字だけで決めません）。');
