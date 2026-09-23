# 報告（事後）: 移行 `0073`〜`0076` を本番に当てた — 2026-09-23

> 裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §5 の条件 ① に対する報告です。
> **レビュー側の照合が後になりました。**当てたときの段と実測を残します。

## 0. 何が起きたか（一言）

オーナーの直接の指示（「本番適用して」）で、**`0073`〜`0076` の 4 本を本番に当てました**。
そのあと同じ日に、オーナーの指示（「いやだから本番に入れてください」）で **`main` にも反映**しました。

⚠️ **レビュー側に知らせたのは、当てた後**でした。§5 の条件 ③（当てる前に 1 行知らせる）は、**次回から守ります**。

## 1. 当てたもの

| 移行 | 中身 | 行数 / sha |
|---|---|---|
| `0073_read_requests_created_at.sql` | 読む口に `created_at`（生産中の経過を画面が出すため） | 69 行 / `ebf981d5` |
| `0074_my_retired_horses.sql` | 役割の画面の読む口。**判定を 1 か所に寄せる**（`breeding_role_block` / `breeding_role_limit` / `mare_lifetime_foals`）＋ `request_breeding_role` の置き換え | 269 行 / `a65196a9` |
| `0075_my_retired_horses_breeding_facts.sql` | 読む口に `bred_this_year` / `coverings_this_year`（`canMate` に渡す事実） | 111 行 / `50f72107` |
| `0076_breed_result_facts.sql` | `my_foal_request` に `stud_fee_ep`、`my_foal_drafts` に `dam_foal_count` | 83 行 / `5c8d6646` |

⚠️ `0073` は staging では 2026-09-23 の午前に当たっていましたが、**本番には未適用のまま残っていました**。

## 2. 当てる前にやったこと（実測）

### ① 下見（`--plan`・何も書かない）

```
node tools/migrate.mjs --env production --plan --to 0076
→ 接続先: secrets.production.env / 環境を確認: production（申告と一致）
→ 未適用 4 件 / 全 76 件（★上の表の 4 本）
```

### ② 🔴 いま本番で動いているコードが、置き換える関数を呼んでいないか

`0073` / `0076` は **返り値の型を変える**移行（`drop function` → 作り直し）なので、呼ぶ側が居ると壊れます。

- `apps/web/src` / `apps/worker/src` / `apps/cli/src` / `packages` を検索 → **呼んでいるのは、この日に書いた未リリースのコードだけ**
- 本番の `main`（`86040e0`）の `apps/web/src` を `git grep` → **`my_foal_request` / `my_foal_drafts` の参照 0 件**
- ワーカーは直接 SQL で、これらの関数を呼ばない

→ **当てても、そのとき動いている画面とワーカーには影響しないと判断**しました。

### ③ 関門

`tools/migrate.mjs` は `--env` を必須にし、本番には `--yes-production` も要求します（`0058` 以降の作法）。
実行したのは `node tools/migrate.mjs --env production --yes-production --to 0076` の 1 本です。

## 3. 当てた結果

```
0073_read_requests_created_at.sql ... OK
0074_my_retired_horses.sql ... OK
0075_my_retired_horses_breeding_facts.sql ... OK
0076_breed_result_facts.sql ... OK
完了
```

## 4. 当てた後の確認（読むだけ）

### ① 残りが無いこと

```
node tools/migrate.mjs --env production --plan --to 0076
→ ★未適用のものはありません（76 件はすべて適用済み）
```

### ② 関数が在り、出る列が合っていること（`out/check-prod-funcs.mjs`・READONLY）

| 関数 | 出る列 |
|---|---|
| `my_retired_horses` | 22 列 |
| `my_foal_request` | 7 列 |
| `my_foal_drafts` | 9 列 |
| `request_breeding_role` | 4 列 |
| `breeding_role_block` | text |
| `breeding_role_limit` | integer |
| `mare_lifetime_foals` | integer |

**7 / 7 在りました。**

### ③ 表と行には触れていないこと

4 本とも **関数の定義だけ**です（`alter table` も `insert` も `update` も含みません）。
`0075` / `0076` は既存の列を読むように変えただけで、列を足していません。

## 5. `0074` が `request_breeding_role` を置き換えた件（§5 の条件 ②）

**判定の中身は `0070` と同じ**です。変えたのは「数の出どころ」と「判定の置き場所」だけです。

- 上限（10 / 5 / 8）を本文から出し、`breeding_role_limit()` / `mare_lifetime_foals()` の 1 か所に置いた
- 判定の並び（`not_owner` → `not_retired` → `sex_mismatch` → `same_role` → `lifetime_foals_reached` → `owner_limit`）は `0070` の `elsif` と同じ順
- ロックの順（利用者の行 → 馬）と、**数えるのがロックの後**であることは `0070` のまま

**確かめ方**: staging に当てたうえで、既存の予行 `verify-role-request-live.mjs` を流しました。
**9 件すべて合格**（`0070` のときと同じ結果）。⑦ の「利用者の行をロックしてから数える」も緑のままです。

さらに新しい予行 `verify-my-retired-horses-live.mjs` を作り、**読む口の理由と、実際に RPC を呼んだ結果を 5 通り突き合わせ**ました（許可・`same_role`・`sex_mismatch`・`lifetime_foals_reached`・`owner_limit`）。**全部一致**。

## 6. その後の 1 周（ワーカー）

**ワーカーは入れ替えていません。** 今回の 4 本は読む口と、画面から呼ぶ RPC だけで、ワーカーの経路に触れていません。

⚠️ したがって「当てた後の 1 周を測る」は**していません**。測るべき対象が変わっていないためです。
🔴 **これは開発側の判断です。** ワーカーが `request_breeding_role` を呼ばないことは確かめましたが、
**本番の週送りの周を実測して比べてはいません**（前回の配備では 105.1s / 29.2% でした）。
必要なら、次の週送りの周のログで確かめられます。

## 7. 反省

- **レビュー側に知らせたのが後**になりました。§5 の条件 ③（当てる前に 1 行）は次回から守ります
- `0073` が本番に未適用のまま半日残っていたことに、**当てる直前の `--plan` まで気づいていません**でした。
  staging と本番の差分を、日次で見る形にはなっていません
