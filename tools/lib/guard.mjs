/**
 * ★状態を変えるツールを本番から締め出すガード（正典 R-24）
 *
 * 【何が起きたか】
 *   `verify-a7.mjs` は `app_environment` を 'development' に固定して終わっていました。
 *   ★A-7 のガードが**正しく働くぶん、確実に本番ワーカーが起動しなくなり**、
 *     しかも**次の再起動まで顕在化しない**ので、流した本人がその場で気づけません。
 *   `verify-a2.mjs` は `delete from races where cycle_index is not null` で
 *   **本番のレースを全件削除**する実装でした。どちらも「検証ツール」の顔をしています。
 *
 * 【設計】
 *   **ワーカーと同じ宣言（`app_environment`）を見ます。** 別の判定材料を作ると、
 *   ワーカーが production と思っている DB をツールが staging と思う余地が生まれます。
 *
 * 【★宣言が無い DB も拒否します】
 *   「宣言が無い＝本番ではない」とは限りません。**判断できないなら実行しない**が正しい。
 *   ここを通してしまうと、`app_environment` を消した直後の DB に書けてしまいます
 *   （まさに `verify-a7` が作る状態です）。
 */

/**
 * 接続先が本番なら例外を投げる。
 *
 * @param {import('pg').Client} client 接続済みのクライアント
 * @param {string} tool ツール名（メッセージに出す）
 */
/**
 * 🔴 ★**`allowProduction` について**（★2026-09-20・運用簿 ④・レビュー側の裁定）。
 *
 *   ★本番の世界を作り直す段が在り、★そこでは ★**本番に書くことが目的**です。
 *   ★門は ★**消しません。★明示の宣言が要る形にするだけ**です
 *   （★`migrate.mjs` に同じ扉が在り、★2026-09-20 にそれで移行 33 件を当てました）。
 *
 * ⚠️ ★**緩むのは 1 か所だけです。** ★次の 2 つは ★`allowProduction` でも ★**止まります**:
 *   ★① ★`app_environment` を ★**読めない**（★本番かどうか判断できない）
 *   ★② ★宣言が ★**無い**（★「宣言が無い＝本番でない」ではない）
 *   → ★★**分からないときは、★許可の旗が在っても止まる**（★fail-closed）。
 *
 * ⚠️ ★呼ぶ側は ★**旗 1 つで渡さないこと。** ★`seed-world.mjs` は
 *   ★`productionOptInProblem()`（★旗 2 つ ＋ ★いまの頭数）を先に通してから渡します。
 */
export async function assertNotProduction(client, tool, { allowProduction = false } = {}) {
  let environment = null;
  try {
    const r = await client.query('select environment from app_environment');
    environment = r.rows[0]?.environment ?? null;
  } catch (e) {
    // ★読めないのは「本番ではない」の証拠になりません。判断できないので止めます
    throw new Error(
      `${tool}: app_environment を読めませんでした（${e.message}）。` +
        `本番かどうか判断できないので実行しません（R-24）`,
    );
  }
  if (environment === null) {
    throw new Error(
      `${tool}: 接続先の DB に app_environment の宣言がありません。` +
        `★「宣言が無い＝本番でない」とは限らないので実行しません（R-24）`,
    );
  }
  if (environment === 'production' && !allowProduction) {
    throw new Error(
      `${tool} は状態を変えるツールです。★接続先の DB は "production" 宣言なので実行しません（R-24）。` +
        `staging の DATABASE_URL に向けてください`,
    );
  }
  return environment;
}
