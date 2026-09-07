/**
 * ★Gate 0B — ★**デフォルメ馬のリグを、図形のまま 3 秒動かして撮る**
 *
 * 【★何を見ていただくためのものか】
 *   ★**動きだけ**です。★造形は Gate 1 で判定します。
 *   ★指示書 §9 Gate 1 の手前に置いた段（★レビュー側裁定 1・12）。
 *
 *   > ★**この骨組みに完成した絵を載せれば、違和感のないデフォルメ馬になりそうか。**
 *
 * 【★2 本出します（★裁定・第3版）】
 *   ★① 通常速度 … 全体として走って見えるか
 *   ★② **0.25 倍速** … ★通常速度では見落としやすい **接地滑り / 脚の跳び / 騎手の浮き**
 *   ⚠️ ★0.25 倍速は ★**コマを増やしません**。★同じ姿勢列を 4 倍の尺で出します
 *      （★補間で中割りを作ると、★実際には無い滑らかさを見せることになるため）。
 *
 * 【★憲法】
 *   ★時刻も乱数も使いません。★進んだ距離と馬番だけで決まります（★憲法4）。
 *   ★製品コードは変更しません。★`@star/render` の純粋関数を読むだけです。
 *   ★色は `palette.json` から役割名で引きます（★裁定 7・★16 進をこの道具に持ちません）。
 *
 * ★実行:
 *   npx tsx tools/render-deformed-gate0.mjs [--sec 3] [--fps 30] [--gate 3] [--speed 16]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import {
  DEFORMED_HORSE_V0, DEFORMED_GAIT_V0, deformedPoseAt, deformedHorseShapes,
  gaitFitsLegs, supportCount, hoofWorldX, legPhase, gaitPhase, legInContact,
} from '@star/render';

/**
 * ⚠️ ★**和文の書体を登録しないと、文字が全部豆腐（□）になります**（`_shapecompare.mjs` の註）。
 *    ★実際 1 回目の書き出しで全滅しました。★既存ツールと同じ候補列を使います（R-30）。
 */
for (const file of ['C:/Windows/Fonts/YuGothB.ttc', 'C:/Windows/Fonts/meiryob.ttc', 'C:/Windows/Fonts/msgothic.ttc']) {
  try { if (GlobalFonts.registerFromPath(file, 'JPUI')) break; } catch { /* 次の候補へ */ }
}
const FONT = (px, bold) => `${bold ? 'bold ' : ''}${px}px JPUI, sans-serif`;

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : Number(process.argv[i + 1]); };
const SEC = arg('sec', 3);
const FPS = arg('fps', 30);
const GATE = arg('gate', 3);
const SPEED = arg('speed', 16);

const W = 1280;
const H = 720;
const OUT = path.resolve('out/deformed-gate0');
const WORK = path.join(OUT, '_frames');
const FFMPEG = path.resolve('node_modules/ffmpeg-static/ffmpeg.exe');

const C = DEFORMED_HORSE_V0;
const G = DEFORMED_GAIT_V0;

/**
 * ★色は ★**既存パレットが唯一の出どころ**（裁定 7）。
 *   ⚠️ ★ここで 16 進を新しく決めません。★役割名を palette の役割へ**対応づける**だけです。
 */
const PALETTE = JSON.parse(readFileSync(path.resolve('apps/web/public/art/palette.json'), 'utf8'));
const need = (k) => {
  const v = PALETTE[k];
  if (typeof v !== 'string') throw new Error(`palette.json に役割 "${k}" がありません（★ここで色を作りません）`);
  return v;
};
/**
 * ★**役割の対応づけ**。⚠️ ★16 進を 1 つも新しく書きません（★裁定 7）。
 *   ★`palette.json` に**無い**役割（★たてがみ・蹄・肌など）は、
 *   ★**既にある役割で代用**します。★勝手に色を作ると、★色の出どころが 2 つになります。
 *   ★毛色の並びは「0 = 明るい／3 = 暗い」（★palette.json 冒頭の注記）。
 * ⚠️ ★Gate 1 で絵柄を決めるときに、★不足する役割を palette へ足すか判断します。
 */
