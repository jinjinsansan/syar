/**
 * ★斜め俯瞰の**静止1枚**（試作①の確認用）
 *
 * 【これは何か】
 *   ★**新しいレンダラではありません。** 裁定の手順①「1頭だけ斜め俯瞰で試作」に対し、
 *   ★**その1頭を置いたときに「内/外」が画面に出るか**だけを確かめる静止画です。
 *
 * 【なぜ要るか】
 *   絵だけを見ても決まりません。`SPRITE_LOG_20260813.md §1` に
 *   ★**「判断材料は『部品』ではなく『使われる場面』で作る」**と書いてあります
 *   （32×32 のときも、レース画面を作って初めてオーナーが判断できました）。
 *
 * 【★投影】`design/art/OBLIQUE_CONTRACT_20260815.md`
 *   進行 → 画面 x（26 px/m）／内外 → 画面 y（7.6 px/m・上が内）
 *   ★大きさは全馬同じ（D-058）。奥行きは**接地線の y と重なり順**で作る
 *
 * 実行: node tools/shot-oblique.mjs
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const W = 1280, H = 720;
const OUT = path.resolve('out/oblique');
const pal = JSON.parse(readFileSync('apps/web/public/art/palette.json', 'utf8'));

/* ── ★投影（契約どおり）───────────────────────── */
const PX_PER_M = 26;          // 進行方向
const TRACK_W_M = 25;         // 走路の幅
const TRACK_TOP = 360;        // 内ラチの画面 y
const TRACK_PX = 190;         // 走路の幅の画面 y
const PX_PER_M_W = TRACK_PX / TRACK_W_M;
const HORSE_W = 160;          // ★スプライトの表示幅（比較で読めた最小に近い）
const X_ANCHOR = 520;

/** 内からの距離 w[m] → 画面 y（接地点） */
const yOf = (w) => TRACK_TOP + w * PX_PER_M_W;
/** 進行 m → 画面 x */
const xOf = (m, camM) => X_ANCHOR + (m - camM) * PX_PER_M;

/** 12頭。★道中の一団（24m）に散らし、内/外もばらす */
const FIELD = Array.from({ length: 12 }, (_, i) => {
  const gate = i + 1;
  return {
    gate,
    m: -((i * 7919) % 12) / 11 * 22,
    // ★内枠ほど内を通り、差し馬は外に出す（ここは見せ方の仮置き）
    w: 1.5 + ((gate * 5) % 12) * 1.7,
  };
});

function band(ctx, y, h, role) { ctx.fillStyle = pal[role]; ctx.fillRect(0, y, W, h); }

