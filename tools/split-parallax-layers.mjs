/**
 * 合格済みの側面背景プレートを、横方向にループする多層パララックス素材へ分解する。
 *
 *   node tools/split-parallax-layers.mjs backstretch-side-v1
 *
 * 入力: apps/web/public/art/race-<plate>.png（絵はそのまま。加工は帯の切り出しと継ぎ目のクロスフェードのみ）
 * 出力: apps/web/public/art/parallax/<plate>/<layer>.png と manifest.json
 *
 * ★方針（docs/broadcast-v2-redesign-20260817.md「廃止するもの」への対処）
 *   - 1枚絵をクロップして送るだけでは、馬の速度で背景を流すと 0.2 秒で絵が尽きる。
 *     → 帯ごとに横ループするタイルにし、描画側が「馬群の進行距離 × その帯の px/m」で流す。
 *   - ラチのように周期のある帯は、支柱・金具の**無い**区間で継ぎ目を取り、周期を壊さない。
 *   - 芝・樹木・生垣・スタンドは端同士をクロスフェードして繋ぐ（テクスチャなので継ぎ目は見えない）。
 *
 * ⚠️ 決定論: 乱数・時刻は使わない。同じ入力からは常に同じ出力。
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'apps', 'web', 'public', 'art');

/**
 * 帯の定義。y0/y1 はプレート px。
 *   x0     : タイルの元にする範囲の左端（プレート px）
 *   tileW  : タイル幅（プレート px）。周期のある帯は周期の整数倍にする
 *   overlap: 継ぎ目のクロスフェード幅（プレート px）。[x0, x0+overlap) と [x0+tileW, x0+tileW+overlap) に
 *            目立つ構造物が無いように x0/tileW を選ぶ
 *   depthOffsetM: 馬群（カメラの注視点）からの奥行き差（m）。＋は奥、−は手前。描画側の px/m 計算に使う
 *   anchor : 'ground'（地面に接する帯）/ 'sky'（水平線より上）— 現状は情報のみ
 */
