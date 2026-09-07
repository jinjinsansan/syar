/**
 * ★納品スプライトの修復 — ★**焼き込まれた市松模様を抜いて、本物の透過に戻す**
 *
 * 【⚠️ ★なぜ要るか — ★納品の不適合】
 *   ★発注書 `ART_ORDER_DEFORMED_HORSE_20260905.md` §1 は
 *   ★「★**背景 = 完全透過**」を指定しています。
 *   ★ところが納品物は ★**40 枚すべてアルファが全面 255**（＝透過なし）で、
 *   ★**透過を表す市松模様が実際の画素として焼き込まれて**いました。
 *
 *   ★実測（`01_coat.png`）:
 *   　★アルファ … 最小 255 / 最大 255（★全面不透明）
 *   　★市松    … **10px 周期**・約 **244** と **254** の 2 値
 *   　★値に 243〜247 / 252〜255 の揺れ … ★**一度 JPEG を経由した痕跡**
 *
 * 【★どう抜くか】
 *   ★明るさで一律に抜くと ★**馬の白いハイライトまで消えます**。
 *   → ★**画面の縁から流し込み**ます（★背景は縁から繋がっている・馬は島）。
 *   　★脚の間の隙間は縁から繋がるので、★正しく抜けます。
 *   　★馬の内側のハイライトは縁から繋がらないので、★**守られます**。
 *
 * 【⚠️ ★これは修復であって、正しい納品ではありません】
 *   ★輪郭の半透明（アンチエイリアス）は市松と混ざってしまっており、★**戻せません**。
 *   ★縁に薄い灰色のふちが残ります。★**本番は再納品を待つこと。**
 *
 * ★実行: node tools/repair-delivered-sprites.mjs <入力フォルダ> <出力フォルダ>
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const FFMPEG = path.resolve('node_modules/ffmpeg-static/ffmpeg.exe');
const SRC = process.argv[2] ?? 'tmp/horse3a/layers';
const OUT = process.argv[3] ?? 'tmp/horse3a/fixed';
const W = 512;
const H = 512;
/** ★市松の 2 値と、許す揺れ（★JPEG の痕跡があるので少し広めに） */
const TILE_A = 244;
const TILE_B = 254;
const TOL = 7;

mkdirSync(OUT, { recursive: true });

const raw = (file) => execFileSync(
  FFMPEG, ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
  { maxBuffer: 1 << 28 },
);

