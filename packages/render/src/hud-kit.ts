/**
 * ★レース中継 HUD の共通部品（デザインシステム「STAR レース中継 HUD」の Canvas 実装）
 *
 *   正本: `design/hud-ds/styles.css`（トークン）／`design/hud-ds/MOTION_HANDOFF.md`（規約）／
 *         `design/hud-ds/components/screen-live/index.html`（実装座標）
 *
 * 【規約（MOTION_HANDOFF §0・§2）】
 *   - 表現は 塗り・1px 線・角丸 2px ＋ **金のグラデーション 1 本**（`createLinearGradient`）まで。影・ぼかしなし
 *   - 斜度は **-9° 固定**。Canvas では 4 点 path。**文字は傾けない**
 *   - 金 `#f0cc4a` はアクセント。1 画面で金を使う要素は 3 つまで（上縁・先頭順位・重要数字）
 *   - 数字はコンデンス書体が本線。導入できない環境では system-ui bold ＋ 右揃えの箱幅 +15%
 *   ⚠️ 座標や色を変えるときは **先にカード（design/hud-ds）を直し、そのあとここへ反映**する（2 か所で持つと必ず離れる）
 */

import type { Ctx2D, FontOf, Palette } from './oblique-draw.js';
import { inkOn } from './oblique-draw.js';

/** styles.css の :root と 1:1 */
export const HUD = {
  gold: '#f0cc4a',
  goldDim: 'rgba(240,204,74,.5)',
  paper: '#f6f2e7',
  paper70: 'rgba(246,242,231,.7)',
  paper45: 'rgba(246,242,231,.45)',
  ink: '#12140f',
  glass: 'rgba(7,10,8,.86)',
  panel: 'rgba(6,10,8,.82)',
  panelLite: 'rgba(6,10,8,.62)',
  band: 'rgba(3,7,5,.86)',
  board: 'rgba(6,10,8,.9)',
  hair: 'rgba(246,242,231,.22)',
  goldHair: 'rgba(243,207,52,.4)',
  rule: 'rgba(246,242,231,.14)',
  row: 'rgba(255,255,255,.05)',
  onAir: '#c8271f',
  replay: '#2f6fd0',
  ok: '#148c46',
  warn: '#fad728',
  bad: '#d62828',
  flash: 'rgba(255,255,255,.18)',
  dissolve: 'rgba(4,10,7,.55)',
  /** 斜度 -9° の tan */
  skew: Math.tan((9 * Math.PI) / 180),
  /** 金の光沢の周期（秒） */
  sheenSec: 4.5,
  /** 実況の文字送り（文字/秒） */
  charsPerSec: 20,
} as const;

/**
 * ★金プレート（本線）: #fff6b0 0% → #f3cf34 30% → #a9791a 48% → #f7dc6b 62% → #fff6b0 100%
 *   CSS: background-size 240% / background-position を 4.5s 周期で 190% → -90% に動かす（光沢が走る）
 *   → offset = -(2.4w - w) × p, p = 1.9 → -0.9
 */
export function goldPlate(ctx: Ctx2D<unknown>, x: number, w: number, timeSec = 0): unknown {
  if (typeof ctx.createLinearGradient !== 'function' || !(w > 0)) return HUD.gold;
  const phase = ((timeSec / HUD.sheenSec) % 1 + 1) % 1;
  const p = 1.9 - 2.8 * phase;
  const bw = w * 2.4;
  const offset = -(bw - w) * p;
  const grad = ctx.createLinearGradient(x + offset, 0, x + offset + bw, 0);
  grad.addColorStop(0, '#fff6b0');
  grad.addColorStop(0.30, '#f3cf34');
  grad.addColorStop(0.48, '#a9791a');
  grad.addColorStop(0.62, '#f7dc6b');
  grad.addColorStop(1, '#fff6b0');
  return grad;
}

/** 上縁の金 4px（`.edge`） */
export function drawGoldEdge(ctx: Ctx2D<unknown>, x: number, y: number, w: number, timeSec = 0, h = 4): void {
  ctx.fillStyle = goldPlate(ctx, x, w, timeSec);
  ctx.fillRect(x, y, w, h);
}

/** 斜度 -9° の平行四辺形（`transform: skewX(-9deg)`・原点は中心）。上辺が右へ、下辺が左へずれる */
export function slantPath(ctx: Ctx2D<unknown>, x: number, y: number, w: number, h: number): void {
  const k = HUD.skew * h * 0.5;
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w + k, y);
  ctx.lineTo(x + w - k, y + h);
  ctx.lineTo(x - k, y + h);
  ctx.closePath();
}

export function fillSlant(ctx: Ctx2D<unknown>, x: number, y: number, w: number, h: number, style: unknown): void {
  ctx.fillStyle = style;
  slantPath(ctx, x, y, w, h);
  ctx.fill();
}

