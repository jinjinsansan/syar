import type { Ctx2D } from './oblique-draw.js';

/**
 * ★**季節と天気の空気**（★2026-09-15・計画書 R-6「季節の色味」・R-7「季節の舞うもの」・C-2「雨」）
 *
 * 【★何で決めるか】★決定論です（★憲法 4）。★端末の時計・乱数を読みません。
 *   ★季節 … ★レースの `month`（★`graded-races.ts` の明示のフィールド・★レース名からは決めない・回答 §3-1）
 *   ★雨   … ★馬場状態（★重・不良だけ・★照りと水たまりと同じ入力）
 *   ★舞い方 … ★呼ぶ側が渡す表示秒と風（`windOf`）
 *
 * 【★舞うものは雪だけ】★オーナー評（2026-09-15）:
 *   > ★冬の雪はいいですが　春の桜と　雨の落ち葉みたいな？のもおかしいです。　雨は雨だけにしてください。
 *   → ★春の花びら・秋の落ち葉は ★**やめました**。★舞うのは ★冬（1〜2 月）の雪だけです。
 *   → ★**雨の日（重・不良）は雨だけ**を降らせ、★雪も降らせません（`seasonParticlesFor`）。
 *
 * 【★見やすさの線】（★レビュー側の回答 §4-3・計画書 L-5）
 *   ★重ねる色は ★**濃さに上限** `ATMOSPHERE_TINT_MAX`。
 *   ★色は ★**背景の板・地面だけ**に重ね、★**馬・勝負服・枠番・HUD には掛けません**（★馬より先に描く）。
 *   ★雪・雨も ★**馬より先**（★奥）に描き、★勝負服を隠しません。
 *
 * ⚠️ ★着順にも位置にも触れません（★憲法 3）。
 */

export type Season = 'winter' | 'spring' | 'early-summer' | 'summer' | 'autumn';

/** ★月 → 季節（★計画書 §3-1 の表） */
export function seasonOf(month: number): Season {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error(`月が不正です: ${month}`);
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 6) return 'early-summer';
  if (month <= 8) return 'summer';
  return 'autumn';
}

/** ★重ねる色の濃さの上限（★これを超える値を表に書くと検査が落ちる） */
export const ATMOSPHERE_TINT_MAX = 0.12;

export interface Tint { readonly color: string; readonly alpha: number }

/** ★舞うものの種類（★2026-09-15 のオーナー評で雪だけになりました） */
export type ParticleKind = 'snow';

export interface SeasonLook {
  readonly label: string;
  /** ★地面（芝・ダートの層）に重ねる色 */
  readonly ground: Tint;
  /** ★景色（空・木・スタンドの層）に重ねる色 */
  readonly scenery: Tint;
  /** ★舞うもの（★無い季節は `undefined`） */
  readonly particles?: {
    readonly kind: ParticleKind;
    readonly colors: readonly string[];
    readonly count: number;
    /** ★この月だけ舞う（★冬の雪は 1〜2 月だけ・★12 月は色味だけ） */
    readonly months: readonly number[];
  } | undefined;
}

/**
 * ★**季節ごとの色味と舞うもの**（★開発側の仮置き・★オーナーの目で決める）。
 *   ★地面は ★春＝若草・初夏＝濃い緑・夏＝強い日差し・秋＝黄み・冬＝枯れ色。★景色は空気の色。
 */
export const SEASON_LOOKS: Readonly<Record<Season, SeasonLook>> = {
  spring: {
    label: '春', ground: { color: '#c8e8a0', alpha: 0.06 }, scenery: { color: '#f4dde6', alpha: 0.08 },
  },
  'early-summer': {
    label: '初夏', ground: { color: '#5f9a3c', alpha: 0.06 }, scenery: { color: '#d8ecf4', alpha: 0.06 },
  },
  summer: {
    label: '夏', ground: { color: '#f2e6a0', alpha: 0.05 }, scenery: { color: '#fff4c8', alpha: 0.08 },
  },
  autumn: {
    label: '秋', ground: { color: '#c9a64a', alpha: 0.09 }, scenery: { color: '#f0c890', alpha: 0.08 },
  },
  winter: {
    label: '冬', ground: { color: '#b8ae8c', alpha: 0.1 }, scenery: { color: '#dfe6ee', alpha: 0.1 },
    particles: { kind: 'snow', colors: ['#ffffff', '#eef4fa'], count: 70, months: [1, 2] },
  },
};

/** ★その月に舞うものがあるか（★冬でも 12 月は舞わない） */
export function particlesFor(month: number): SeasonLook['particles'] {
  const p = SEASON_LOOKS[seasonOf(month)].particles;
  return p !== undefined && p.months.includes(month) ? p : undefined;
}

/** ★馬場状態 → 雨粒の数（★良・稍重は 0） */
export function rainDropsOf(condition: 'good' | 'yielding' | 'soft' | 'bad'): number {
  return condition === 'bad' ? 110 : condition === 'soft' ? 60 : 0;
}

