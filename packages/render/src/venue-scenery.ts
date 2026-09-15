import type { Ctx2D } from './oblique-draw.js';
import type { Tint } from './season-look.js';

/**
 * ★**場の景色と紋**（★2026-09-15・計画書 V-13 / V-15・第 5 便）
 *
 * 【★なぜコードで描くか — ★測ってから決めています】
 *   ★レース中の真横の板で ★景色（空と遠景）が見えるのは ★**画面の上 約 9% の帯**だけで、★その大半は木の頭です
 *   （★板 941 行のうち木の層は 0〜188 行・★窓は zoom 1.14 で 116 行目から下）。
 *   ★場ごとのパノラマの絵を 10 枚作っても ★レース中はほとんど映りません。
 *   ★景色が大きく映るのは ★**タイトルカードの背景**（★空が画面の上 2〜3 割）なので、★そこに場の主題を描き足します。
 *   ★絵の生成・権利・承認（D-087）が要らないように、★**図形だけ**で描きます（★開発側の仮置き・★オーナーの目で決める）。
 *
 * 【★何を描くか】
 *   ★`drawVenueScenery` … ★空の帯に遠景（海・山並み・雪山・白い砂丘・丘と月・霧・星空と川・高台の日差し・大河）
 *   ★`drawVenueCrest`   … ★場の紋（★丸の中に主題の図形）
 *   ★`drawVenueFog`     … ★霧（★霧の場だけ・レース中も・★馬より先に描く）
 *
 * ⚠️ ★主題は ★場の見た目の表の明示の欄（`VenueLook.scenery`）から引きます。★場の名前からは引きません（★回答 §3-1）。
 * ⚠️ ★実在の場の景色を写していません（★型だけ・憲法 §0.1）。
 * ⚠️ ★決定論です（★乱数・端末の時計を読まない・★揺れは表示秒の関数）。
 * ⚠️ ★スターパーク（`default`）は ★何も描きません（★既定の鞍の画を変えない）。
 */

export type VenueSceneryKind =
  | 'default' | 'sea' | 'mountains' | 'snow-peaks' | 'white-dunes'
  | 'hill-moon' | 'fog' | 'stars-river' | 'highland-sun' | 'great-river';

export const VENUE_SCENERY_KINDS: readonly VenueSceneryKind[] = [
  'default', 'sea', 'mountains', 'snow-peaks', 'white-dunes', 'hill-moon', 'fog', 'stars-river', 'highland-sun', 'great-river',
];

/** ★遠景を描く帯（px）。★`horizonY` より下には描きません */
export interface SceneryBand {
  readonly width: number;
  /** ★霞が掛かり始める行（★ここから `horizonY` へ向けて遠景が空に溶ける） */
  readonly fadeTopY: number;
  readonly horizonY: number;
}

/**
 * ★**タイトルカードの背景絵での帯**（★`race-title-spring-v1.png` を画面いっぱいに置いたとき）。
 *   ★木の頭が画面の高さの 20〜30% にあるので、★遠景の足元を 22.5% に置き、★14% から霞に溶かします。
 * ⚠️ ★初版（足元 24.5%・霞 17% から）は ★実画面で遠景が霞と木に埋もれて ★ほとんど読めませんでした（★2026-09-15 撮影）。
 * ⚠️ ★背景絵を差し替えたら ★ここも測り直すこと。
 */
export const TITLE_SCENERY_BAND = { fadeTop: 0.14, horizon: 0.225 } as const;

export function titleSceneryBand(viewport: { readonly width: number; readonly height: number }): SceneryBand {
  return {
    width: viewport.width,
    fadeTopY: viewport.height * TITLE_SCENERY_BAND.fadeTop,
    horizonY: viewport.height * TITLE_SCENERY_BAND.horizon,
  };
}

/** ★霧の濃さの上限（★レース中・★見やすさの線 L-5） */
export const VENUE_FOG_ALPHA_MAX = 0.4;
/** ★霧の場のレース中の濃さ（★仮置き） */
export const VENUE_FOG_ALPHA = 0.32;

/** ★座標と塩から 0〜1（★乱数ではない） */
function h01(i: number, salt: number): number {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function withAlpha(ctx: Ctx2D<unknown>, alpha: number, color: string, draw: () => void): void {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.fillStyle = color;
  draw();
  ctx.globalAlpha = prev;
}

/** ★尾根の線（★点の並び）。★`smooth` なら丘、★そうでなければ尖った山 */
function ridgePoints(band: SceneryBand, count: number, peakH: number, salt: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= count; i += 1) {
    const x = (band.width * i) / count;
    pts.push({ x, y: band.horizonY - peakH * (0.35 + 0.65 * h01(i, salt)) });
  }
  return pts;
}

