/**
 * ★**画面の物理画素で描くための倍率**（★2026-09-12・★引継ぎ書 `HANDOVER_P4_RENDER_SCALE_20260912.md` §2）
 *
 * 【★なぜ要るか】
 *   ⚠️ ★レースの画布は **1280×720** を描き、★画面は ★**1152 CSS px × dpr 1.5 ＝ 1728 物理 px**
 *      で出していました（★実測・★引継ぎ書 F-1）。★**1.35 倍に引き伸ばして**表示していたので、
 *      ★オーナー評「★絵が滲んでいます」。★撮り方では直りません。
 *   → ★**画布を `1280 × この倍率` で持ち**、★描く座標は 1280×720 のままにします。
 *
 * 【★なぜ 1 か所に置くのか】
 *   ⚠️ ★同じ倍率を ★**画布の大きさ・描画の変換・地面の走査線**の 3 か所が使います。
 *      ★別々に書くと必ず離れます（★R-31・★台帳 B-6）。★出どころはこのファイルだけです。
 */

/**
 * ★**倍率の上限。**
 *
 * ⚠️ ★4K の端末は `devicePixelRatio` が 2〜3 を返します。★そのまま使うと画素数が 9 倍になり、
 *    ★コマ落ちします。★2 で頭打ちにします（★引継ぎ書 §2 ②）。
 */
export const MAX_PIXEL_SCALE = 2;

/**
 * ★端末の画素比から、★実際に使う倍率を決める。
 *
 * ⚠️ ★`devicePixelRatio` は ★**1 未満**にもなります（★頁を縮小表示しているとき）。
 *    ★そのまま使うと画布が 1280 より小さくなり、★**こちらから絵を粗くします**。★1 を下限にします。
 */
export function pixelScaleOf(deviceRatio: number): number {
  if (!Number.isFinite(deviceRatio)) return 1;
  return Math.min(MAX_PIXEL_SCALE, Math.max(1, deviceRatio));
}

/**
 * ★**戻し口** … `/race?dpr=1` で ★**引き伸ばしていた頃の見え方**に戻せます。
 *
 *   ★`?dpr=<数>` … その倍率で描く（★上限 `MAX_PIXEL_SCALE`・下限 1）
 *   ★指定なし     … 端末の `devicePixelRatio` から決める（★既定）
 *
 * ⚠️ ★既定値をこの関数の**外**に書かないこと（★R-31）。★呼ぶ側は端末の値を渡すだけにします。
 */
export function pixelScaleFromSearch(search: string, deviceRatio: number): number {
  const v = new URLSearchParams(search).get('dpr');
  if (v === null || v === '') return pixelScaleOf(deviceRatio);
  const n = Number(v);
  if (!Number.isFinite(n)) return pixelScaleOf(deviceRatio);
  return pixelScaleOf(n);
}