/**
 * ★**画面に出す舞うもの**（★月と馬場状態から・★画面も検査もここを通る）。
 * ⚠️ ★**雨の日（重・不良）は舞うものを出しません**（★オーナー評「雨は雨だけにしてください」）。
 */
export function seasonParticlesFor(month: number, condition: 'good' | 'yielding' | 'soft' | 'bad'): SeasonLook['particles'] {
  if (rainDropsOf(condition) > 0) return undefined;
  return particlesFor(month);
}

/**
 * ★**描画に渡す空気のまとめ**（★画面が 1 つ組み、★`drawBroadcastV2Scene` が背景と馬の間に使う）。
 *   ★注視点・画面の大きさ・馬の進む向きは ★場面の側が入れます（★呼ぶ側は渡さない）。
 */
export interface AtmosphereOptions {
  /** ★地面の層に重ねる色（★季節・ダートの砂の色を順に） */
  readonly groundTints: readonly Tint[];
  /** ★景色の層（空・木・スタンド）に重ねる色 */
  readonly sceneryTint?: Tint | undefined;
  /** ★景色の層に ★`sceneryTint` の後から重ねる色（★時間帯・`timeOfDayTintsOf`・2026-09-15） */
  readonly sceneryTints?: readonly Tint[] | undefined;
  readonly particles?: SeasonLook['particles'];
  readonly rainDrops: number;
  /** ★霧の濃さ（★霧の場だけ・0 または省略で描かない・`drawVenueFog`・2026-09-15） */
  readonly fogAlpha?: number | undefined;
  readonly windDir: 1 | -1;
  readonly windStrength: number;
  readonly timeSec: number;
}

/** ★座標とシードから 0〜1（★乱数ではない） */
function hash01(i: number, salt: number): number {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const wrap = (v: number, m: number): number => ((v % m) + m) % m;

export interface AtmosphereMotion {
  readonly viewport: { readonly width: number; readonly height: number };
  /** ★揺れと落ち方の時計（★表示秒） */
  readonly timeSec: number;
  /** ★カメラが進んだ距離（m）。★景色と一緒に流れて見えるように */
  readonly focusS: number;
  /** ★画面の上で馬が進む向き（+1 右 ／ −1 左）。★景色はその逆へ流れる */
  readonly direction: 1 | -1;
  readonly windDir: 1 | -1;
  readonly windStrength: number;
}

/**
 * ★**舞うもの**（雪）を描く。★**馬より先**に呼ぶこと（★勝負服を隠さない）。
 */
export function drawSeasonParticles(
  ctx: Ctx2D<unknown>,
  p: NonNullable<SeasonLook['particles']>,
  m: AtmosphereMotion,
): void {
  const W = m.viewport.width, H = m.viewport.height;
  const prev = ctx.globalAlpha;
  const fall = 34;
  const drift = (10 + m.windStrength * 50) * m.windDir;
  /** ★景色と一緒に流す（★1m あたり 9px・★奥の層くらいの速さ） */
  const scroll = -m.direction * m.focusS * 9;
  for (let i = 0; i < p.count; i += 1) {
    const u = hash01(i, 11), v = hash01(i, 23), w = hash01(i, 37);
    /** ★大きさ（px）。★2026-09-15 の初版（2〜5px）は実画面でほとんど見えなかったので大きくした */
    const size = 3.6 + w * 3.4;
    const x = wrap(u * W + drift * m.timeSec + scroll * (0.6 + w * 0.6) + Math.sin(m.timeSec * (1.3 + w) + i) * 14, W + 40) - 20;
    const y = wrap(v * H + fall * (0.7 + w * 0.6) * m.timeSec, H + 40) - 20;
    ctx.globalAlpha = prev * (0.55 + w * 0.3);
    ctx.fillStyle = p.colors[i % p.colors.length]!;
    ctx.beginPath();
    ctx.ellipse(x, y, size / 2, size / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = prev;
}

/**
 * ★雨粒を描く（★斜めの細い線）。★**馬より先**に呼ぶこと。
 * ⚠️ ★2026-09-15 の初版（濃さ 0.22・太さ 1.2px）は実画面で雨に見えなかったので、★濃さ 0.38・太さ 1.6px にした。
 */
export function drawRain(ctx: Ctx2D<unknown>, drops: number, m: AtmosphereMotion): void {
  if (!(drops > 0)) return;
  const W = m.viewport.width, H = m.viewport.height;
  const prev = ctx.globalAlpha;
  const slant = (0.12 + m.windStrength * 0.25) * m.windDir;
  ctx.strokeStyle = '#dfe8ef';
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = prev * 0.38;
  ctx.beginPath();
  for (let i = 0; i < drops; i += 1) {
    const u = hash01(i, 101), v = hash01(i, 131), w = hash01(i, 151);
    const len = 18 + w * 18;
    const x = wrap(u * W + slant * 900 * m.timeSec - m.direction * m.focusS * 12, W + 60) - 30;
    const y = wrap(v * H + 900 * (0.8 + w * 0.4) * m.timeSec, H + 60) - 30;
    ctx.moveTo(x, y);
    ctx.lineTo(x + slant * len, y + len);
  }
  ctx.stroke();
  ctx.globalAlpha = prev;
}
