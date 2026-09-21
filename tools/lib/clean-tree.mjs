/**
 * ★**作業ツリーが汚れていないか**の判定（★純関数）— 簿 `CI-DIRTY-TREE-UNSEEN`・2026-09-21
 *
 * ============================================================================
 * 【🔴 ★なぜ要るか】
 *   ★門は長らく ★**読むだけ**でした（★型検査・検査・簿の期限）。
 *   ★2026-09-21 に ★`build:web` を入れ、★★**門が「作って壊す」道具を持ちました**。
 *   ★実際 ★`next build` は ★`apps/web/next-env.d.ts` と `tsconfig.json` を ★**書き換えます**。
 *   ★★そのまま commit すると、★Vercel（`.next`）が参照できない道を指します。
 *   ✅ ★その 1 件は `gate.mjs` の `buildWeb()` が塞ぎました。
 *   🔴 ★**塞いだのは 1 件だけ。** ★次に「作る」段を足した人は、★同じ穴を作ります。
 *   → ★★**CI が「門を流した後、★ツリーが汚れていないこと」を見ます。**
 *
 * 【🔴 ★「空だから合格」にしない（★**CK-14**）】
 *   ⚠️ ★`git status --porcelain` が空なのは ★**2 通り**あります:
 *     ★① ★本当にきれい（★合格）
 *     ★② ★★**git が答えていない**（★別の場所で走った・★リポジトリでない・★失敗した）
 *   → ★★**②を①と読ませないために、★「git が見えていること」を別に確かめます。**
 *     ★`trackedCount`（★`git ls-files` の数）が 0 なら ★**判定不能**にします。
 *
 * 【★なぜ純関数に切り出すか】
 *   ★`migrate-guard` と同じ理由です。★**組み合わせを、★CI に触らずに検査で回せる**から。
 *   ★★CI の中でしか試せない判定は、★**CI が落ちた日にしか直せません。**
 * ============================================================================
 */

/**
 * ★判定する。
 *
 * @param {string} porcelain      ★`git status --porcelain` の出力（★そのまま）
 * @param {number} trackedCount   ★`git ls-files` が返した数（★git が見えていることの対照）
 * @param {readonly string[]} allowed ★汚れていてよい道（★前方一致）。★既定は無し
 * @returns {{ ok: boolean, undecidable: boolean, dirty: string[], reason: string }}
 */
export function cleanTreeVerdict(porcelain, trackedCount, allowed = []) {
  if (!Number.isInteger(trackedCount) || trackedCount <= 0) {
    return {
      ok: false,
      undecidable: true,
      dirty: [],
      reason: '★git が 1 件も追跡ファイルを返しません。★リポジトリの中で走っていない可能性があります'
        + '（★**空の出力を「きれい」と読みません** — ★CK-14）',
    };
  }
  const lines = porcelain.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const dirty = [];
  for (const line of lines) {
    // ★`XY path` / `XY old -> new`。★道は 4 文字目から
    const path = line.slice(3);
    const target = path.includes(' -> ') ? path.split(' -> ')[1] : path;
    if (allowed.some((a) => target.startsWith(a))) continue;
    dirty.push(line);
  }
  if (dirty.length > 0) {
    return {
      ok: false,
      undecidable: false,
      dirty,
      reason: `★門を流した後に ${dirty.length} 件 汚れています`
        + '（★道具が書いたなら、★その道具が書き戻すこと）',
    };
  }
  return {
    ok: true,
    undecidable: false,
    dirty: [],
    reason: `★きれいです（★追跡 ${trackedCount} 件を git が見えている状態で確かめました）`,
  };
}
