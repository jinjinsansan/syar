# 指示書 — 監査の修正 第 2 便（週送りの失敗の扱い ／ 関数の実行権限 ／ 売らない目 ／ V-10 の判定）

**案件**: STAR（ポイ活型オンライン競馬育成）
**発行**: 2026-09-14 ／ レビュー側 → 開発側
**根拠**: 裁定 `REVIEW_AUDIT_FIX_VERDICT_20260914.md` §4（照会 Q1〜Q5 への回答）／ 正典 **D-094・D-095・D-096**（2026-09-14 起票）

> ⚠️ **着手は、第 1 便の V-10（変更後の 1 本）が終わり、報告 §3-3 の追記と終了 HEAD の修正をコミットしてから**にしてください。
> 計測中に製品コードを変えると、計測がどちらのコードで走ったか分からなくなります。
> **起点 HEAD は、その報告修正のコミット**です（報告に明記すること）。

---

## 0. 範囲

### 0-1. 触ってよいもの

| 工程 | ファイル |
|---|---|
| BF-1 | `apps/worker/src/training-runner.ts`・`apps/worker/test/` |
| BF-2・BF-3 | `db/migrations/0022_*.sql`（新規）・`apps/cli/test/rpc-guard.test.ts`・`tools/lib/exposure-registry.mjs`・`tools/verify-anon-exposure.mjs`・`apps/cli/test/exposure-registry.test.ts` |
| BF-4 | `.gitattributes`（新規） |
| BF-5・BF-6 | `packages/betting/src/balance.ts`・`packages/betting/test/`・`apps/worker/src/odds.ts`・`apps/worker/test/odds.test.ts`・`apps/cli/src/verify-payout.ts`（判定部分を切り出す場合は `apps/cli/src/` に新規 1 本とそのテスト）・`apps/cli/src/calibration.ts`（新しい数値定数を登録する場合だけ） |

### 0-2. 触らないもの
- P4 のファイル（`packages/render/`・`apps/web/`・描画系の道具）と、別セッションの未追跡ファイル
- **本番 DB への書き込み・移行ファイルの適用**。本便も staging までです
- 正典 `STAR_SPEC_v2.0.md`（レビュー側の変更が未コミットで作業ツリーにあります。**コミットに混ぜないでください**）
- `migrate.mjs` のチェックサムの取り方
- push

### 0-3. 同じ作業ツリーの作法
第 1 便と同じです。`git stash`・`git add -A`・`git commit -a` を使わず、ファイルを名指しでコミットし、開始・終了 HEAD と `git diff --numstat` を報告に書いてください。

---

## 1. BF-1 週送りで失敗した馬だけを飛ばす（照会 Q1）

### 1-1. いまの問題
失敗した馬が出るとバッチで打ち切ります。馬を選ぶ SQL は `last_processed_week < $1 order by id limit 2000`（`training-runner.ts:193-196`）なので、**失敗し続ける馬は毎回同じバッチに選ばれ、そのたびに打ち切りになります**。1 周（10 分）で 2,000 頭しか進まず、頭数が多いと週の進みに追いつけません。

### 1-2. 作るもの
- この実行の中で失敗した馬の ID を集め、**以後のバッチを選ぶ SQL から除く**（例: `and id <> all($3::uuid[])`。列の型に合わせる）
- **打ち切らない。** 他の馬は、既存の上限（`MAX_WEEKS_PER_RUN × batchesPerWeek`）まで進める
- 警報は失敗した馬ごとに出す（既存のまま）。周の終わりに件数の要約を 1 行出す
- `incomplete` は「上限に当たった」**または**「失敗で進めなかった馬がいる」のとき true にし、その定義を註記する
- EP 不足（`ST001`）は、これまでどおり休養に落とす

### 1-3. 検査
| # | 内容 |
|---|---|
| 1 | 偽の DB で、**`BATCH_SIZE` を超える頭数**と、**ID が最小で常に失敗する馬 1 頭**（`ST001` 以外の例外）を用意する。1 回の実行で、**失敗した馬以外の全頭が目標の週まで進む**こと |
| 2 | 失敗した馬の ID が、2 回目以降のバッチを選ぶ SQL のパラメータに含まれていること |
| 3 | `spendErrors = 1`・`incomplete = true`・警報に SQLSTATE が含まれること |
| 4 | `ST001` の馬は休養に落ち、`epShort` に数えられ、除外の対象にならないこと |
| 5 | **変異**: 除外の条件を外すと 1 が落ちることを実演し、報告に書く |

