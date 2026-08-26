/**
 * ★参考映像を**コマに切って「せめぎ合い」を測る**
 *
 * 【なぜ要るか】
 *   オーナー指摘の ①せめぎ合い ②直線で馬が巨大化する は、
 *   ★**参考にしている映像では実際どうなっているかを数字にしないと合わせようがありません。**
 *   `tools/measure-race-video.mjs`（カット割りと俯角）に対して、この道具は
 *   ★**馬の見かけの高さ・画面内の塊の数**を測ります。
 *
 * 【★憲法1について】
 *   ⚠️ この道具は**画面の幾何と時間だけ**を数字にします。
 *   ★**絵を写しません。文字も読み取りません。製品名も書きません。**
 *   入力の動画は引数で受け取り、リポジトリには取り込みません。
 *
 * 使い方:
 *   node tools/measure-contest-video.mjs <動画> --view x,y,w,h [--fps 5] [--from 秒] [--to 秒] [--frames]
 *     --view   … 走路が映っている矩形（縦画面のアプリは HUD と会話欄を外す）
 *     --frames … 1コマずつの表も出す
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

const [src] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const FPS = Number(arg('fps', 5));
const FROM = arg('from', null);
const TO = arg('to', null);
const OUT = path.resolve(arg('out', 'out/contest-video'));
const VIEW = String(arg('view', '')).split(',').map(Number);

if (!src || !existsSync(src) || VIEW.length !== 4 || VIEW.some((n) => !Number.isFinite(n))) {
  console.error('使い方: node tools/measure-contest-video.mjs <動画> --view x,y,w,h [--fps 5] [--from 秒] [--to 秒] [--frames]');
  process.exit(2);
}
const [VX, VY, VW, VH] = VIEW;

/* ── ① コマに切る（★原寸のまま。縮めると馬の高さが測れない） ── */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execFileSync(ffmpegPath, [
  '-v', 'error',
  ...(FROM === null ? [] : ['-ss', String(FROM)]),
  ...(TO === null ? [] : ['-to', String(TO)]),
  '-i', src, '-vf', `fps=${FPS}`, '-y', path.join(OUT, 'f%04d.png'),
], { stdio: ['ignore', 'pipe', 'pipe'] });
const files = readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
const t0 = FROM === null ? 0 : Number(FROM);
console.log(`★${files.length} コマ（毎秒 ${FPS} コマ・${t0.toFixed(1)}s から）`);
console.log(`★走路の矩形 ${VW}×${VH}（画面の ${VX},${VY} から）\n`);

/**
 * ★**馬らしい画素** = 暗くて緑でないもの。
 *   走路は緑、ダートは明るい茶、柵は白。馬体（焦茶）・脚（黒）・勝負服（濃色）が残ります。
 *   ⚠️ 閾値は**素材の色ではなく「緑か・暗いか」だけ**で決めます（絵を写さないため）。
 */
const isHorsePx = (r, g, b) => {
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  return !(g > r + 18 && g > b + 18) && lum < 140;
};

/**
 * ★**馬の見かけの高さは連結成分では測れません。**
 *   ⚠️ せめぎ合いでは馬同士が**横に重なって1つの塊に融合**します。実測で成分の高さが
 *      306px（走路の 78%）まで跳ねました。これは「巨大な馬」ではなく「融合した塊」です。
 *   ★そこで**列ごとの縦の連続長**を取ります。横に重なっても**縦の長さは変わらない**ので、
 *     融合に強い測り方です。上位 10% の列を「脚先から鬐甲まで通っている列」とみなします。
 */
function columnRuns(mask, W, H) {
  const runs = [];
  for (let x = 0; x < W; x += 1) {
    let best = 0, cur = 0;
    for (let y = 0; y < H; y += 1) {
      if (mask[y * W + x]) { cur += 1; if (cur > best) best = cur; } else cur = 0;
    }
    if (best > 0) runs.push(best);
  }
  return runs.sort((a, b) => a - b);
}

