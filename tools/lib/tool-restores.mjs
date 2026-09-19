/**
 * ★**殺された道具が残した状態を、★次の実行が元に戻す**（★**SB-6**・2026-09-19）
 *
 * 【🔴 ★なぜ在るか】
 *   ★`snapshot-file.mjs` は ★**控えをプロセスの外に置く**ところまでです。
 *   ★置いただけでは戻りません。★**戻す手続き**が要ります。
 *   ★ここは「★この道具の控えは、★こう戻す」を ★**1 か所**に集めた表です。
 *
 * 【⚠️ ★なぜ道具ごとのファイルに分けないか】
 *   ★道具の本体は ★**先頭で DB に繋ぐ実行スクリプト**なので、★検査から `import` できません。
 *   → ★**戻す手続きだけを、★繋がない部品**として外に出します。★そうすると
 *     ★偽の client を渡して ★**検査から実際に走らせられます**。
 *
 * 【🔴 ★この表が守る約束】
 *   ★`restore` は ★**冪等**であること（★2 回 走っても同じ）。
 *   ★殺され方によっては ★**一部だけ適用済み**で残るので、★「もう戻っている」を
 *   ★異常として扱ってはいけません。
 *
 * 【⚠️ ★見ていないもの】
 *   🔴 ★**実 DB で確かめていません。** ★検査が渡すのは偽の client です。
 *     ★確かめるには staging の馬を 1 頭 動かす必要があり、★それ自体が
 *     ★`STABLE-1-SKEW` を測っている母集団を動かします（★2026-09-19 に 1 度やって、
 *     ★自分が測っていた分布を自分で動かしました）。
 *   → ★**「SQL の文面が正しいか」は、★ここでは分かりません。**
 *     ★分かるのは ★**控えが読めて・★戻す手が呼ばれ・★冪等である**ところまでです。
 */

/**
 * ★`verify-g6.mjs` の控え。
 *
 * 【★何を失うか】
 *   ★この道具は ★**NPC 馬を 1 頭 プレイヤー所有に付け替えます**:
 *     `update horses set owner_id = $uid, npc_stable_id = null where id = $horseId`
 *   ★`horses_owner_xor_npc` があるので、★`owner_id` を入れた時点で
 *   ★**`npc_stable_id` は行から消えます**。★元の厩舎番号は ★**メモリの中だけ**でした。
 *
 * 【🔴 ★殺されるとどうなるか（★2026-09-19 に 9 頭で起きたこと）】
 *   ★馬は「プレイヤー所有」のまま残り、★元の厩舎は ★**どこにも無い**。
 *   ⚠️ ★さらに、★この道具の準備は `update horses set owner_id = null where owner_id = $uid`
 *     ★から始まります。★`npc_stable_id` を戻さずに `owner_id` を外すと ★**両方 null** になり、
 *     ★`horses_owner_xor_npc` に当たります。
 *     → ★**次の実行が、★準備の 1 行目で落ちるはず**です。
 *     🔴 ★**「はず」です** — ★制約の文面からの読みで、★実 DB では確かめていません。
 */
export const RESTORE_G6 = {
  /** ★`tmp/snapshots/<name>.json` の名前 */
  snapshot: 'verify-g6',
  tool: 'verify-g6.mjs',
  /**
   * @param {{ query: (sql: string, params: readonly unknown[]) => Promise<{ rowCount: number | null }> }} client
   * @param {{ horseId: string, npcStableId: number | string, uid: string }} data ★`takeSnapshot` に渡したもの
   * @returns {Promise<{ rows: number }>} ★戻した行数（★**TL-1** の `restores` で数える）
   */
  async restore(client, data) {
    /**
     * ⚠️ ★**`owner_id` を外すのと `npc_stable_id` を戻すのは、★同じ 1 文で**。
     *   ★2 文に分けると、★間で死んだときに ★**両方 null** の行ができます。
     *
     * ⚠️ ★`where id = $1` だけで、★`owner_id = $3` は**条件に入れません** —
     *   ★一部だけ適用済みで戻っている場合にも当てたいからです（★冪等）。
     */
    const r = await client.query(
      `update horses
          set owner_id = null, npc_stable_id = $2
        where id = $1
          and (owner_id is not null or npc_stable_id is distinct from $2)`,
      [data.horseId, data.npcStableId],
    );
    return { rows: r.rowCount ?? 0 };
  },
};

