/**
 * ★**引き / 寄り / ゴール の3カットを、本番のエンジンで描く**
 *
 * 【なぜ要るか】
 *   アートバイブルに「カットの3系統」を入れました（2026-08-15 の裁定）。
 *   ★**それを絵にして、馬の大きさを決めます。**
 *   参考は 3D で 引き 2.7% ですが、こちらはピクセルアートで
 *   ★**「読める最小」は 110px 付近**でした。**そのままの数字は採れません。**
 *
 * 【★合成データを使いません】
 *   ⚠️ 前の道具は**手で置いた 12頭**を描いていました。
 *      ★**本番のエンジン → 境界時刻 → 位置モデル（脚質から生成）→ 投影**を通します。
 *      そうしないと「絵は良いが、実際のレースでは成立しない」が起きます。
 *
 * 実行: npx tsx tools/shot-cuts.mjs [--distance 1600] [--seed 42]
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt } from '@star/race-engine';
import {
  replayPositionModel, finalOrderOf, ovalCourse, obliqueProject, railPolyline,
  timeWarpFor, knotsFor, ratesForTarget, targetDisplaySec, frameRoleOf,
} from '@star/render';

const W = 1280, H = 720;
const OUT = path.resolve('out/cuts');
const pal = JSON.parse(readFileSync('apps/web/public/art/palette.json', 'utf8'));
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const DIST = num('--distance', 1600);
const SEED = num('--seed', 42);
const FIELD = 12;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const COURSE = ovalCourse(DIST);

/* ── ★本番と同じ経路 ─────────────────────────── */
const start = (SEED * 13) % Math.max(1, POOL.length - FIELD);
const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
  horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
  distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
  strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
  strategy: STRATS[(i + SEED) % 4], condition: 3, fatigue: 20,
  weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
}));
const conditions = {
  raceId: `c${SEED}`, distance: DIST, surface: 'turf',
  trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
};
const result = resolveRace({ conditions, entrants, seed: SEED, balance: DEFAULT_RACE_BALANCE });
const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);
if (!finalOrderMatches(result, boundaries)) throw new Error('★D-059: 映像の着順が確定着順と違います');
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  strategyOf: (g) => entrants[g - 1].strategy, pace, formationSeed: SEED * 2654435761,
  // ★横位置はエンジンが引いたものを読むだけ（D-071）
  laneOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, DIST, SEED),
});
if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(result.order.map((e) => Number(e.horseId)))) {
  throw new Error('★D-059: 位置モデルの最終順が着順と違います');
}
const knots = knotsFor(boundaries, 1);
const warp = timeWarpFor(knots, ratesForTarget(knots, targetDisplaySec(DIST)));

