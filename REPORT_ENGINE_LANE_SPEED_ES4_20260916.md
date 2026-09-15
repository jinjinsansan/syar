# 報告 — ES-4（区間を作る回数の上限）と、`0021`・`0022` の古いワーカーとの互換（F-2 の材料）

**案件**: STAR（ポイ活型オンライン競馬育成）
**発行**: 2026-09-16 ／ 開発側 → レビュー側・オーナー
**対象**: 回答 `REVIEW_ENGINE_LANE_SPEED_ES3_ANSWER_20260916.md` §6（ES-4）・§5-2（互換の確認・読み取りのみ）
**ブランチ**: `p4/race-30sec-cuts` ／ **開始 HEAD** `9a2873c` ／ ES-4 は本報告と同じコミット

> 凡例（R-13）: **✔** ＝ 開発側がこの便で実行・実測した ／ **△** ＝ 未確認・推定
> ⚠️ **ES-5（案 (f)）には着手していません**（F-1 の承認待ち・回答 §4 冒頭）。
> ⚠️ 本番には**接続していません**。互換の確認はコード（`70d9982`）と **staging の読み取り専用**だけです。

---

## 0. 結論

1. **ES-4 を入れました。** `resolveRace` 1 回で `lanePlanOf`（区間と `swingScale`）が**頭数によらず 1 回**・馬ごとに区間を作り直す `laneExtraM` が **0 回**であることを固定。ES-2 を戻す変異で落ちます ✔
2. **`0021`・`0022` を先に本番へ当てても、古いワーカー（`70d9982`）は止まらない見込みです**（△ 本番の DB は見ていない）。理由は §2-3

---

## 1. ES-4 ✔

### 1-1. 検査 `packages/race-engine/test/lane-plan-count.test.ts`

- **数え方**: 製品のコードに状態を足さず、検査の中だけ `vi.mock('../src/lane.js')` で `lanePlanOf`・`laneExtraM` を包み（元の関数をそのまま呼ぶ）、`race.ts` が import した関数の呼び出し回数を数えます
- **範囲**: 8・12・18 頭 × 1200・3000m × 既定の楕円・大河原相当（1 周 2400・直線 540・幅 23）＝ 12 通り で `lanePlanOf` 1 回・`laneExtraM` 0 回 ／ 対照: 直線は両方 0 回
- **結果が変わらないこと**: 包みは元の関数を呼ぶだけ。指紋の検査（`lane-fingerprint.test.ts`）は包みを使わずに同じ全体の実行で合格

### 1-2. 変異

| 変異 | 結果 |
|---|---|
| ES-2 を戻す（`race.ts` で馬ごとに `laneExtraM(entrant.gate, fieldSize, distance, seed, course)` を呼ぶ） | ✔ **落ちる**: 「8頭 1200m 2000 の laneExtraM（馬ごとに区間を作り直す経路）: expected 8 to be +0」 |

戻して `git diff -- packages/race-engine/src` が空であることを確かめました。

### 1-3. 上限の値

- **1 レース 1 回**（ES-2 の形）。頭数・距離・走路の形によらない
- ES-5 の後も同じ上限が成り立つことを、ES-5 の検査に含めます（回答 §6）

---

## 2. `0021`・`0022` と古いワーカーの互換（回答 §5-2・F-2 の材料）

### 2-1. 移行ファイルがすること ✔（`db/migrations/`）

| ファイル | 中身 |
|---|---|
| `0021_spend_training_ep_worker_only.sql` | `spend_training_ep(uuid, bigint, integer)` の本体を差し替え（① `assert_setup_complete()` を外す ③ EP 不足に `ST001`）＋ ② `revoke all … from public, anon, authenticated`。1 トランザクション |
| `0022_user_rpc_revoke_anon.sql` | `place_bet`・`exchange_prize` から `public, anon` を剥がし、`authenticated` への付与を書き直す |

⚠️ `0021` の冒頭には「下書き・未適用。稼働中の定義との md5 照合の前に適用しないこと」の註記が残っています（2026-09-14 時点）。staging には適用済み（§2-2）。本番へ当てる前に、この註記の照合が済んでいるかを確かめてください（△ 開発側は確かめていません）。

### 2-2. 古いワーカー `70d9982` が呼ぶ DB 関数 ✔（`git grep` と `git show`）

