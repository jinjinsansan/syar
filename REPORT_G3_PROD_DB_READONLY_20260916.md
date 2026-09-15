# 報告 — G-3: 本番 DB の読み取り確認（`0021`・`0022` を当てる前）

**案件**: STAR（ポイ活型オンライン競馬育成）
**発行**: 2026-09-16 ／ 開発側 → レビュー側・オーナー
**対象**: 回答 `REVIEW_ENGINE_LANE_SPEED_ES5_ANSWER_20260916.md` §4（推奨する進め方 1）・裁定 `REVIEW_ENGINE_LANE_SPEED_ES6_VERDICT_20260916.md` §4 G-3
**HEAD**: `fc9bdc6`（コードの変更なし）

> 凡例（R-13）: **✔** ＝ 開発側がこの便で実行・実測した ／ **△** ＝ 未確認・推定

## 0. オーナーのご判断（2026-09-16）

裁定 §4 の表に対して、オーナーから「いいです」とお返事をいただきました。開発側は次のように受け取っています。

| # | 受け取り方 |
|---|---|
| G-1 | F-1 承認 |
| G-2 | 速さは試行 1 回の比 1.3 倍以下で判定（→ ES 便は合格） |
| G-3 | 本番 DB の読み取り確認を許可 → **本書で実施**。**`0021`・`0022` の本番への適用は、本書をお見せしてから改めてご指示をいただきます**（本番への書き込みのため） |
| G-4 | 推奨の無い項目だったので、**push はしていません**（明示のご指示待ち） |

## 1. 読み方 ✔

スクリプト `out/gen/es/g3-db-readonly.mjs`（git の対象外）を使いました。
- `set session characteristics as transaction read only` をかけ、`transaction_read_only = on` と `app_environment` が `--env` と一致することを確かめてから読みます。**書き込み文はありません**
- **staging と本番に 1 回ずつ**流しました。接続文字列は表示していません
- 関数の本体は `md5(pg_proc.prosrc)` で取り、移行ファイルの `$function$` の間の本文の md5 と照合しました
- V-20 は `npx tsx tools/verify-anon-exposure.mjs --env production` です（`select` だけ）

## 2. 結果 ✔

| 項目 | 本番 | staging |
|---|---|---|
| `app_environment` ／ 接続ロール | `production` ／ `postgres` | `staging` ／ `postgres` |
| 適用済みの移行 | **`0020` まで**（`0019`・`0020` は 2026-08-20）。**未適用: `0021`・`0022`・`0023`** | `0023` まで（すべて） |
| チェックサムの食い違い | なし | なし |
| `spend_training_ep` の本体 | **`0020` の本文と md5 一致**（`3dd34bfc…`）。セットアップ判定あり・`ST001` なし | `0021` の本文と一致（`1e0c2ded…`） |
| `place_bet`・`exchange_prize` の本体 | `0020` の本文と一致 | `0020` の本文と一致（両環境で同じ md5） |
| `spend_training_ep` の実行権 | **anon=true**・authenticated=false・`postgres`=true | anon=false・authenticated=false・`postgres`=true |
| `place_bet`・`exchange_prize` の実行権 | **anon=true**・authenticated=true | anon=false・authenticated=true |
| 利用者 ／ 調教の EP 記帳 | **0 人 ／ 0 件** | 0 人 ／ 0 件 |
| **V-20** | **🔴 不合格 1 件（11 件中）**: ④ 関数の EXECUTE（anon）が `exchange_prize`・`place_bet`・`spend_training_ep` の 3 件で期待と違う。①〜③（テーブルの書き込み権限・anon からの読み取り・登録簿）は合格 | （今回は流していません） |

## 3. 読み

1. **`0021` の冒頭の註記「照合前に適用しないこと」の条件は満たされました**。本番で稼働中の `spend_training_ep` は `0020` の本文と md5 で一致し、`0021` はその本文から 2 か所だけ変えたものです
   - 註記の文言そのものは直していません。直すと、staging に記録されたチェックサムと食い違うためです
2. **監査 H-4 の穴（anon が `spend_training_ep` を実行できる）は本番に残っています**。V-20 ④ の 3 件は、`0021`（`spend_training_ep`）と `0022`（`place_bet`・`exchange_prize`）が剥がす対象と一致します
3. **いま実害は出ていない見込みです**。利用者 0 人・調教の EP 記帳 0 件で、EP を持つ行がありません △（D-095 の記載とも一致）
4. **古いワーカーへの影響**（ES-4 §2 の続き）
   - 本番の `spend_training_ep` にはセットアップ判定があるので、古いワーカーが呼べば「未認証」で失敗して休養に落ちるはずです（監査 H-3）
   - ただ、記帳 0 件・利用者 0 人なので、持ち主のいる馬が無く、呼び出し自体が起きていない見込みです △
   - `0021` の後も `postgres` の実行権は残ります（staging で確認済み）

## 4. 当てるときの手順（案・オーナーのご指示の後）

| # | 作業 | 備考 |
|---|---|---|
| 1 | `npx tsx tools/migrate.mjs --env production --yes-production 0021` | **番号を必ず付けること**。付けないと未適用の `0023` まで当たります（`0023` は新しいワーカーの配備と一緒に・裁定 §3 の 5）。`0020` まで適用済みなので、順序の抜けの検査は通る見込みです |
| 2 | `npx tsx tools/migrate.mjs --env production --yes-production 0022` | |
| 3 | `npx tsx tools/verify-anon-exposure.mjs --env production` | **期待: V-20 合格**（④ の 3 件が消える） |
| 4 | 本書の読み取りスクリプトをもう一度流す | 期待: 適用済みが `0022` まで・`spend_training_ep` の本体が `0021` と一致・anon=false |

- `migrate.mjs` は 1 ファイルを 1 トランザクションで当てるので、途中で落ちれば戻ります。当てる前に `app_environment` との照合も行います
- 誰が流すか（開発側がこのセッションで流すか、オーナーのターミナルで流すか）もご指示ください

## 5. オーナーに決めていただくこと

| # | 判断 |
|---|---|
| G-3' | §4 の手順で `0021` → `0022` を本番に当ててよいか。当てるのは開発側か、オーナーのターミナルか |
| G-4 | push するか |
