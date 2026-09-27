/**
 * ★**常設帯の走行のカメラ**（★先頭を追う・★中継と同じ考え方）（★2026-09-27）
 *
 * ★枠に映るのは ★`RUN_VIEW_M` メートルぶん。
 *   ⚠️ ★1600m を 1 枚に収めると ★数馬身の差が ★3px にしかならず、★全頭が 1 つの塊に見えました（★2026-09-27 実測）。
 *   ★先頭の少し前を右端にし、★ゴールが近づいたら ★ゴールの少し先で止めます（★ゴールの線が見える）。
 * ★返り値は進行率（0〜1）の区間。
 *
 * ⚠️ ★**式はこの 1 か所だけ**です（★裁定 `REVIEW_ALWAYS_VISIBLE_RACE_20260927.md` §5 条件 1）。
 *    ★`race-strip.tsx` と網（`race-strip-run.test.ts`）が ★**同じこれを import** します。★写さないこと（★D-052）。
 *    ★css を読まない純関数にしてあるので、★網からそのまま読めます。
 */
export const RUN_VIEW_M = 60;

export function runCamera(positions: readonly number[], distance: number): { readonly left: number; readonly right: number } {
  const d = Number.isFinite(distance) && distance > 0 ? distance : 1600;
  const view = Math.min(1, RUN_VIEW_M / d);
  const lead = positions.length === 0 ? 0 : Math.max(...positions);
  const right = Math.min(1 + 6 / d, Math.max(view, lead + 8 / d));
  return { left: right - view, right };
}
