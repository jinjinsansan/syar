import { drawCourseMinimap, type MinimapHorse } from './minimap.js';
import type { Course } from './course.js';
import type { Ctx2D, FontOf, Palette } from './oblique-draw.js';

/**
 * ★**カットイン**（★2026-09-10・★レビュー側の構成案 §1）
 *
 * ★企画者の 9 点のうち ★**⑤「コーナーなど上手く表現できない部分はカットインを入れてしまう」**への実装。
 *
 * 【★なぜ要るか】
 *   ★斜め前の走行はオーナー評で不合格（★「ぴょこぴょこ歩いているのか走っているのか」）。
 *   ★オーナー方針は ★**「できないことは深く追わず、出来ることとカットインで綺麗に見せればいい」**。
 *   → ★描けない区間を ★**短い挿入画面**で置き換え、★状況だけを確実に伝えます。
 *
 * 【★守ること】
 *   ⚠️ ★**カットの数・境界・尺は変えません**（★台帳「カット数は減らさない」）。
 *      ★置き換えるのは ★**同じ区間の中身**だけです。
 *   ⚠️ ★**レース時間は止めません。** ★戻ったときは、その時点のレース状態の画になります。
 *   ⚠️ ★**着順・走破時刻・台帳・サーバー側の判定に触れません。** ★描画だけです。
 *   ⚠️ ★背面は ★**不透明**にします。★不合格の走行が透けないようにするためです（★構成案 §1）。
 *
 * 【★どの区間を置き換えるかは、ここ 1 か所で決めます】
 *   ★画面が個別に判定すると、★道具・検査・画面が別々の答えを持ちます（★R-30）。
 */

/** ★カットインの種類と、そのときに出す一言 */
export interface RaceCutIn {
  readonly kind: 'course-map' | 'formation';
  /** ★画面に出す短い説明（★一画面につき一情報・★構成案 §2） */
  readonly caption: string;
}

/**
 * ★**その カット を挿入画面に置き換えるか。**
 *
 * ⚠️ ★ここに無いカットは ★**1 画素も変わりません**。
 * ★2026-09-10 の着手順は ★⑤ → ③ → 55〜60 秒 → ② です。★今は ⑤ だけを載せています。
 */
export function raceCutInFor(shotId: string): RaceCutIn | undefined {
  if (shotId === 'opening-formation') {
    return { kind: 'formation', caption: '現在の隊列' };
  }
  if (shotId === 'fourth-corner-front') {
    // コース長や直線長で実際の位置が変わるため、ショット名だけから通過地点を断定しない。
    return { kind: 'course-map', caption: 'コースの現在位置' };
  }
  return undefined;
}

export interface FormationCutInOptions {
  readonly viewport: { readonly width: number; readonly height: number };
  /** 描画に使っている現在位置。順位や着順から組み直さない。 */
  readonly horses: readonly MinimapHorse[];
  readonly courseWidthM: number;
  readonly frameColorOf: (gate: number) => string;
  readonly caption: string;
  readonly sinceSec: number;
}

export interface CourseMapCutInOptions {
  readonly viewport: { readonly width: number; readonly height: number };
  /** ★馬の位置。★**描画に使っている値をそのまま**渡すこと（★着順から作らない） */
  readonly horses: readonly MinimapHorse[];
  /** ★注視点（m） */
  readonly focusS: number;
  readonly frameColorOf: (gate: number) => string;
  readonly distanceLabel: string;
  readonly metersLeft: number;
  readonly caption: string;
  /** ★光沢の時刻（秒） */
  readonly timeSec: number;
  /** ★この挿入画面が出てからの秒（★登場の動き） */
  readonly sinceSec: number;
}

/** ★背面の色。★不透明であることがこの画面の要件です（★走行を透かさない） */
const BACKDROP = '#0d1218';
const BACKDROP_EDGE = '#16202a';

/**
 * ★**コース図の挿入画面**を描く。
 *
 *   ★コース全体・現在位置・進行方向を、★1 画面で読めるようにします。
 *   ★図そのものは ★**既存の `drawCourseMinimap`** を大きな枠で呼びます。
 *   ★同じ図を 2 か所で描くと、★片方だけ直って離れます（★D-052）。
 */
