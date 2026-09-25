/**
 * ★**登録簿の一覧**（★どの簿に何を足すのか・★落ちたときに他の簿も名指しするため）
 *   ★裁定 `REVIEW_JOCKEY_FEE_20260925.md` §5 の追加要求（2026-09-25・レビュー側）
 *
 * 【🔴 ★なぜ要るか — ★3 回 別々に落ちて 1 つずつ気づいた】
 *   ★2026-09-25、★移行 `0081` と `0082` で SQL の関数を足したところ、
 *   ★**同じ日に 2 回**、★次の順で ★**1 つずつ**落ちました:
 *     ★① `rpc-guard`（★新しい関数を READONLY の簿に足していない）
 *     ★② `calibration-registry`（★新しい数値 export を登録簿に足していない）
 *     ★③ `pinned-migration-tests`（★移行を名指しする検査を分類簿に足していない）
 *   ★どれも落ちた文には ★**自分の簿のことしか書いてありません**でした。
 *   → ★直して流す → ★次が落ちる → ★また直す。★**同じ作業を 3 往復**しました。
 *
 * 【★どう解くか】
 *   ★落ちたときの文に ★**他に要る登録を名指しします。**
 *   ⚠️ ★一覧を各検査に写すと ★**片方だけ古くなります**（★D-052）。★ここ 1 か所に置きます。
 *
 * 【🔴 ★**除外は腐る**】（★2026-09-25・裁定 `REVIEW_OWNER_SCOPE_AND_STUD_FEE_20260925.md` §6 の指示で作法に）
 *
 *   ★簿に ★**除外（免除）**を書いたら、★それは ★**いつか要らなくなります。**
 *   🔴 ★要らなくなった除外は ★**消えません。★黙って効き続けます。**
 *   → ★次に同じ欠陥が入ったとき、★**除外が守ってしまい 緑になります。**
 *
 *   ✔ ★実例（★2026-09-25）: ★`owner-scoped-needs-session` の ★`SCREEN_EXEMPT` に
 *     ★`/stable`・`/training` を ★「旧世代・デザイナー待ち」として入れました。
 *     ★その日のうちに 2 枚とも直したので、★除外は ★**不要になりました**。
 *     ★もし残していたら、★もう一度 見本に落としても ★**緑のまま**でした。
 *
 *   → ★★**除外を持つ簿には「使われない除外を落とす検査」を対で置くこと。**
 *     ★見るのは 2 つです: ★① ★もう対象を読んでいない ★② ★自分で対処を持つようになった。
 *   ⚠️ ★これは ★`KNOWN_RED` の ★`until`（★期限）と同じ考えです
 *     （★あちらは ★**時間**で腐らせ、★こちらは ★**実物**で腐りを見ます）。
 *
 * 【⚠️ ★簿を 1 つにまとめる案は採っていません】
 *   ★レビュー側も同意しています。★理由は ★**見ているものが違う**からです:
 *     ★`rpc-guard` は ★DB の関数と権限、★`calibration` は ★TS の数、
 *     ★`pinned-migration` は ★検査の書き方、★`known-red` は ★いま赤いもの。
 *   ★1 つにすると「どれに当たったか」が分からなくなります。
 *   ★書く手間より、★忘れたときの静かさのほうが高くつきます。
 */

/** ★何を足したときに、どの簿を見るか */
export interface RegistryHint {
  /** ★簿の在りか */
  readonly where: string;
  /** ★何を足したときに要るか */
  readonly when: string;
}

export const REGISTRIES: readonly RegistryHint[] = [
  {
    where: 'apps/cli/test/rpc-guard.test.ts の READONLY_FUNCTIONS / WORKER_ONLY_FUNCTIONS',
    when: '★移行に SQL の関数を足したとき（★読むだけなら READONLY・★ワーカー専用なら WORKER_ONLY）',
  },
  {
    where: 'apps/cli/src/calibration.ts の CALIBRATION / EXEMPT',
    when: '★`packages/` に数値の `export const` を足したとき（★較正定数でなければ EXEMPT に理由つき）',
  },
  {
    where: 'apps/cli/test/pinned-migration-tests.test.ts の CLASSIFIED',
    when: "★検査が `'00NN_….sql'` と移行を名指ししたとき（★`pinned` か `history` か）",
  },
  {
    where: 'tools/lib/known-red.mjs の KNOWN_RED',
    when: '★いま赤い検査を足したとき（★why / owner / until が必須。★`node tools/verify-known-red.mjs` で照合）',
  },
  {
    where: 'apps/cli/src/canon-amounts.ts の CANON_AMOUNTS',
    when: '★正典が額を決めた項目に触れたとき（★渡す側／引く側の実装を名指しする）',
  },
];

/**
 * ★落ちたときの文の末尾に付ける ★**「他に要る登録」**の案内。
 *
 * @param self ★自分の簿の `where`（★自分は一覧から外します。★「自分を直せ」は既に言っているので）
 */
export function otherRegistriesHint(self: string): string {
  const others = REGISTRIES.filter((r) => r.where !== self);
  return (
    '\n\n  ⚠️ ★**同じ変更で、他の簿にも登録が要ることがあります**'
    + '（★2026-09-25: ★3 つが 1 つずつ落ちて 3 往復しました）:\n'
    + others.map((r) => `    ・${r.where}\n        … ${r.when}`).join('\n')
  );
}