/**
 * ★`verify-prize.mjs` の控え。
 *
 * 【🔴 ★これが `STABLE-1-SKEW` の正体でした（★2026-09-19・実測）】
 *   ★この道具は ★**出走表の「最終枠を除く全頭」**（★1 回 17 頭 前後）をプレイヤー所有にし、
 *   ★後片付けで ★**`npc_stable_id = 1` と決め打ち**して返していました（★`535db6e` 以来）。
 *   → ★**1 回 流すたびに、★17 頭が いろいろな厩舎から 厩舎 1 へ 一方向に移ります。**
 *
 *   ✔ ★staging の跡（★読むだけの `diag-stable1-skew.mjs` で実測）:
 *     ★**6 本のレースで「厩舎 1 の頭数 ＝ 出走頭数 − 1」ちょうど**
 *     （17/18・12/13・10/11・9/10・9/10・7/8。★すべて `settled`）。
 *     ★**他の 39 厩舎では 0 本**。★偶然では出ません。
 *     ★厩舎 1 の余り 92 頭 のうち ★**66 頭（72%）**がこの 6 本で説明できます。
 *
 * 【🔴 ★`verify-g6` より悪い形でした】
 *   ★`verify-g6` は ★**元の値をメモリに持っていました**（★殺されると失う）。
 *   ★こちらは ★**元の値を読んでさえいません** — ★**いつ流しても失われます。**
 *   → ★だから ★「殺されなければ大丈夫」ではなく、★**毎回 壊していました。**
 */
export const RESTORE_PRIZE = {
  snapshot: 'verify-prize',
  tool: 'verify-prize.mjs',
  /**
   * @param {{ query: (sql: string, params: readonly unknown[]) => Promise<{ rowCount: number | null }> }} client
   * @param {{ horses: readonly (readonly [string, number | string])[], uid: string }} data
   *   ★`horses` は `[馬 id, 元の npc_stable_id]` の組。★**厩舎は馬ごとに違います**
   * @returns {Promise<{ rows: number }>}
   */
  async restore(client, data) {
    /**
     * ⚠️ ★**1 頭ずつではなく 1 文で**当てます（★`unnest` の組）。
     *   ★1 頭ずつだと、★途中で死んだときに ★**一部だけ戻った状態**が残ります。
     * ⚠️ ★`owner_id` を外すのと `npc_stable_id` を戻すのは同じ 1 文（★`RESTORE_G6` と同じ理由）。
     */
    if (data.horses.length === 0) return { rows: 0 };
    const r = await client.query(
      `update horses h
          set owner_id = null, npc_stable_id = t.stable
         from unnest($1::uuid[], $2::int[]) as t(id, stable)
        where h.id = t.id
          and (h.owner_id is not null or h.npc_stable_id is distinct from t.stable)`,
      [data.horses.map((x) => x[0]), data.horses.map((x) => Number(x[1]))],
    );
    return { rows: r.rowCount ?? 0 };
  },
};

/**
 * ★`verify-a7.mjs` の控え。
 *
 * 【🔴 ★これがいちばん危ない】
 *   ★この道具は ** `app_environment` を丸ごと消します**（★A-7 の門が働くことを確かめるため）。
 *   ★元の宣言は ** メモリの `original` だけ**でした。
 *
 * 🔴 ★**殺されるとどうなるか** — ★馬が 1 頭 消えるのとは訳が違います:
 *   ★`assertEnvironmentMatches` は宣言が無ければ ** 投げます**（`apps/worker/src/env.ts:78`・既定値で救いません）。
 *   → ★★**ワーカーも、★状態を変える道具 全部も、★起動できなくなります**（fail-closed・R-27）。
 *   ⚠️ ★シグナルは捕まえていますが、★**SIGKILL・電源断・OOM では走りません**。
 *   → ★そのとき ** 戻す値を知っているのは、★死んだプロセスだけ**でした。
 *
 * ⚠️ ★`environment` が `null`（★元から無かった）なら、★**消したままが正しい**です。
 */
export const RESTORE_A7 = {
  snapshot: 'verify-a7',
  tool: 'verify-a7.mjs',
  /**
   * @param {{ query: (sql: string, params: readonly unknown[]) => Promise<{ rowCount: number | null }> }} client
   * @param {{ environment: string | null }} data
   * @returns {Promise<{ rows: number }>}
   */
  async restore(client, data) {
    if (data.environment === null) {
      // ★元から無かった。★消してあるのが元の姿です。
      const r = await client.query('delete from app_environment where true', []);
      return { rows: r.rowCount ?? 0 };
    }
    /**
     * ⚠️ ★**1 文で**戻します（★`singleton` は一意なので upsert が使えます）。
     *   ★`delete` → `insert` の 2 文にすると、★**間で死んだときに空になります**。
     *   ★そこがこの道具では致命的です。
     */
    const r = await client.query(
      `insert into app_environment (singleton, environment) values (true, $1)
         on conflict (singleton) do update set environment = excluded.environment`,
      [data.environment],
    );
    return { rows: r.rowCount ?? 0 };
  },
};

/** ★道具の名前 → ★戻し方。★**1 本ずつ**足します（★まとめて書かない） */
export const TOOL_RESTORES = Object.freeze({
  'verify-g6.mjs': RESTORE_G6,
  'verify-prize.mjs': RESTORE_PRIZE,
  'verify-a7.mjs': RESTORE_A7,
});