---

## 2. BF-2 `place_bet`・`exchange_prize` から anon の実行権限を剥がす（照会 Q2）

### 2-1. 作るもの
- `0022` で `revoke all on function public.place_bet(uuid, text, jsonb, integer, uuid) from anon;` と、`exchange_prize(bigint, uuid)` について同じ文
- **authenticated の grant には触らない**
- V-20 の登録簿 `EXPECTED_FUNCTION_EXECUTE` の 2 つを `anon: false` に直す

### 2-2. 検査
- `rpc-guard.test.ts` に、**利用者が呼ぶ RPC の条件**を足す。最後の定義より後に ①`public`・`anon` からの revoke がある ②`authenticated` への grant がある ③その後に anon への grant が無い。**開きすぎも塞ぎすぎも落ちる**こと（R-2）を、合成の SQL で固定する
- **staging での実演**（R-26）
  - ①anon キーで `/rpc/place_bet` を呼ぶ → 適用前は `P0001 未認証`、適用後は **`42501`**
  - ②セットアップ済みの利用者（authenticated）で呼ぶ → **関数の中まで入る**（例: `発売時間外` などの業務エラーで返る）。塞ぎすぎていないことの確認
  - ③V-20 が全件合格
- **変異**: `0022` から anon の revoke を消すと `rpc-guard` が落ちる

---

## 3. BF-3 これから作る関数も、最初から利用者のロールに実行させない（照会 Q3）

### 3-1. 作るもの
- `0022` に `alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;`
- ⚠️ 移行ファイルを適用するロールが `postgres` であることを、報告 AF-3 §4-5 の `pg_default_acl` の実測に基づいて書くこと。**`pg_default_acl` に `postgres` 以外のロールの関数の行があれば、変更せず照会**

### 3-2. 検査
- **V-20 に ⑤ を足す**: `pg_default_acl`（`defaclnamespace = public`・`defaclobjtype = 'f'`）を全行読み、anon・authenticated・PUBLIC に EXECUTE が付く行が無いこと
- **staging での実演**（トランザクションの中で関数を作って測り、rollback する）
  - ①新しく作った関数で、anon・authenticated の EXECUTE がどちらも **false**
  - ②`place_bet`・`exchange_prize` の authenticated の EXECUTE は **true のまま**（既存の grant が壊れていない）
  - ③片付けたあと、残った関数が 0 件
- **註記として残す**: 以後、利用者の RPC を足す移行ファイルでは `grant execute … to authenticated` を明示する必要がある（BF-2 の `rpc-guard` の条件が、書き忘れを落とす）

---

## 4. BF-4 移行ファイルの改行を LF に固定する（照会 Q5）

- `.gitattributes` に `db/migrations/*.sql text eol=lf` の 1 行だけを置く。**他のパスへ広げない**（正典などの扱いは別の判断です）
- 検査:
  - ①`git ls-files --eol db/migrations` で全件が `attr/text eol=lf`・`w/lf`
  - ②`git add --renormalize db/migrations` のあと、**中身の差が 0 行**（索引は元から LF なので）
  - ③`migrate.mjs --env staging` を適用なしで実行し、全件が「記録済み」でチェックサムの食い違いが 0 件

---

## 5. BF-5 1.0 倍を下回る目を売らない ＋ V-10 を本番と同じ「売る目」で測る（D-096・D-035）

### 5-1. ⚠️ レビュー側の発見: V-10 は本番が売らない目まで数えている
- 本番: `odds.ts:106` は `probability < minSellableProbability(betType)` の目を**売らない**（D-035）
- V-10: `verify-payout.ts:194-196` は「MC で 1 回以上出た目」を**すべて賭け金に入れ**、`minSellableProbability` を一度も参照しない

→ **測定器と製品が、別々に「売る目」を決めています**（R-30）。影響の大きさは測っていません（△）。試行数 10,000 の V-10 では、上限の低い券種（単勝・複勝・ワイド・馬連）で差が出うる計算です。

### 5-2. 作るもの
- **「この目を売るか」を決める述語を `packages/betting` に 1 つだけ置く。** 条件は 2 つ
  - ①D-035 の下限: `p̂ ≥ minSellableProbability(kind)`
  - ②D-096: 切り捨て前のオッズが 1.0 倍以上。**判定は `floorOddsToTenths(min(ODDS_CAP, raw)) ≥ 10` で行い、D-094 と同じ許容幅を使う**（1.0 ちょうどの値が浮動小数で下に表されても売る側に倒れる。境界の扱いを 2 か所で別々に書かない）