const COAT = 'kuri';
const ROLE = {
  coat: need(`coat-${COAT}-1`),
  coatShade: need(`coat-${COAT}-3`),
  coatLight: need(`coat-${COAT}-0`),
  mane: need(`coat-${COAT}-3`),
  hoof: need('ink-1'),
  muzzle: need(`coat-${COAT}-2`),
  eye: need('ink'),
  outline: need('ink'),
  silk: need('silk-3'),
  cap: need('frame-3'),
  skin: need('paper-1'),
  boot: need('ink-1'),
  saddle: need('coat-kurokage-3'),
  shadow: need('ink-2'),
  numberCloth: need('paper'),
  numberInk: need('ink'),
};
/** ★接地影だけは、★下の絵が透ける必要があるので薄く敷きます（★色は上の役割のまま） */
const SHADOW_ALPHA = 0.26;

/** ★1m を何画素で描くか。★§5 の「画面高 18〜24%」に入るように決めます */
const targetRatio = 0.21;
const PX_PER_M = (H * targetRatio) / C.totalHeightM;
const GROUND_Y = Math.round(H * 0.78);
const CENTRE_X = Math.round(W * 0.5);

/** ★[m]（y は上が正）→ ★画面 [px]（y は下が正） */
const sx = (x) => CENTRE_X + x * PX_PER_M;
const sy = (y) => GROUND_Y - y * PX_PER_M;

function drawShape(ctx, s) {
  ctx.beginPath();
  if (s.kind === 'ellipse') {
    ctx.ellipse(sx(s.x), sy(s.y), Math.max(0.5, s.rx * PX_PER_M), Math.max(0.5, s.ry * PX_PER_M), -s.angleRad, 0, Math.PI * 2);
  } else if (s.kind === 'capsule') {
    ctx.lineCap = 'round';
    ctx.strokeStyle = ROLE[s.fill];
    ctx.lineWidth = Math.max(1, s.radius * 2 * PX_PER_M);
    ctx.moveTo(sx(s.x1), sy(s.y1));
    ctx.lineTo(sx(s.x2), sy(s.y2));
    if (s.outline) {
      ctx.save();
      ctx.strokeStyle = ROLE.outline;
      ctx.lineWidth = Math.max(1, s.radius * 2 * PX_PER_M + 2.6);
      ctx.stroke();
      ctx.restore();
    }
    ctx.stroke();
    return;
  } else {
    s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(sx(p.x), sy(p.y)) : ctx.lineTo(sx(p.x), sy(p.y))));
    ctx.closePath();
  }
  if (s.outline) { ctx.strokeStyle = ROLE.outline; ctx.lineWidth = 2.6; ctx.stroke(); }
  if (s.fill === 'shadow') { ctx.save(); ctx.globalAlpha = SHADOW_ALPHA; }
  ctx.fillStyle = ROLE[s.fill];
  ctx.fill();
  if (s.fill === 'shadow') ctx.restore();
}

/** ★背景。★単色 + ★**動きが分かる目盛り**（★接地滑りを目で見るため） */
function drawBackground(ctx, travelM) {
  ctx.fillStyle = '#eef2f5';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#dfe6ea';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  /** ★1m ごとの縦線。★**接地中の蹄はこの線に貼り付いたまま流れます** */
  const first = Math.floor(travelM - 8);
  ctx.strokeStyle = '#c3ced5';
  ctx.lineWidth = 1;
  ctx.font = FONT(11);
  ctx.fillStyle = '#9aa8b2';
  for (let m = first; m < travelM + 8; m += 1) {
    const x = sx(m - travelM);
    if (x < -20 || x > W + 20) continue;
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y - 14);
    ctx.lineTo(x, H);
    ctx.stroke();
    if (m % 5 === 0) ctx.fillText(`${m}m`, x + 3, GROUND_Y + 18);
  }
  ctx.strokeStyle = '#8d9aa4';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
}