/**
 * ★**見える側にいちばん高い峰を立てる**（★2026-09-15）。
 *   ★タイトルカードは左 78% が暗幕で隠れるので、★遠景が見えるのは右側だけです。★峰の高さを位置の関数（`h01`）で決めると、
 *   ★右側がたまたま低い尾根になり ★雪山がほとんど見えませんでした（★実画面で確認）。
 *   ★幅の `atRatio` にいちばん近い点を最も高く、★その両隣を低くします。
 */
function withHeroPeak(pts: readonly { x: number; y: number }[], band: SceneryBand, peakH: number, atRatio: number): { x: number; y: number }[] {
  const out = pts.map((p) => ({ ...p }));
  let best = 0;
  for (let i = 1; i < out.length; i += 1) {
    if (Math.abs(out[i]!.x - band.width * atRatio) < Math.abs(out[best]!.x - band.width * atRatio)) best = i;
  }
  out[best]!.y = band.horizonY - peakH;
  for (const j of [best - 1, best + 1]) if (out[j] !== undefined) out[j]!.y = band.horizonY - peakH * 0.4;
  return out;
}

function fillRidge(ctx: Ctx2D<unknown>, band: SceneryBand, pts: readonly { x: number; y: number }[], smooth: boolean): void {
  ctx.beginPath();
  ctx.moveTo(0, band.horizonY);
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    if (!smooth || i === 0) { ctx.lineTo(p.x, p.y); continue; }
    /** ★丘は間を 4 分割して正弦でならす（★曲線の命令を使わない・記録しやすい） */
    const q = pts[i - 1]!;
    for (let k = 1; k <= 4; k += 1) {
      const t = k / 4;
      const e = (1 - Math.cos(Math.PI * t)) / 2;
      ctx.lineTo(q.x + (p.x - q.x) * t, q.y + (p.y - q.y) * e);
    }
  }
  ctx.lineTo(band.width, band.horizonY);
  ctx.closePath();
  ctx.fill();
}

/** ★遠景の足元を空に溶かす霞（★段で重ねる・グラデーションを使わない） */
function haze(ctx: Ctx2D<unknown>, band: SceneryBand, color: string, strength: number): void {
  const steps = 6;
  const span = Math.max(0, band.horizonY - band.fadeTopY);
  for (let k = 0; k < steps; k += 1) {
    const y = band.fadeTopY + (span * k) / steps;
    /** ★初版の 0.6 倍（★遠景が霞に埋もれたので弱めた） */
    withAlpha(ctx, strength * 0.6 * (k + 1) / steps, color, () => ctx.fillRect(0, y, band.width, span / steps + 1));
  }
}

/** ★水面のきらめき（★細い横長の矩形・★表示秒で明滅） */
function glints(ctx: Ctx2D<unknown>, band: SceneryBand, y0: number, h: number, count: number, salt: number, timeSec: number): void {
  for (let i = 0; i < count; i += 1) {
    const x = h01(i, salt) * band.width;
    const y = y0 + h01(i, salt + 1) * Math.max(1, h - 2);
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(timeSec * (1.2 + h01(i, salt + 2)) + i));
    withAlpha(ctx, 0.55 * tw, '#f4f8fb', () => ctx.fillRect(x, y, 8 + h01(i, salt + 3) * 18, 1.5));
  }
}

export interface VenueSceneryOptions {
  /** ★揺れと明滅の時計（★表示秒） */
  readonly timeSec: number;
  /** ★夜か（★星空と川の星・★`?tod=night`） */
  readonly night?: boolean | undefined;
}

/**
 * ★**遠景を空の帯に描く**（★タイトルカードの背景の上・暗幕の前）。★`default` は何も描きません。
 */
