/**
 * ★**調教の指示をサーバーへ送る**（★1 か所・★2026-09-27・裁定 `REVIEW_UI_AUDIT_20260927.md` P1-1）
 *
 * 【🔴 ★なぜ部品にしたか】
 *   ★ナビの「育成」は ★新しい `/train` を指しますが、★`/train` は ★**1 つも送れませんでした**（★「調教指示は準備中」）。
 *   ★送れたのは ★旧い `/training` だけで、★メニューから辿れませんでした（★遊びの中心が止まっていた）。
 *   → ★送る処理を ★ここ 1 か所に置き、★`/train` と `/training` の両方が使います（★D-052・★写しを持たない）。
 *
 * 【★決まり】
 *   ★EP は ★ここでは減りません（★ワーカーが実際に調教したときに減る・★「EP だけ減って何も起きない」を作らない）。
 *   ★所有の確認と締切（★処理済みの週へは書けない）は ★**サーバー側**（★`set_training_order`・`0057`〜`0059`・憲法 §0.2-4）。
 *   ★週は ★`my_horses.last_processed_week`（★既定値で埋めない — ★週を持たない馬には書けない）。
 */
import { authClient } from './supabase';

/**
 * 🔴 ★**指示する週は、★その馬の `last_processed_week`**（★2026-09-21 に直しました・★旧 `/training` から移した註記）。
 *
 *   ⚠️ ★最初は ★**世界の週**（`world_state_public.game_week`）を書いていました。
 *     ★しかしワーカーが読むのは ★**その馬の `last_processed_week` の注文**です
 *     （★`training-runner.ts:306`）。★★馬が遅れていれば、★世界の週の注文は読まれません。
 *   → ★★**読む側と同じ鍵を書きます。** ★画面で週を計算しません。
 */
async function weekForOrder(horseId: string): Promise<number> {
  const { data, error } = await authClient()
    .from('my_horses').select('last_processed_week').eq('id', horseId).limit(1);
  if (error !== null) throw new Error(`my_horses を読めませんでした: ${error.message}`);
  const w = data?.[0]?.last_processed_week;
  if (w === null || w === undefined) {
    // ★週を持っていない馬に指示は書けません（★既定値で埋めない）
    throw new Error('この馬はまだ週を持っていません（last_processed_week が空）');
  }
  return Number(w);
}

/**
 * ★指示を送る。★失敗は ★サーバーの文をそのまま投げます（★黙って成功に見せない）。
 * @param menuId ★`TRAINING_MENUS` の id（★サーバーの `menu in (...)` と同じ語）
 */
export async function sendTrainingOrder(horseId: string, menuId: string): Promise<void> {
  const week = await weekForOrder(horseId);
  const { error } = await authClient().rpc('set_training_order', {
    p_horse_id: horseId, p_week: week, p_menu: menuId,
  });
  if (error !== null) throw new Error(error.message);
}
