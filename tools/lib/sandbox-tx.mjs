/**
 * ★**自分で取引を張る関数を、外側の取引の中に閉じ込める**（★2026-09-19）
 *
 * 【🔴 ★何が起きたか — ★私は staging を汚しました】
 *   ★`tools/verify-ds7-cancel.mjs` は こう書いていました:
 *
 *   ```js
 *   await c.query('begin');
 *   try { await cancelRace(c, CY); … } finally { await c.query('rollback'); }
 *   ```
 *
 *   ★ところが ★**`cancelRace` は自分で `begin` して `commit` します**（★製品としては正しい）。
 *   ★PostgreSQL に**入れ子の取引はありません**:
 *     ★内側の `begin`  … ★**警告を出して無視**（"there is already a transaction in progress"）
 *     🔴 ★内側の `commit` … ★★**外側の取引ごと確定します**
 *   → ★その後の処理は ★**取引の外**で走り、★最後の `rollback` は ★**戻すものがありません**。
 *
 *   ✔ ★実害（2026-09-19・staging）: ★レース 2 件・★`public.users` 1 人・★`auth.users` 1 行・
 *     ★所有者の付いた馬 2 頭・★`ep_ledger` 2 行（1,000 EP）が**残りました**。
 *   🔴 ★とくに ★**`horses.owner_id` が付いたこと**が厄介です — ★`RACEABLE_WHERE` も `ACTIVE_WHERE` も
 *     ★`owner_id is null` で絞るので、★**私が測っていた母集団そのものを、私が動かしていました。**
 *
 * 【★直し方】
 *   ★呼ぶ側が ★**`begin` / `commit` / `rollback` を横取りする包み**を渡します。
 *   ★内側がいくら `commit` と言っても ★**何も起きません**。★確定するかどうかは ★**外側だけ**が決めます。
 *
 * ⚠️ ★**これは検査の道具です。** ★製品のコードに使わないこと —
 *    ★製品で取引を無効化すると、★途中で落ちたときに半端な状態が残ります。
 */

/**
 * ★取引の文を横取りするクライアントの包みを返す。
 *
 * @param {import('pg').Client} client 接続済みのクライアント
 * @returns {{ client: import('pg').Client, swallowed: string[] }}
 *   `client` … 渡す先。`swallowed` … 横取りした文（★**0 件なら包む意味が無かった**と分かる）
 */
export function sandboxTx(client) {
  /** ★横取りした文。★**0 件なら「そもそも取引を張っていない」** — ★呼ぶ側が確かめられる */
  const swallowed = [];
  const wrapped = {
    /**
     * @param {string} sql
     * @param {readonly unknown[]} [params]
     */
    query: async (sql, params) => {
      const head = String(sql).trim().toLowerCase();
      if (head === 'begin' || head === 'commit' || head === 'rollback') {
        swallowed.push(head);
        // ★何も起きません。★外側の取引はそのまま
        return { rows: [], rowCount: 0 };
      }
      return params === undefined ? client.query(sql) : client.query(sql, params);
    },
  };
  return { client: /** @type {import('pg').Client} */ (/** @type {unknown} */ (wrapped)), swallowed };
}
