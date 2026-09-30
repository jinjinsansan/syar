/**
 * ★**タイトル画面の格ごとの見た目**（★2026-09-30・デザイナー R-25 D25-1・実装表そのまま）。
 *   ★格は 5 段: G1 ／ G2 ／ G3 ／ オープン・特別 ／ 平場。★格が上がるほど 縁が太く・レース名が大きい。
 *   ★平場は今のガラスの板だけ（★いちばん控えめ・★重賞より派手にしない）。
 */
import type { Ctx2D } from './oblique-draw.js';

export type TitleTier = 'G1' | 'G2' | 'G3' | 'OP' | 'FLAT';

export interface TitleTierLook {
  /** ★板の地（★左 → 右の 2 色。同じなら単色） */
  readonly plate: readonly [string, string];
  /** ★上下の縁 */
  readonly edge: { readonly px: number; readonly color: string };
  readonly pattern: 'stripe' | 'rule' | 'dots' | null;
  readonly patternColor: string;
  readonly namePx: number;
  readonly nameColor: string;
  /** ★名前の影（★下へ 5px）。null は影なし */
  readonly nameShadow: string | null;
  readonly underline: { readonly px: number; readonly color: string };
  /** ★画面全体に重ねる色（★null は重ねない） */
  readonly tint: { readonly rgb: string; readonly alpha: number } | null;
  /** ★名前の上の札 */
  readonly badge: {
    readonly metal: readonly string[] | null;
    readonly fill: string;
    readonly ink: string;
    readonly border: string;
    readonly px: number;
  };
}

const GOLD = ['#fff6b0', '#f3cf34', '#b8860b', '#ffe483', '#a9741a'];
const SILVER = ['#ffffff', '#dfe5ea', '#8c98a4', '#eef1f4', '#7d8a96'];
const COPPER = ['#f7d6b0', '#d9a06a', '#8a5530', '#e8b886', '#7a4a24'];

export const TITLE_TIER_LOOKS: Readonly<Record<TitleTier, TitleTierLook>> = {
  G1: {
    plate: ['rgba(26,18,6,.95)', 'rgba(10,35,64,.92)'], edge: { px: 6, color: '#f0cc4a' },
    pattern: 'stripe', patternColor: 'rgba(240,204,74,.09)',
    namePx: 104, nameColor: '#ffe483', nameShadow: '#7a4f06',
    underline: { px: 6, color: '#f0cc4a' }, tint: { rgb: '240,204,74', alpha: 0.12 },
    badge: { metal: GOLD, fill: '#f3cf34', ink: '#10243a', border: '#0a2340', px: 30 },
  },
  G2: {
    plate: ['rgba(8,18,30,.95)', 'rgba(16,40,64,.92)'], edge: { px: 4, color: '#c9d1d9' },
    pattern: 'rule', patternColor: 'rgba(201,209,217,.08)',
    namePx: 96, nameColor: '#eef1f4', nameShadow: '#46505b',
    underline: { px: 5, color: '#c9d1d9' }, tint: { rgb: '201,209,217', alpha: 0.10 },
    badge: { metal: SILVER, fill: '#dfe5ea', ink: '#10243a', border: '#0a2340', px: 30 },
  },
  G3: {
    plate: ['rgba(24,14,6,.95)', 'rgba(40,26,14,.92)'], edge: { px: 4, color: '#c08a5a' },
    pattern: 'dots', patternColor: 'rgba(242,199,154,.14)',
    namePx: 90, nameColor: '#f2c79a', nameShadow: '#4f2c12',
    underline: { px: 5, color: '#c08a5a' }, tint: { rgb: '192,138,90', alpha: 0.10 },
    badge: { metal: COPPER, fill: '#d9a06a', ink: '#10243a', border: '#0a2340', px: 30 },
  },
  OP: {
    plate: ['rgba(10,35,64,.92)', 'rgba(10,35,64,.92)'], edge: { px: 3, color: '#3c92e6' },
    pattern: null, patternColor: '',
    namePx: 80, nameColor: '#ffffff', nameShadow: '#0a2340',
    underline: { px: 4, color: '#3c92e6' }, tint: { rgb: '60,146,230', alpha: 0.08 },
    badge: { metal: ['#5fa9ee', '#1a6fd4'], fill: '#1a6fd4', ink: '#ffffff', border: '#0a2340', px: 20 },
  },
  FLAT: {
    plate: ['rgba(7,10,8,.86)', 'rgba(7,10,8,.86)'], edge: { px: 2, color: 'rgba(243,207,52,.4)' },
    pattern: null, patternColor: '',
    namePx: 68, nameColor: '#f6f2e7', nameShadow: null,
    underline: { px: 3, color: 'rgba(240,204,74,.4)' }, tint: null,
    badge: { metal: null, fill: 'rgba(7,10,8,.86)', ink: '#f6f2e7', border: 'rgba(246,242,231,.5)', px: 20 },
  },
};

