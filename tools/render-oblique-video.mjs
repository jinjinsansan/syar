/**
 * ★**斜め俯瞰でレースを1本、動画にする**（D-066・β）
 *
 * 【なぜ要るか】
 *   ⚠️ ★**静止画では分からないことがあります。**
 *      「レース演出の基礎」§9 に書いたとおり、数字と静止画が良くても
 *      動かすと**小間切れ**・**右端に消える**・**行進に見える**が出ます。
 *      実際、この案件でその3つを全部踏みました。
 *   → ★**絵を動かして、自分の目で見てから出します。**
 *
 * 【★合成データを使いません】
 *   本番のエンジン → 境界時刻 → 位置モデル（脚質から生成）→ 投影、を通します。
 *
 * 【★カットの切り替え】
 *   アートバイブル「カットの3系統」。実際の中継と同じく**ハードカット**です
 *   （ゆっくり寄るのは1つのカットの中でやることで、カット間ではやりません）。
 *
 * 実行: npx tsx tools/render-oblique-video.mjs [--distance 1600] [--seed 42] [--fps 24]
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import {
  DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt, laneAtStart, TRACK_WIDTH_M,
} from '@star/race-engine';
import {
  replayPositionModel, finalOrderOf, ovalCourse, obliqueProject, railPolyline,
  timeWarpFor, knotsFor, ratesForTarget, targetDisplaySec, frameRoleOf, gateStalls,
} from '@star/render';

const W = 1280, H = 720;
const OUT = path.resolve('out/video');
const WORK = path.join(OUT, 'frames');
const pal = JSON.parse(readFileSync('apps/web/public/art/palette.json', 'utf8'));
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const DIST = num('--distance', 1600);
const SEED = num('--seed', 42);
const FPS = num('--fps', 24);
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
  raceId: `v${SEED}`, distance: DIST, surface: 'turf',
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

/* ── 背景・走路（★`shot-cuts.mjs` と同じ描き方）─────────── */
const INFIELD_W = -26;

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

function bandBetween(ctx, cam, w0, w1, role) {
  const poly = (w) => railPolyline(COURSE, cam, w, { fromM: -180, toM: 420, stepM: 5 });
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
  const line = railPolyline(COURSE, cam, w, { fromM: -180, toM: 420, stepM: 5 });
  ctx.beginPath();
  line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = pal[role];
  ctx.lineWidth = thick;
  ctx.stroke();
}

function track(ctx, cam) {
  const WIDTH = COURSE.widthM;
  bandBetween(ctx, cam, INFIELD_W, -12, 'turf-1');
  lineAt(ctx, cam, -12, 3, 'rail-1');
  bandBetween(ctx, cam, -12, -1, 'dirt-2');
  lineAt(ctx, cam, -1, 2, 'dirt-3');
  bandBetween(ctx, cam, 0, WIDTH, 'turf-3');
  for (let k = 1; k < 7; k++) {
    if (k % 2 === 0) continue;
    bandBetween(ctx, cam, (WIDTH * k) / 7, (WIDTH * (k + 1)) / 7, 'turf-2');
  }
  bandBetween(ctx, cam, WIDTH, WIDTH + 30, 'turf-4');
  lineAt(ctx, cam, 0, 4, 'rail-0');
  lineAt(ctx, cam, WIDTH, 6, 'rail-1');
}

/**
 * ★**決勝線とハロン棒**。
 *   ⚠️ これが無いと「あとどれだけか」が画面から分かりません
 *      （オーナーの指摘「ゴール前が一番盛り上がるはずなのに全くわからない」）。
 */
function marks(ctx, cam) {
  const seg = (s, w0, w1, color, thick) => {
    const a = obliqueProject(COURSE, cam, s, w0);
    const b = obliqueProject(COURSE, cam, s, w1);
    if (Math.max(a.x, b.x) < -50 || Math.min(a.x, b.x) > W + 50) return;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color; ctx.lineWidth = thick; ctx.stroke();
  };
  // ★ハロン棒（200m ごと）
  for (let m = 200; m < DIST; m += 200) {
    const p = obliqueProject(COURSE, cam, m, -2);
    if (p.x < -40 || p.x > W + 40) continue;
    ctx.fillStyle = pal['paper-0'];
    ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 18, 4, 18);
    ctx.fillStyle = pal['ink-0'];
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(DIST - m), Math.round(p.x), Math.round(p.y) - 22);
    ctx.textAlign = 'left';
  }
  // ★決勝線
  seg(DIST, 0, COURSE.widthM, pal['paper-0'], 5);
}

