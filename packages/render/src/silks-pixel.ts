/**
 * ★**勝負服として塗ってよい画素か**（★2026-09-13 に 1 か所へ寄せました）
 *
 * 【★なぜ切り出したか】
 *   ★この判定は `race/page.tsx` の中に直書きされていました。★そのため
 *   ★**窓（`SILKS_LAYOUT_*`）を決める測り方が、★画面と違う式で行われます**。
 *   ★実際、★2026-09-12 に窓を 1 コマだけ測って詰め、★鞍布が縦に割れました
 *   （★オーナー評「★騎手の服がまた縦縞模様です」）。
 * → ★測る側と塗る側が ★**同じ関数**を通るようにします（★R-30）。
 *
 * ⚠️ ★ここは「どこを塗るか（窓）」を決めません。★「その色を塗ってよいか」だけです。
 */
import { isSkinTone } from './silks-skin.js';

/**
 * ★**塗ってよい色の範囲**。
 *   ★素材の勝負服は ★**無彩色の灰／白**で作らせています（★生成プロンプトで指定）。
 *   ★だから「彩度が低く、暗すぎない」を通します。
 * ⚠️ ★兜は縁取りの濃い線を含むので、★少しゆるめます。
 */
export const SILKS_PAINT = {
  /** ★透けている画素は触らない */
  minAlpha: 16,
  /** ★彩度（最大 − 最小）の上限 */
  maxSpread: 34,
  maxSpreadHelmet: 62,
  /** ★明るさ（最大チャンネル）の下限 */
  minLevel: 72,
  minLevelHelmet: 42,
} as const;

/**
 * ★その画素を勝負服の色で塗ってよいか。
 * @param helmet ★兜の窓の中か（★ゆるい閾値を使う）
 */
export function silksPaintable(
  r: number, g: number, b: number, a: number, helmet: boolean,
): boolean {
  if (a < SILKS_PAINT.minAlpha) return false;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread > (helmet ? SILKS_PAINT.maxSpreadHelmet : SILKS_PAINT.maxSpread)) return false;
  if (Math.max(r, g, b) < (helmet ? SILKS_PAINT.minLevelHelmet : SILKS_PAINT.minLevel)) return false;
  /** ⚠️ ★肌は塗りません（★陰になった肌は彩度で弾けません・`silks-skin.ts`） */
  return !isSkinTone(r, g, b);
}
