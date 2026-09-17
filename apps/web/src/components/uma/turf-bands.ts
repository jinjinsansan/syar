/**
 * ★**近景の芝の「遠近 4 段」**（★2026-09-17・オーナー指示「★芝をあなたが治してください」）
 *
 * 【★なぜ `uma-parts.tsx` から切り出すか】
 *   ★`uma-parts.tsx` は `'use client'` で、★`import './uma-theme.css'` を持ちます。
 *   ★検査は `environment: 'node'` で走るので、★あちらを取り込むと ★**CSS の読み込みで落ちます**。
 *   → ★**計算だけをここに置きます**（★React も CSS も要りません）。★これで検査できます。
 *
 * 【★何が「雑な芝」の正体だったか】
 *   ⚠️ ★以前は ★**1 枚の要素に `repeat`（縦横とも繰り返し）**で `turf-near.webp`
 *      （★実寸 1500×**90**）を敷いていました。★近景は画面の 58〜74% を占めるので、
 *      ★**同じ帯が縦に 5〜6 回並びます**。★素材は横一本の帯として描かれているため、
 *      ★**同じ明暗が等間隔で現れます** — ★それが「等間隔の白い横筋」でした。
 *   ⚠️ ★**引き伸ばしではありません。** ★私は最初「5.5 倍に引き伸ばしている」と報告しましたが、
 *      ★実装は `backgroundSize: '1500px 90px'` ＋ `repeat` で、★**タイル貼り**でした。★訂正します。
 *
 * 【★どう直すか】
 *   ★各段は ★**高さ 100%＝縦に 1 枚だけ**にします（★縦の継ぎ目が消えます）。
 *   ★手前の段ほど ★**背を高く・速く**流します。★地面を寝かせて見たとき、手前ほど芝が
 *   ★大きく速く見えるのが本当なので、★段の境目が「継ぎ目」ではなく
 *   ★**遠近の線**として読めます。
 */

/** ★近景の領域を 1 としたときの各段の高さ（★合計 1.00）と、★1 周にかける秒数 */
const NEAR_BANDS = [
  { frac: 0.12, dur: 1.9 },
  { frac: 0.18, dur: 1.35 },
  { frac: 0.26, dur: 0.95 },
  { frac: 0.44, dur: 0.62 },
] as const;

export interface TurfBand {
  /** ★画面の上からの位置（%） */
  readonly top: number;
  /** ★段の高さ（%） */
  readonly height: number;
  /** ★1 周にかける秒数（★手前ほど短い＝速い） */
  readonly dur: number;
}

/**
 * ★`regionTop`（%）から画面下端までを 4 段に割ります。
 *
 * ⚠️ ★段は ★**必ず隣と接します**（★隙間があると素の背景色が線になって見えます）。
 * ⚠️ ★最後の段は ★**必ず画面下端（100%）で終わります**。
 */
export function nearBands(regionTop: number): readonly TurfBand[] {
  if (!Number.isFinite(regionTop) || regionTop < 0 || regionTop >= 100) {
    throw new Error(`★近景の開始位置が画面の中にありません: ${regionTop}`);
  }
  const region = 100 - regionTop;
  let acc = 0;
  return NEAR_BANDS.map((b) => {
    const row: TurfBand = { top: regionTop + region * acc, height: region * b.frac, dur: b.dur };
    acc += b.frac;
    return row;
  });
}