const PLATES = {
  'backstretch-side-v1': {
    source: 'race-backstretch-side-v1.png',
    layers: [
      { name: 'trees',       y0: 0,   y1: 188, x0: 100, tileW: 1350, overlap: 220, depthOffsetM: 160 },
      { name: 'stand',       y0: 188, y1: 342, x0: 60,  tileW: 1450, overlap: 140, depthOffsetM: 70 },
      { name: 'hedge',       y0: 342, y1: 398, x0: 40,  tileW: 1500, overlap: 120, depthOffsetM: 30 },
      { name: 'back-rails',  y0: 398, y1: 458, x0: 30,  tileW: 1530, overlap: 100, depthOffsetM: 18 },
      // 内ラチ: 支柱 x ≈ 108,305,514,742,960,1179,1416,1653 → 継ぎ目区間 [140,220) と [1250,1330) は支柱なし
      { name: 'inner-rail',  y0: 458, y1: 503, x0: 140, tileW: 1110, overlap: 80,  depthOffsetM: 10 },
      { name: 'turf-far',    y0: 503, y1: 578, x0: 20,  tileW: 1500, overlap: 140, depthOffsetM: 3 },
      { name: 'turf-mid',    y0: 578, y1: 672, x0: 20,  tileW: 1500, overlap: 140, depthOffsetM: -3 },
      { name: 'turf-near',   y0: 672, y1: 762, x0: 20,  tileW: 1500, overlap: 140, depthOffsetM: -8 },
      // 手前ラチ＋生垣: 金具 x ≈ 606–631 / 1449–1487（周期 835）→ x0=200 なら継ぎ目区間 [200,280) [1035,1115) は金具なし
      { name: 'front-rail',  y0: 762, y1: 941, x0: 200, tileW: 835,  overlap: 80,  depthOffsetM: -13 },
    ],
    /**
     * ★世界に固定した物体。同じ構図で描かれた別プレート（ゴール）との**差分**で切り出す（絵は描き足さない）。
     *   審判塔は内ラチの奥行き、決勝線は芝の各帯の奥行きに置く（線は帯ごとに別の速さで流れる＝遠近として正しい）。
     *   worldS は 'finish'（描画側で course.distance に解決）。anchorX は決勝線の中心 x=1178.5。
     */
    /**
     * ★透視ワールド用: 芝タイルはプレートの芝帯（y 503〜762）から。90px/m（望遠横追従で馬 2.5m ≈ 229 プレート px）。
     *   パノラマは y 0〜398（樹木・スタンド・生垣）。horizonY は生垣の下端（地面が始まる線）。
     */
    world: {
      turf: { x0: 20, y0: 522, tileW: 1500, tileH: 208, overlapX: 140, overlapY: 30, pxPerM: 90 },
      panorama: { x0: 60, y0: 0, y1: 398, tileW: 1450, overlapX: 140, horizonY: 398 },
      trees: { x0: 100, y0: 60, y1: 190, tileW: 1350, overlapX: 220 },
    },
    objects: [
      { name: 'finish-tower',     from: 'race-finish-side-v2.png', x0: 1148, x1: 1210, y0: 250, y1: 532, anchorX: 1178.5, worldS: 'finish', depthOffsetM: 10 },
      { name: 'finish-line-far',  from: 'race-finish-side-v2.png', x0: 1165, x1: 1193, y0: 518, y1: 578, anchorX: 1178.5, worldS: 'finish', depthOffsetM: 3 },
      { name: 'finish-line-mid',  from: 'race-finish-side-v2.png', x0: 1165, x1: 1193, y0: 578, y1: 672, anchorX: 1178.5, worldS: 'finish', depthOffsetM: -3 },
      { name: 'finish-line-near', from: 'race-finish-side-v2.png', x0: 1165, x1: 1193, y0: 672, y1: 762, anchorX: 1178.5, worldS: 'finish', depthOffsetM: -8 },
      { name: 'finish-line-hedge', from: 'race-finish-side-v2.png', x0: 1165, x1: 1193, y0: 800, y1: 866, anchorX: 1178.5, worldS: 'finish', depthOffsetM: -13 },
      /**
       * ★発馬機（発走ショット・馬の手前に描く）。差分は「発馬機あり（承認済みプレート）」と
       *   「Codex に発馬機だけ消させた版（design/art/assets/starting-gate-side-v1-nogate.png）」の間で取る。
       *   配置は実投影: 手前端（カメラに最も近い枠＝外ラチ側）の枠中央の床 (anchorX, anchorY) を世界 (s=0, w=19.2) に置く。
       */
      { name: 'start-gate', from: 'starting-gate-side-v1.png', base: 'design/art/assets/starting-gate-side-v1-nogate.png',
        // 手前端＝右端。手前の枠（12番）の中央 x≈640 の真下、車輪の接地 y≈600 を (s=0, w=14.2) に置く
        x0: 128, x1: 684, y0: 226, y1: 608, anchorX: 640, anchorY: 600, worldS: 0, worldW: 14.2, depthOffsetM: -9, zOrder: 'front', scale: 0.82,
        // ラチ片・芝の粒を拾わないよう閾値を上げ、左上に掛かるポール標識は除外
        maskLo: 75, maskHi: 140, exclude: [[128, 226, 160, 310]] },
      // ★標識ポール（発馬機の後ろ・内側）。馬の後ろに描く
      { name: 'start-pole', from: 'starting-gate-side-v1.png', base: 'design/art/assets/starting-gate-side-v1-nogate.png',
        x0: 58, x1: 162, y0: 222, y1: 528, anchorX: 110, anchorY: 520, worldS: -3, worldW: -1.5, depthOffsetM: 12, zOrder: 'behind', scale: 0.82 },
    ],
  },
};

const key = process.argv[2];
const def = PLATES[key];
if (def === undefined) {
  console.error(`unknown plate: ${key}. known: ${Object.keys(PLATES).join(', ')}`);
  process.exit(2);
}

const src = await loadImage(join(ART, def.source));
const srcCv = createCanvas(src.width, src.height);
const srcCtx = srcCv.getContext('2d');
srcCtx.drawImage(src, 0, 0);
const srcData = srcCtx.getImageData(0, 0, src.width, src.height).data;

const outDir = join(ART, 'parallax', key);
mkdirSync(outDir, { recursive: true });