/**
 * ★格 → 段。★重賞は `grade`、★それ以外は レース名に「オープン」を含めばオープン・特別、★他は平場。
 * ⚠️ ★名前は `raceNameOf`（`@star/scheduler`）が作る（★「府中 オープン 芝1600m」など）。
 */
export function titleTierOf(grade: 'G1' | 'G2' | 'G3' | null, raceName: string): TitleTier {
  if (grade !== null) return grade;
  return raceName.includes('オープン') ? 'OP' : 'FLAT';
}

/** ★札の字（★G1〜G3 は「G I」・オープンは「オープン」・平場は レース名の中の級の言葉） */
export function titleTierBadgeText(tier: TitleTier, raceName: string): string {
  if (tier === 'G1') return 'G I';
  if (tier === 'G2') return 'G II';
  if (tier === 'G3') return 'G III';
  if (tier === 'OP') return 'オープン';
  const m = /(新馬|未勝利|[123]勝クラス)/.exec(raceName);
  return m?.[1] ?? '平場';
}

/** ★金属のグロス（★100°・5 点）。★グラデーションが無い環境では 地の 1 色 */
export function metalFill(ctx: Ctx2D<unknown>, x: number, y: number, w: number, h: number, stops: readonly string[] | null, fallback: string): unknown {
  if (stops === null || typeof ctx.createLinearGradient !== 'function') return fallback;
  const g = ctx.createLinearGradient(x, y, x + w, y + h * 0.18);
  if (g === undefined || g === null) return fallback;
  const at = stops.length === 2 ? [0, 1] : [0, 0.3, 0.5, 0.68, 1];
  stops.forEach((c, i) => g.addColorStop(at[i] ?? 1, c));
  return g;
}

/**
 * ★格の札（★R-25: タイトル・出馬表の見出し・払戻の見出しで同じ形）。★戻り値は札の幅。
 *   ★高さ `h`・縁 2px・影 4px。★字は `titleTierBadgeText`。
 */
export function drawTierBadge(
  ctx: Ctx2D<unknown>, font: (px: number, bold?: boolean) => string,
  tier: TitleTier, raceName: string, x: number, y: number, h: number,
): number {
  const look = TITLE_TIER_LOOKS[tier];
  const text = titleTierBadgeText(tier, raceName);
  const px = Math.round(look.badge.px * (h / 46));
  ctx.font = font(px, true);
  const w = ctx.measureText(text).width + Math.round(32 * (h / 46));
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x, y + 4, w, h);
  ctx.fillStyle = metalFill(ctx, x, y, w, h, look.badge.metal, look.badge.fill); ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = look.badge.border; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + w - 1, y + 1); ctx.lineTo(x + w - 1, y + h - 1); ctx.lineTo(x + 1, y + h - 1); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = look.badge.ink; ctx.textAlign = 'left';
  ctx.fillText(text, x + (w - ctx.measureText(text).width) / 2, y + h / 2 + px * 0.36);
  return w;
}
