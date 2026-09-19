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

/** ★道具の名前 → ★戻し方。★**1 本ずつ**足します（★まとめて書かない） */
export const TOOL_RESTORES = Object.freeze({
  'verify-g6.mjs': RESTORE_G6,
});