/** 連結成分（4近傍）。★頭数ではなく「塊の数」。重なると減ります */
function components(mask, W, H, minPx, minH) {
  const lab = new Int32Array(W * H).fill(-1);
  const stack = [];
  let n = 0;
  for (let s = 0; s < W * H; s += 1) {
    if (!mask[s] || lab[s] >= 0) continue;
    let y0 = H, y1 = -1, area = 0;
    stack.push(s); lab[s] = s;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p / W) | 0;
      area += 1;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && lab[p - 1] < 0) { lab[p - 1] = s; stack.push(p - 1); }
      if (x < W - 1 && mask[p + 1] && lab[p + 1] < 0) { lab[p + 1] = s; stack.push(p + 1); }
      if (y > 0 && mask[p - W] && lab[p - W] < 0) { lab[p - W] = s; stack.push(p - W); }
      if (y < H - 1 && mask[p + W] && lab[p + W] < 0) { lab[p + W] = s; stack.push(p + W); }
    }
    if (area >= minPx && y1 - y0 + 1 >= minH) n += 1;
  }
  return n;
}

const med = (a) => { if (a.length === 0) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

/* ── ② 1コマずつ測る ── */
const rows = [];
let prev = null;
const minPx = Math.round(VW * VH * 0.0012);
const minH = Math.round(VH * 0.04);
for (const f of files) {
  const { data, info } = await sharp(path.join(OUT, f))
    .extract({ left: VX, top: VY, width: VW, height: VH })
    .removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const mask = new Uint8Array(W * H);
  let on = 0;
  for (let i = 0, p = 0; p < W * H; p += 1, i += 3) {
    if (isHorsePx(data[i], data[i + 1], data[i + 2])) { mask[p] = 1; on += 1; }
  }
  const runs = columnRuns(mask, W, H);
  const pct = (qq) => (runs.length ? runs[Math.min(runs.length - 1, Math.floor(runs.length * qq))] : 0);
  /**
   * ★**カットの検出に画素の差分は使えません。**
   *   ⚠️ 横追従のカットでは背景が丸ごと流れるので、★**同じカットの中でも画素は総取っ替え**に
   *      なります（実測: コマ間差分の中央値 0.069 = カットの跳びと区別が付かない）。
   *   ★**色のヒストグラム**なら、横に流れても中身は変わらないのでほぼ不変です。
   *     カットが変わったときだけ大きく動きます。
   */
  const hist = new Float64Array(8 * 8 * 8);
  for (let i = 0; i < data.length; i += 3) {
    hist[((data[i] >> 5) << 6) + ((data[i + 1] >> 5) << 3) + (data[i + 2] >> 5)] += 1;
  }
  const total = data.length / 3;
  for (let k = 0; k < hist.length; k += 1) hist[k] /= total;
  let d = 0;
  if (prev) { for (let k = 0; k < hist.length; k += 1) d += Math.abs(prev[k] - hist[k]); d /= 2; }
  prev = hist;
  rows.push({
    sec: t0 + rows.length / FPS,
    blobs: components(mask, W, H, minPx, minH),
    hRun: pct(0.90),
    cover: on / (W * H),
    diff: d,
  });
}

/* ── ③ カットの切り替わり ── */
/**
 * ★閾値は**中央値の定数倍**にします（★手で選ばない）。
 *   ⚠️ 平均+3σ は外れ値（閃光・大写し）が σ を膨らませて★**本物のカットを取りこぼします**
 *      （実測: 80 秒で 4 個しか出ませんでした。コンタクトシートでは 10 個以上あります）。
 *      中央値は外れ値に動かされないので、追走中の細かな揺れを基準にできます。
 */
const ds = rows.map((r) => r.diff).slice(1).sort((a, b) => a - b);
const dMed = ds[ds.length >> 1] || 0;
const TH = dMed * 4;
const cutAt = new Set([0]);
rows.forEach((r, i) => { if (i > 0 && r.diff > TH) cutAt.add(i); });
console.log(`★コマ間差分 中央値 ${dMed.toFixed(3)} → 閾値 ${TH.toFixed(3)}（中央値の4倍・★手で選んでいない）`);
console.log(`★カット ${cutAt.size} 個\n`);

if (process.argv.includes('--frames')) {
  console.log('  秒     塊  馬の高さ  走路に対する割合  暗い画素の占有  切替');
  for (const [i, r] of rows.entries()) {
    console.log(
      `  ${r.sec.toFixed(1).padStart(5)}s`
      + `  ${String(r.blobs).padStart(3)}`
      + `  ${String(r.hRun).padStart(6)}px`
      + `  ${((r.hRun / VH) * 100).toFixed(1).padStart(13)}%`
      + `  ${(r.cover * 100).toFixed(1).padStart(13)}%`
      + `  ${cutAt.has(i) ? '★' : ''}`,
    );
  }
  console.log('');
}

/* ── ④ カットごと（★巨大化しているかはここに出る） ── */
const idx = [...cutAt].sort((a, b) => a - b);
console.log('★カットごと（★「高さ 始→終」が伸びていたら、そのカットの中で馬が大きくなっています）');
console.log('  #   開始     長さ   塊(中央)  高さ 始→終       伸び率   最大   走路に対する割合');
const shots = [];
for (let c = 0; c < idx.length; c += 1) {
  const from = idx[c], to = (idx[c + 1] ?? rows.length) - 1;
  const seg = rows.slice(from, to + 1);
  if (seg.length === 0) continue;
  const nEdge = Math.max(1, Math.ceil(seg.length * 0.25));
  const h0 = med(seg.slice(0, nEdge).map((r) => r.hRun));
  const h1 = med(seg.slice(-nEdge).map((r) => r.hRun));
  const hMax = Math.max(...seg.map((r) => r.hRun));
  shots.push({ sec: seg[0].sec, len: seg.length / FPS, h0, h1, hMax, blobs: med(seg.map((r) => r.blobs)) });
  console.log(
    `  ${String(c + 1).padStart(2)}  ${seg[0].sec.toFixed(1).padStart(5)}s`
    + `  ${(seg.length / FPS).toFixed(1).padStart(5)}s`
    + `  ${String(med(seg.map((r) => r.blobs))).padStart(7)}`
    + `  ${String(h0).padStart(5)}px →${String(h1).padStart(4)}px`
    + `  ${(h1 / (h0 || 1)).toFixed(2).padStart(8)} 倍`
    + `  ${String(hMax).padStart(5)}px`
    + `  ${((hMax / VH) * 100).toFixed(1).padStart(14)}%`,
  );
}

/* ── ⑤ ★オーナー指摘②「巨大化」に直接答える数字 ── */
const allH = rows.map((r) => r.hRun).filter((h) => h > 0).sort((a, b) => a - b);
const q = (p) => allH[Math.min(allH.length - 1, Math.floor(allH.length * p))];
console.log(`\n★★この映像で馬はどこまで大きくなるか（走路の高さ ${VH}px に対する割合）`);
console.log(`   p50 ${q(0.5)}px = ${((q(0.5) / VH) * 100).toFixed(1)}%`
  + ` / p90 ${q(0.9)}px = ${((q(0.9) / VH) * 100).toFixed(1)}%`
  + ` / ★最大 ${q(1)}px = ${((q(1) / VH) * 100).toFixed(1)}%`);
const grow = shots.filter((s) => s.h1 / (s.h0 || 1) > 1.3);
console.log(`★1カットの中で 1.3 倍以上に育つカット: ${grow.length} / ${shots.length} 本`
  + (grow.length ? `（${grow.map((s) => `${s.sec.toFixed(1)}s`).join(' ')}）` : ''));
console.log(`★1カットの長さ 中央 ${med(shots.map((s) => s.len)).toFixed(1)}s`
  + ` / 最短 ${Math.min(...shots.map((s) => s.len)).toFixed(1)}s`
  + ` / 最長 ${Math.max(...shots.map((s) => s.len)).toFixed(1)}s`);
console.log('\n⚠️ この道具は画面の幾何と時間だけを数字にします。絵は写しません。');