export function drawVenueScenery(ctx: Ctx2D<unknown>, kind: VenueSceneryKind, band: SceneryBand, opts: VenueSceneryOptions): void {
  const W = band.width, hy = band.horizonY;
  const span = Math.max(1, hy - band.fadeTopY);
  switch (kind) {
    case 'default':
      return;
    case 'sea': {
      /** ★遠くの島影と、★地平線までの海 */
      withAlpha(ctx, 0.55, '#8ea3ae', () => fillRidge(ctx, band, ridgePoints(band, 5, span * 0.9, 11).map((p, i) => (i % 2 === 0 ? { x: p.x, y: hy } : p)), true));
      const seaH = span * 0.9;
      withAlpha(ctx, 0.92, '#4f7f9c', () => ctx.fillRect(0, hy - seaH, W, seaH));
      glints(ctx, band, hy - seaH, seaH, 26, 13, opts.timeSec);
      haze(ctx, band, '#dfe7ec', 0.25);
      return;
    }
    case 'mountains': {
      withAlpha(ctx, 0.7, '#93a6aa', () => fillRidge(ctx, band, withHeroPeak(ridgePoints(band, 9, span * 2.4, 21), band, span * 2.4, 0.86), false));
      withAlpha(ctx, 0.85, '#6f8b84', () => fillRidge(ctx, band, ridgePoints(band, 13, span * 1.4, 23), true));
      haze(ctx, band, '#d9e1e2', 0.45);
      return;
    }
    case 'snow-peaks': {
      const pts = withHeroPeak(ridgePoints(band, 8, span * 3.2, 31), band, span * 3.2, 0.8);
      withAlpha(ctx, 0.85, '#8795a3', () => fillRidge(ctx, band, pts, false));
      /** ★雪を頂く（★尾根の線の上に三角を載せる・★高い峰だけ） */
      for (let i = 1; i < pts.length - 1; i += 1) {
        const p = pts[i]!, l = pts[i - 1]!, r = pts[i + 1]!;
        if (p.y > l.y || p.y > r.y) continue;
        const f = 0.32;
        withAlpha(ctx, 0.92, '#f4f7fa', () => {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + (r.x - p.x) * f, p.y + (r.y - p.y) * f);
          ctx.lineTo(p.x + (r.x - p.x) * f * 0.4, p.y + (r.y - p.y) * f * 0.75);
          ctx.lineTo(p.x + (l.x - p.x) * f * 0.5, p.y + (l.y - p.y) * f * 0.8);
          ctx.lineTo(p.x + (l.x - p.x) * f, p.y + (l.y - p.y) * f);
          ctx.closePath();
          ctx.fill();
        });
      }
      haze(ctx, band, '#e6ecf1', 0.45);
      return;
    }
    case 'white-dunes': {
      withAlpha(ctx, 0.8, '#e9dcc0', () => fillRidge(ctx, band, ridgePoints(band, 5, span * 1.1, 41), true));
      withAlpha(ctx, 0.85, '#d6c39c', () => fillRidge(ctx, band, ridgePoints(band, 7, span * 0.6, 43), true));
      haze(ctx, band, '#f3ead6', 0.3);
      return;
    }
    case 'hill-moon': {
      /** ★昼の月（★白く薄い円）と、★なだらかな丘 */
      withAlpha(ctx, 0.8, '#f6f1dc', () => {
        ctx.beginPath(); ctx.ellipse(W * 0.8, band.fadeTopY - span * 1.6, span * 0.55, span * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      });
      withAlpha(ctx, 0.85, '#7f8c79', () => fillRidge(ctx, band, ridgePoints(band, 6, span * 1.3, 51), true));
      haze(ctx, band, '#dde3da', 0.35);
      return;
    }
    case 'fog': {
      drawVenueFog(ctx, { width: W, top: band.fadeTopY - span * 1.5, bottom: hy }, { alpha: 0.5, timeSec: opts.timeSec, focusS: 0, direction: 1 });
      return;
    }
    case 'stars-river': {
      if (opts.night === true) {
        for (let i = 0; i < 60; i += 1) {
          const tw = 0.5 + 0.5 * Math.abs(Math.sin(opts.timeSec * (0.8 + h01(i, 61)) + i));
          withAlpha(ctx, 0.8 * tw, '#f4f1e2', () => ctx.fillRect(h01(i, 62) * W, h01(i, 63) * band.fadeTopY, 2, 2));
        }
      }
      withAlpha(ctx, 0.75, '#8e99ab', () => fillRidge(ctx, band, ridgePoints(band, 10, span * 0.7, 65), true));
      const riverH = span * 0.35;
      withAlpha(ctx, 0.8, '#c9d6e6', () => ctx.fillRect(0, hy - riverH, W, riverH));
      glints(ctx, band, hy - riverH, riverH, 18, 67, opts.timeSec);
      haze(ctx, band, '#dfe5ee', 0.3);
      return;
    }
    case 'highland-sun': {
      /** ★強い日差し（★重ねた円の光）と、★遠くの低い街並み */
      const sx = W * 0.84, sy = band.fadeTopY - span * 1.7;
      for (const [r, a] of [[span * 2.4, 0.12], [span * 1.4, 0.2], [span * 0.6, 0.75]] as const) {
        withAlpha(ctx, a, '#fff1c4', () => { ctx.beginPath(); ctx.ellipse(sx, sy, r, r, 0, 0, Math.PI * 2); ctx.fill(); });
      }
      for (let i = 0; i < 34; i += 1) {
        const w = 10 + h01(i, 71) * 22, h = span * (0.2 + h01(i, 72) * 0.5);
        withAlpha(ctx, 0.7, '#9c9082', () => ctx.fillRect(h01(i, 73) * W, hy - h, w, h));
      }
      haze(ctx, band, '#f6ead2', 0.35);
      return;
    }
    case 'great-river': {
      const riverH = span * 0.6;
      withAlpha(ctx, 0.85, '#86adb3', () => ctx.fillRect(0, hy - riverH, W, riverH));
      glints(ctx, band, hy - riverH, riverH, 22, 81, opts.timeSec);
      /** ★長い橋（★橋桁と橋脚） */
      const deckY = hy - riverH - span * 0.18;
      withAlpha(ctx, 0.75, '#6f7f84', () => {
        ctx.fillRect(W * 0.28, deckY, W * 0.62, span * 0.07);
        for (let i = 0; i <= 12; i += 1) ctx.fillRect(W * 0.28 + (W * 0.62 * i) / 12, deckY, 3, hy - deckY);
      });
      haze(ctx, band, '#dde8e8', 0.3);
      return;
    }
  }
}

