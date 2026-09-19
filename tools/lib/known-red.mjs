/**
 * ★**いま赤いと分かっている検査の登録簿**（★RD-2・2026-09-19）
 *   ★裁定 `REVIEW_UI4_PREP_VERDICT_20260919.md` §4
 *
 * 【🔴 ★なぜ要るか】
 *   ★報告に「2,226 / 2,227」と書き続けると、★**「いくつ赤か」を人が覚えている状態**になります。
 *   ★2 件目が出たとき、★**3 件目は紛れます**（R-16: いちばん楽に検査を満たす道）。
 *   → ★**赤は数ではなく名前で管理します。** ★ここに載っていない赤が 1 つでも出たら落ちます。
 *
 * 【★載せるときに必ず書くこと】
 *   ★`test`     … ★検査の名前（★ファイル > describe > it を `>` で繋いだもの。★部分一致ではなく**完全一致**）
 *   ★`why`      … ★**なぜ赤いか**（★「調査中」は理由ではありません）
 *   ★`owner`    … ★誰の担当か（★`dev` / `review` / `owner`）
 *   ★`until`    … ★いつまでか（★ISO の日付。★過ぎたら落ちます）
 *
 * 【⚠️ ★緑に戻ったのに載っているのも落とします】
 *   ★登録簿が ★**現実より悲観的**になると、★「この赤は既知」で本当の赤を見逃します。
 *   ★直した人が ★**ここから消す**まで通りません。
 *
 * 【★使い方】
 *   `node tools/verify-known-red.mjs`（★`npm test` を流して照合します）
 */

/**
 * ★**いま赤い検査**。★空 ＝ ★赤が 1 つも無いこと。
 *
 * ⚠️ ★**空にしたくて検査を消す・skip するのは禁止**です。★skip は「赤が無い」ではなく
 *    ★「見ていない」で、★この登録簿より悪い状態です（★R-16）。
 */
export const KNOWN_RED = [
  {
    test: 'packages/render/test/edit-grammar-audit.test.ts > 編集文法の監査 🔴 ⑭ 撮影が、いまの画面より古くない',
    why: '★`out/2d-edit-grammar/race-captures.json` は 2026-08-24 の撮影で、★画面（packages/render/src・apps/web/src）は'
      + '★その後 台本 v6 → v7 → v8 → v9 と変わっている。★⑩「実ブラウザ経路から撮っている」は 26 日前の撮影を見て緑だった。'
      + '🔴 ★この検査は 2026-09-19 に**足した時点で赤**で、★「すでに悪い状態を見えるようにした」もの（★裁定 RD-4 ③）。'
      + '★撮り直しは `tools/capture-edit-grammar-race.mjs`。★開発側からは流さない — ★人の画面にブラウザの窓が開く。',
    owner: 'owner',
    until: '2026-09-26',
  },
  {
    test: 'packages/render/test/existing-shot-gate.test.ts > 既存ショット適性ゲート 🔴 ⑫ 測定が、いまの画面より古くない',
    why: '★`out/2d-existing-shot-gate/` は 2026-08-24 の測定で、★画面の最後の変更（`cfc3ad1`）は 2026-09-15。'
      + '🔴 ★26 日前の画面を見て 10 件が緑だった（★RD-4 ② の「もう片方」）。'
      + '⚠️ ★この検査の ② は `332 = contest` / `474 = solo` を**種の番号で固定**している — '
      + '★`edit-grammar-audit` で同じ固定が古くなっていた（RD-3）ので、★測り直すと**ここも落ちる見込み**。'
      + '★そのときは「両方の型が 1 つ以上ある」に直すこと。'
      + '★測り直しは `tools/audit-existing-shot-gate.mjs`。★開発側からは流さない（★ブラウザの窓）。',
    owner: 'owner',
    until: '2026-09-26',
  },
];

/**
 * ★**読み込めないと分かっている検査ファイル**（★**CI-8**・2026-09-19・レビュー側の指示）
 *
 * 【🔴 ★なぜ「検査名」の簿と分けるのか】
 *   ★ファイルがモジュールの段階で落ちると、★**検査の名前が 1 つも存在しません**。
 *   → ★上の `KNOWN_RED`（★名前で照合する簿）には ★**載せようがありません**。
 *   ✔ ★2026-09-19・**CI-4**: ★それを ★**「走らなかった」ではなく「緑」**と数えていました。
 *
 * 【🔴 ★載せてよい理由／いけない理由 — ★**CI-5** の線引き】
 *   ✅ ★**物の理由**: ★「この生成物はブラウザの撮影が要る」「CI にブラウザは無い」
 *      → ★**機械を変えても直りません。** ★物のほうの制約です。
 *   🔴 ★**機械の理由**: ★「CI では通らない」「手元では緑」
 *      → ★★**それは欠陥**であって、★載せると ★**欠陥が仕様になります**。
 *
 * 【⚠️ ★作り直せるものは載せないこと】
 *   ★`out/2d-edit-grammar/race-edl.json` は ★**12 秒で作り直せます**（★RD-4 ③ の `_provenance`）。
 *   ★**撮影が要るものと、作り直せるものを分けてください。**
 *   → ★作り直せるなら ★**作り直す**のが正しく、★簿に載せるのは誤りです。
 */
