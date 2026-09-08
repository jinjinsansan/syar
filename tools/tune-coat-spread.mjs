/**
 * ★**毛色 7 色の変換値を、実測で探す**（★2026-09-08）
 *
 * 【★なぜ道具にするか】
 *   ★手で 1 つずつ動かすと、★**押した所が別の所で戻ります**（★実測で 3 回起きました）。
 *   ★`dark-bay ↔ seal-brown` を離すと `seal-brown ↔ blue-black` が近づく、の繰り返しです。
 *   → ★**全組の最小値を最大にする**組み合わせを探します。
 *
 * ⚠️ ★焼き直さずに探します。★`applyCoat` と同じ変換を、★馬体の平均色に 1 回だけ掛けます
 *    （★平均に掛けるのと画素ごとに掛けて平均するのは、★線形変換なので同じです。
 *      ★`contrast` だけ非線形なので、★探索では使いません）。
 *
 * ★実行: node tools/tune-coat-spread.mjs
 */
import sharp from 'sharp';

const DIR = 'apps/web/public/art/baked';
/** ★元の色（★変換前）。★`bay` のアトラスは変換済みなので、★原版から取ります */
const SRC = 'apps/web/public/art/horse-jockey-side-v8-pose01.png';

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let r0 = 0; let g0 = 0; let b0 = 0; let n = 0;
for (let i = 0; i < data.length; i += 4) {
  if ((data[i + 3] ?? 0) < 128) continue;
  const r = data[i] ?? 0; const g = data[i + 1] ?? 0; const b = data[i + 2] ?? 0;
  if (!(r > g && g > b)) continue;
  if (r < 24 || r - g < 12 || g / r > 0.70) continue;
  r0 += r; g0 += g; b0 += b; n += 1;
}
const base = [r0 / n, g0 / n, b0 / n];
console.log(`★原版の毛の平均色 rgb(${base.map((v) => Math.round(v)).join(',')})  画素 ${n}`);

const LUMA = [0.2126, 0.7152, 0.0722];
function hueMatrix(deg) {
  const a = (deg * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}
function apply(c, t) {
  let [r, g, b] = c;
  if (t.hueRotate !== undefined && t.hueRotate !== 0) {
    const m = hueMatrix(t.hueRotate);
    [r, g, b] = [
      r * m[0] + g * m[1] + b * m[2],
      r * m[3] + g * m[4] + b * m[5],
      r * m[6] + g * m[7] + b * m[8],
    ];
  }
  if (t.saturate !== undefined) {
    const l = r * LUMA[0] + g * LUMA[1] + b * LUMA[2];
    r = l + (r - l) * t.saturate; g = l + (g - l) * t.saturate; b = l + (b - l) * t.saturate;
  }
  if (t.brightness !== undefined) { r *= t.brightness; g *= t.brightness; b *= t.brightness; }
  return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))];
}
function dist(a, b) {
  const dl = (0.3 * a[0] + 0.59 * a[1] + 0.11 * a[2]) - (0.3 * b[0] + 0.59 * b[1] + 0.11 * b[2]);
  return Math.sqrt(dl * dl * 2 + ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) * 0.3);
}

const NAMES = ['blue-black', 'seal-brown', 'dark-bay', 'liver-chestnut', 'bay', 'chestnut', 'grey'];
/** ★探す範囲。★暗い順に並べ、★明るさは重ならないよう区切ります */
const RANGE = {
  'blue-black': { br: [0.10, 0.22], sa: [0.05, 0.30], hu: [180, 220] },
  'seal-brown': { br: [0.26, 0.40], sa: [0.25, 0.55], hu: [-25, 5] },
  'dark-bay': { br: [0.44, 0.58], sa: [0.40, 0.70], hu: [-15, 10] },
  'liver-chestnut': { br: [0.62, 0.76], sa: [0.50, 0.80], hu: [-10, 15] },
  bay: { br: [0.82, 0.96], sa: [0.60, 0.90], hu: [-5, 20] },
  chestnut: { br: [1.02, 1.20], sa: [0.80, 1.10], hu: [5, 30] },
  grey: { br: [1.40, 1.70], sa: [0.00, 0.12], hu: [0, 0] },
};
const step = (a, b, k) => Array.from({ length: k }, (_, i) => a + ((b - a) * i) / Math.max(1, k - 1));

/** ★総当たりは重いので、★1 色ずつ「他を固定して最善へ動かす」を繰り返します */
const cur = {};
for (const nm of NAMES) {
  const R = RANGE[nm];
  cur[nm] = { brightness: (R.br[0] + R.br[1]) / 2, saturate: (R.sa[0] + R.sa[1]) / 2, hueRotate: (R.hu[0] + R.hu[1]) / 2 };
}
const worstOf = (set) => {
  let m = 1e9; let pair = '';
  for (let i = 0; i < NAMES.length; i += 1) {
    for (let j = i + 1; j < NAMES.length; j += 1) {
      const d = dist(apply(base, set[NAMES[i]]), apply(base, set[NAMES[j]]));
      if (d < m) { m = d; pair = `${NAMES[i]} ↔ ${NAMES[j]}`; }
    }
  }
  return { m, pair };
};
for (let round = 0; round < 8; round += 1) {
  for (const nm of NAMES) {
    const R = RANGE[nm];
    let best = null;
    for (const br of step(R.br[0], R.br[1], 9)) {
      for (const sa of step(R.sa[0], R.sa[1], 7)) {
        for (const hu of step(R.hu[0], R.hu[1], 5)) {
          const trial = { ...cur, [nm]: { brightness: br, saturate: sa, hueRotate: hu } };
          const { m } = worstOf(trial);
          if (best === null || m > best.m) best = { m, t: trial[nm] };
        }
      }
    }
    cur[nm] = best.t;
  }
}
const fin = worstOf(cur);
console.log(`\n★探索の結果 — ★いちばん近い組 ${fin.pair} = ${fin.m.toFixed(0)}`);
console.log();
for (const nm of NAMES) {
  const t = cur[nm];
  const c = apply(base, t);
  const hx = `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const hu = Math.abs(t.hueRotate) < 0.5 ? '' : `, hueRotate: ${t.hueRotate.toFixed(0)}`;
  console.log(`  '${nm}': { saturate: ${t.saturate.toFixed(2)}, brightness: ${t.brightness.toFixed(2)}${hu} },  // ${hx}`);
}