const png = (buf, file) => execFileSync(
  FFMPEG, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`,
    '-i', 'pipe:0', '-frames:v', '1', file],
  { input: buf, maxBuffer: 1 << 28 },
);

/** ★その画素が市松の地に見えるか */
function isPlate(px, i) {
  const r = px[i]; const g = px[i + 1]; const b = px[i + 2];
  /** ★灰色であること（★色が付いていたら地ではない） */
  if (Math.abs(r - g) > 4 || Math.abs(g - b) > 4) return false;
  return Math.abs(r - TILE_A) <= TOL || Math.abs(r - TILE_B) <= TOL;
}

/**
 * ★**囲まれた市松を抜く**（★2026-09-05・★オーナー指摘「白がチカチカする」から判明）
 *
 * 【⚠️ ★上の「縁から流し込む」だけでは届きません】
 *   ★この道具のヘッダにこう書きました —
 *   ★「★馬の内側のハイライトは縁から繋がらないので、★**守られます**」。
 *   ★その守りが ★**そのまま裏目**に出ました。★頭絡（ブライドル）に**囲まれた口元**は
 *   ★縁から繋がらないので、★**市松が白い塊のまま残りました**。
 *
 * 【★実測（★再納品版 `horse_3A_reissue_final`）】
 *   ★`tack` 層の白い画素は ★**123 コマ → 1166 コマ（約 10 倍）**振れます。
 *   ★1 完歩 5.28m・16m/s では ★**24 コマ/秒**で切り替わるので、★これがそのまま点滅です。
 *   ★残っていたのは 1・3・4・8 コマ目の口元（★1 コマ目は市松の目が肉眼で見えます）。
 *
 * 【⚠️ ★`tack` 層にしか掛けません — ★他の層に掛けると絵を壊します】
 *   ★試しに全層へ掛けて「消える範囲」を絵にしたところ:
 *   　★`coat` … ★**馬の目（白目）が消えました**
 *   　★`silk` … ★**騎手の勝負服の明るい面が抜けました**
 *   ★素材は**無彩色**なので、★**明るさでも模様の周期でも市松と絵を分けられません**
 *   （★244/254 の二山でも、★5px/10px のずらし比でも分離しませんでした）。
 *   → ★**仕様で切ります。** ★`tack` は「蹄・鞍・手綱・肌・長靴」の層であり
 *     （★`ART_ORDER_DEFORMED_HORSE_20260905.md` §2）、★**顔の面はそこに在ってはいけません**。
 *
 * ⚠️ ★これも修復であって、正しい納品ではありません。★再納品で直すのが本筋です。
 */
function clearEnclosedPlate(px, name) {
  if (!/_tack\.png$/.test(name)) return 0;
  /** ★明るい灰（★市松の 2 値を含む帯）。★透過している所は最初から数えません */
  const bright = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k += 1) {
    const i = k * 4;
    const r = px[i]; const g = px[i + 1]; const b = px[i + 2];
    if (px[i + 3] < 32) continue;
    if (Math.abs(r - g) > 4 || Math.abs(g - b) > 4) continue;
    if (r < 236) continue;
    bright[k] = 1;
  }
  /** ★縁から届く分は上の段で処理済み。★ここは**届かなかった島**を集めます */
  const seen2 = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = y * W + x;
    if (seen2[k] === 1 || bright[k] === 0) return;
    seen2[k] = 1;
    stack.push(k);
  };
  for (let x = 0; x < W; x += 1) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y += 1) { push(0, y); push(W - 1, y); }
  while (stack.length > 0) {
    const k = stack.pop();
    const x = k % W; const y = (k - x) / W;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  /** ★40px 未満は消しません（★金具・ハミの白は残す） */
  const done = new Uint8Array(W * H);
  let removed = 0;
  for (let k0 = 0; k0 < W * H; k0 += 1) {
    if (bright[k0] === 0 || seen2[k0] === 1 || done[k0] === 1) continue;
    const cells = [];
    const st = [k0];
    done[k0] = 1;
    while (st.length > 0) {
      const k = st.pop();
      cells.push(k);
      const x = k % W; const y = (k - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (bright[nk] === 0 || seen2[nk] === 1 || done[nk] === 1) continue;
        done[nk] = 1;
        st.push(nk);
      }
    }
    if (cells.length < 40) continue;
    for (const k of cells) { px[k * 4 + 3] = 0; removed += 1; }
  }
  return removed;
}

let repaired = 0;
let untouched = 0;
for (const name of readdirSync(SRC).filter((n) => n.endsWith('.png')).sort()) {
  const px = Buffer.from(raw(path.join(SRC, name)));
  /** ★縁から流し込む（★背景は縁と繋がっている・馬は島） */
  const seen = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = y * W + x;
    if (seen[k] === 1) return;
    if (!isPlate(px, k * 4)) return;
    seen[k] = 1;
    stack.push(k);
  };
  for (let x = 0; x < W; x += 1) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y += 1) { push(0, y); push(W - 1, y); }
  while (stack.length > 0) {
    const k = stack.pop();
    const x = k % W; const y = (k - x) / W;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  let cleared = 0;
  for (let k = 0; k < W * H; k += 1) {
    if (seen[k] === 1) { px[k * 4 + 3] = 0; cleared += 1; }
  }
  cleared += clearEnclosedPlate(px, name);
  png(px, path.join(OUT, name));
  const ratio = cleared / (W * H);
  if (ratio > 0.05) repaired += 1; else untouched += 1;
  console.log(`  ${name}  抜いた地 ${(ratio * 100).toFixed(1)}%`);
}
console.log(`★修復 ${repaired} 枚 / ⚠️ ほとんど抜けなかった ${untouched} 枚 → ${OUT}`);