/**
 * ★**発走ゲート**（オーナーの指摘「枠入りではなく**ゲート入り**にすべき」）。
 *
 * ⚠️ ★房の位置は**エンジンの `laneAtStart` から**取ります。
 *    自前に並べると、★**描いたゲートの外に馬が立ちます**（実際に 18m と 13.8m で離れていました）。
 */
function gate(ctx, cam) {
  const stalls = gateStalls(COURSE, cam, 0, FIELD,
    (g) => laneAtStart(g, FIELD, TRACK_WIDTH_M));
  const first = stalls[0], last = stalls[stalls.length - 1];
  if (first === undefined || last === undefined) return;
  if (Math.max(first.x, last.x) < -80 || Math.min(first.x, last.x) > W + 80) return;
  const h = Math.max(10, Math.round((cam.pxPerM ?? 15) * 2.4));   // ★房の高さ = 馬の背丈ぶん
  for (const st of stalls) {
    const x = Math.round(st.x), y = Math.round(st.y);
    // 房の枠（後ろ扉は開いている＝横棒は上だけ）
    ctx.fillStyle = pal['rail-1'];
    ctx.fillRect(x - 2, y - h, 3, h);
    ctx.fillRect(x + Math.round(h * 0.5), y - h, 3, h);
    ctx.fillStyle = pal['rail-0'];
    ctx.fillRect(x - 2, y - h - 3, Math.round(h * 0.5) + 5, 3);
    // ★房の番号（枠色）
    ctx.fillStyle = pal[frameRoleOf(st.gate, FIELD)] ?? pal['paper-0'];
    ctx.fillRect(x - 2, y - h - 9, Math.round(h * 0.5) + 5, 6);
  }
}

