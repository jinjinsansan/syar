/**
 * ★斜め俯瞰 — **静止画で「表示できるようになったもの」を確かめる**（手順②）
 *
 * 【裁定の手順】①1頭だけ試作 → ★**②内/外・コーナー・ゲートが表示できることと V-16 を確認**
 *
 * 【★この道具の立ち位置】
 *   ★**新しいレンダラではありません。** `packages/render/src/oblique.ts`（純粋関数）を
 *   そのまま呼んで、**真横では原理的に不可能だった3つ**が出るかだけを見ます。
 *
 * 【★測るもの】
 *   ・内/外 … 内を通る馬と外を回る馬が、画面の y で分かれるか
 *   ・コーナー … ラチが画面の中で曲がるか（直線では曲がらないか）
 *   ・ゲート … 12房が重ならずに散るか（真横では前後に重なって1頭しか見えなかった）
 *
 * 実行: npx tsx tools/shot-oblique.mjs
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ovalCourse, obliqueProject, railPolyline, gateStalls, frameRoleOf, bracketOf } from '@star/render';

/** ★色は枠、数字は個体（D-060）。18頭でも 8色で足りる */
const FIELD_SIZE = 12;
const frameColor = (gate) => pal[frameRoleOf(gate, FIELD_SIZE)] ?? pal['paper-0'];

const W = 1280, H = 720;
const OUT = path.resolve('out/oblique');
const pal = JSON.parse(readFileSync('apps/web/public/art/palette.json', 'utf8'));
const COURSE = ovalCourse(1600);

/** ★契約（design/art/OBLIQUE_CONTRACT_20260815.md） */
const CAM = { pxPerM: 26, depth: 0.29, anchorX: 520, anchorY: 470 };
const HORSE_W = 160;

/** 12頭。道中の一団（22m）に散らし、内/外もばらす */
const FIELD = Array.from({ length: 12 }, (_, i) => ({
  gate: i + 1,
  ds: -((i * 7919) % 12) / 11 * 22,
  w: 1.5 + ((i * 5 + 3) % 12) * 1.8,
}));

