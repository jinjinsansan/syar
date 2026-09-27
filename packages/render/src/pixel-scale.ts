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
/**
 * ★**見せる寸法に合わせた倍率**（★2026-09-28・正典 D-058b・レビュー側の暫定）。
 *
 * 【★なぜ】
 *   ★D-058 の「表示は整数倍のみ」は ★ピクセルアート（220×140）を ★非整数倍が壊すことへの守りでした。
 *   ★絵柄は 09-23 にセル調（★描いた絵・side-v8 970×576）になり、★カメラは連続に寄り引きします。★守る対象は無くなりました。
 *   ★残る目的は ★**ブラウザに縮め直させない（★滲ませない）**こと。
 *   → ★裏の画素 ＝ ★見せる寸法 × devicePixelRatio（★比 1.000）。★映像の大きさは変わりません。
 *   ⚠️ ★これまでの `pixelScaleOf` は ★端末の画素比だけで決め、★見せる幅を見ていなかったので、
 *      ★PC（入れ物 1252 CSS px）では ★裏 1280 → 画面 1252 で ★0.978 倍に縮め直されていました。
 *
 * ★`displayCssWidth` … ★画布が画面に出ている幅（CSS px・★拡大縮小と回転を含んだ長い辺）。★0 以下や数でないなら ★端末の画素比だけで決める。
 * ★`drawWidth` … ★描く座標の幅（1280）。
 * ★`?dpr=` の戻し口は ★これまでどおり効きます（★その値で描く）。
 * ⚠️ ★上限は `MAX_PIXEL_SCALE`（★コマ落ち対策）。★上限に当たる大きな画面（★4K で全幅など）だけは ★比が 1 を超えます。
 */
export function pixelScaleForDisplay(search: string, deviceRatio: number, displayCssWidth: number, drawWidth: number): number {
  const v = new URLSearchParams(search).get('dpr');
  if (v !== null && v !== '') return pixelScaleFromSearch(search, deviceRatio);
  if (!Number.isFinite(displayCssWidth) || displayCssWidth <= 0 || !Number.isFinite(drawWidth) || drawWidth <= 0
    || !Number.isFinite(deviceRatio) || deviceRatio <= 0) return pixelScaleOf(deviceRatio);
  return Math.min(MAX_PIXEL_SCALE, Math.max(MIN_DISPLAY_SCALE, (displayCssWidth * deviceRatio) / drawWidth));
}
/** ★見せる寸法から出す倍率の下限（★画布が一瞬 0 幅のとき 極端に小さくしない） */
export const MIN_DISPLAY_SCALE = 0.25;

export function pixelScaleFromSearch(search: string, deviceRatio: number): number {
  const v = new URLSearchParams(search).get('dpr');
  if (v === null || v === '') return pixelScaleOf(deviceRatio);
  const n = Number(v);
  if (!Number.isFinite(n)) return pixelScaleOf(deviceRatio);
  return pixelScaleOf(n);
}