/* ── 馬 ─────────────────────────────────── */
const CELL_H = 120;
function drawHorse(ctx, img, x, y, frame, gate, widthPx) {
  const cw = img.width / 6;
  const sc = widthPx / cw;
  const hh = Math.round(CELL_H * sc);
  const row = Math.max(0, Math.min(7, Number(frameRoleOf(gate, FIELD).slice(6)) - 1));
  ctx.fillStyle = 'rgba(20,30,18,0.30)';
  ctx.beginPath();
  ctx.ellipse(x, y - 2, widthPx * 0.20, widthPx * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, frame * cw, row * CELL_H, cw, CELL_H,
    Math.round(x - 52 * sc), Math.round(y - 116 * sc), widthPx, hh);
  const col = pal[frameRoleOf(gate, FIELD)] ?? pal['paper-0'];
  const bw = Math.max(14, Math.round(widthPx * 0.17));
  const bh = Math.max(10, Math.round(bw * 0.72));
  const bx = Math.round(x + widthPx * 0.02);
  const by = Math.round(y - hh * 0.5);
  ctx.fillStyle = pal['paper-0'];
  ctx.fillRect(bx - bw / 2, by, bw, bh);
  ctx.fillStyle = col;
  ctx.fillRect(bx - bw / 2, by, bw, Math.max(3, bh * 0.22));
  ctx.fillStyle = pal['ink-0'];
  ctx.font = `bold ${Math.max(8, Math.round(bh * 0.72))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(String(gate), bx, by + bh - Math.max(2, bh * 0.18));
  ctx.textAlign = 'left';
}

/**
 * ★**カットの切り替え**（アートバイブル「カットの3系統」）。
 *   ⚠️ 実際の中継は**ハードカット**です。ゆっくり寄るのは1つのカットの中でやります。
 *   ★切り替えの条件は「先頭の残り距離」— **時刻ではありません**
 *     （時間配分 D-062 で表示の時計は伸び縮みするので、時刻で切ると局面とずれます）。
 */
const CUTS = {
  wide: { label: '引き', horseW: 64, cam: { pxPerM: 15, depth: 0.55, anchorX: 470, anchorY: 545 } },
  close: { label: '寄り', horseW: 180, cam: { pxPerM: 30, depth: 0.52, anchorX: 380, anchorY: 590 } },
  goal: { label: 'ゴール', horseW: 96, cam: { pxPerM: 22, depth: 0.20, anchorX: 560, anchorY: 560 } },
};
function cutFor(metersLeft) {
  if (metersLeft <= 220) return CUTS.goal;
  if (metersLeft <= 800) return CUTS.close;
  return CUTS.wide;
}

async function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const img = await loadImage(path.resolve('apps/web/public/art/horse-oblique.png'));

  const total = Math.ceil(warp.displaySec * FPS);
  console.log(`★${DIST}m・${FIELD}頭・シード ${SEED}`);
  console.log(`  表示 ${warp.displaySec.toFixed(1)}秒 × ${FPS}fps = ${total} 枚\n`);

  let prevCut = '';
  const cuts = [];
  for (let i = 0; i <= total; i += 1) {
    const dispSec = i / FPS;
    const sec = warp.raceSecAt(dispSec);
    const at = model.at(sec);
    const lead = Math.max(...at.map((h) => h.meters));
    const cut = cutFor(DIST - lead);
    if (cut.label !== prevCut) { cuts.push(`${cut.label}@${dispSec.toFixed(1)}s`); prevCut = cut.label; }

    // ★カメラは**馬群の中心**に（1頭に付けると馬群が画面の隅に寄る）
    const centre = at.reduce((s, h) => s + h.meters, 0) / at.length;
    /**
     * ★**内外もカメラが追います。**
     *
     * ⚠️ ★走路の中心（w=10m）を見ていたら、**馬群が走路の上端に貼りつき、
     *    画面の下3分の2が空**になりました（実際にそう写りました）。
     *    馬はラチを取りにいくので、★**走路の真ん中は走りません。**
     * → 見るのは**馬群の内外の中心**です。
     */
    const wCentre = at.reduce((s, h) => s + (h.w ?? COURSE.widthM / 2), 0) / at.length;
    const cam = { ...cut.cam, s: Math.max(1, Math.min(DIST - 1, centre)), w: wCentre };

    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const farY = obliqueProject(COURSE, cam, cam.s, INFIELD_W).y;
    sky(ctx, Math.max(60, Math.round(farY - 88)));
    track(ctx, cam);
    marks(ctx, cam);
    // ★ゲートは馬より先（＝馬の後ろ）に描く。出た馬が手前に来る
    gate(ctx, cam);

    const drawn = at.map((h) => {
      const p = obliqueProject(COURSE, cam, Math.max(0, Math.min(DIST, h.meters)), h.w ?? COURSE.widthM / 2);
      return { ...h, ...p };
    }).sort((a, b) => a.y - b.y);   // ★奥（上）から描く＝手前の馬が奥を隠す
    for (const h of drawn) {
      /**
       * ★脚は**表示の時間**で回します（D-062 の教訓）。
       *   ⚠️ 距離で回すと、道中を速く送ったときに**脚も速く回り**、小走りに見えます。
       *   ★競走馬は毎秒およそ2歩。6コマ1完歩なので **毎秒12コマ**。
       */
      const frame = Math.floor(dispSec * 12 + h.gate * 0.37 * 6) % 6;
      drawHorse(ctx, img, h.x, h.y, frame, h.gate, cut.horseW);
    }
    writeFileSync(path.join(WORK, `f${String(i).padStart(4, '0')}.png`), cv.toBuffer('image/png'));
  }

  console.log(`  カットの切り替え: ${cuts.join(' → ')}`);
  const mp4 = path.join(OUT, `race-${DIST}-${SEED}.mp4`);
  execFileSync(ffmpeg, [
    '-y', '-framerate', String(FPS), '-i', path.join(WORK, 'f%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4,
  ], { stdio: 'pipe' });
  console.log(`\n★${mp4}`);
  console.log('⚠️ ★UI（実況帯・ゲージ・順位表示）はまだ入れていません。動きと構図だけを見ます。');
}
main().catch((e) => { console.error('★落ちました:', e); process.exit(1); });
