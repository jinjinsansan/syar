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

/**
 * ★**カットインは「情報画面」をやめ、★境目で光る「ロゴの一瞬」にしました**
 * （★2026-09-11・★オーナー判定 ★**A（デザイン系ロゴ型）**）。
 *
 * ★オーナー評: ★「カットインの内容がダメです。★意味あるカットインにするなら本格的に
 *   意味あるカットインにすべきです。★意味ないカットインにするならデザイン系のロゴを
 *   入れたようなカットインにしてください」→ ★**A**。
 *
 * 【★何が変わったか】
 *   ★旧: ★カット ★1 つ（★数秒）を ★**まるごと**隊列図／コース図に置き換えていた。
 *   ★新: ★カットの ★**境目の 0.42 秒だけ**ロゴが走り、★残りは ★**その場面の走行**を見せる。
 *
 * ⚠️ ★これでも ★**カットの数・境界・尺は 1 つも変わりません**（★台帳「カット数は減らさない」）。
 *    ★変わったのは ★**同じ枠の中身**だけです。
 * ⚠️ ★隊列図・コース図を描く関数（`drawFormationCutIn` / `drawCourseMapCutIn`）は
 *    ★**消さずに残して**あります。★画面からは呼んでいません（★方針が戻ったときのため）。
 */

/** ★ロゴの一瞬に出す字 */
export interface RaceCutInFlash {
  /** ★画面中央に出す字（★レース名 or 製品のロゴ字） */
  readonly text: string;
  /** ★字送り（em）。★製品ロゴ（`STAR`）はトップページと同じ広い字送りにする */
  readonly letterSpacingEm: number;
}

/**
 * ★製品のロゴ字。★トップページ（`apps/web/src/app/page.tsx`）と ★**同じ字・同じ字送り**。
 * ⚠️ ★別の字を作らないこと。★ロゴが 2 種類あると、それはもうロゴではありません。
 */
export const LOGO_MARK_TEXT = 'STAR';
/** ★トップページのロゴと同じ金（`#ffe37a`） */
export const LOGO_MARK_COLOR = '#ffe37a';

/**
 * ★**この切り替わりでロゴを光らせるか。**
 *
 * ⚠️ ★カットの ★**名前だけでは決められません**。★台本 v6 の `side-drive` は
 *    ★**2 回**出てきます（★0.330〜0.540 と ★0.604〜0.750）。★光らせたいのは
 *    ★**4 角から直線へ出る方（後者）だけ**です。★だから ★**どこから来たか**で見ます。
 *
 * ★2026-09-11 の光らせどころ（★オーナー ④「コーナーに入る→カットイン とか
 *   カットイン⇒コーナーから直線へ」）:
 *     ① `opening-side-lead` → `opening-formation` … ★位置取りへ入る
 *     ② `side-drive` → `fourth-corner-front`      … ★コーナーへ入る
 *     ③ `fourth-corner-front` → `side-drive`      … ★コーナーから直線へ出る
 *   ★発走（レース開始の 0 秒）は画面側が別に出します（★`LOGO_CUTIN_SEC`）。
 */
export function raceCutInFlashAt(fromId: string, toId: string): RaceCutInFlash | undefined {
  const mark = { text: LOGO_MARK_TEXT, letterSpacingEm: 0.22 } as const;
  /**
   * ⚠️ ★4 角のカットは ★**3 通り**あります（`fourth-corner-front` / `-wide` / `-far`）。
   *    ★名前を 1 つだけ書くと、★撮り方を替えた日に ★**ロゴが出なくなり**、
   *    ★代わりに白い閃光だけが残ります（★2026-09-11 に実際にそうなりました）。
   */
  const isCorner = (id: string): boolean => id.startsWith('fourth-corner-');
  if (fromId === 'opening-side-lead' && toId === 'opening-formation') return mark;
  if (fromId === 'side-drive' && isCorner(toId)) return mark;
  if (isCorner(fromId) && toId === 'side-drive') return mark;
  return undefined;
}

/**
 * ★**ロゴの一瞬のカットイン**（★2026-09-11・★オーナー判定「A ロゴ型」）
 *
 * ★オーナー評: ★「カットインは長く見せるべきではなく、★**一瞬のカッコイイカットイン**であるべき。
 *   ★例）桜星賞〜 とか このゲームの STAR とか」
 *
 * 【★どう作るか】
 *   ★情報を伝えません。★**間（ま）を作るためだけ**の画です。
 *   ★暗い地に題字を置き、★左右から光の帯が走って抜ける。★0.3〜0.5 秒。
 *
 * ⚠️ ★**長く出さないこと。** ★1 秒を超えたら、それは情報画面です（★前の試作の失敗）。
 * ⚠️ ★参考映像にこの手のカットインは出てきません。★これはオーナーの案です。
 */