async function main() {
  mkdirSync(OUT, { recursive: true });
  const horse = await loadImage(path.resolve('out/oblique/w160.png'));
  const hh = Math.round(horse.height * (HORSE_W / horse.width));

  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // 空・スタンド（★ここは水平の帯のまま）
  for (let y = 0; y < 216; y++) {
    const t = y / 215;
    ctx.fillStyle = pal[t < 0.34 ? 'sky-0' : t < 0.67 ? 'sky-1' : 'sky-2'];
    ctx.fillRect(0, y, W, 1);
  }
  band(ctx, 216, 64, 'stand-1');
  ctx.fillStyle = pal['stand-0']; ctx.fillRect(0, 216, W, 6);
  for (let x = 0; x < W; x += 3) for (let y = 226; y < 274; y += 3) {
    ctx.fillStyle = ((x * 3 + y * 5) % 11) < 5 ? pal['crowd-0'] : pal['crowd-2'];
    ctx.fillRect(x, y, 2, 2);
  }
  band(ctx, 280, 40, 'hedge-1');
  band(ctx, 320, 40, 'turf-0');

  /* ── ★走路（内ラチ → 外ラチ）。★奥ほど暗く、手前ほど明るい ── */
  for (let y = TRACK_TOP; y < TRACK_TOP + TRACK_PX + 90; y++) {
    const t = (y - TRACK_TOP) / (TRACK_PX + 90);
    ctx.fillStyle = pal[t < 0.25 ? 'turf-2' : t < 0.5 ? 'turf-3' : t < 0.78 ? 'turf-4' : 'turf-5'];
    ctx.fillRect(0, y, W, 1);
  }
  // ★内ラチ（奥）／外ラチ（手前）。★どちらも水平の帯（直線区間なので曲げない）
  ctx.fillStyle = pal['rail-1']; ctx.fillRect(0, TRACK_TOP - 10, W, 4);
  ctx.fillStyle = pal['rail-0']; ctx.fillRect(0, TRACK_TOP - 14, W, 4);
  for (let x = 0; x < W; x += 64) { ctx.fillStyle = pal['rail-1']; ctx.fillRect(x, TRACK_TOP - 12, 3, 12); }

  /* ── ★馬（内＝上＝先に描く。手前が上に重なる）── */
  const camM = FIELD.reduce((s, h) => s + h.m, 0) / FIELD.length;
  const sorted = [...FIELD].sort((a, b) => a.w - b.w);
  for (const h of sorted) {
    const cx = xOf(h.m, camM);
    const cy = yOf(h.w);
    // ★影（接地点を示す。これが無いと『浮いている』ように見える）
    ctx.fillStyle = 'rgba(20,30,18,0.32)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 2, HORSE_W * 0.22, HORSE_W * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(horse, Math.round(cx - HORSE_W / 2), Math.round(cy - hh + 6), HORSE_W, hh);
    // ★馬番（当て布の上あたり）
    const col = pal[`silk-${h.gate}`] ?? pal['paper-0'];
    const bx = Math.round(cx - 6), byy = Math.round(cy - hh * 0.52);
    ctx.fillStyle = pal['paper-0']; ctx.fillRect(bx - 12, byy, 28, 20);
    ctx.fillStyle = col; ctx.fillRect(bx - 12, byy, 28, 4);
    const rgb = parseInt(col.slice(1), 16);
    const lum = (((rgb >> 16) & 255) * 299 + ((rgb >> 8) & 255) * 587 + (rgb & 255) * 114) / 1000;
    ctx.fillStyle = lum < 140 ? pal['ink-0'] : pal['ink-0'];
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(h.gate), bx + 2, byy + 17);
    ctx.textAlign = 'left';
  }

  // 外ラチ（手前）
  ctx.fillStyle = pal['rail-1']; ctx.fillRect(0, TRACK_TOP + TRACK_PX + 40, W, 6);
  ctx.fillStyle = pal['rail-0']; ctx.fillRect(0, TRACK_TOP + TRACK_PX + 34, W, 5);
  for (let x = 0; x < W; x += 80) { ctx.fillStyle = pal['rail-1']; ctx.fillRect(x, TRACK_TOP + TRACK_PX + 34, 5, 18); }

  const file = path.join(OUT, 'scene-oblique.png');
  writeFileSync(file, cv.toBuffer('image/png'));

  /* ── ★測る ─────────────────────────────── */
  const im = ctx.getImageData(0, 0, W, H).data;
  const colours = new Set();
  for (let i = 0; i < im.length; i += 4) colours.add((im[i] << 16) | (im[i + 1] << 8) | im[i + 2]);
  const ys = FIELD.map((h) => Math.round(yOf(h.w)));
  const xs = FIELD.map((h) => Math.round(xOf(h.m, camM)));
  console.log(`★${file}`);
  console.log(`  色数 ${colours.size.toLocaleString()}`);
  console.log(`  ★内/外の画面 y  最小 ${Math.min(...ys)} 〜 最大 ${Math.max(...ys)}（差 ${Math.max(...ys) - Math.min(...ys)} px）`);
  console.log(`  進行の画面 x     最小 ${Math.min(...xs)} 〜 最大 ${Math.max(...xs)}（差 ${Math.max(...xs) - Math.min(...xs)} px）`);
  // ★何頭が「他の馬に隠れずに」見えるか（中心どうしが HORSE_W*0.45 以上離れているか）
  let clear = 0;
  for (const a of FIELD) {
    const ax = xOf(a.m, camM), ay = yOf(a.w);
    const hidden = FIELD.some((b) => b !== a && yOf(b.w) > ay
      && Math.abs(xOf(b.m, camM) - ax) < HORSE_W * 0.45 && Math.abs(yOf(b.w) - ay) < 34);
    if (!hidden) clear++;
  }
  console.log(`  ★他の馬に隠れずに見える頭数 ${clear} / 12`);
  console.log('\n⚠️ ★これは静止1枚です。動き・カット・ゲートは手順②で確かめます。');
}
main().catch((e) => { console.error('★落ちました:', e); process.exit(1); });
