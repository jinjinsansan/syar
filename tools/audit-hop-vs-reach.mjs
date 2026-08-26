/**
 * ★**「ぴょんぴょん」の正体を素材から測る**（読取専用・製品コードに触れません）
 *
 * 【何を測るか】
 *   描画は**矩形の下端（＝いちばん低い蹄）を地面に固定**します
 *   （`perspective-draw.ts`: top = 地面 − (source.height + flight)×scale）。
 *   したがって画面に出るのは 2 つ:
 *     ① **胴の上下**  … 矩形下端から胴までの距離がコマごとに変わるぶん（＝尻が上下する）
 *     ② **脚の伸び縮み** … 矩形の幅がコマごとに変わるぶん（＝前後に脚が伸びる）
 *
 *   ★真横は②が大きいので「走っている」に見えます。後ろ・上からは②が消えて①だけが残ります。
 *     `SCRIPT_V4` のコメント（オーナー 12 カット全数判定 2026-08-21）と同じ主張を、
 *     ★**素材の画素から数字で確かめます。**
 *
 * ⚠️ 乱数・時刻を使いません（憲法 4）。`out/` にも書きません（表を出すだけ）。
 *
 * 実行: npx tsx tools/audit-hop-vs-reach.mjs
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ART = path.resolve('apps/web/public/art');
const SETS = [
  { role: 'side-v6',       label: '真横（直線・勝負所・ゴール）',   base: 'horse-jockey-side-v6' },
  { role: 'diag-front-v3', label: '前から（発走・1角・4角正面）',   base: 'horse-jockey-diag-front-v3' },
  { role: 'diag-rear-v2',  label: '後ろから（3角）',               base: 'horse-jockey-diag-rear-v2' },
  { role: 'high-diag-v4',  label: '★上・後ろから（いまの4角俯瞰）', base: 'horse-jockey-high-diag-v4' },
];
const ALPHA = 24;

/** ★不透明な画素の矩形と、胴（上半分の重心）の位置を測る */
async function measure(file) {
  const img = await loadImage(file);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (data[(y * img.width + x) * 4 + 3] <= ALPHA) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (!Number.isFinite(x0)) throw new Error(`★不透明な画素がありません: ${file}`);
  /** ★胴＋騎手 = 矩形の上半分の重心（脚を含めない） */
  const half = y0 + (y1 - y0) / 2;
  let sy = 0, n = 0;
  for (let y = y0; y <= half; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (data[(y * img.width + x) * 4 + 3] <= ALPHA) continue;
      sy += y; n += 1;
    }
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, bottom: y1, bodyY: sy / n };
}

const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const range = (a) => Math.max(...a) - Math.min(...a);

console.log('\n★素材 8 コマから測る「胴の上下」と「脚の伸び縮み」（矩形の下端を地面に置いた場合）\n');
console.log('素材            向き                              胴の上下   脚の伸び縮み   比（上下÷伸び）');
console.log('─'.repeat(94));

const rows = [];
for (const set of SETS) {
  const files = Array.from({ length: 8 }, (_, i) =>
    path.join(ART, `${set.base}-pose${String(i + 1).padStart(2, '0')}.png`));
  if (!files.every((f) => existsSync(f))) { console.log(`${set.role.padEnd(15)} ★素材が見つかりません（飛ばします）`); continue; }
  const ms = [];
  for (const f of files) ms.push(await measure(f));
  const H = med(ms.map((m) => m.h));
  /** ① 胴の上下 = 「矩形下端から胴まで」の振れ幅 ÷ 体高 */
  const hop = range(ms.map((m) => m.bottom - m.bodyY)) / H;
  /** ② 脚の伸び縮み = 矩形の幅の振れ幅 ÷ 幅の中央値 */
  const reach = range(ms.map((m) => m.w)) / med(ms.map((m) => m.w));
  rows.push({ ...set, hop, reach });
  console.log(`${set.role.padEnd(15)} ${set.label.padEnd(30)} ${(hop * 100).toFixed(1).padStart(6)}%  ${(reach * 100).toFixed(1).padStart(9)}%  ${(hop / reach).toFixed(2).padStart(12)}`);
}

console.log(`
★読み方
   「胴の上下」が大きく「脚の伸び縮み」が小さいほど、その場で跳ねて見えます（比が大きいほど悪い）。
   ⚠️ これは**素材だけ**を測った量です。実際の見え方にはカメラの見込み角も掛かります
      （走路方向の動きが圧縮されるほど、同じ素材でも跳ねが目立ちます）。`);