/* ── 背景 ───────────────────────────────── */
function sky(ctx, horizonY) {
  for (let y = 0; y < horizonY; y++) {
    const t = y / Math.max(1, horizonY - 1);
    ctx.fillStyle = pal[t < 0.34 ? 'sky-0' : t < 0.67 ? 'sky-1' : 'sky-2'];
    ctx.fillRect(0, y, W, 1);
  }
  ctx.fillStyle = pal['stand-1']; ctx.fillRect(0, horizonY, W, 58);
  ctx.fillStyle = pal['stand-0']; ctx.fillRect(0, horizonY, W, 6);
  for (let x = 0; x < W; x += 3) {
    for (let y = horizonY + 10; y < horizonY + 50; y += 3) {
      ctx.fillStyle = ((x * 3 + y * 5) % 11) < 5 ? pal['crowd-0'] : pal['crowd-2'];
      ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.fillStyle = pal['hedge-1']; ctx.fillRect(0, horizonY + 58, W, 30);
  ctx.fillStyle = pal['turf-0']; ctx.fillRect(0, horizonY + 88, W, H - horizonY - 88);
}

/**
 * ★走路まわりを、**内外方向の帯**として描く。
 *
 * ⚠️ ★以前は「芝コースだけ」を描き、その外は一面の緑でした。
 *    参考では**外の芝・ダート・内馬場・埒**で埋まっており、
 *    ★**一面の緑だと「空いている」ように見えます**（引きのカットで上下が余った原因）。
 *
 * ★`w` は走路の内外 [m] ですが、**0 未満や幅より大きい値も投影できます**
 *   （`posOf` は `w − 中心` を法線方向に足すだけなので、走路の外側も出せる）。
 */
/**
 * ★内馬場のいちばん奥。⚠️ ここを深くしすぎると**スタンドを覆い隠します**
 *   （実際に隠れました）。★**地平線はこの帯の端から決めます。**
 */
const INFIELD_W = -26;

function bandBetween(ctx, cam, w0, w1, role) {
  const poly = (w) => railPolyline(COURSE, cam, w, { fromM: -120, toM: 320, stepM: 5 });
  const a2 = poly(w0);
  const b2 = poly(w1);
  ctx.beginPath();
  a2.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  for (let i = b2.length - 1; i >= 0; i--) ctx.lineTo(b2[i].x, b2[i].y);
  ctx.closePath();
  ctx.fillStyle = pal[role];
  ctx.fill();
}

function lineAt(ctx, cam, w, thick, role) {
  const line = railPolyline(COURSE, cam, w, { fromM: -120, toM: 320, stepM: 5 });
  ctx.beginPath();
  line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = pal[role];
  ctx.lineWidth = thick;
  ctx.stroke();
}

function track(ctx, cam) {
  const WIDTH = COURSE.widthM;
  /* ── 奥（内ラチより内側）── ★これが無いと一面の緑になる ── */
  bandBetween(ctx, cam, INFIELD_W, -12, 'turf-1');     // 内馬場
  lineAt(ctx, cam, -12, 3, 'rail-1');            // 内埒
  bandBetween(ctx, cam, -12, -1, 'dirt-2');      // ★ダートコース（内側）
  lineAt(ctx, cam, -1, 2, 'dirt-3');

  /* ── 芝コース ── */
  bandBetween(ctx, cam, 0, WIDTH, 'turf-3');
  for (let k = 1; k < 7; k++) {
    if (k % 2 === 0) continue;
    bandBetween(ctx, cam, (WIDTH * k) / 7, (WIDTH * (k + 1)) / 7, 'turf-2');
  }

  /* ── 手前（外ラチより外側）── */
  bandBetween(ctx, cam, WIDTH, WIDTH + 30, 'turf-4');

  lineAt(ctx, cam, 0, 4, 'rail-0');              // 内ラチ
  lineAt(ctx, cam, WIDTH, 6, 'rail-1');          // 外ラチ
}

/**
 * ★接地点はセルの左下（契約 (52,116) / セル 160x120）。
 * ★シートは **6コマ × 8行（枠色）**。★色は枠、数字は個体（D-060）。
 */
const CELL_H = 120;
function drawHorse(ctx, img, x, y, frame, gate, widthPx) {
  const cw = img.width / 6;
  const sc = widthPx / cw;
  const hh = Math.round(CELL_H * sc);
  /** ★枠色の行を選ぶ（1〜8 → 0〜7） */
  const row = Math.max(0, Math.min(7, Number(frameRoleOf(gate, FIELD).slice(6)) - 1));
  ctx.fillStyle = 'rgba(20,30,18,0.30)';
  ctx.beginPath();
  ctx.ellipse(x, y - 2, widthPx * 0.20, widthPx * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, frame * cw, row * CELL_H, cw, CELL_H,
    Math.round(x - 52 * sc), Math.round(y - 116 * sc), widthPx, hh);
  const col = pal[frameRoleOf(gate, FIELD)] ?? pal['paper-0'];
  const bw = Math.max(16, Math.round(widthPx * 0.17));
  const bh = Math.max(12, Math.round(bw * 0.72));
  const bx = Math.round(x + widthPx * 0.02);
  const by = Math.round(y - hh * 0.5);
  ctx.fillStyle = pal['paper-0'];
  ctx.fillRect(bx - bw / 2, by, bw, bh);
  ctx.fillStyle = col;
  ctx.fillRect(bx - bw / 2, by, bw, Math.max(3, bh * 0.22));
  ctx.fillStyle = pal['ink-0'];
  ctx.font = `bold ${Math.max(9, Math.round(bh * 0.72))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(String(gate), bx, by + bh - Math.max(2, bh * 0.18));
  ctx.textAlign = 'left';
}

/** カット定義。★アートバイブル「カットの3系統」 */
/**
 * ★走路の帯（画面の高さの割合）は **走路の幅 × pxPerM × depth ÷ 720**。
 *   参考の実測に合わせます: ★**引き 23% ／ 寄り 43%**。
 */
const CUTS = [
  // 20m × 15 × 0.55 = 165px = 23%   ★参考どおり
  // ⚠️ ★anchorY は「走路の中心（w=12.5m）が来る画面 y」。低くしないと馬が上半分に寄る
  { name: 'wide', label: '引き（道中）', d: 0.30, cam: { pxPerM: 15, depth: 0.55, anchorX: 470, anchorY: 545 } },
  // 20m × 30 × 0.52 = 312px = 43%   ★参考どおり
  { name: 'close', label: '寄り（見せ場）', d: 0.62, cam: { pxPerM: 30, depth: 0.52, anchorX: 380, anchorY: 590 } },
  // ★ゴールはほぼ真横（帯を薄く）
  { name: 'goal', label: 'ゴール', d: 0.985, cam: { pxPerM: 22, depth: 0.20, anchorX: 560, anchorY: 560 } },
];
/** 引きで試す幅（★並べて決める） */
const WIDE_SIZES = [48, 64, 96, 128];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const img = await loadImage(path.resolve('apps/web/public/art/horse-oblique.png'));

  const render = (cut, horseW) => {
    const sec = warp.raceSecAt(warp.displaySec * cut.d);
    const at = model.at(sec);
    /**
     * ⚠️ ★最初は「1番の馬」にカメラを合わせました。**1番が最後方だと馬群が画面の隅に寄ります**
     *    （実際、右3分の2が空になりました）。
     * → ★**馬群の中心**に合わせます。
     */
    const centre = at.reduce((s2, h) => s2 + h.meters, 0) / at.length;
    const cam = { ...cut.cam, s: Math.max(1, Math.min(DIST - 1, centre)), w: COURSE.widthM / 2 };
    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    /**
     * ★**地平線は、内馬場のいちばん奥が来る画面 y** から決めます。
     *   ⚠️ 手で決めていたら、★**帯がスタンドを覆い隠しました**。
     */
    const farY = obliqueProject(COURSE, cam, cam.s, INFIELD_W).y;
    sky(ctx, Math.max(60, Math.round(farY - 88)));
    track(ctx, cam);
    const drawn = at.map((h) => {
      const p = obliqueProject(COURSE, cam, Math.max(0, Math.min(DIST, h.meters)), h.w ?? COURSE.widthM / 2);
      return { ...h, ...p };
    }).sort((a, b) => a.y - b.y);
    for (const h of drawn) {
      drawHorse(ctx, img, h.x, h.y, (h.gate * 2 + Math.floor(sec * 2.4)) % 6, h.gate, horseW);
    }
    return { cv, drawn };
  };

  console.log(`★${DIST}m・${FIELD}頭・シード ${SEED}　表示 ${warp.displaySec.toFixed(1)}秒\n`);
  console.log('  カット        時点   馬の幅  画面幅比  写る  走路の帯  馬群の横幅  内/外');
  for (const cut of CUTS) {
    const sizes = cut.name === 'wide' ? WIDE_SIZES : [cut.name === 'close' ? 180 : 96];
    for (const hw of sizes) {
      const { cv, drawn } = render(cut, hw);
      const inFrame = drawn.filter((h) => h.x > -hw && h.x < W + hw && h.y > 100 && h.y < H).length;
      const ys = drawn.map((h) => h.y);
      const file = path.join(OUT, `${cut.name}${sizes.length > 1 ? `-${hw}` : ''}.png`);
      writeFileSync(file, cv.toBuffer('image/png'));
      const band = COURSE.widthM * cut.cam.pxPerM * cut.cam.depth;
      const xs = drawn.map((h) => h.x);
      console.log(`  ${cut.label.padEnd(12)} ${(cut.d * 100).toFixed(0).padStart(3)}%  ${String(hw).padStart(4)}px`
        + `   ${(hw / W * 100).toFixed(1).padStart(5)}%     ${String(inFrame).padStart(2)}/${FIELD}`
        + `   ${(band / H * 100).toFixed(0).padStart(3)}%`
        + `   ${(Math.max(...xs) - Math.min(...xs)).toFixed(0).padStart(4)}px`
        + `   ${(Math.max(...ys) - Math.min(...ys)).toFixed(0).padStart(3)}px`);
    }
  }
  console.log(`\n★${OUT}`);
  console.log('⚠️ ★UI（実況帯・順位表示）は入れていません。構図と大きさだけを見ます。');
}
main().catch((e) => { console.error('★落ちました:', e); process.exit(1); });