| 呼び出し | 場所 | 失敗したとき |
|---|---|---|
| `select spend_training_ep($1, $2, $3)` | `apps/worker/src/training-runner.ts:198`（持ち主のいる馬の週進行） | `try/catch` で捕まえ、**その馬を休養に落として続行**（ワーカーは止まらない）。`advanceTrainingWeeks` の中に `begin`・`savepoint` は無い（1 回の失敗が他の更新を巻き込まない） |
| `pg_try_advisory_lock`・`pg_advisory_unlock` | `pg-store.ts:61・66` | 組み込み関数（移行と無関係） |
| `place_bet`・`exchange_prize` | **呼ばない**（利用者が Web から呼ぶ） | — |

- 接続は `DATABASE_URL` だけ（`main.ts:44`・`schemacheck.ts:42`）。`set role` 無し

### 2-3. 権限（staging・読み取り専用・1 回）✔

`transaction_read_only = on` と `app_environment = 'staging'` を確かめてから読みました（スクリプト `out/gen/es/compat-readonly.mjs`・git の対象外）。

| 項目 | staging |
|---|---|
| 接続ロール | `current_user = session_user = postgres`（superuser ではない・bypassrls）。所属: `anon`・`authenticated`・`service_role`・`authenticator` ほか |
| 適用済み（0018 以降） | `0018`〜`0023` すべて |
| `spend_training_ep` | 持ち主 `postgres` ／ `SECURITY DEFINER` ／ 本体にセットアップ判定 **無し**・`ST001` **有り**（＝ `0021` の本体） |
| ACL | `postgres=X/postgres ; service_role=X/postgres`（public・anon・authenticated には無い） |
| 接続ロールの実行権 | `has_function_privilege(current_user, …, 'execute') = true` |

- 手元の設定ファイルのユーザー名は **本番も staging も `postgres.<プロジェクト>`**（Supabase のプーラ・ポート 5432）✔（パスワードは表示していない）

### 2-4. 読み

- **`0021`**: 剥がすのは `public・anon・authenticated` だけで、**持ち主の `postgres` の実行権は残る**（staging で `0021` 適用後も `true`）。古いワーカーは `postgres` で繋ぐので、**`spend_training_ep` を呼び続けられる**見込み
- さらに、**いまの本番に `0020`（本体にセットアップ判定）が当たっていれば、古いワーカーの呼び出しは既に毎回「未認証」で失敗して休養に落ちている**はずで（監査 H-3）、`0021` はそれを**直す側**です。△ 本番で `0020` が当たっているかは見ていません
- **`0022`**: 古いワーカーは `place_bet`・`exchange_prize` を呼ばない → ワーカーには影響なし。Web の利用者は `authenticated` への付与が残る
- △ **本番の DB は見ていません**（接続ロール・適用済みの移行・関数の ACL）。本番で同じか確かめるなら、ES-0 と同じ読み取り専用の 1 回（§2-3 のスクリプトの `staging` を `production` に替える）が要ります → オーナーの許可で

---

## 3. 触ったもの

| ファイル | 中身 |
|---|---|
| `packages/race-engine/test/lane-plan-count.test.ts` | ES-4（新規） |
| 触っていない | `lane.ts`・`race.ts`（変異のあと戻した）・指紋の期待値・較正定数・`stepM`・試行回数・移行ファイル・本番 DB・ワーカーの配備 |

## 4. 検査 ✔

- `npm run typecheck` … 通過
- `npx vitest run --maxWorkers=2 --minWorkers=1` … `Test Files 1 failed | 173 passed (174)` ／ `Tests 1 failed | 1774 passed (1775)`・終了コード 1。落ちたのは変更前からの `edit-grammar-audit` ⑨（独走代表 expected 'contest' to be 'solo'）で、1 件から増えていない

## 5. オーナーに決めていただくこと（回答 §9 のまま）

| # | 判断 |
|---|---|
| F-1 | ES-5（案 (f)）で「1 ビットも変えない」を「丸めの差だけ（≤ 1×10⁻⁹ m・着順は完全一致）」に緩めてよいか |
| F-2 | `0021`・`0022` を新しいワーカーより先に本番へ当てるか（本書 §2。本番の DB での読み取り確認を先にするか） |
| F-3 | push |
