/**
 * ★**片付いたことを数える**（★**TL-1**・2026-09-19）
 *
 * 【🔴 ★なぜ在るか】
 *   ★`delete` を呼んだは ★**「消えた」ではありません。**
 *   ★外部キー・権限・`where` の書き間違いで、★**0 行しか消えないことがあります。**
 *   ★2026-09-19 の時点で、★状態を変える道具 47 本のうち ★**16 本**が
 *   ★「片付けを呼ぶだけで、★片付いたかを見ていない」（`pending`）状態でした。
 *
 * 【⚠️ ★なぜ道具ごとに書かないか】
 *   ★同じ形を 16 回 書くと、★**16 通りの微妙に違う形**になります。
 *   ★そして ★**そのうち何本かは、★数えたのに合否に入れ忘れます**（★今日 実際に見た形）。
 *   → ★数え方と ★**「0 でなければ落ちる」を 1 か所**に置きます。
 *
 * 【⚠️ ★これが見ないもの】
 *   ★渡された問い合わせが ★**正しい場所を見ているか**は分かりません。
 *   ★`where` が間違っていれば、★**いつでも 0 件で通ります**（★`R-21` の族）。
 *   → ★**呼ぶ側が、★自分が作ったものと同じ条件で書くこと。**
 */

/**
 * ★片付けの残りを数える。
 *
 * @param {{ query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: { n: unknown }[] }> }} client
 * @param {readonly { label: string, sql: string, params?: readonly unknown[] }[]} checks
 *   ★`sql` は ★**`count(*)::int as n` を 1 行だけ返す**こと。
 * @returns {Promise<{ ok: boolean, total: number, detail: string, left: readonly string[] }>}
 *   ★`detail` は全部の件数（★0 も出す）、★`left` は ★**0 でなかったものだけ**。
 */
export async function countLeftovers(client, checks) {
  const all = [];
  const left = [];
  let total = 0;
  for (const { label, sql, params = [] } of checks) {
    const row = (await client.query(sql, params)).rows[0];
    const n = Number(row?.n ?? 0);
    /**
     * ⚠️ ★`rows[0]` が無い／`n` が数でないのは ★**問い合わせの書き間違い**です。
     *   ★そこを 0 に落とすと、★**間違った問い合わせが「片付いた」に見えます**（★`R-21`）。
     */
    if (!Number.isFinite(n)) {
      throw new Error(`countLeftovers: 「${label}」が数を返しませんでした（★count(*)::int as n を返すこと）`);
    }
    total += n;
    all.push(`${label} ${n}`);
    if (n > 0) left.push(`${label} ${n}`);
  }
  return { ok: left.length === 0, total, detail: all.join(' / '), left };
}

/**
 * ★数えて、★出して、★0 でなければ ★**終了コードを 1 にする**。
 *
 * ⚠️ ★`process.exit()` は**呼びません** — ★呼ぶ側にまだ片付けが残っていることがあります。
 *   ★`process.exitCode` を立てるだけにして、★**そのまま最後まで走らせます**。
 *
 * @param {Parameters<typeof countLeftovers>[0]} client
 * @param {Parameters<typeof countLeftovers>[1]} checks
 * @param {string} [tool] ★道具の名前（★出力に出すだけ）
 * @returns {Promise<boolean>} ★片付いていれば true
 */
export async function reportLeftovers(client, checks, tool = '') {
  const r = await countLeftovers(client, checks);
  if (r.ok) {
    console.log(`  ✅ ★片付きました（${r.detail}）`);
  } else {
    console.log(`  🔴 ★片付いていません${tool ? `（${tool}）` : ''}: ${r.left.join(' / ')}`);
    console.log(`     ★全部: ${r.detail}`);
    process.exitCode = 1;
  }
  return r.ok;
}
