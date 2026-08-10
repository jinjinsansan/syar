/**
 * ★ツールの分類登録簿（正典 R-24）
 *
 * 【なぜ登録簿にするのか】
 *   最初、書き込み文を機械的に grep して分類しようとしました。**2回外しました**:
 *     1回目 `grep -P` が使えず**全ツールが「読取専用」**と出た（0件は抽出器を疑う）
 *     2回目 `migrate.mjs` を読取専用と判定した — **DDL は .sql 側**にあり、
 *           ツール本体の文字列しか見ていなかった
 *   ★**「何をするツールか」は、ソースの見た目からは決まりません。** 明示します。
 *
 * 【分類】★基準は「**DB の状態を変えるか**」です。ファイル出力の有無ではありません。
 *   readonly       … **DB を変えない**。本番に向けてよい（ファイルを書くものは含みうる）
 *   stateChanging  … 状態を変える。**本番に向けてはならない**（起動時に拒否する）
 *   productionOps  … 本番に向けることが目的の運用ツール。**理由を必ず書く**
 *
 * 【なぜ本番に向けてはならないのか（R-24 の由来）】
 *   `verify-a7.mjs` は `app_environment` を 'development' に固定して終わっていました。
 *   ★ガードが**正しく働くぶん確実に本番ワーカーが起動しなくなり**、しかも
 *     **次の再起動まで顕在化しない**ので、流した本人がその場で気づけません。
 *   `verify-a2.mjs` は `delete from races where cycle_index is not null` で
 *   **本番のレースを全件削除**する実装でした。
 */

/** 読むだけ。本番に向けてよい */
export const READONLY = [
  'a3-converge.mjs',
  // ★DB に一切接続しない。受け渡しテキストから secrets.staging.env を作るだけ。
  //   ファイルは書くが DB の状態は変えないので、ガードの対象外。
  'import-staging-secrets.mjs',
  'a3-mscale.mjs',
  'a3-predict.mjs',
  'a3-seeds.mjs',
  'check-gate.mjs',
  'mc-sweep.mjs',
  'penalty-sweep.mjs',
  'preseed-distribution.mjs',
  'verify-ability.mjs',
  'verify-build.mjs',
  'verify-repo.mjs',
  'verify-views.mjs',
  'verify-world.mjs',
  'world-search.mjs',
];

/**
 * 状態を変える。★`assertNotProduction()` を必ず呼ぶこと。
 *   メタテストが、ここに載っているのに呼んでいないファイルを落とします。
 */
export const STATE_CHANGING = [
  'fix-purse.mjs',
  'seed-stables.mjs',
  'seed-world.mjs',
  'synthetic-bettor.mjs',
  'verify-a2.mjs',
  'verify-a4.mjs',
  'verify-a5.mjs',
  'verify-a6.mjs',
  'verify-a7.mjs',
  'verify-cancel.mjs',
  'verify-db.mjs',
  'verify-economy.mjs',
  'verify-exchange.mjs',
  'verify-flow.mjs',
  'verify-overdue.mjs',
  'verify-prize.mjs',
];

/** 本番に向けることが目的のもの。★理由を必ず書く（空欄で登録できない） */
export const PRODUCTION_OPS = [
  {
    file: 'migrate.mjs',
    why: '★スキーマ移行そのもの。本番に適用できなければ意味がない。★機械的な検出では「読取専用」に見える（DDL は .sql 側にあり、ツール本体に SQL 文字列が無い）ので、ここに明示しないと静かに誤分類される',
  },
];

/** 全分類を平らにする（メタテスト用） */
export function allClassified() {
  return [...READONLY, ...STATE_CHANGING, ...PRODUCTION_OPS.map((x) => x.file)];
}