- `odds.ts` と `verify-payout.ts` の**両方が、この述語だけを通る**ようにする
- `verify-payout.ts` は、当たったのに払われない目を 2 つに分けて数える
  - MC で一度も出なかった目（既存の `unseenHits`）
  - 述語で売らなかった目（新設。D-035 の下限によるものと、D-096 によるものを分ける）
- **1 回の実行で効果を分けられるよう**、売らなかった目についても「売っていたら」の賭け金と払戻額を D-035 分・D-096 分に分けて出す（V-10 は 1 本 6 時間を超えるので、前後の 2 本を走らせない）

### 5-3. 検査
| # | 内容 |
|---|---|
| 1 | 述語の境界（両側）: 切り捨て前が 1.0 のわずかに下 → 売らない ／ 1.0 ちょうど（浮動小数で下に表されたものを含む）→ 売る ／ D-035 の下限のすぐ下 → 売らない・ちょうど → 売る |
| 2 | `buildOddsRows` の出力に、オッズ 1.0 未満の行が 0 行 |
| 3 | **経路**: `verify-payout.ts` の賭け金が、同じ `counts` から `buildOddsRows` が作る行数と一致する（測定器と製品が同じ集合を見ていること自体を検査で固定・R-30） |
| 4 | staging でレースを 1 本生成し、`race_odds` に 1.0 未満の行が 0 行。売らなかった行数を券種別に報告 |
| 5 | staging で、売らなかった目に `place_bet` を呼ぶと「発売していない買い目」で拒否される（検証用の口座で・rollback） |
| 6 | **変異**: `verify-payout.ts` が述語を通らない形に戻すと 3 が落ちる |

---

## 6. BF-6 V-10 の合否を、切り捨て前の払戻率で出す（D-094）

### 6-1. 作るもの
- 合否の式を `|(payout + floorLoss) / stake − (1 − margin)| ≤ 0.01` にする
- 出力には、**切り捨て前の払戻率（判定値）・切り捨て後の払戻率・その差**を並べ、どれが判定値かを行の中に明記する
- 判定の部分は、テストできる関数に切り出してよい

### 6-2. 検査
- 判定関数の両側: 切り捨て前が帯の内で切り捨て後が帯の外 → **合格** ／ 切り捨て前が帯の外 → **不合格**
- **変異**: 判定を切り捨て後の値に戻すと落ちる

### 6-3. V-10 の実行について
- BF-5 と BF-6 を入れたあとに **1 本だけ**走らせ、報告に券種別の表を出す（列: 切り捨て前・切り捨て後・差・D-035 で売らなかった分・D-096 で売らなかった分・合否）
- ⚠️ **この 1 本は正式な V-10 ゲートではありません。** 正典 §13.2 は「出走表間 SD を出したうえでプール SE ≤ 0.25pt」を求めています（D-036）。**SE を計算して報告し、届いていなければ「届いていない」と書いてください**（判定不能を合格と書かない・R-3）

---

## 7. 本番について（本便では何もしない）

本番へ当てる順番だけ、先に固定しておきます: **`0021` → `0022` → 新しいワーカーを配備**。それぞれの前後で V-20 が全件合格することを確かめます。実施はオーナーの指示で、裁定のあとに行います。

---

## 8. 報告 `REPORT_AUDIT_FIX2_<日付>.md`

- 第 1 便と同じ形（§0-2 提出物・変更範囲、§8 期待値つきの再実行表、再現した事実と未検証の主張を分ける R-13）を続ける
- `npx vitest run` の `Test Files`・`Tests` の行と終了コード。**提出物を足したあとにもう一度回す**。既存の赤（`edit-grammar-audit` ⑨）が 1 件から増えていないこと
- BF ごとの変異の実演（1-3-5・2-2・5-3-6・6-2）と、復元の確認
- staging の実演はすべて、適用前と適用後の両方を書く
- 本番に向けたコマンドを実行した場合は、全文と出力を切らずに（本便では原則実行しない）

---

## 9. 本便でやらないこと
- 本番への `0021`・`0022` の適用、ワーカーの配備
- 監査の H-5（権利）・H-6（本番の開発画面）・M-1〜M-10
- 売らない目の画面での見せ方（Web の馬券画面は、利用者の書き込み経路がまだ無いため）
- 正典の編集