export function strokeSlant(ctx: Ctx2D<unknown>, x: number, y: number, w: number, h: number, style: unknown, lineWidth = 1): void {
  ctx.strokeStyle = style; ctx.lineWidth = lineWidth;
  slantPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.stroke();
}

/** 右下 12px 切り欠きの板（`.notch`）。5 点 path */
export function notchPath(ctx: Ctx2D<unknown>, x: number, y: number, w: number, h: number, notch = 12): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - notch);
  ctx.lineTo(x + w - notch, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

/** `.glass.notch` ＝ 半透明の暗地＋金ヘアライン 1px＋上縁 金 4px */
export function drawGlassNotchPanel(
  ctx: Ctx2D<unknown>, x: number, y: number, w: number, h: number, timeSec = 0,
): void {
  ctx.fillStyle = HUD.glass;
  notchPath(ctx, x, y, w, h);
  ctx.fill();
  ctx.strokeStyle = HUD.goldHair; ctx.lineWidth = 1;
  notchPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.stroke();
  drawGoldEdge(ctx, x, y, w, timeSec);
}

/**
 * ★枠色付き馬番（`.frame`）: 斜度 -9° の板に数字は水平。地が明色なら文字は #111（`inkOn`）
 *   既定 28×22 / 数字 15px
 */
export function drawFrameBadge(
  ctx: Ctx2D<unknown>, pal: Palette, font: FontOf, role: string, text: string,
  x: number, y: number, w = 28, h = 22, fontPx = 15,
): void {
  fillSlant(ctx, x, y, w, h, pal[role] ?? '#fff');
  ctx.fillStyle = inkOn(pal, role);
  ctx.font = font(fontPx, true);
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y + h / 2 + fontPx * 0.36);
  ctx.textAlign = 'left';
}

/** 字間つきの文字（`letter-spacing` の代用）。戻り値は描いた幅 */
export function drawSpacedText(ctx: Ctx2D<unknown>, text: string, x: number, y: number, spacingPx: number): number {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacingPx;
  }
  return cx - x - spacingPx;
}

export function spacedWidth(ctx: Ctx2D<unknown>, text: string, spacingPx: number): number {
  let w = 0; let n = 0;
  for (const ch of text) { w += ctx.measureText(ch).width; n += 1; }
  return w + Math.max(0, n - 1) * spacingPx;
}

/** `.lbl`: 12px bold・字間 .18em・紙色 70% */
export function drawLabel(ctx: Ctx2D<unknown>, font: FontOf, text: string, x: number, y: number, color: string = HUD.paper70, align: 'left' | 'right' = 'left'): void {
  ctx.font = font(12, true);
  ctx.fillStyle = color;
  const sp = 12 * 0.18;
  const w = spacedWidth(ctx, text, sp);
  drawSpacedText(ctx, text, align === 'right' ? x - w : x, y, sp);
}

/** 登場（`rise`）: 0.45s で alpha 0→1・y +10px→0（cubic-bezier(.2,.85,.2,1) 相当のイーズアウト） */
export function riseAt(sinceSec: number, delaySec = 0, durSec = 0.45): { readonly alpha: number; readonly dy: number } {
  const t = Math.max(0, Math.min(1, (sinceSec - delaySec) / durSec));
  const e = 1 - Math.pow(1 - t, 3);
  return { alpha: e, dy: (1 - e) * 10 };
}

/** ワイプ（`wipe`）: 左から幅を伸ばす。戻り値は 0..1 */
export function wipeAt(sinceSec: number, delaySec = 0, durSec = 0.5): number {
  const t = Math.max(0, Math.min(1, (sinceSec - delaySec) / durSec));
  return 1 - Math.pow(1 - t, 3);
}