const smooth = (t) => t * t * (3 - 2 * t);
const manifestLayers = [];
for (const L of def.layers) {
  const h = L.y1 - L.y0;
  if (L.x0 + L.tileW + L.overlap > src.width) {
    throw new Error(`${L.name}: x0+tileW+overlap (${L.x0 + L.tileW + L.overlap}) exceeds plate width ${src.width}`);
  }
  const out = createCanvas(L.tileW, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(L.tileW, h);
  for (let y = 0; y < h; y++) {
    const sy = L.y0 + y;
    for (let x = 0; x < L.tileW; x++) {
      const a = ((sy * src.width) + (L.x0 + x)) * 4;                // 主画素
      let r = srcData[a], g = srcData[a + 1], b = srcData[a + 2];
      if (x < L.overlap) {
        // 左端は「タイル右端の続き」と混ぜ、右端 → 左端が連続するようにする
        const t = smooth((x + 0.5) / L.overlap);
        const c = ((sy * src.width) + (L.x0 + L.tileW + x)) * 4;
        r = srcData[c] * (1 - t) + r * t;
        g = srcData[c + 1] * (1 - t) + g * t;
        b = srcData[c + 2] * (1 - t) + b * t;
      }
      const o = (y * L.tileW + x) * 4;
      img.data[o] = Math.round(r); img.data[o + 1] = Math.round(g); img.data[o + 2] = Math.round(b); img.data[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const file = `${L.name}.png`;
  writeFileSync(join(outDir, file), out.toBuffer('image/png'));
  manifestLayers.push({ name: L.name, file, plateY0: L.y0, plateY1: L.y1, tileWidth: L.tileW, depthOffsetM: L.depthOffsetM });
  console.log(`${L.name.padEnd(12)} ${L.tileW}x${h}  depth ${L.depthOffsetM >= 0 ? '+' : ''}${L.depthOffsetM}m`);
}
// ★固定物体: 差分マスク（|Δrgb| 合計を 40→110 でなだらかに 0→1、1px 膨張）で切り出す
const manifestObjects = [];
const smoothstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const variantCache = new Map();
for (const O of def.objects ?? []) {
  const loadPixels = async (rel) => {
    const key = rel;
    let px = variantCache.get(key);
    if (px === undefined) {
      const file = rel.includes('/') ? join(ROOT, rel) : join(ART, rel);
      const vimg = await loadImage(file);
      if (vimg.width !== src.width || vimg.height !== src.height) throw new Error(`${rel}: size differs from ${def.source}`);
      const vcv = createCanvas(vimg.width, vimg.height); const vctx = vcv.getContext('2d'); vctx.drawImage(vimg, 0, 0);
      px = vctx.getImageData(0, 0, vimg.width, vimg.height).data; variantCache.set(key, px);
    }
    return px;
  };
  const variant = await loadPixels(O.from);
  // ★差分の相手: 既定はプレート本体。`base` があればそれ（同構図の「物体なし」版）
  const baseData = O.base !== undefined ? await loadPixels(O.base) : srcData;
  const w = O.x1 - O.x0, h = O.y1 - O.y0;
  const raw = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((O.y0 + y) * src.width + (O.x0 + x)) * 4;
    const diff = Math.abs(baseData[i] - variant[i]) + Math.abs(baseData[i + 1] - variant[i + 1]) + Math.abs(baseData[i + 2] - variant[i + 2]);
    const px = O.x0 + x, py = O.y0 + y;
    const excluded = (O.exclude ?? []).some(([ex0, ey0, ex1, ey1]) => px >= ex0 && px < ex1 && py >= ey0 && py < ey1);
    raw[y * w + x] = excluded ? 0 : smoothstep(O.maskLo ?? 40, O.maskHi ?? 110, diff);
  }
  const out = createCanvas(w, h); const octx = out.getContext('2d'); const img = octx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue; a = Math.max(a, raw[yy * w + xx]);
    }
    const i = ((O.y0 + y) * src.width + (O.x0 + x)) * 4; const o = (y * w + x) * 4;
    img.data[o] = variant[i]; img.data[o + 1] = variant[i + 1]; img.data[o + 2] = variant[i + 2]; img.data[o + 3] = Math.round(a * 255);
  }
  octx.putImageData(img, 0, 0);
  const file = `${O.name}.png`;
  writeFileSync(join(outDir, file), out.toBuffer('image/png'));
  manifestObjects.push({
    name: O.name, file, plateY0: O.y0, anchorXRatio: (O.anchorX - O.x0) / w, worldS: O.worldS, depthOffsetM: O.depthOffsetM,
    ...(O.zOrder !== undefined ? { zOrder: O.zOrder } : {}),
    ...(O.worldW !== undefined ? { worldW: O.worldW, anchorYRatio: (O.anchorY - O.y0) / h } : {}),
    ...(O.scale !== undefined ? { scale: O.scale } : {}),
  });
  console.log(`${O.name.padEnd(18)} ${w}x${h}  object depth ${O.depthOffsetM >= 0 ? '+' : ''}${O.depthOffsetM}m`);
}
/**
 * ★透視ワールド用素材（コーナー・斜めショット）。
 *   world-turf.png     : 芝の 2 方向ループタイル（横クロスフェード＋縦クロスフェード）。地面を走査線ごとに透視で貼る
 *   world-panorama.png : 樹木・スタンド・生垣の帯（プレート y 0〜398）を横ループにしたもの。地平線に貼る
 */
const worldDefs = def.world;
const manifestWorld = {};
if (worldDefs !== undefined) {
  const makeTile = (x0, y0, tileW, tileH, overlapX, overlapY) => {
    const out = createCanvas(tileW, tileH); const octx = out.getContext('2d'); const img = octx.createImageData(tileW, tileH);
    const at = (x, y) => ((y * src.width) + x) * 4;
    for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW; x++) {
      // 横継ぎ目: 左端 overlapX 分は「右端の続き」と混ぜる。縦継ぎ目: 上端 overlapY 分は「下端の続き」と混ぜる
      const tx = x < overlapX ? smooth((x + 0.5) / overlapX) : 1;
      const ty = y < overlapY ? smooth((y + 0.5) / overlapY) : 1;
      const sample = (xx, yy) => at(x0 + xx, y0 + yy);
      // ★重み 0 の側は読まない（範囲外参照で NaN → 黒になる）
      const mixPx = (a, b, t) => [0, 1, 2].map((c) => (t >= 1 ? srcData[b + c] : t <= 0 ? srcData[a + c] : srcData[a + c] * (1 - t) + srcData[b + c] * t));
      const row = (yy) => mixPx(tx < 1 ? sample(x + tileW, yy) : 0, sample(x, yy), tx);
      const top = row(y);
      const wrapRow = ty < 1 ? row(y + tileH) : top;
      const o = (y * tileW + x) * 4;
      for (let c = 0; c < 3; c++) img.data[o + c] = Math.round(wrapRow[c] * (1 - ty) + top[c] * ty);
      img.data[o + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    return out;
  };
  const turf = worldDefs.turf;
  if (turf.x0 + turf.tileW + turf.overlapX > src.width || turf.y0 + turf.tileH + turf.overlapY > src.height) throw new Error('world-turf: out of plate');
  writeFileSync(join(outDir, 'world-turf.png'), makeTile(turf.x0, turf.y0, turf.tileW, turf.tileH, turf.overlapX, turf.overlapY).toBuffer('image/png'));
  manifestWorld.turf = { file: 'world-turf.png', tileWidth: turf.tileW, tileHeight: turf.tileH, pxPerM: turf.pxPerM };
  console.log(`world-turf     ${turf.tileW}x${turf.tileH}  ${turf.pxPerM}px/m`);
  const pano = worldDefs.panorama;
  if (pano.x0 + pano.tileW + pano.overlapX > src.width) throw new Error('world-panorama: out of plate');
  writeFileSync(join(outDir, 'world-panorama.png'), makeTile(pano.x0, pano.y0, pano.tileW, pano.y1 - pano.y0, pano.overlapX, 0).toBuffer('image/png'));
  manifestWorld.panorama = { file: 'world-panorama.png', tileWidth: pano.tileW, height: pano.y1 - pano.y0, horizonY: pano.horizonY - pano.y0 };
  console.log(`world-panorama ${pano.tileW}x${pano.y1 - pano.y0}`);
}
// ★樹林帯（空を透過）: プレート上部の樹木行から、空色（明るく青みがかった画素）を α=0 にする
if (worldDefs?.trees !== undefined) {
  const t = worldDefs.trees;
  const tw = t.tileW, th = t.y1 - t.y0;
  const out = createCanvas(tw, th); const octx = out.getContext('2d'); const img = octx.createImageData(tw, th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const tx = x < t.overlapX ? smooth((x + 0.5) / t.overlapX) : 1;
    const a = ((t.y0 + y) * src.width + (t.x0 + x)) * 4;
    const b = ((t.y0 + y) * src.width + (t.x0 + x + t.tileW)) * 4;
    const px = [0, 1, 2].map((c) => (tx >= 1 ? srcData[a + c] : srcData[b + c] * (1 - tx) + srcData[a + c] * tx));
    const lum = (px[0] + px[1] + px[2]) / 3;
    const isSky = lum > 128 && px[2] >= px[1] - 4;   // 明るく、青が緑以上 → 空
    // 空との境界を少し柔らかく
    const alpha = isSky ? 0 : lum > 110 && px[2] >= px[1] - 4 ? Math.round(255 * (128 - lum) / 18) : 255;
    const o = (y * tw + x) * 4;
    img.data[o] = Math.round(px[0]); img.data[o + 1] = Math.round(px[1]); img.data[o + 2] = Math.round(px[2]); img.data[o + 3] = Math.max(0, Math.min(255, alpha));
  }
  octx.putImageData(img, 0, 0);
  writeFileSync(join(outDir, 'world-trees.png'), out.toBuffer('image/png'));
  manifestWorld.trees = { file: 'world-trees.png', tileWidth: tw, height: th };
  console.log(`world-trees    ${tw}x${th} (sky transparent)`);
}
const manifest = { source: def.source, plateWidth: src.width, plateHeight: src.height, layers: manifestLayers, objects: manifestObjects, world: manifestWorld };
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${join('apps/web/public/art/parallax', key, 'manifest.json')}`);