function sky(ctx) {
  for (let y = 0; y < 214; y++) {
    const t = y / 213;
    ctx.fillStyle = pal[t < 0.34 ? 'sky-0' : t < 0.67 ? 'sky-1' : 'sky-2'];
    ctx.fillRect(0, y, W, 1);
  }
  ctx.fillStyle = pal['stand-1']; ctx.fillRect(0, 214, W, 60);
  ctx.fillStyle = pal['stand-0']; ctx.fillRect(0, 214, W, 6);
  for (let x = 0; x < W; x += 3) for (let y = 224; y < 270; y += 3) {
    ctx.fillStyle = ((x * 3 + y * 5) % 11) < 5 ? pal['crowd-0'] : pal['crowd-2'];
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.fillStyle = pal['hedge-1']; ctx.fillRect(0, 274, W, 34);
  ctx.fillStyle = pal['turf-0']; ctx.fillRect(0, 308, W, H - 308);
}

/** ★走路を「内ラチの線と外ラチの線の間」として塗る（帯ではない。コーナーで曲がる） */
function track(ctx, cam) {
  const inner = railPolyline(COURSE, cam, 0, { fromM: -70, toM: 190, stepM: 4 });
  const outer = railPolyline(COURSE, cam, COURSE.widthM, { fromM: -70, toM: 190, stepM: 4 });
  ctx.beginPath();
  inner.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  for (let i = outer.length - 1; i >= 0; i--) ctx.lineTo(outer[i].x, outer[i].y);
  ctx.closePath();
  ctx.fillStyle = pal['turf-3'];
  ctx.fill();
  // ★手入れの縞（内外方向に等間隔）。走路の面であることが伝わる
  for (let k = 1; k < 6; k++) {
    const line = railPolyline(COURSE, cam, (COURSE.widthM * k) / 6, { fromM: -70, toM: 190, stepM: 4 });
    ctx.beginPath();
    line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = k % 2 ? pal['turf-2'] : pal['turf-4'];
    ctx.lineWidth = 10;
    ctx.stroke();
  }
  for (const [w, thick, role] of [[0, 5, 'rail-0'], [COURSE.widthM, 7, 'rail-1']]) {
    const line = railPolyline(COURSE, cam, w, { fromM: -70, toM: 190, stepM: 4 });
    ctx.beginPath();
    line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = pal[role];
    ctx.lineWidth = thick;
    ctx.stroke();
  }
}

function drawHorse(ctx, img, x, y, frame, gate, frames, mul) {
  // ⚠️ ★1コマの絵をシート扱いして 6分の1 幅で切り、6倍に拡大していました（真っ黒な塊になった）
  const cw = img.width / frames;
  const HW = HORSE_W * (mul ?? 1);
  const hh = Math.round(img.height * (HW / cw));
  ctx.fillStyle = 'rgba(20,30,18,0.30)';
  ctx.beginPath();
  ctx.ellipse(x, y - 2, HW * 0.20, HW * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();
  // ★接地点はセルの左下（契約）。そこが (x, y) に来るように置く
  ctx.drawImage(img, frame * cw, 0, cw, img.height,
    Math.round(x - HW * 0.30), Math.round(y - hh + 3), HW, hh);
  const col = frameColor(gate);
  const bx = Math.round(x + HW * 0.02), by = Math.round(y - hh * 0.46);
  ctx.fillStyle = pal['paper-0']; ctx.fillRect(bx - 13, by, 27, 19);
  ctx.fillStyle = col; ctx.fillRect(bx - 13, by, 27, 4);
  ctx.fillStyle = pal['ink-0'];
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(gate), bx + 1, by + 16);
  ctx.textAlign = 'left';
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sheetPath = path.resolve('apps/web/public/art/horse-oblique.png');
  const single = path.resolve('out/oblique/w160.png');
  const useSheet = existsSync(sheetPath);
  const img = await loadImage(useSheet ? sheetPath : single);
  const frames = useSheet ? 6 : 1;
  console.log(`★馬の絵: ${useSheet ? '6コマのシート' : '1コマ（試作①）'}`);

  /**
   * ★**カットごとにカメラを変えます。**
   *   これが「真横ではできなかったこと」の4つめ（裁定表の「カメラの自由度」）。
   *   ・直線 … 標準
   *   ・4角  … ★引いて（pxPerM を下げて）**曲がりが見えるところまで先を映す**
   *   ・ゲート … ★俯角を深く（depth を上げる）。房が内外方向に並ぶので、寝かせると潰れる
   */
  const cases = [
    { name: 'a-straight', s: 1400, label: '直線', cam: {} },
    { name: 'b-corner', s: 1050, label: '4角', cam: { pxPerM: 11, depth: 0.34, anchorX: 300, anchorY: 430 } },
    { name: 'c-gate', s: 0, label: 'ゲート', gate: true, cam: { pxPerM: 34, depth: 0.62, anchorX: 300, anchorY: 400 } },
  ];

  for (const cs of cases) {
    const cam = { ...CAM, ...cs.cam, s: cs.s, w: COURSE.widthM / 2 };
    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    sky(ctx);
    track(ctx, cam);

    if (cs.gate) {
      // ★ゲート: 12房が**内外方向**に並ぶ。真横では原理的に描けなかったもの
      const stalls = gateStalls(COURSE, cam, cs.s, 12);
      const sw = Math.round((COURSE.widthM - 2) / 12 * cam.pxPerM * cam.depth);
      for (const st of stalls) {
        // ★房は「内外方向に並ぶ箱」。奥行き 1房ぶんの高さを投影から出す
        const d = Math.max(10, sw);
        ctx.fillStyle = pal['gate-2']; ctx.fillRect(st.x - 30, st.y - d, 150, d - 1);
        ctx.fillStyle = pal['gate-4']; ctx.fillRect(st.x - 26, st.y - d + 3, 142, d - 7);
        ctx.fillStyle = pal['gate-1']; ctx.fillRect(st.x - 30, st.y - d, 150, 3);
        // ★馬（房の中）— 真横では 12頭が重なって 1頭しか見えなかった
        drawHorse(ctx, img, st.x + 84, st.y - 2, st.gate % frames, st.gate, frames, 0.62);
        const col = frameColor(st.gate);
        ctx.fillStyle = col; ctx.fillRect(st.x - 28, st.y - d + 4, 26, d - 9);
        ctx.fillStyle = pal['ink-0'];
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(st.gate), st.x - 15, st.y - 4);
        ctx.textAlign = 'left';
      }
      const ys = stalls.map((s) => s.y);
      console.log(`  ★ゲート12房の画面 y ${Math.min(...ys).toFixed(0)} 〜 ${Math.max(...ys).toFixed(0)}`
        + `（隣との間隔 ${(ys[1] - ys[0]).toFixed(1)}px）`);
    } else {
      const drawn = FIELD.map((h) => {
        const p = obliqueProject(COURSE, cam, Math.max(0, cam.s + h.ds), h.w);
        return { ...h, ...p };
      }).sort((a, b) => a.y - b.y);   // ★内（奥）から描く
      for (const h of drawn) drawHorse(ctx, img, h.x, h.y, (h.gate * 2) % frames, h.gate, frames);
      const ys = drawn.map((h) => h.y);
      // ⚠️ ★0 を falsy で落としていたので、直線で Math.max() が -Infinity になっていました
      const off = drawn.map((h) => Math.abs(h.headingOffset));
      console.log(`  ★${cs.label}: 内/外の画面 y ${Math.min(...ys).toFixed(0)} 〜 ${Math.max(...ys).toFixed(0)}`
        + `（差 ${(Math.max(...ys) - Math.min(...ys)).toFixed(0)}px）`
        + `  向きのずれ 最大 ${(Math.max(...off) * 180 / Math.PI).toFixed(1)}°`);
    }

    // ラチの曲がりを数える
    const rail = railPolyline(COURSE, cam, 0, { fromM: -70, toM: 190, stepM: 4 });
    const rys = rail.map((p) => p.y);
    console.log(`     内ラチの上下の振れ ${(Math.max(...rys) - Math.min(...rys)).toFixed(0)}px`);

    ctx.fillStyle = `${pal['ink-0']}dd`; ctx.fillRect(0, H - 54, W, 54);
    ctx.fillStyle = pal['mark-gold']; ctx.fillRect(0, H - 54, W, 3);
    ctx.fillStyle = pal['paper-0'];
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(cs.label, 24, H - 18);
    writeFileSync(path.join(OUT, `${cs.name}.png`), cv.toBuffer('image/png'));
  }
  console.log(`\n★${OUT}\n⚠️ 静止画です。動きと V-16 は別に測ります。`);
}
main().catch((e) => { console.error('★落ちました:', e); process.exit(1); });