export const KNOWN_UNLOADABLE = [
  {
    file: 'packages/render/test/edit-grammar-audit.test.ts',
    why: '★`out/2d-edit-grammar/race-captures.json` ／ `reference-edl.json` ／ `comparison.json` は'
      + '★**ブラウザの撮影**が要る（`tools/capture-edit-grammar-race.mjs`）。'
      + '🔴 ★**物の理由**です — ★CI にブラウザは無く、★開発側の端末からも流せません'
      + '（★人の画面に窓が開きます）。★**機械を変えても直りません。**'
      + '⚠️ ★同じディレクトリの `race-edl.json` は **12 秒で作り直せる**ので、★これには含めません'
      + '（★`freshRaceEdl()` が `_provenance` を見て、★必要なら自分で作り直します・RD-4 ③）。'
      + '★撮り直しはオーナーの端末で（★期限は `KNOWN_RED` の 2 件と揃えています）。',
    owner: 'owner',
    until: '2026-09-26',
  },
  {
    file: 'packages/render/test/existing-shot-gate.test.ts',
    why: '★`out/2d-existing-shot-gate/` は ★**ブラウザの測定**が要る（`tools/audit-existing-shot-gate.mjs`）。'
      + '🔴 ★**物の理由**です（★上と同じ）。★CI にブラウザは無い。'
      + '⚠️ ★測り直すと ★**この検査の ② も落ちる見込み**です（★`332 = contest` / `474 = solo` を'
      + '★種の番号で固定しているため・RD-3）。★そのときは「両方の型が 1 つ以上ある」に直すこと。',
    owner: 'owner',
    until: '2026-09-26',
  },
];

/**
 * ★**この登録簿の外にある赤と、緑に戻った登録**を返す。
 *
 * @param {readonly string[]} failing ★いま落ちている検査の名前（★完全一致の並び）
 * @param {string} todayIso ★今日（★`until` の判定に使う。★`Date.now()` を中で呼ばない・憲法 4）
 * @param {readonly object[]} registry ★登録簿。★既定は実物。
 *   ⚠️ ★**差し替えられる形にしてあります** — ★そうしないと、★登録簿が空の間
 *      ★**4 つの落ち方のうち 3 つを試せません**（★「✅ が別の理由で出ていないか」）。
 */
export function diffAgainstRegistry(
  failing,
  todayIso,
  registry = KNOWN_RED,
  /**
   * ★**読み込めなかったファイル**（★**CI-8**）。★`[{ file, message }]`。
   * ★既定は空 — ★渡さなければ、★この照合はしません（★呼ぶ側が拾えたときだけ渡します）。
   */
  unloadable = [],
  unloadableRegistry = KNOWN_UNLOADABLE,
) {
  const known = new Map(registry.map((r) => [r.test, r]));
  const unregistered = failing.filter((t) => !known.has(t));
  const staleGreen = registry.filter((r) => !failing.includes(r.test)).map((r) => r.test);
  const expired = registry.filter((r) => r.until < todayIso).map((r) => `${r.test}（期限 ${r.until}）`);
  const missingFields = registry
    .filter((r) => !r.test || !r.why || !r.owner || !r.until)
    .map((r) => r.test ?? '(名前が無い登録)');

  /**
   * 🔴 ★**CI-8**: ★読み込めないファイルも、★**物の理由なら**簿で許します。
   * ⚠️ ★**機械の理由は許しません**（★CI-5）— ★下の `machineExcuses` が落とします。
   */
  const knownFiles = new Map(unloadableRegistry.map((r) => [r.file, r]));
  const unregisteredUnloadable = unloadable
    .filter((u) => !knownFiles.has(u.file))
    .map((u) => `${u.file} … ${u.message ?? ''}`);
  /**
   * 🔴 ⚠️ ★**「読み込めるようになったのに簿に残っている」は、★見ません。**
   *
   * 【★なぜ `KNOWN_RED` の `staleGreen` と同じにしないのか】
   *   ★`KNOWN_RED` で「緑に戻ったのに残っている」を落とすのは、★**どの機械でも同じ検査を流すから**です。
   *   🔴 ★ところが ★**「読み込めるか」は、★その機械に生成物が在るかで決まります**:
   *     ★手元 … `out/2d-edit-grammar/` が在る → ★**読み込める**
   *     ★CI   … 新しいクローン → ★**読み込めない**
   *   → ★★**ここで落とすと、★手元で赤・CI で緑**になります。
   *     ★★**いま消そうとしている機械差を、★向きを変えて作り直すだけ**です（★CI-5）。
   *
   * 【★では、★何が古い登録を落とすのか】★**期限です**（`until`）。
   *   ★撮り直したら ★**簿から消す**。★消し忘れても ★**2026-09-26 に門が落ちます**。
   *   ⚠️ ★これは `KNOWN_RED` より弱い守り方です。★弱いことを承知で採っています —
   *      ★**強くすると機械差になる**ためです。
   */
  const staleUnloadable = [];
  const unloadableExpired = unloadableRegistry
    .filter((r) => r.until < todayIso).map((r) => `${r.file}（期限 ${r.until}）`);
  const unloadableMissing = unloadableRegistry
    .filter((r) => !r.file || !r.why || !r.owner || !r.until)
    .map((r) => r.file ?? '(名前が無い登録)');
  /**
   * 🔴 ★**CI-5**: ★「機械が違うから」を理由にしていないか。
   *   ★**機械で結果が変わることが欠陥**で、★載せると ★**その欠陥が仕様になります**。
   */
  const machineExcuses = unloadableRegistry
    .filter((r) => /機械が違う|CI では通らない|手元では緑|CI だけ/.test(String(r.why)))
    .map((r) => `${r.file}（★機械の理由は載せられません・CI-5）`);

  return {
    unregistered, staleGreen, expired, missingFields,
    unregisteredUnloadable, staleUnloadable, unloadableExpired, unloadableMissing, machineExcuses,
  };
}
