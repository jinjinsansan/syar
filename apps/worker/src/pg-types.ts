/**
 * ★`pg` の型変換を**1箇所で**設定する（正典 §14）
 *
 * 【なぜ箇所ごとに直さないのか】
 *   `pg` は **bigint (int8) を文字列で返します**。JavaScript の `number` では
 *   2^53 を超える整数を表せないので、`pg` は安全側に倒しています。
 *
 *   ところが TypeScript 側では `number` と書けてしまい、**型は通るのに中身は文字列**です。
 *   これを2回踏みました:
 *     1回目 `horse-repo` … 能力値が文字列で返り、演算すると NaN になりかけた
 *     2回目 `pendingSettlements` … `number[]` と型付けした配列の中身が文字列で、
 *                                  数値比較した瞬間に静かに外れた
 *
 *   ★**「型が通る」は「値が正しい」ではありません。**
 *     TypeScript の型は**境界の外側（DB・ネットワーク・環境変数）では何も保証しません。**
 *
 *   2回目なので、箇所ごとに直すのをやめます。**入口で1度だけ変換します。**
 *
 * 【★安全範囲を超えたら黙って進まない】
 *   `Number()` は 2^53 を超えると**静かに精度を落とします**。
 *   台帳の金額でそれが起きると、**客の残高が黙ってずれます**。
 *   `Number.isSafeInteger` で弾き、超えたら例外にします（R-3）。
 *
 * 【★金額列について（判断の記録）】
 *   `entry_points` / `prize_points` / `ep_ledger.delta` / `balance_after` /
 *   `bets.payout` / `races.purse` は**すべて bigint** なので、この変換が効きます。
 *   それでも `number` 化して安全と判断しました:
 *     - ポイントは**整数**で、`number` は 2^53−1 まで**誤差なく**表せます
 *     - §9.4 の1日上限は 500,000 EP で、桁が 10^15 に達する経路がありません
 *     - 万一到達したら**例外で止まります**（静かに丸まるのではなく）
 *   ★`BigInt` や文字列のままにする案も検討しましたが、
 *     すべての算術に変換を挟むことになり、**書き忘れが静かに壊れる面が増えます**。
 *
 * 【★これで塞げないもの — 集計は numeric で返ります】
 *   実測（本番 DB）:
 *     `select sum(delta) from ep_ledger`      → **OID 1700 (numeric)**・文字列
 *     `select sum(delta)::bigint from ...`    → OID 20・この変換が効く
 *     `select count(*) from races`            → OID 20・この変換が効く
 *
 *   ★numeric は小数を持てるので、**一律に number 化してはいけません**。
 *     集計は呼ぶ側が `::bigint` か `::text` に落として明示的に変換します
 *     （`daily-flow.ts` は既に `::text` + `Number()` でそうしています）。
 */

import pg from 'pg';

/** int8 (bigint) の型 OID */
export const INT8_OID = 20;

/** numeric の型 OID。★ここは変換しない（小数を持てるため） */
export const NUMERIC_OID = 1700;

function parseInt8(value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    // ★丸めて返さない。台帳の金額が静かにずれるより、止まったほうがよい
    throw new Error(`bigint が number の安全範囲を超えました: ${value}`);
  }
  return n;
}

// ★モジュールの読み込みで有効になります。
//   `pg` の型パーサはプロセス全体で1つなので、一度設定すれば全ての接続に効きます。
pg.types.setTypeParser(INT8_OID, parseInt8);

/**
 * 設定されていることを確かめる。
 *
 * ★副作用の import は「書き忘れると静かに効かない」形なので、
 *   **効いていることを実行時に確認できる手段**を用意します
 *   （`cancelRace` が呼ばれていなかったのと同じ穴を、ここで作らないため）。
 */
export function assertPgTypesConfigured(): void {
  const parsed = pg.types.getTypeParser(INT8_OID)('12345');
  if (typeof parsed !== 'number') {
    throw new Error('pg の int8 型パーサが設定されていません');
  }
}

/** テスト用に公開する（安全範囲の検査を振る舞いで確かめるため） */
export { parseInt8 };
