/**
 * ★**斜め俯瞰の「世界」を描く**（走路・標識・ゲート・馬）— D-066 / β
 *
 * 【★なぜ package に置くか】
 *   ⚠️ この案件で繰り返し踏んだのは「**2か所で持てば必ず離れる**」です:
 *     `jostle` が判定 0.06 / 製品 0.25 ／ 走路の幅が 20m / 25m ／
 *     ゲートの房が 13.8m / 18m。
 *   ★動画の道具（`tools/render-oblique-video.mjs`）と Web の画面が
 *     **別々に描いたら、必ず離れます**。→ **ここが唯一の描き方**です。
 *
 * 【★描画の環境に依存しません】
 *   `Ctx2D` は、`@napi-rs/canvas` と ブラウザの `CanvasRenderingContext2D` の
 *   **両方が満たす最小の形**だけを要求します。**どちらの型にも依存しません。**
 *
 * 【★この層が持たないもの】
 *   - **UI（ゲージ・順位・実況帯）**: 画面の座標系のもので、アプリごとに置き方が違います。
 *     ⚠️ ただし**ゲージの値はエンジンの `staminaAt()` を読むこと**（D-072）。
 *        ★**この層でも、アプリ側でも、式を作らないでください。**
 *   - **位置**: `PositionModel` が持ちます。ここは受け取った位置を置くだけです。
 */

import { obliqueProject, railPolyline, gateStalls, type ObliqueCamera } from './oblique.js';
import type { Course } from './course.js';

/**
 * ★描画に必要な最小の形。
 *   ⚠️ **足さないでください。** 足すほど、使える環境が減ります。
 */
export interface Ctx2D<TImage = unknown> {
  /**
   * ⚠️ ★`string` にすると**ブラウザの `CanvasRenderingContext2D` が入りません**
   *    （あちらは `string | CanvasGradient | CanvasPattern`）。
   *    ★型を狭めた結果、呼ぶ側が `as unknown as Ctx2D` で**型検査を殺す**ことになります。
   *    実際に一度そう書きました。→ 書き込み専用なので `unknown` で受けます。
   */
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlignLike;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  ellipse(
    x: number, y: number, rx: number, ry: number,
    rot: number, a0: number, a1: number,
  ): void;
  fillText(text: string, x: number, y: number): void;
  /**
   * ★文字幅。**両方の環境にあります**（ブラウザは `TextMetrics`、
   *   `@napi-rs/canvas` も `width` を持つ）。
   * ⚠️ ★これを持たずに `文字数 × 13` で概算したら、
   *    **和文と欧文が混じった行で必ずずれます**。近似しません。
   */
  measureText(text: string): { readonly width: number };
  drawImage(
    img: TImage, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
  ): void;
  /**
   * ★任意（両環境にある）。接地影のように**画像を変形して描く**ときだけ使う。
   *   無い環境では変形を伴う描画を省く（落ちない）。
   */
  save?(): void;
  restore?(): void;
  transform?(a: number, b: number, c: number, d: number, e: number, f: number): void;
}

/** ★ブラウザの `CanvasTextAlign` と同じ並び（`lib.dom` に依存しないため自前に持つ） */
export type CanvasTextAlignLike = 'center' | 'end' | 'left' | 'right' | 'start';

/** 画面の寸法 */
export interface Viewport2D {
  readonly width: number;
  readonly height: number;
}

/** 色は `palette.json` から受け取る。★この層で色を作りません */
export type Palette = Readonly<Record<string, string>>;

/** 文字の指定を作る（環境ごとにフォント名が違うので受け取る） */
export type FontOf = (px: number, bold?: boolean) => string;

/**
 * ★**内馬場のいちばん奥**（走路の内側）。
 *
 * ⚠️ ★−26m 固定にしたら、寄りのカット（16.6px/m）で**内馬場だけで 431px**になり、
 *    **画面の上半分が空虚**になりました。参考では内馬場は細い帯です。
 * → ★**画面に対する割合**で決めます。
 */
export function infieldW(cam: ObliqueCamera, vp: Viewport2D): number {
  return -Math.max(8, Math.min(26, (vp.height * 0.30) / (cam.pxPerM * cam.depth)));
}