/** ON AIR の白丸（1.1s 点滅）と音声レベル（6 本 × 幅3・間隔3・高16、0.62s 周期・0.08s ずつ位相ずれ） */
export function drawOnAir(
  ctx: Ctx2D<unknown>, font: FontOf, x: number, y: number, timeSec: number, speaking: boolean, label = 'ON AIR',
): number {
  // チップ h22・地 #c8271f・padding 3 10
  ctx.font = font(11, true);
  const sp = 11 * 0.2;
  const tw = spacedWidth(ctx, label, sp);
  const w = 10 + 7 + 7 + tw + 10;
  ctx.fillStyle = HUD.onAir; ctx.fillRect(x, y, w, 22);
  const blink = 0.625 + 0.375 * Math.cos((timeSec / 1.1) * Math.PI * 2);
  ctx.globalAlpha *= blink;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(x + 10 + 3.5, y + 11, 3.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha /= blink;
  ctx.fillStyle = '#fff';
  drawSpacedText(ctx, label, x + 24, y + 15, sp);
  // 音声レベル
  let lx = x + w + 14;
  for (let i = 0; i < 6; i += 1) {
    const ph = ((timeSec - i * 0.08) / 0.62) % 1;
    const s = speaking ? levelShape(ph) : 0.3;
    const h = 16 * s;
    ctx.fillStyle = HUD.gold;
    ctx.fillRect(lx, y + 11 - h / 2, 3, h);
    lx += 6;
  }
  return lx + 8;
}

/** `@keyframes lv`: 0%/100% .3 → 20% 1 → 45% .55 → 70% .9 */
function levelShape(p: number): number {
  const t = ((p % 1) + 1) % 1;
  const k = [[0, 0.3], [0.2, 1], [0.45, 0.55], [0.7, 0.9], [1, 0.3]] as const;
  for (let i = 1; i < k.length; i += 1) {
    const [t0, v0] = k[i - 1]!; const [t1, v1] = k[i]!;
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      return v0 + (v1 - v0) * e;
    }
  }
  return 0.3;
}

/** 実況の文字送り: 20 文字/秒。戻り値は今見せる文字数 */
export function typedCount(totalChars: number, sinceSec: number): number {
  if (!(sinceSec >= 0)) return totalChars;
  return Math.max(0, Math.min(totalChars, Math.floor(sinceSec * HUD.charsPerSec)));
}

/** ナレーター立ち絵の枠 150×172（地 #1b241d・金ヘアライン・下辺なし）＋ネームプレート 30px */
export function drawNarratorFrame<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf, x: number, y: number,
  portrait: { readonly image: TImage; readonly width: number; readonly height: number } | undefined,
  roleLabel: string, name: string,
): void {
  const w = 150, h = 172;
  ctx.fillStyle = '#1b241d'; ctx.fillRect(x, y, w, h);
  if (portrait !== undefined) {
    // 顔の中心を (75, 68) に。正方形の立ち絵を枠幅に合わせて描く
    const s = w / portrait.width;
    const dh = portrait.height * s;
    ctx.drawImage(portrait.image, 0, 0, portrait.width, portrait.height, x, y + Math.min(0, (h - 30) - dh) , w, dh);
  }
  ctx.strokeStyle = HUD.goldHair; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 0.5, y + h); ctx.lineTo(x + 0.5, y + 0.5); ctx.lineTo(x + w - 0.5, y + 0.5); ctx.lineTo(x + w - 0.5, y + h); ctx.stroke();
  ctx.fillStyle = 'rgba(4,7,5,.92)'; ctx.fillRect(x, y + h - 30, w, 30);
  ctx.fillStyle = HUD.goldHair; ctx.fillRect(x, y + h - 30, w, 1);
  ctx.font = font(10, true);
  const sp = 2;
  const lw = spacedWidth(ctx, roleLabel, sp);
  ctx.font = font(15, true);
  const nw = ctx.measureText(name).width;
  const total = lw + 8 + nw;
  let cx = x + (w - total) / 2;
  ctx.font = font(10, true); ctx.fillStyle = HUD.gold;
  drawSpacedText(ctx, roleLabel, cx, y + h - 11, sp);
  cx += lw + 8;
  ctx.font = font(15, true); ctx.fillStyle = HUD.paper;
  ctx.fillText(name, cx, y + h - 10);
}

/** 「まもなく発走」「確定」などの金ベタチップ（斜度 -9°・文字 #12140f） */
export function drawGoldChip(ctx: Ctx2D<unknown>, font: FontOf, text: string, x: number, y: number, h = 26, fontPx = 16, padX = 14, letterSpacing = 0): number {
  ctx.font = font(fontPx, true);
  const tw = spacedWidth(ctx, text, letterSpacing);
  const w = tw + padX * 2;
  fillSlant(ctx, x, y, w, h, HUD.gold);
  ctx.fillStyle = HUD.ink;
  drawSpacedText(ctx, text, x + padX, y + h / 2 + fontPx * 0.36, letterSpacing);
  return w;
}

/** 暗地＋金ヘアラインの斜めチップ（`glass` + `gold-hair`） */
export function drawGlassChip(ctx: Ctx2D<unknown>, font: FontOf, text: string, x: number, y: number, h = 26, fontPx = 14, padX = 14): number {
  ctx.font = font(fontPx, true);
  const w = ctx.measureText(text).width + padX * 2;
  fillSlant(ctx, x, y, w, h, HUD.glass);
  strokeSlant(ctx, x, y, w, h, HUD.goldHair);
  ctx.fillStyle = HUD.paper;
  ctx.font = font(fontPx, true);
  ctx.fillText(text, x + padX, y + h / 2 + fontPx * 0.36);
  return w;
}

/** m:ss.s（レースは 3 分未満） */
export function formatRaceTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