export interface VenueFogOptions {
  readonly alpha: number;
  readonly timeSec: number;
  /** ★カメラの進んだ距離（m）。★景色と一緒に流す */
  readonly focusS: number;
  readonly direction: 1 | -1;
}

/**
 * ★**霧**（★横に流れる薄い帯）。★`top`〜`bottom` の中にだけ描き、★下へ行くほど薄くします。
 * ⚠️ ★レース中は ★**馬より先**に呼ぶこと（★勝負服に掛けない）。★濃さは `VENUE_FOG_ALPHA_MAX` で頭打ち。
 */
export function drawVenueFog(
  ctx: Ctx2D<unknown>, rect: { readonly width: number; readonly top: number; readonly bottom: number }, opts: VenueFogOptions,
): void {
  const alpha = Math.max(0, Math.min(VENUE_FOG_ALPHA_MAX, opts.alpha));
  if (!(alpha > 0) || !(rect.bottom > rect.top)) return;
  const H = rect.bottom - rect.top;
  const steps = 8;
  for (let k = 0; k < steps; k += 1) {
    withAlpha(ctx, alpha * (1 - k / steps) * 0.7, '#e8ede9', () => ctx.fillRect(0, rect.top + (H * k) / steps, rect.width, H / steps + 1));
  }
  /** ★流れる塊（★楕円・★景色と同じ向きへ流す） */
  const flow = opts.timeSec * 14 - opts.direction * opts.focusS * 6;
  const period = rect.width + 400;
  for (let i = 0; i < 9; i += 1) {
    const x = ((((h01(i, 91) * period + flow * (0.6 + h01(i, 92) * 0.8)) % period) + period) % period) - 200;
    const y = rect.top + H * (0.15 + h01(i, 93) * 0.55);
    const rx = 160 + h01(i, 94) * 220, ry = H * (0.1 + h01(i, 95) * 0.12);
    /**
     * ★縁をぼかす（★大きさの違う薄い楕円を重ねる・★ぼかしの命令を使わない）。
     * ⚠️ ★初版（★楕円 1 枚・濃さ 0.55 倍）は ★実画面で縁がくっきりして ★円盤が浮いて見えました（★2026-09-15 撮影）。
     */
    for (const k of [1, 0.78, 0.56, 0.34]) {
      withAlpha(ctx, alpha * 0.16, '#f1f4f1', () => { ctx.beginPath(); ctx.ellipse(x, y, rx * k, ry * (0.6 + 0.4 * k), 0, 0, Math.PI * 2); ctx.fill(); });
    }
  }
}

export interface VenueCrestColors {
  /** ★丸の地の色 */
  readonly ground: string;
  /** ★図形の色 */
  readonly mark: string;
}

/**
 * ★**場の紋**（★丸の中に主題の図形・★タイトルカードの右上）。★`default` は何も描きません。
 */