/** ★接地している蹄に印を出す（★0.25 倍速で「刺さったまま」を確かめるため） */
function drawContactMarks(ctx, travelM) {
  const phase = gaitPhase(travelM, GATE, G);
  for (const leg of ['hindFar', 'hindNear', 'foreFar', 'foreNear']) {
    if (!legInContact(legPhase(phase, leg, G), G)) continue;
    const wx = hoofWorldX(travelM, GATE, leg, C.legs[leg], G);
    const x = sx(wx - travelM);
    ctx.strokeStyle = '#d0463a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y - 9);
    ctx.lineTo(x, GROUND_Y + 9);
    ctx.stroke();
  }
}

function drawHud(ctx, frame, total, travelM, pose, label) {
  ctx.fillStyle = '#2c3a44';
  ctx.font = FONT(15, true);
  ctx.fillText(`STARミニホース — Gate 0B（★暫定契約 v0・★図形のみ・★動きの判定用）`, 24, 30);
  ctx.font = FONT(13);
  ctx.fillStyle = '#5a6b76';
  ctx.fillText(label, 24, 52);
  ctx.fillText(
    `${frame + 1}/${total}  進行 ${travelM.toFixed(2)}m  完歩位相 ${pose.phase.toFixed(3)}  接地 ${pose.supportCount} 本  速さ ${SPEED}m/s`,
    24, 72,
  );
  ctx.fillText(`赤い縦線 = ★いま地面に刺さっている蹄（★動かなければ滑っていません）`, 24, 92);
}

function renderFrames() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const total = Math.round(SEC * FPS);
  for (let f = 0; f < total; f += 1) {
    const travelM = (f / FPS) * SPEED;
    const pose = deformedPoseAt({ travelM, gate: GATE, speedMps: SPEED, contract: C });
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    drawBackground(ctx, travelM);
    for (const s of deformedHorseShapes(pose, C, { facing: 1 })) drawShape(ctx, s);
    /** ⚠️ ★印は**馬の上**に描きます（★1 度目は馬の背面に隠れて見えませんでした） */
    drawContactMarks(ctx, travelM);
    drawHud(ctx, f, total, travelM, pose, '通常速度');
    writeFileSync(path.join(WORK, `p${String(f).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
  }
  return total;
}

function encode(name, fps) {
  const out = path.join(OUT, name);
  execFileSync(FFMPEG, [
    '-y', '-framerate', String(fps), '-i', path.join(WORK, 'p%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', out,
  ], { stdio: 'pipe' });
  return out;
}

mkdirSync(OUT, { recursive: true });
const total = renderFrames();

/** ★① 通常速度 */
const normal = encode('deformed-gate0-normal.mp4', FPS);
/** ★② 0.25 倍速 — ★**同じコマを 4 倍の尺で**（★中割りを作らない） */
const slow = encode('deformed-gate0-quarter.mp4', FPS / 4);

const fit = gaitFitsLegs(C, G);
let air = 0;
for (let i = 0; i < 2000; i += 1) if (supportCount((i / 2000) * G.strideM, GATE, G) === 0) air += 1;

const summary = {
  contractSchemaVersion: C.schemaVersion,
  frames: total,
  seconds: SEC,
  fps: FPS,
  speedMps: SPEED,
  gate: GATE,
  strideM: G.strideM,
  duty: G.duty,
  stridesPerSecond: Number((SPEED / G.strideM).toFixed(3)),
  framesPerStride: Number(((FPS * G.strideM) / SPEED).toFixed(2)),
  flightFraction: Number((air / 2000).toFixed(3)),
  legFitsOk: fit.ok,
  legNeedM: Number(fit.needM.toFixed(4)),
  legHaveM: Number(fit.haveM.toFixed(4)),
  horseScreenHeightRatio: Number(((C.totalHeightM * PX_PER_M) / H).toFixed(4)),
  videos: { normal, quarter: slow },
};
writeFileSync(path.join(OUT, 'gate0b-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