export function drawCourseMapCutIn<TImage>(
  ctx: Ctx2D<TImage>,
  course: Course,
  pal: Palette,
  font: FontOf,
  opts: CourseMapCutInOptions,
): void {
  const { width: W, height: H } = opts.viewport;

  /** ★① 背面を不透明で塗る */
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, W, H);
  /** ★上下に少し明るい帯を置いて、★のっぺりした黒板に見えないようにする */
  ctx.fillStyle = BACKDROP_EDGE;
  ctx.fillRect(0, 0, W, Math.round(H * 0.10));
  ctx.fillRect(0, Math.round(H * 0.90), W, Math.round(H * 0.10));

  /**
   * ★② コース図。★画面の中央に大きく。
   *   ★`drawCourseMinimap` は ★`opts` を渡すと板つき（★見出し・残距離バー・フッタ）で描きます。
   */
  /**
   * ⚠️ ★画面の下 2 割は ★**実況の帯**が乗ります（★HUD はこの後に描かれます）。
   *    ★図をそこへ伸ばすと隠れるので、★上寄りに置きます。
   */
  const boxW = Math.round(W * 0.52);
  const boxH = Math.round(H * 0.62);
  const box = {
    x: Math.round((W - boxW) / 2),
    y: Math.round(H * 0.06),
    width: boxW,
    height: boxH,
  };
  drawCourseMinimap(ctx, course, pal, font, opts.horses, opts.focusS, box, opts.frameColorOf, {
    distanceLabel: opts.distanceLabel,
    metersLeft: opts.metersLeft,
    timeSec: opts.timeSec,
    sinceSec: opts.sinceSec,
  });

  /** ★③ 一言。★一画面につき一情報（★構成案 §2） */
  const capY = box.y + box.height + Math.round(H * 0.055);
  ctx.fillStyle = '#eef2f6';
  ctx.font = font(Math.round(H * 0.042), true);
  ctx.textAlign = 'center';
  ctx.fillText(opts.caption, Math.round(W / 2), capY);
  ctx.textAlign = 'left';
  ctx.globalAlpha = prevAlpha;
}

/**
 * 発走直後の隊列を示す短い挿入画面。
 * 前後は実際の進行距離、上下は実際の走路内位置を使う。ここで着順や進路を作らない。
 */
export function drawFormationCutIn<TImage>(
  ctx: Ctx2D<TImage>,
  pal: Palette,
  font: FontOf,
  opts: FormationCutInOptions,
): void {
  const { width: W, height: H } = opts.viewport;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = BACKDROP_EDGE;
  ctx.fillRect(0, 0, W, Math.round(H * 0.10));
  ctx.fillRect(0, Math.round(H * 0.90), W, Math.round(H * 0.10));

  const board = { x: Math.round(W * 0.14), y: Math.round(H * 0.20), width: Math.round(W * 0.72), height: Math.round(H * 0.48) };
  ctx.fillStyle = pal['turf-2'] ?? '#263c31';
  ctx.fillRect(board.x, board.y, board.width, board.height);
  ctx.strokeStyle = '#d9ded2';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(board.x, board.y); ctx.lineTo(board.x + board.width, board.y);
  ctx.lineTo(board.x + board.width, board.y + board.height); ctx.lineTo(board.x, board.y + board.height);
  ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(238,242,246,0.28)';
  ctx.lineWidth = 1;
  for (const ratio of [0.25, 0.5, 0.75]) {
    const x = Math.round(board.x + board.width * ratio);
    ctx.beginPath(); ctx.moveTo(x, board.y); ctx.lineTo(x, board.y + board.height); ctx.stroke();
  }

  const lead = Math.max(...opts.horses.map((h) => h.s), 0);
  const tail = Math.min(...opts.horses.map((h) => h.s), lead);
  const span = Math.max(12, lead - tail);
  const radius = Math.max(13, Math.round(Math.min(W, H) * 0.025));
  for (const horse of opts.horses) {
    const x = board.x + board.width * (0.08 + 0.84 * ((horse.s - tail) / span));
    const lane = Math.max(0, Math.min(1, horse.w / Math.max(1, opts.courseWidthM)));
    const y = board.y + board.height * (0.14 + 0.72 * lane);
    ctx.beginPath(); ctx.ellipse(x, y, radius, radius, 0, 0, Math.PI * 2); ctx.fillStyle = opts.frameColorOf(horse.gate); ctx.fill();
    ctx.strokeStyle = horse.own ? '#f5d56d' : '#111820'; ctx.lineWidth = horse.own ? 4 : 2; ctx.stroke();
    ctx.fillStyle = '#111820'; ctx.font = font(Math.round(radius * 1.05), true); ctx.textAlign = 'center';
    ctx.fillText(String(horse.gate), x, y + Math.round(radius * 0.35));
  }

  ctx.fillStyle = '#eef2f6'; ctx.font = font(Math.round(H * 0.042), true); ctx.textAlign = 'center';
  ctx.fillText(opts.caption, Math.round(W / 2), Math.round(H * 0.13));
  ctx.font = font(Math.round(H * 0.026), false);
  ctx.fillText('前方', board.x + board.width - 6, board.y + board.height + Math.round(H * 0.055));
  ctx.textAlign = 'left';
  ctx.globalAlpha = prevAlpha;
}
