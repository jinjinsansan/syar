/**
 * ★勝負服の18色を、機械で選ぶ（アートバイブル §4）
 *
 * 【なぜ要るか】
 *   目で18色を選んだところ、**濃い黄色と薄いレモン色**が混ざりました。
 *   オーナーが並べた画面から**一目で見つけて**指摘されています。
 *   ★**目で選ぶと漏れます。** 18色の総当たりは 153 組で、人が見比べる数ではありません。
 *
 * 【★何を最大化するか】
 *   「いちばん近い2色の距離」を最大化します（max-min）。
 *   ⚠️ 平均距離を最大化してはいけません。**平均が良くても、1組だけ近ければ
 *      その2頭は見分けられません**（R-22: 照合は壊れ方と同じ粒度で）。
 *
 * 【★距離の測り方】
 *   RGB のユークリッド距離ではなく **CIE Lab** を使います。
 *   RGB は人の見え方と一致しません（緑の差は鈍く、青の差は敏感）。
 *
 * 【★この道具が言えないこと】
 *   「その色が競馬の勝負服として自然か」は決められません。**候補を出すだけ**です。
 *
 * 実行: node tools/pick-silk-palette.mjs [--n 18]
 */
const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const N = arg('n', 18);

/** sRGB → CIE Lab（D65） */
function toLab(r, g, b) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [k(X), k(Y), k(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * 候補の色。
 * ★アートバイブル §4「勝負服は**高彩度をここに集中**（12〜16色）」に沿い、
 *   **彩度の高い色と、無彩色の両端（白・黒）**を候補にします。
 *   ⚠️ 芝（緑）と馬体（茶）に近い色は**背景に溶ける**ので候補から外します。
 */
const candidates = [];
for (let h = 0; h < 360; h += 5) {
  for (const [s, v] of [[1.0, 1.0], [1.0, 0.75], [0.6, 1.0]]) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    const [r1, g1, b1] =
      h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const rgb = [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
    // ★芝（58,78,48）と馬体（139,90,60）に近すぎるものは外す — 背景に溶ける
    const lab = toLab(...rgb);
    if (dist(lab, toLab(58, 78, 48)) < 32) continue;
    if (dist(lab, toLab(139, 90, 60)) < 32) continue;
    candidates.push(rgb);
  }
}
candidates.push([255, 255, 255], [20, 20, 20]);   // 白・黒は競馬の勝負服の定番

/**
 * ★貪欲法で「いちばん近い2色の距離」を大きく取る。
 *   最適解ではありませんが、**目で選ぶより確実に良く、結果を数字で示せます**。
 */
const labs = candidates.map((c) => toLab(...c));
const chosen = [0];
while (chosen.length < N) {
  let best = -1, bestD = -1;
  for (let i = 0; i < candidates.length; i += 1) {
    if (chosen.includes(i)) continue;
    let near = Infinity;
    for (const j of chosen) near = Math.min(near, dist(labs[i], labs[j]));
    if (near > bestD) { bestD = near; best = i; }
  }
  chosen.push(best);
}

const picked = chosen.map((i) => candidates[i]);
const pickedLab = picked.map((c) => toLab(...c));
let minD = Infinity, pair = [0, 0];
for (let i = 0; i < N; i += 1) {
  for (let j = i + 1; j < N; j += 1) {
    const d = dist(pickedLab[i], pickedLab[j]);
    if (d < minD) { minD = d; pair = [i, j]; }
  }
}

const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
console.log(`# ★勝負服 ${N} 色（機械で選定）`);
console.log('');
picked.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2)}. ${hex(c)}  rgb(${c.join(',')})`));
console.log('');
console.log('【判定】★いちばん近い2色の距離（これが小さいと見分けられない）');
console.log(`  最小距離: ${minD.toFixed(1)}（${hex(picked[pair[0]])} と ${hex(picked[pair[1]])}）`);
/**
 * ★目安: CIE Lab で **ΔE 30 以上**なら、並べて別の色と分かる水準。
 *   ⚠️ この 30 は**一般的な目安であって、この画面で測った値ではありません**。
 *      本当の判定は「18頭を並べて見つけられるか」（P-3）です。
 */
console.log(`  ★目安 30 に対して: ${minD >= 30 ? '足りている' : '★足りていない'}`);
console.log('');
console.log('⚠️ ★この道具は「色が離れているか」しか言えません。');
console.log('   「競馬の勝負服として自然か」はオーナーの判断です。');
