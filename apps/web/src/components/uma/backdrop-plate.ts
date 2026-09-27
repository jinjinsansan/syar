/**
 * ★**芝の背景（`Backdrop`）の値 ── 1 か所**（★2026-09-28 に `uma-parts.tsx` から移した）
 *
 * ★移した理由（★レビュー側の条件）: ★道具 `tools/audit-text-on-backdrop.mjs`（★芝の上の文字の明度差を測る）が
 *   ★層の位置と暗幕の段を ★**写していました**（★今日カメラの式で直したのと同じ二重管理）。
 *   ★`uma-parts.tsx` の Backdrop と ★道具が ★**同じこれを import** します（★JSX を持たないので道具からも読める）。
 *   ★網 `apps/web/test/turf-bands.test.ts` は ★このファイルの原文で ★層の割合を見ます。
 */

/**
 * ★**中継の板の割合**（★2026-09-17・オーナー指摘
 *   ★「★レース演出そのものの芝にしていないからです」）。
 *
 * ★`/art/parallax/backstretch-side-v1/manifest.json` の板は **941px** で、
 * ★層ごとに `plateY0`〜`plateY1` が決まっています。★その割合をそのまま使います。
 * ⚠️ ★これを守らないと、★`turf-near`（板の 9.6%）を画面の 64% へ ★**5 倍に引き伸ばす**ことになり、
 *    ★ぼやけて白っぽくなります（★「手前が半透明」の正体）。
 *
 * ★`dur` は中継の公式から（★`parallax-plate.ts:14`・★注視点 30m・`turf-near`=1 の比）。
 */
export const PLATE_LAYERS = [
  { src: 'trees', y: 0, h: 19.98, dur: 5.35 },
  { src: 'stand', y: 19.98, h: 16.37, dur: 2.82 },
  { src: 'hedge', y: 36.34, h: 5.95, dur: 1.69 },
  { src: 'back-rails', y: 42.30, h: 6.38, dur: 1.35 },
  { src: 'inner-rail', y: 48.67, h: 4.78, dur: 1.13 },
  { src: 'turf-far', y: 53.45, h: 7.97, dur: 0.93 },
  { src: 'turf-mid', y: 61.42, h: 9.99, dur: 0.76 },
  { src: 'turf-near', y: 71.41, h: 9.56, dur: 0.62 },
  { src: 'front-rail', y: 80.98, h: 19.02, dur: 0.48 },
] as const;

/**
 * ★**画面版の暗幕の段**（★文字を載せるので背景を沈める・★TOP は沈めない）。
 *   ★下半分は ★2026-09-28 に濃くしました（★.42 → .55・★.78 → .86・★デザイナー R-18 回答 🟡 #7）。
 */
export const SCREEN_OVERLAY_STOPS: readonly { readonly pos: number; readonly rgb: readonly [number, number, number]; readonly a: number }[] = [
  { pos: 0, rgb: [10, 35, 64], a: 0.5 },
  { pos: 26, rgb: [10, 35, 64], a: 0.28 },
  { pos: 62, rgb: [8, 20, 10], a: 0.55 },
  { pos: 100, rgb: [8, 20, 10], a: 0.86 },
];

/** ★暗幕の CSS（★`SCREEN_OVERLAY_STOPS` から作る・★値を 2 か所に書かない） */
export function screenOverlayCss(): string {
  const stops = SCREEN_OVERLAY_STOPS.map((s) => `rgba(${s.rgb.join(',')},${s.a}) ${s.pos}%`);
  return `linear-gradient(${stops.join(',')})`;
}