/**
 * ★**枠色の上に置く文字の色**。
 *
 * ⚠️ ★黒枠（`#191919`）の上に黒い文字を描いて、**馬番が読めませんでした。**
 *    D-060 は「色は枠、**数字は個体**」なので、
 *    ★**数字が読めないと個体が識別できません**（V-16 の前提が壊れます）。
 */
export function inkOn(pal: Palette, role: string): string {
  const hex = pal[role] ?? '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // ★人の目の感度で明るさを見る
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140 ? (pal['paper-0'] ?? '#fff') : (pal['ink-0'] ?? '#000');
}

const POLY = { fromM: -180, toM: 420, stepM: 5 } as const;

function bandBetween(
  ctx: Ctx2D<never>, course: Course, cam: ObliqueCamera, w0: number, w1: number, color: string,
): void {
  const a = railPolyline(course, cam, w0, POLY);
  const b = railPolyline(course, cam, w1, POLY);
  ctx.beginPath();
  a.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  for (let i = b.length - 1; i >= 0; i -= 1) ctx.lineTo(b[i]!.x, b[i]!.y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function lineAt(
  ctx: Ctx2D<never>, course: Course, cam: ObliqueCamera, w: number, thick: number, color: string,
): void {
  const line = railPolyline(course, cam, w, POLY);
  ctx.beginPath();
  line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  ctx.stroke();
}

/**
 * ★空・スタンド・生け垣。**地平線は内馬場のいちばん奥から決めます。**
 *   ⚠️ 手で決めていたら、★**帯がスタンドを覆い隠しました**。
 */
export function drawSky(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, horizonY: number,
): void {
  const W = vp.width;
  for (let y = 0; y < horizonY; y += 1) {
    const t = y / Math.max(1, horizonY - 1);
    ctx.fillStyle = pal[t < 0.34 ? 'sky-0' : t < 0.67 ? 'sky-1' : 'sky-2'] ?? '#88a';
    ctx.fillRect(0, y, W, 1);
  }
  ctx.fillStyle = pal['stand-1'] ?? '#444'; ctx.fillRect(0, horizonY, W, 58);
  ctx.fillStyle = pal['stand-0'] ?? '#222'; ctx.fillRect(0, horizonY, W, 6);
  for (let x = 0; x < W; x += 3) {
    for (let y = horizonY + 10; y < horizonY + 50; y += 3) {
      ctx.fillStyle = ((x * 3 + y * 5) % 11) < 5
        ? (pal['crowd-0'] ?? '#999') : (pal['crowd-2'] ?? '#666');
      ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.fillStyle = pal['hedge-1'] ?? '#254'; ctx.fillRect(0, horizonY + 58, W, 30);
  ctx.fillStyle = pal['turf-0'] ?? '#374'; ctx.fillRect(0, horizonY + 88, W, vp.height - horizonY - 88);
}

/**
 * ★走路（内馬場・ダート・芝・刈り目・ラチ）。
 */
export function drawTrack(
  ctx: Ctx2D<never>, course: Course, cam: ObliqueCamera, pal: Palette, vp: Viewport2D,
): void {
  const WIDTH = course.widthM;
  const IN_W = infieldW(cam, vp);
  const DIRT = Math.max(IN_W + 2, -12);
  bandBetween(ctx, course, cam, IN_W, DIRT, pal['turf-1'] ?? '#3a5');
  lineAt(ctx, course, cam, DIRT, 3, pal['rail-1'] ?? '#ccc');
  bandBetween(ctx, course, cam, DIRT, -1, pal['dirt-2'] ?? '#75543a');
  lineAt(ctx, course, cam, -1, 2, pal['dirt-3'] ?? '#8a6');
  bandBetween(ctx, course, cam, 0, WIDTH, pal['turf-3'] ?? '#4a6');

  /**
   * ★**芝の刈り目**。
   *
   * ⚠️ ★内外にも刻んだら**市松模様**になりました。芝目は市松ではありません。
   * → ★**進行方向だけ**で刻みます（走路を端から端まで横切る帯）。
   *   斜めに見えるのは**投影の結果**であって、斜めに描くのではありません。
   *
   * ⚠️ ★1本の長さを 25m 固定にしたら、ゴールのカット（22px/m）で **1マス 550px** になり、
   *    画面に1〜2マスしか入らず**縞に見えませんでした**。
   *    → **画面上で 70px 前後**になる長さにします。
   */
  const STRIPE_M = Math.max(6, Math.round(70 / cam.pxPerM));
  const first = Math.floor((cam.s - 220) / (STRIPE_M * 2)) * (STRIPE_M * 2);
  for (let m = first; m < cam.s + 480; m += STRIPE_M * 2) {
    const a = obliqueProject(course, cam, m, 0);
    const b = obliqueProject(course, cam, m + STRIPE_M, 0);
    const c = obliqueProject(course, cam, m + STRIPE_M, WIDTH);
    const d = obliqueProject(course, cam, m, WIDTH);
    if (Math.max(a.x, b.x, c.x, d.x) < -60 || Math.min(a.x, b.x, c.x, d.x) > vp.width + 60) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = pal['turf-2'] ?? '#5b7';
    ctx.fill();
  }

  bandBetween(ctx, course, cam, WIDTH, WIDTH + 30, pal['turf-4'] ?? '#396');
  lineAt(ctx, course, cam, 0, 4, pal['rail-0'] ?? '#eee');
  lineAt(ctx, course, cam, WIDTH, 6, pal['rail-1'] ?? '#ccc');
}

/**
 * ★**決勝線とハロン棒**。
 *   ⚠️ これが無いと「あとどれだけか」が画面から分かりません
 *      （オーナーの指摘「ゴール前が一番盛り上がるはずなのに全くわからない」）。
 */
export function drawMarks(
  ctx: Ctx2D<never>, course: Course, cam: ObliqueCamera, pal: Palette, vp: Viewport2D,
  distanceMeter: number, font: FontOf, poleEveryMeter = 200,
): void {
  for (let m = poleEveryMeter; m < distanceMeter; m += poleEveryMeter) {
    const p = obliqueProject(course, cam, m, -2);
    if (p.x < -40 || p.x > vp.width + 40) continue;
    ctx.fillStyle = pal['paper-0'] ?? '#fff';
    ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 18, 4, 18);
    ctx.fillStyle = pal['ink-0'] ?? '#000';
    ctx.font = font(12, true);
    ctx.textAlign = 'center';
    ctx.fillText(String(distanceMeter - m), Math.round(p.x), Math.round(p.y) - 22);
    ctx.textAlign = 'left';
  }
  // ★決勝線
  const a = obliqueProject(course, cam, distanceMeter, 0);
  const b = obliqueProject(course, cam, distanceMeter, course.widthM);
  if (Math.max(a.x, b.x) < -50 || Math.min(a.x, b.x) > vp.width + 50) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = pal['paper-0'] ?? '#fff';
  ctx.lineWidth = 5;
  ctx.stroke();
}

/**
 * ★**発走ゲート**（オーナーの指摘「枠入りではなく**ゲート入り**にすべき」）。
 *
 * ⚠️ ★房の位置は**エンジンから受け取ります**（`laneAtStart`）。
 *    自前に並べると、★**描いたゲートの外に馬が立ちます**
 *    （実際に 18m と 13.8m で離れていました）。
 *
 * ★房の長さ 4.0m・高さ 2.6m。★寸法も**投影で置きます** —
 *   画面座標で組み立てると、コーナーで走路から浮きます。
 *   ⚠️ ★高さは**縦方向**なので `depth` を掛けません（掛けると房が潰れます）。
 */
export function drawGate(
  ctx: Ctx2D<never>, course: Course, cam: ObliqueCamera, pal: Palette, vp: Viewport2D,
  fieldSize: number, wOf: (gate: number) => number,
  frameRoleOf: (gate: number, fieldSize: number) => string, font: FontOf,
): void {
  const stalls = gateStalls(course, cam, 0, fieldSize, wOf);
  const first = stalls[0];
  const last = stalls[stalls.length - 1];
  if (first === undefined || last === undefined) return;
  if (Math.max(first.x, last.x) < -140 || Math.min(first.x, last.x) > vp.width + 140) return;

  const LEN_M = 4.0, TOP_M = 2.6;
  const top = TOP_M * cam.pxPerM;
  const at = (sM: number, wM: number) => obliqueProject(course, cam, sM, wM);

  for (const st of stalls) {
    const back = at(-LEN_M, st.w);
    const front = at(0, st.w);
    ctx.fillStyle = pal['rail-1'] ?? '#ccc';
    ctx.beginPath();
    ctx.moveTo(back.x, back.y);
    ctx.lineTo(front.x, front.y);
    ctx.lineTo(front.x, front.y - top);
    ctx.lineTo(back.x, back.y - top);
    ctx.closePath();
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal['rail-0'] ?? '#eee';
    ctx.fillRect(Math.round(back.x) - 1, Math.round(back.y - top), 2, Math.round(top));
    ctx.fillRect(Math.round(front.x) - 1, Math.round(front.y - top), 2, Math.round(top));
    ctx.beginPath();
    ctx.moveTo(back.x, back.y - top);
    ctx.lineTo(front.x, front.y - top);
    ctx.strokeStyle = pal['rail-0'] ?? '#eee';
    ctx.lineWidth = 2;
    ctx.stroke();

    const bw = Math.max(12, Math.round(cam.pxPerM * 1.1));
    const bh = Math.max(9, Math.round(bw * 0.62));
    const bx = Math.round((back.x + front.x) / 2 - bw / 2);
    const by = Math.round((back.y + front.y) / 2 - top - bh - 2);
    const role = frameRoleOf(st.gate, fieldSize);
    ctx.fillStyle = pal[role] ?? pal['paper-0'] ?? '#fff';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = inkOn(pal, role);
    ctx.font = font(Math.max(8, Math.round(bh * 0.8)), true);
    ctx.textAlign = 'center';
    ctx.fillText(String(st.gate), bx + bw / 2, by + bh - 2);
    ctx.textAlign = 'left';
  }
}

/** 騎手の乗り方。★**姿勢は作りません**（別コマがシートに無いため・第3便で依頼） */
export type RideMode = 'cruise' | 'drive' | 'celebrate';

/**
 * ★シートの形。**コマ数と接地点はシートごとに違う**ので、引数で受け取ります。
 *
 * ⚠️ ★以前は「6コマ・セル高 120・接地点 (52,116)」を**この層に直接書いて**いました。
 *    8コマのシートに差し替えた瞬間、★**別のコマを切り出して描きます**（黙って壊れます）。
 */
export interface SheetSpec {
  readonly frames: number;
  readonly cellH: number;
  /** 接地点のセル内座標（★1コマの幅に対する比・高さに対する比） */
  readonly anchorXRatio: number;
  readonly anchorYRatio: number;
}
/** 第2便までのシート（6コマ・セル 160×120・接地点 (52,116)） */
export const SHEET_V1: SheetSpec = {
  frames: 6, cellH: 120, anchorXRatio: 52 / 160, anchorYRatio: 116 / 120,
};
/** ★第3便の寄り用（8コマ・セル 300×209）。接地点は整列で下端付近に揃っています */
export const SHEET_V2: SheetSpec = {
  frames: 8, cellH: 209, anchorXRatio: 0.50, anchorYRatio: 1.0,
};
/**
 * ★第3便の引き用（8コマ・セル 120×76）。
 *
 * ⚠️ ★引きも寄りのシート（300px）を **0.4倍**に縮めて描いていました。
 *    半端な比なので**画素の格子が合わず、輪郭が濁ります**
 *    — 契約 §5 で自分が禁じていた形を、自分でやっていました。
 * → ★引き用は**別に描き起こした**シートを使います。
 */
/**
 * ★**後ろ姿**（8コマ・セル 200×506）。追走カメラの主役の絵です。
 *
 * ⚠️ ★参考は3枚とも**馬群の後ろ**から見ていました。真横の絵では別物になります。
 */
export const SHEET_REAR: SheetSpec = {
  frames: 8, cellH: 506, anchorXRatio: 0.50, anchorYRatio: 1.0,
};
/** 斜め前の中継カメラ用（4コマ・セル 300×274）。勝負服の重心で機械整列済み。 */
export const SHEET_DIAG_FRONT_V1: SheetSpec = {
  frames: 4, cellH: 274, anchorXRatio: 263 / 453, anchorYRatio: 1.0,
};
/** 高い斜め俯瞰カメラ用（4コマ・セル 300×202）。勝負服の重心で機械整列済み。 */
export const SHEET_HIGH_DIAG_V1: SheetSpec = {
  frames: 4, cellH: 202, anchorXRatio: 226 / 397, anchorYRatio: 1.0,
};
/** 斜め後方カメラ用（4コマ・セル 300×249）。勝負服の重心で機械整列済み。 */
export const SHEET_DIAG_REAR_V1: SheetSpec = {
  frames: 4, cellH: 249, anchorXRatio: 284 / 425, anchorYRatio: 1.0,
};
export const SHEET_FAR: SheetSpec = {
  frames: 8, cellH: 76, anchorXRatio: 0.50, anchorYRatio: 1.0,
};

/**
 * ★1頭を描く。
 *
 * ⚠️ ★**騎手の姿勢は作りません。** シートに別コマがありません。
 *    上体の揺れと鞭だけにしてあります（**無い絵を「あることにしない」**）。
 */
export function drawObliqueHorse<TImage>(
  ctx: Ctx2D<TImage>, img: TImage, imgWidth: number, pal: Palette,
  x: number, y: number, frame: number, gate: number, fieldSize: number, widthPx: number,
  frameRoleOf: (gate: number, fieldSize: number) => string, font: FontOf,
  mode: RideMode = 'cruise', phaseT = 0, sheet: SheetSpec = SHEET_V1,
): void {
  const cw = imgWidth / sheet.frames;
  const sc = widthPx / cw;
  const hh = Math.round(sheet.cellH * sc);
  const role = frameRoleOf(gate, fieldSize);
  const row = Math.max(0, Math.min(7, Number(role.slice(6)) - 1));

  ctx.fillStyle = 'rgba(20,30,18,0.30)';
  ctx.beginPath();
  ctx.ellipse(x, y - 2, widthPx * 0.20, widthPx * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // ★追っているときは上体が大きく上下する（走りそのものは変えない）
  const bob = mode === 'cruise' ? 0 : Math.sin(phaseT * Math.PI * 2) * (widthPx * 0.025);
  ctx.drawImage(
    img, frame * cw, row * sheet.cellH, cw, sheet.cellH,
    Math.round(x - cw * sheet.anchorXRatio * sc),
    Math.round(y - sheet.cellH * sheet.anchorYRatio * sc - bob),
    widthPx, hh,
  );

  /**
   * ⚠️ ★鞭は**寄りのカットだけ**にします。
   *    96px で描いたら、★**馬の上に棒が1本浮いている**だけに見えました。
   */
  if (mode !== 'cruise' && widthPx >= 140) {
    const up = mode === 'celebrate' ? 1 : Math.max(0, Math.sin(phaseT * Math.PI * 2));
    const wx = Math.round(x - widthPx * 0.10);
    const wy = Math.round(y - hh * 0.78 - bob);
    ctx.strokeStyle = pal['ink-0'] ?? '#000';
    ctx.lineWidth = Math.max(1, Math.round(widthPx / 60));
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx - widthPx * 0.10, wy - widthPx * (0.06 + 0.16 * up));
    ctx.stroke();
  }

  /**
   * ★ゼッケンの馬番（D-060「色は枠、数字は個体」）。
   *
   * ⚠️ ★第3便のシートは**鞍布そのものが枠色**になりました。
   *    その上に**白い板を重ねて**いたので、★**貼り付けた札**に見えていました。
   * → 板は**枠色**にして鞍布と地続きにし、数字だけを読ませます。
   *   ⚠️ ★寄り（300px）で 51px になり馬より目立ったので、上限は残します。
   */
  const bw = Math.max(13, Math.min(28, Math.round(widthPx * 0.15)));
  const bh = Math.max(9, Math.round(bw * 0.72));
  const bx = Math.round(x + widthPx * 0.02);
  const by = Math.round(y - hh * 0.5);
  ctx.fillStyle = pal[role] ?? pal['paper-0'] ?? '#fff';
  ctx.fillRect(bx - bw / 2, by, bw, bh);
  // ★枠色の上で読める色を選ぶ（黒枠に黒文字だと消えます）
  ctx.fillStyle = inkOn(pal, role);
  ctx.font = font(Math.max(8, Math.round(bh * 0.78)), true);
  ctx.textAlign = 'center';
  ctx.fillText(String(gate), bx, by + bh - Math.max(2, bh * 0.16));
  ctx.textAlign = 'left';
}

/** 1頭ぶんの入力（★位置は `PositionModel` が持つ。ここは受け取るだけ） */
export interface ObliqueHorse {
  readonly gate: number;
  readonly meters: number;
  /** 内ラチからの距離 m。★エンジンが引いた `w`（D-071） */
  readonly w: number;
}

/**
 * ★**世界を1コマ描く**（走路 → 標識 → ゲート → 馬）。
 *
 *   ⚠️ ★**UI はここに入れません**（画面の座標系のもの・アートバイブル §9）。
 *      アプリ側で、`cam` を一切使わずに描いてください。
 */
export function drawObliqueWorld<TImage>(
  ctx: Ctx2D<TImage>,
  opts: {
    readonly course: Course;
    readonly cam: ObliqueCamera;
    readonly pal: Palette;
    readonly viewport: Viewport2D;
    readonly distanceMeter: number;
    readonly horses: readonly ObliqueHorse[];
    readonly fieldSize: number;
    readonly horseWidthPx: number;
    readonly sheet: TImage;
    readonly sheetWidth: number;
    readonly frameOf: (gate: number) => number;
    readonly modeOf?: (h: ObliqueHorse) => RideMode;
    readonly ridePhase?: number;
    readonly gateWOf?: (gate: number) => number;
    readonly frameRoleOf: (gate: number, fieldSize: number) => string;
    readonly font: FontOf;
    /** ★シートの形（コマ数・セル高・接地点）。省略時は第2便までのシート */
    readonly sheet_?: SheetSpec | undefined;
  },
): void {
  const { course, cam, pal, viewport: vp, distanceMeter } = opts;
  const farY = obliqueProject(course, cam, cam.s, infieldW(cam, vp)).y;
  drawSky(ctx, pal, vp, Math.max(60, Math.round(farY - 88)));
  drawTrack(ctx, course, cam, pal, vp);
  drawMarks(ctx, course, cam, pal, vp, distanceMeter, opts.font);
  if (opts.gateWOf !== undefined) {
    drawGate(ctx, course, cam, pal, vp, opts.fieldSize, opts.gateWOf, opts.frameRoleOf, opts.font);
  }
  /**
   * ★**画面の上にいる馬ほど奥**（内ラチ側が上）。
   *   上から順に描けば、**手前の馬が奥を隠します**（実際の中継と同じ重なり）。
   *   ★同じ高さなら馬番順なので、順序は決まります（C-5 は崩れません）。
   */
  const drawn = opts.horses
    .map((h) => {
      const p = obliqueProject(
        course, cam, Math.max(0, Math.min(distanceMeter, h.meters)), h.w,
      );
      return { h, x: p.x, y: p.y };
    })
    .sort((a, b) => (a.y - b.y) || (a.h.gate - b.h.gate));
  for (const d of drawn) {
    drawObliqueHorse(
      ctx, opts.sheet, opts.sheetWidth, pal, d.x, d.y,
      opts.frameOf(d.h.gate), d.h.gate, opts.fieldSize, opts.horseWidthPx,
      opts.frameRoleOf, opts.font,
      opts.modeOf?.(d.h) ?? 'cruise', opts.ridePhase ?? 0, opts.sheet_ ?? SHEET_V1,
    );
  }
}
