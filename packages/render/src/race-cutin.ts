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
  readonly kind: 'course-map';
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
  if (shotId === 'fourth-corner-front') {
    return { kind: 'course-map', caption: '4 コーナーを回って直線へ' };
  }
  return undefined;
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