export interface LogoCutInOptions<TImage> {
  readonly viewport: { readonly width: number; readonly height: number };
  /** ★題字の絵（★無ければ文字だけで出す） */
  readonly title?: { readonly image: TImage; readonly width: number; readonly height: number } | undefined;
  /** ★題字が無いときに出す文字 */
  readonly fallbackText: string;
  /**
   * ★字送り（em）。★製品ロゴ（`STAR`）はトップページと同じ ★0.22em。
   * ★和文のレース名は ★0（★詰めない・★字送りを入れると読みにくくなる）。
   */
  readonly letterSpacingEm?: number;
  /** ★字の色（★既定はレース名用の生成り。★製品ロゴは `LOGO_MARK_COLOR`） */
  readonly textColor?: string;
  /** ★この画が出てからの秒 */
  readonly sinceSec: number;
  /** ★全体の尺（秒）。★これを超えたら呼ぶ側が出すのをやめる */
  readonly durationSec: number;
}

/** ★ロゴのカットインの既定の尺（秒）。★道具はこの値を読むこと（★R-31） */
export const LOGO_CUTIN_SEC = 0.42;

export function drawLogoCutIn<TImage>(
  ctx: Ctx2D<TImage>,
  opts: LogoCutInOptions<TImage>,
): void {
  const { width: W, height: H } = opts.viewport;
  const t = Math.max(0, Math.min(1, opts.sinceSec / Math.max(0.01, opts.durationSec)));
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = 1;

  /** ★① 地。★不透明（★下の走行を透かさない） */
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, W, H);

  /**
   * ★② 斜めの帯。★上下から挟むように動く。
   *   ★入り（0〜0.35）で閉じ、★抜け（0.65〜1）で開く。
   */
  const ease = (x: number): number => x * x * (3 - 2 * x);
  const close = ease(Math.max(0, Math.min(1, t / 0.35)));
  const open = ease(Math.max(0, Math.min(1, (t - 0.65) / 0.35)));
  const band = (1 - open) * close;
  const bandH = Math.round(H * 0.30 * band);
  ctx.fillStyle = '#14202b';
  ctx.fillRect(0, Math.round(H * 0.5 - bandH), W, bandH * 2);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, Math.round(H * 0.5 - bandH) - 3, W, 3);
  ctx.fillRect(0, Math.round(H * 0.5 + bandH), W, 3);

  /** ★③ 題字。★帯が閉じている間だけ出す */
  const show = Math.max(0, Math.min(1, (t - 0.12) / 0.18)) * (1 - open);
  if (show > 0.01) {
    ctx.globalAlpha = show;
    if (opts.title !== undefined) {
      const tw = Math.round(W * 0.52);
      const th = Math.round(tw * (opts.title.height / Math.max(1, opts.title.width)));
      /** ⚠️ ★この `Ctx2D` の `drawImage` は ★**9 引数のみ**（★切り出し込み） */
      ctx.drawImage(
        opts.title.image, 0, 0, opts.title.width, opts.title.height,
        Math.round((W - tw) / 2), Math.round((H - th) / 2), tw, th,
      );
    } else {
      /** ★字。★中央よりやや上に置き、★下は実況の帯に譲る */
      const cy = Math.round(H * 0.47);
      const size = Math.round(H * 0.115);
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      const gap = size * (opts.letterSpacingEm ?? 0);
      const color = opts.textColor ?? '#f4e6b8';
      /**
       * ★字送りを入れるときは ★**1 字ずつ**置きます。
       * ⚠️ ★`ctx.letterSpacing` はブラウザにしかなく、★測る側（`@napi-rs/canvas`）に
       *    ★無いので、★画面と道具で ★**違う絵**になります（★R-30）。
       */
      const chars = [...opts.fallbackText];
      const widths = chars.map((c) => ctx.measureText(c).width);
      const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, chars.length - 1);
      const put = (dx: number, dy: number, fill: string): void => {
        ctx.fillStyle = fill;
        ctx.textAlign = 'left';
        let x = Math.round(W / 2 - total / 2) + dx;
        for (let i = 0; i < chars.length; i += 1) {
          ctx.fillText(chars[i]!, x, cy + dy);
          x += widths[i]! + gap;
        }
      };
      /** ★影で締める */
      put(3, 4, '#0b0f14');
      put(0, 0, color);
      /** ★下に細い金の線 */
      const lw = Math.round(W * 0.26 * show);
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(Math.round(W / 2 - lw / 2), cy + Math.round(H * 0.035), lw, 3);
      ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = prev;
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