export function drawVenueCrest(
  ctx: Ctx2D<unknown>, kind: VenueSceneryKind, cx: number, cy: number, size: number, colors: VenueCrestColors,
): void {
  if (kind === 'default') return;
  const r = size / 2;
  const disc = (x: number, y: number, rr: number, color: string): void => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rr, rr, 0, 0, Math.PI * 2); ctx.fill();
  };
  const poly = (pts: readonly (readonly [number, number])[], color: string): void => {
    ctx.fillStyle = color; ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(cx + x * r, cy + y * r) : ctx.lineTo(cx + x * r, cy + y * r)));
    ctx.closePath(); ctx.fill();
  };
  const bar = (y: number, h: number, x0: number, x1: number, color: string): void => {
    ctx.fillStyle = color; ctx.fillRect(cx + x0 * r, cy + y * r, (x1 - x0) * r, h * r);
  };
  disc(cx, cy, r, colors.mark);
  disc(cx, cy, r * 0.88, colors.ground);
  const m = colors.mark;
  switch (kind) {
    case 'sea':
      for (const y of [-0.25, 0.15]) {
        poly([[-0.6, y], [-0.3, y - 0.18], [0, y], [0.3, y - 0.18], [0.6, y], [0.6, y + 0.12], [0.3, y - 0.06], [0, y + 0.12], [-0.3, y - 0.06], [-0.6, y + 0.12]], m);
      }
      return;
    case 'mountains':
      poly([[-0.65, 0.4], [-0.2, -0.35], [0.1, 0.05], [0.3, -0.15], [0.65, 0.4]], m);
      return;
    case 'snow-peaks':
      poly([[-0.65, 0.4], [0, -0.5], [0.65, 0.4]], m);
      poly([[0, -0.5], [0.2, -0.2], [0.05, -0.12], [-0.08, -0.22], [-0.2, -0.2]], colors.ground);
      return;
    case 'white-dunes':
      poly([[-0.7, 0.35], [-0.45, 0.02], [-0.1, -0.12], [0.2, 0.05], [0.4, 0.0], [0.7, 0.35]], m);
      bar(0.42, 0.08, -0.55, 0.55, m);
      return;
    case 'hill-moon':
      disc(cx + r * 0.2, cy - r * 0.2, r * 0.32, m);
      disc(cx + r * 0.33, cy - r * 0.3, r * 0.27, colors.ground);
      poly([[-0.7, 0.45], [-0.35, 0.12], [0, 0.05], [0.35, 0.15], [0.7, 0.45]], m);
      return;
    case 'fog':
      bar(-0.3, 0.1, -0.55, 0.45, m);
      bar(-0.05, 0.1, -0.45, 0.6, m);
      bar(0.2, 0.1, -0.6, 0.35, m);
      return;
    case 'stars-river':
      poly([[0, -0.6], [0.1, -0.32], [0.38, -0.3], [0.15, -0.14], [0.24, 0.12], [0, -0.03], [-0.24, 0.12], [-0.15, -0.14], [-0.38, -0.3], [-0.1, -0.32]], m);
      poly([[-0.65, 0.3], [0, 0.18], [0.65, 0.3], [0.65, 0.42], [0, 0.3], [-0.65, 0.42]], m);
      return;
    case 'highland-sun':
      disc(cx, cy, r * 0.28, m);
      for (let i = 0; i < 8; i += 1) {
        const a = (Math.PI * 2 * i) / 8;
        const c = Math.cos(a), s = Math.sin(a), pc = Math.cos(a + 0.18), ps = Math.sin(a + 0.18), mc = Math.cos(a - 0.18), ms = Math.sin(a - 0.18);
        poly([[c * 0.62, s * 0.62], [pc * 0.38, ps * 0.38], [mc * 0.38, ms * 0.38]], m);
      }
      return;
    case 'great-river':
      poly([[-0.65, -0.1], [-0.2, -0.25], [0.2, -0.05], [0.65, -0.2], [0.65, 0.2], [0.2, 0.35], [-0.2, 0.15], [-0.65, 0.3]], m);
      return;
  }
}

/** ★タイトルカードに渡すもの（★画面が 1 つ組む） */
export interface TitleSceneryOptions {
  readonly kind: VenueSceneryKind;
  /** ★背景絵全体に重ねる色（★季節・時間帯の景色の色） */
  readonly tints: readonly Tint[];
  readonly crest?: VenueCrestColors | undefined;
  readonly night?: boolean | undefined;
}
