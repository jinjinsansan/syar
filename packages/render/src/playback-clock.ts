/**
 * ★**画面の時計を 1 コマで大きく飛ばさない**（★2026-10-03・オーナー「芝・ダートの動きが どうしても 逆回転・超高速になる」）。
 *
 * 【★なぜ】
 *   ★映像そのもの（★1/60 秒刻みの理想の再生）は ★見本でも実レースの経路でも ★芝の速さ 0.96〜1.09 倍・逆回転 0 件（★`/race?audit=ground`）。
 *   ★ところが 端末では ★コマ落ち 120〜400ms が出る（★オーナーの `[race-ground]` の記録）。★時計を壁の時計に合わせて飛ばすと、
 *   ★毎秒 16m の芝が 1 コマで 2〜6m 進む。★刈り目の縞（★8〜12m で繰り返す）や ラチの支柱は ★その距離で
 *   ★**車輪が逆に回って見えるのと同じ錯覚**になり、★逆に流れたり 急に飛んだりして見える。
 *
 * 【★どうするか】
 *   ★1 コマで進める画面の時間を ★`PLAYBACK_STEP_CAP_SEC`（1/30 秒）までにし、★遅れた分は ★`PLAYBACK_CATCHUP` 倍の速さで 取り戻す。
 *   ★遅れが ★`PLAYBACK_SNAP_SEC` を超えたら（★タブを裏に回していた 等）★取り戻さず 合わせる（★長い早回しにしない）。
 *   ★30 コマ/秒の端末でも 遅れが溜まらない（★1 コマ 1/30 秒までは そのまま進む）。
 * ★決定論: ★時刻は引数で受け取る（★`Date.now` / `performance.now` を ここで呼ばない・憲法 4）。
 */
/**
 * ★**長く止まったコマだけ 抑える**（★2026-10-03・オーナー「最後の直線 残り 70m あたりで 芝が急にトーンダウンして すぐ戻る」）。
 *   ⚠️ ★1/30 秒で抑えていた頃は ★0.03〜0.1 秒の少し重いコマが続くと ★レースごと ゆっくりになり、★その後 1.2 倍で追いついた。
 *   ★0.1 秒までは 壁の時計どおり（★芝は 1 コマ 1.6m まで・刈り目の縞 8〜12m の半分より十分小さい）。
 */
export const PLAYBACK_LONG_STALL_SEC = 0.1;
/** ★長く止まったコマで 進める画面の時間（★1/30 秒） */
export const PLAYBACK_STEP_CAP_SEC = 1 / 30;
export const PLAYBACK_CATCHUP = 1.2;
export const PLAYBACK_SNAP_SEC = 1;

/**
 * ★次のコマの 画面の時刻。
 * @param shown  いま画面に出している時刻（秒）
 * @param target 壁の時計で そうあるべき時刻（秒）
 * @param frameSec 前のコマからの 壁の時計の秒（★再生速度を掛けた後）
 */
export function nextShownTime(shown: number, target: number, frameSec: number): number {
  const lag = target - shown;
  if (!(lag > 0)) return target;
  if (lag > PLAYBACK_SNAP_SEC) return target;
  const f = Math.max(0, frameSec);
  const step = f > PLAYBACK_LONG_STALL_SEC ? PLAYBACK_STEP_CAP_SEC : f;
  /** ★遅れが このコマの分より大きいときだけ 速める（★ふだんは 壁の時計どおり） */
  const advance = lag > step * 1.001 ? step * PLAYBACK_CATCHUP : step;
  return Math.min(target, shown + advance);
}
