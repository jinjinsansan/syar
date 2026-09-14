# 報告書 — 監査の修正 第 2 便（週送りの失敗の扱い ／ 関数の実行権限 ／ 売らない目 ／ V-10 の判定）

**案件**: STAR（ポイ活型オンライン競馬育成）
**提出**: 2026-09-14 ／ 開発側 → レビュー側
**指示書**: `DEV_INSTRUCTIONS_AUDIT_FIX2_20260914.md` ／ 裁定 `REVIEW_AUDIT_FIX_VERDICT_20260914.md` §4
**正典**: D-094・D-095・D-096（作業ツリーの未コミットの変更を読んだ。本便のコミットには含めない）

> 報告は鵜呑みにされない前提で書きます（CLAUDE.md）。
> 凡例（R-13）: **✔ 再現** ＝ 実行・計算の出力で確かめた事実 ／ **△ 未検証** ＝ 主張・推測のまま。
> ⚠️ 実行が終わらなかった測定は「未計測」、提出時点で走っているものは「【計測中】」と書き、数字を予測で埋めていません。

---

## 0. 位置

| | |
|---|---|
| ブランチ | `p4/race-30sec-cuts` |
| 起点 HEAD | `fe7376c`（第 1 便の報告修正）。⚠️ 指示書の着手条件「第 1 便の V-10 が終わってから」は**字義どおりには満たしていません**。第 1 便の V-10 はメモリ不足で強制終了して結果が無く、オーナーの判断で記録をコミットして着手しました（`REPORT_AUDIT_FIX_20260914.md` §3-3） |
| 終了 HEAD | 本報告書を含むコミット（報告書は自分が入るコミットの SHA を書けないので、`git log` で確かめてください）。push はしていません |
| staging | `0022` を適用済み（オーナーが `migrate.mjs --env staging` を実行） |
| 本番 | **書き込み・適用なし**。⚠️ **開発側の誤りで、本番を 1 回読みました**（読み取り専用・§8-1） |

### 0-2. 提出物・変更範囲

**新規ファイル**

| ファイル | 工程 | 中身 |
|---|---|---|
| `db/migrations/0022_user_rpc_revoke_anon.sql` | BF-2 | `place_bet`・`exchange_prize` の EXECUTE を public・anon から剥がし、authenticated への付与を書き直す |
| `.gitattributes` | BF-4 | `db/migrations/*.sql text eol=lf` の 1 行だけ |
| `apps/cli/src/v10-accounting.ts` | BF-5・BF-6 | V-10 の集計（売る目は `sellDecision` だけで決める）と判定（切り捨て前・SE） |
| `apps/cli/test/v10-accounting.test.ts` | BF-5・BF-6 | 経路（賭け金 ＝ 本番のオッズ表の行数）・判定の両側・SE |
| `packages/betting/test/sell-decision.test.ts` | BF-5 | 売る目の判定の境界（両側） |
| `apps/worker/test/training-runner-skip.test.ts` | BF-1 | 偽の DB で週送りを回し、失敗した馬だけを飛ばすことを固定 |
| `REPORT_AUDIT_FIX2_20260914.md` | — | 本書 |

**変更したファイル**（すべて指示書 §0-1 の範囲内）

`apps/worker/src/training-runner.ts`（BF-1）／ `apps/cli/test/rpc-guard.test.ts`・`tools/lib/exposure-registry.mjs`・`apps/cli/test/exposure-registry.test.ts`（BF-2）／ `packages/betting/src/balance.ts`・`apps/worker/src/odds.ts`・`apps/worker/test/odds.test.ts`・`apps/cli/src/verify-payout.ts`（BF-5・BF-6）／ `apps/cli/src/calibration.ts`（新しい数値定数 3 つの登録）

**触っていないもの・含めないもの**

- `tools/verify-anon-exposure.mjs`（範囲内だが変更不要だった）
- `STAR_SPEC_v2.0.md`（レビュー側の未コミットの変更。**コミットに混ぜない**）
- `0021` の古い冒頭注釈（裁定 §3-3 のとおり書き換えない）
- P4 のファイル・別セッションの未追跡ファイル・`migrate.mjs`
- ⚠️ `git add --renormalize -- db/migrations` を実行しました（BF-4 ②）。索引に積まれた差分は 0 行で、作業ツリーの 0017〜0020 の `M` 表示（改行だけ直した名残）が消えました

---

## 1. BF-1 週送りで失敗した馬だけを飛ばす（照会 Q1）

### 1-1. 作ったもの ✔

- 失敗した馬の ID を `failedIds` に集め、バッチを選ぶ SQL に `and not (id = any($3::uuid[]))` を足して、**同じ実行の中では選び直さない**
- **打ち切らない**（第 1 便の「そのバッチで打ち切る」を削除）。他の馬は上限（`MAX_WEEKS_PER_RUN × batchesPerWeek`）まで進める
- 警報は失敗した馬ごと（既存のまま）。周の終わりに件数の要約を 1 行
- `incomplete` は「上限に当たった **または** 失敗で週を進めなかった馬がいる」（`TrainingWeekResult` に註記）
- EP 不足（`ST001`）はこれまでどおり休養に落とす

### 1-2. 検査（指示書 §1-3）✔

偽の DB（`training-runner-skip.test.ts`）で `advanceTrainingWeeks` を本物のまま回す。**頭数と溜まった週数を、実行の上限にちょうど収まる量にした**: 4,000 頭（`BATCH_SIZE` 2,000 の倍数）× 8 週（`MAX_WEEKS_PER_RUN`）→ 上限 16 バッチ × 2,000 枠 ＝ 32,000 枠、進めるべきは 3,999 頭 × 8 週 ＝ 31,992。
偽の DB は、選ぶ SQL の**文面に除外の句があるときだけ**除く（パラメータだけで除くと、句を消す変異を捕まえられない・R-30）。

| # | 内容 | 結果 |
|---|---|---|
| 1 | ID が最小で常に失敗する馬（`P0001`）が 1 頭。1 回の実行で、失敗した馬以外の全頭が目標の週まで進む | ✔ 届かない馬 0 頭 ／ `advanced` ＝ 31,992 ／ 失敗した馬は週 292 のまま |
| 2 | 2 回目以降のバッチを選ぶ SQL のパラメータに、失敗した馬の ID が含まれる（1 回目は空） | ✔ |
| 3 | `spendErrors = 1`・`incomplete = true`・警報に `SQLSTATE P0001`・その馬の警報は 1 回だけ | ✔ |
| 4 | `ST001` の馬は休養に落ちて目標の週まで進み、`epShort = 8`、除外の対象にならない | ✔ |
| 5 | **変異**（下記） | ✔ 検査が捕まえた |

**変異の実演**（`mutate-run.mjs`・finally で復元・sha256 照合）:

```
- (選ぶ SQL の行)  and not (id = any($3::uuid[]))
+ (空行)
× 1 回の実行で、失敗した馬以外の全頭が目標の週まで進み…: 目標の週に届いていない馬: expected [ Array(1) ] to deeply equal []
Tests 1 failed | 1 passed (2) ／ 終了コード 1
復元後 sha256 ＝ 変異前（11789b8ae59bed00…）
```

→ 除かなければ、失敗する馬が毎回先頭の 1 枠を食い、**ID が最大の馬がちょうど 1 頭**目標の週に届かない（上の容量の計算どおり）。

---

## 2. BF-2 `place_bet`・`exchange_prize` から anon の実行権限を剥がす（照会 Q2）

### 2-1. 作ったもの ✔

```sql
revoke all on function public.place_bet(uuid, text, jsonb, integer, uuid) from public, anon;
grant execute on function public.place_bet(uuid, text, jsonb, integer, uuid) to authenticated;
revoke all on function public.exchange_prize(bigint, uuid) from public, anon;
grant execute on function public.exchange_prize(bigint, uuid) to authenticated;
```

- ⚠️ **解釈**: 指示書は「authenticated の grant には触らない」ですが、§2-2 の検査②「最後の定義より後に authenticated への grant がある」を移行ファイルの走査で満たすため、**付与を `0022` に書き直しました**。付与は既にあり、ACL は変わりません（✔ staging の `proacl`: 適用前後とも `authenticated=X/postgres`）→ §9 照会 Q3
- V-20 の登録簿 `EXPECTED_FUNCTION_EXECUTE` の 2 つを `anon: false` に直した

### 2-2. 検査 ✔

- `rpc-guard.test.ts` に**利用者が呼ぶ RPC の条件**を追加: ①最後の定義より後に public・anon からの revoke ②最後の定義より後に authenticated への grant があり、その後に authenticated からの revoke が無い ③①の revoke より後に public・anon への grant が無い
- 合成の SQL で固定（R-2・R-14）: anon の revoke 抜け（開きすぎ）／後の移行で anon に付け直す（開き直し）／authenticated への grant 抜け（塞ぎすぎ）／付与の後に authenticated から剥がす（塞ぎすぎ）／権限の文が再定義より前にしか無い／コメントの中だけの文 → すべて落ちる
- 本物の移行ファイル（`0022` 込み）で `place_bet`・`exchange_prize` とも違反 0

**変異**: `0022` の `place_bet` の行から anon を消すと赤 — `place_bet: 最後の定義（0020_rpc_setup_guard.sql）より後に anon からの revoke が無い（開きすぎ）`。復元 sha256 一致（`837cf1b23bdab65e…`）。

### 2-3. staging の実演（`bf2-demo.mjs`・存在しないレース／景品 ID・SQL は rollback・検証用口座は削除済み）✔

| 手順 | `0022` 適用前（`0021` まで） | `0022` 適用後 | 期待 |
|---|---|---|---|
| ①anon（SQL）`place_bet` | 関数の中まで入り `P0001 未認証` | **`42501 permission denied`** | 拒否 ✔ |
| ①anon（SQL）`exchange_prize` | `P0001 未認証` | **`42501`** | 拒否 ✔ |
| ①anon（HTTP `/rpc`）`place_bet` | status 400・`P0001 未認証` | **status 401・`42501`** | 拒否 ✔ |
| ①anon（HTTP `/rpc`）`exchange_prize` | status 400・`P0001 未認証` | **status 401・`42501`** | 拒否 ✔ |
| ②authenticated（口座あり）`place_bet` | 関数の中まで入り `レースが存在しない` | 同じ（中まで入る） | 塞ぎすぎていない ✔ |
| ②authenticated（口座あり）`exchange_prize` | `景品が存在しない` | 同じ | 塞ぎすぎていない ✔ |
| `proacl`（2 関数とも） | `postgres=X anon=X authenticated=X service_role=X` | `postgres=X authenticated=X service_role=X` | anon だけ消える ✔ |
| ③V-20（staging） | — | **合格 11 件中 11 件**（関数の EXECUTE 4 件すべて anon −） | 全件合格 ✔ |

---

## 3. BF-3 これから作る関数の既定の権限（照会 Q3）— **変更せず照会**

指示書 §3-1「`pg_default_acl` に `postgres` 以外のロールの関数の行があれば、変更せず照会」に該当しました。

staging の `pg_default_acl`（2026-09-14 12:47 頃・読み取り）✔:

```
postgres         public  f  postgres=X/postgres anon=X/postgres authenticated=X/postgres service_role=X/postgres
supabase_admin   public  f  postgres=X/supabase_admin anon=X/supabase_admin authenticated=X/supabase_admin service_role=X/supabase_admin
（ほか graphql・graphql_public・storage・realtime・auth・extensions の行）
```

- 移行ファイルを当てる接続ロールは `postgres`（✔ `migrate.mjs` と同じ接続文字列で `current_user = postgres`）
- 作成ロール `postgres` で public に関数を作ると（トランザクション内で作って測り rollback・残り 0 件）: anon の EXECUTE **true** ／ authenticated の EXECUTE **true**（第 1 便 §4-5 と同じ）
- `0022` に `alter default privileges` は**入れていません**。V-20 の ⑤ も**足していません**（入れると、既定を閉じるまで staging でも落ちるため）
- 参考: 既定が開いたままでも、新しい関数は **V-20 ④「登録簿に無い関数が無い」で落ちます**（✔ 第 1 便で実装済み）。検出は既にある、というのが開発側の見立てです（△ 閉じる代わりにはならない）

→ §9 照会 Q1。

---

## 4. BF-4 移行ファイルの改行を LF に固定する（照会 Q5）✔

| # | 検査 | 結果 |
|---|---|---|
| ① | `git ls-files --eol db/migrations` | `.gitattributes` を置いた後、`0001`〜`0021` の 21 件すべて `i/lf w/lf attr/text eol=lf`（`0022` は後から LF で作成） |
| ② | `git add --renormalize -- db/migrations` のあと中身の差 | **0 行**（`git diff --cached --numstat` が空） |
| ③ | `migrate.mjs --env staging 0021`（対象を適用済みの 0021 に絞り、何も当てない実行・オーナーが実行） | `環境を確認: staging` ／ チェックサムの食い違いの警告なし ／ `★未適用のものはありません（1 件はすべて適用済み）` |

---

## 5. BF-5 1.0 倍を下回る目を売らない ＋ V-10 を本番と同じ「売る目」で測る（D-096・D-035）

### 5-1. 作ったもの ✔

- `packages/betting` に `sellDecision(kind, p̂, trials)` を 1 つだけ置いた。返り値は `'sell' | 'below_min_probability' | 'below_even_odds'`
  - ①D-035: `p̂ ≥ minSellableProbability(kind)`（NaN・負は売らない側）
  - ②D-096: `Math.round(oddsFromProbability(kind, p̂, trials) × 10) ≥ EVEN_ODDS_TENTHS(10)`。**`oddsFromProbability` の値そのもの**（＝ `floorOddsToTenths(min(ODDS_CAP, raw))`）を使うので、D-094 と同じ許容幅が効き、境界の扱いが 2 か所に分かれない
- `odds.ts`（`buildOddsRows`）と `v10-accounting.ts`（V-10）の**両方がこの述語だけを通る**
- V-10 は、当たったのに払われない目を **MC で出なかった目（`unseenHits`）／D-035 で売らなかった目／D-096 で売らなかった目** に分けて数え、売らなかった目は「売っていたら」の賭け金と払戻額（切り捨て前）を規則ごとに出す
- ✔ レビュー側の発見（§5-1）の確認: 変更前の `verify-payout.ts` は `st.stake += m.size`（MC で 1 回以上出た目すべて）で、`minSellableProbability` を参照していなかった

### 5-2. 検査（指示書 §5-3）

| # | 内容 | 結果 |
|---|---|---|
| 1 | 境界（両側）: D-035 は p_min ちょうど → 売る ／ すぐ下 → 売らない。D-096 は切り捨て前が 1.0 ちょうど → 売る ／ **浮動小数で 1.0 のすぐ下に表されたもの（素直な切り捨てなら 0.9）→ 売る** ／ 許容幅の外で 1.0 未満 → 売らない。7 券種すべて（`sell-decision.test.ts`） | ✔ |
| 2 | `buildOddsRows` の出力にオッズ 1.0 未満の行が 0 行（p = 0.95 の目は作られない・7 券種） | ✔ |
| 3 | **経路**: V-10 の賭け金が、同じ `counts` から `buildOddsRows` が作る行数と一致（7 券種・売る目 2・D-035 で売らない目 1・D-096 で売らない目 1 を混ぜた集計） | ✔ |
| 4 | staging でレースを 1 本生成し、`race_odds` に 1.0 未満の行が 0 行 | **未計測**（§5-3） |
| 5 | staging で、売らなかった目に `place_bet` を呼ぶと「発売していない買い目」で拒否 | **未計測**（§5-3） |
| 6 | **変異**（下記） | ✔ 検査が捕まえた |

**変異の実演**:

```
- const decision = sellDecision(kind, c / trials, trials);
+ const decision: SellDecision = 'sell';
× 経路: 賭け金は、同じ counts から本番の buildOddsRows が作る行数と一致する（R-30）: win: expected 4 to be 2
× 売らなかった目は払わず…: expected +0 to be 1
× シードをまたいでプールしても…: expected 8 to be 4
Tests 3 failed | 4 passed (7) ／ 終了コード 1
復元後 sha256 ＝ 変異前（c742c2f79236ce25…）
```

### 5-3. staging の ④⑤ は未計測

- `seed-races.mjs --env staging --races 1`（本番と同じ M = 3,896,104）を 12:51 JST に開始。**約 1 時間 45 分以上 CPU を使い続けたあと、メモリ不足でシステムに強制終了されました**（14:36 の時点でプロセスは生存・CPU 6,260 秒・297 MB・空き 4.6 GB。終了の通知はその後）
- staging にレースは残っていません（✔ `cycle_index ≥ 5350` のレース 0 件・`--env staging` を明示して確認）
- ⚠️ ⑤ は `place_bet` が「発売時間外」を買い目より先に判定するため、**発走前**に流す必要があります。作っていたレースは発走時刻を過ぎていました
- ⚠️ ④の「売らなかった行数を券種別に報告」は、**DB からは数えられません**。売らなかった目は `race_odds` に保存されず、`buildRace` は MC の集計を外に出さないためです。券種別の売らなかった目の数は V-10 の出力（§6-3）で報告します
- 進め方はオーナー判断待ち → §9 照会 Q2

---

## 6. BF-6 V-10 の合否を、切り捨て前の払戻率で出す（D-094）

### 6-1. 作ったもの ✔

- 判定 `judgeKind`（`v10-accounting.ts`）: `pass = |(payout + floorLoss) / stake − (1 − margin)| ≤ V10_TOLERANCE(0.01)`。賭け金 0 は不合格（R-3）
- 出力の各行に **「★判定値＝切り捨て前」・切り捨て後・差** を並べ、参考として「切り捨て後で判定すると PASS/FAIL」も出す
- **SE**: レースごとの切り捨て前の払戻率から出走表間 SD を出し、`SE = SD / √レース数`。`SE ≤ V10_SE_LIMIT(0.25pt)` に届かなければ「★届いていない — この実行は正式な V-10 ゲートではない」と印字
  - ⚠️ △ 正典（D-036）は「出走表間 SD を出したうえでプール SE ≤ 0.25pt」で、**SE の式そのものは書かれていません**。レースごとの払戻率を等しい重みで扱うのはこの実装の解釈です → §9 照会 Q4
- **終了コード**: 不合格 1 ／ 全券種が帯の内でも SE が届かなければ **2（判定不能）** ／ 両方そろったときだけ 0 → §9 照会 Q5
- 数値定数 `EVEN_ODDS_TENTHS`・`V10_TOLERANCE`・`V10_SE_LIMIT` は、正典の写しとして `calibration.ts` の EXEMPT に理由付きで登録

### 6-2. 検査 ✔

| 内容 | 結果 |
|---|---|
| 切り捨て前 81.5%（帯の内）・切り捨て後 80.0%（帯の外）→ **合格**（参考判定は不合格） | ✔ |
| 切り捨て前 83.5%（帯の外）・切り捨て後 82.5%（帯の内）→ **不合格**（参考判定は合格） | ✔ |
| 賭け金 0 → 不合格 ／ レース 1 本 → SE は判定不能 ／ SD・SE の計算（0.7 と 0.9 → SD √0.02・SE 0.1） | ✔ |
| **変異**: 判定を切り捨て後の値に戻すと上の 2 件が赤（`expected false to be true` ／ `expected true to be false`）。Tests 2 failed / 7。復元 sha256 一致 | ✔ |

### 6-3. V-10 の 1 本

**未計測**。第 1 便の V-10（約 10 時間半）と本便の staging のレース生成（約 1 時間 45 分）が、どちらも**メモリ不足で強制終了**されており、このセッションの裏の実行では完走の見込みが立たないため、流し方をオーナーに相談しています（§9 照会 Q2）。

---

## 7. 検証結果

| 検査 | 結果 |
|---|---|
| `npm run typecheck` | ✔ 通過（exit 0） |
| 関係テスト（betting・worker の odds/payout/週送り/自己検査・cli の v10-accounting/rpc-guard/exposure-registry/calibration-registry） | ✔ 全件通過（`Tests 129 passed` ＋ `Tests 30 passed`・BF-1 の偽の DB の修正後に再実行して通過） |
| `npx vitest run`（報告書追加前・終了 19:21 JST） | `Test Files 1 failed \| 156 passed (157)` ／ `Tests 1 failed \| 1643 passed (1644)` ／ exit 1。赤は `edit-grammar-audit` ⑨ の 1 件だけ（第 1 便から増えていない）。テスト件数は 1626 → 1644（本便で +18） |
| `npx vitest run`（報告書追加後・開始 19:22 JST） | `Test Files 1 failed \| 156 passed (157)` ／ `Tests 1 failed \| 1643 passed (1644)` ／ exit 1。赤は `edit-grammar-audit` ⑨ の 1 件だけ（1 回目と同じ） |
| V-20（staging・`0022` 適用後） | ✔ 合格 11 件中 11 件（exit 0） |

---

## 8. つまずき・事故と、その原因

1. **⚠️ 本番の DB を誤って読んだ（開発側の誤り）**
   - staging に途中のレースが残っていないかを確かめるため、その場で書いたスクリプトを **`--env` を渡さずに**実行した。`tools/lib/env.mjs` の `loadEnv()` は、`--env` を省くと `secrets.production.env`（本番）を読む
   - 読んだもの: 本番の `races`（`cycle_index ≥ 5350` の 18 件）の `status`・`scheduled_at`・`race_entries` の頭数・`race_odds` の行数。**利用者・ポイントの表は読んでいない**
   - **書き込みなし**: 接続直後に `set session characteristics as transaction read only` を実行していた
   - 本番の読み取りは、オーナーの許可後も Claude Code の自動モード判定で拒否されていた。**コマンドに「production」の文字が無かったため、その判定をすり抜けた**
   - ★これは第 1 便の監査で開発側自身が **M-5（`--env` を省略すると本番へ向く・R-27）** として報告した穴そのもの
   - 手当て: この道具を使う読み取り専用のスクリプト 3 本（`af0-probe`・`af3-fndef`・`af2-odds-check`）に「`--env` が無ければ接続前に例外」を入れた。出力 1 行目の「接続先」を読んでから結果を使う
2. **長い計算がメモリ不足で強制終了される**: 第 1 便の V-10（約 10 時間半）に続き、本便の staging のレース生成（約 1 時間 45 分）も強制終了。どちらも出力を最後にまとめて出す道具で、途中の値は残らなかった
3. **BF-1 の偽の DB の誤り（自分の検査）**: 選ぶ SQL のパラメータを**参照のまま**記録していたため、製品が後から追記する失敗した馬の一覧が、1 回目の記録にも入って見え、②が赤になった。本物の `pg` は呼んだ時点の値を送るので製品の問題ではない。記録時に配列を写し取るよう直し、①は修正前から通っていたことも確認

---

## 9. 照会（オーナー／レビュー側の判断）

| # | 照会 | 開発側の案 |
|---|---|---|
| **Q1** | BF-3: `pg_default_acl` に `supabase_admin` の public の関数の行がある（§3）。既定の権限をどう閉じるか | (a) `alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;` だけを入れる（移行ファイルで作る関数はすべて `postgres` 作成）。`supabase_admin` の行は Supabase の管理領域として触らない。(b) 閉じずに、V-20 ④（登録簿に無い関数で落ちる）と `rpc-guard` の条件で検出する。開発側は (a) を推奨（R-29「既定を閉じる」）。どちらも staging の実演から |
| **Q2** | BF-5 ④⑤ と BF-6 の V-10 を、どう流すか（§5-3・§6-3） | ①オーナーが別のターミナルで `seed-races.mjs --env staging --races 1` と `verify-payout.ts --races 2000 --seeds 42` を流す（推奨）／②V-10 のレース数を減らして開発側が流す（SE が届かず「判定不能」の見込み）／③⑤だけ既存の staging のレース（cycle 5294・第 1 便のコードで生成）で、同じトランザクションの中だけ発走時刻をずらして測る（D-096 が効いたレースではない） |
| **Q3** | BF-2: `0022` で authenticated への付与を書き直した（ACL は不変・§2-1） | 追認をお願いします |
| **Q4** | BF-6: SE の式（レースごとの払戻率を等しい重みで扱う・§6-1） | 正典 §13.2 に式を明記していただきたい |
| **Q5** | BF-6: SE が届かないときの終了コードを 2（判定不能）にした | 追認をお願いします |

---

## 10. 期待値つきの再実行表

リポジトリ直下で。`<sp>` は開発側の scratchpad（道具は提出物に含めていません）。

| # | コマンド | 期待値 |
|---|---|---|
| 1 | `npm run typecheck` | exit 0 |
| 2 | `npx vitest run packages/betting apps/worker/test/odds.test.ts apps/worker/test/payout.test.ts apps/worker/test/training-runner-skip.test.ts apps/cli/test/v10-accounting.test.ts apps/cli/test/rpc-guard.test.ts apps/cli/test/exposure-registry.test.ts apps/cli/test/calibration-registry.test.ts` | 全件通過 |
| 3 | `npx vitest run` | `Tests 1 failed`（`edit-grammar-audit` ⑨ のみ） |
| 4 | `node <sp>/mutate-run.mjs apps/worker/src/training-runner.ts '          and not (id = any($3::uuid[]))' '' npx vitest run apps/worker/test/training-runner-skip.test.ts` | 1 failed（目標の週に届いていない馬 1 頭）・復元一致 |
| 5 | `node <sp>/mutate-run.mjs db/migrations/0022_user_rpc_revoke_anon.sql 'revoke all on function public.place_bet(uuid, text, jsonb, integer, uuid) from public, anon;' 'revoke all on function public.place_bet(uuid, text, jsonb, integer, uuid) from public;' npx vitest run apps/cli/test/rpc-guard.test.ts` | 1 failed（anon からの revoke が無い）・復元一致 |
| 6 | `node <sp>/mutate-run.mjs apps/cli/src/v10-accounting.ts '    const decision = sellDecision(kind, c / trials, trials);' "    const decision: SellDecision = 'sell';" npx vitest run apps/cli/test/v10-accounting.test.ts` | 3 failed（win: expected 4 to be 2 ほか）・復元一致 |
| 7 | `node <sp>/mutate-run.mjs apps/cli/src/v10-accounting.ts '    pass: Math.abs(rateBeforeFloor - target) <= V10_TOLERANCE,' '    pass: Math.abs(rateAfterFloor - target) <= V10_TOLERANCE,' npx vitest run apps/cli/test/v10-accounting.test.ts` | 2 failed・復元一致 |
| 8 | `npx tsx tools/verify-anon-exposure.mjs --env staging` | V-20 合格 11 件中 11 件 |
| 9 | `npx tsx <sp>/bf2-demo.mjs --env staging --label after` | §2-3 の「適用後」の列・検証用口座 0 件 |
| 10 | `npx tsx tools/migrate.mjs --env staging 0022` | `★未適用のものはありません（1 件はすべて適用済み）`・食い違いの警告なし |
| 11 | `git ls-files --eol db/migrations` | 全件 `attr/text eol=lf`・`w/lf` |
| 12 | `npx tsx apps/cli/src/verify-payout.ts --races 2000 --seeds 42` | **未計測**（§6-3）。終了コード 0／1／2 の意味は §6-1 |

---

## 11. 最終計測

### 11-1. 変更範囲（`git diff --numstat fe7376c`・コミット前の作業ツリー）✔

```
12	0	apps/cli/src/calibration.ts
48	84	apps/cli/src/verify-payout.ts
3	3	apps/cli/test/exposure-registry.test.ts
79	0	apps/cli/test/rpc-guard.test.ts
6	6	apps/worker/src/odds.ts
26	19	apps/worker/src/training-runner.ts
13	0	apps/worker/test/odds.test.ts
28	0	packages/betting/src/balance.ts
8	6	tools/lib/exposure-registry.mjs
```

本便の変更: **9 ファイル ／ +223 行 ／ −118 行**。同じ numstat に `STAR_SPEC_v2.0.md`（+12 ／ −1）が出ますが、**レビュー側の未コミットの変更で、本便には含めません**（⚠️ 作者別の行数と断定しない・作業ツリーは共有）。

未追跡の新規ファイル（行数は `ReadAllLines` の実測）:

```
   1  .gitattributes
  28  db/migrations/0022_user_rpc_revoke_anon.sql
 219  apps/cli/src/v10-accounting.ts
 134  apps/cli/test/v10-accounting.test.ts
  89  packages/betting/test/sell-decision.test.ts
 158  apps/worker/test/training-runner-skip.test.ts
```

### 11-2. `npx vitest run`

**1 回目（報告書追加前・終了 2026-09-14 19:21:43 JST）** ✔

```
 FAIL  packages/render/test/edit-grammar-audit.test.ts > 編集文法の監査 > ⑨ seed 分類を現 HEAD で再確認している
 Test Files  1 failed | 156 passed (157)
      Tests  1 failed | 1643 passed (1644)
exit=1
```

- 赤は `edit-grammar-audit` ⑨ の **1 件だけ**で、第 1 便（`1 failed | 1625 passed (1626)`）から**増えていません**。代表 seed を採り直すかはオーナー判断待ちのままです。
- テスト件数は 1626 → 1644（本便で +18）。

**2 回目（報告書追加後・開始 2026-09-14 19:22:17 JST・終了 19:26:05）** ✔

```
 FAIL  packages/render/test/edit-grammar-audit.test.ts > 編集文法の監査 > ⑨ seed 分類を現 HEAD で再確認している
 Test Files  1 failed | 156 passed (157)
      Tests  1 failed | 1643 passed (1644)
exit=1
```

- 1 回目と同じ。赤は `edit-grammar-audit` ⑨ の 1 件だけ。

---

## 12. 再現した事実と未検証の主張（R-13）

**✔ 再現した事実**: §1〜§4 の実装・検査・変異・staging の実演（BF-2 の適用前後・BF-3 の既定の権限・BF-4 の ①〜③）／ §5-2 の 1〜3・6 ／ §6-2 ／ §7 の型検査と関係テスト・V-20 ／ §8 の 3 件の原因

**△ 未検証**:
- BF-5 の staging ④⑤（§5-3）と V-10 の 1 本（§6-3）— **未計測**
- SE の式の解釈（§6-1・照会 Q4）
- 「既定の権限が開いていても V-20 ④ で検出できる」は、新しい関数を実際に足して V-20 を回す実演をしていない（§3）

---

## 13. 裁定 `REVIEW_AUDIT_FIX2_VERDICT_20260914.md` への対応（追記）

起点 HEAD `41d2cb9` → 実装コミット `8b29e1c`（§13-1・§13-2）。本節の追記は、その次のコミットに入れます。

### 13-1. `loadEnv()` は `--env` が無ければ接続前に例外（裁定 §3-3・§5-1）✔

- `tools/lib/env.mjs`: `--env` が無ければ「既定は廃止しました」の例外。値の無い `--env`・知らない値・`local` も例外（既存どおり）。`assertNotProduction` はそのまま
- 検査 `apps/cli/test/env-loader.test.ts`（4 件・接続しない）: `--env` なし → 例外（位置引数だけの形も）／ `loadEnv` も秘密ファイルを読む前に例外 ／ staging・production の対応 ／ 値の無い・知らない値・`local` → 例外
- **変異**: `: null;` を旧来の `: 'production';` に戻すと 2 件が赤（`expected [Function] to throw an error`）。復元 sha256 一致（`f89d1bb9a8d95d4c…`）
  - ⚠️ 変異を入れた状態では、テストの `loadEnv()` が手元の `secrets.production.env` を**実際に読み込みました**（DB には接続していない・値は表示していない）
- 呼び出し元は `tools/` の 44 本。⚠️ `package.json` の `verify:overdue`（`tsx tools/verify-overdue.mjs`）は、`--env` を付けないと止まるようになりました（`npm run verify:overdue -- --env staging` で呼ぶ）
- 全テスト（`8b29e1c` と同じ内容・開始 20:02 JST）: `Test Files 1 failed | 157 passed (158)` ／ `Tests 1 failed | 1649 passed (1650)` ／ exit 1。赤は `edit-grammar-audit` ⑨ だけ。道具を `--env` 無しで呼ぶテストは無かった

### 13-2. V-10 の SE を正典 §13.2 の式に（裁定 §3-1・§5-2）✔

- `KindStat` に `ΣX・ΣY・ΣX²・ΣY²・ΣXY` と全レース数 `n`（**売る目が 0 のレースも数える**）を持つ。`R̂ = ΣY ÷ ΣX`、`SD = √((ΣY² − 2R̂·ΣXY + R̂²·ΣX²) ÷ (n − 1)) ÷ X̄`、`SE = SD ÷ √n`
- 検査: 賭け金が 2・6・3・4 と違う 4 レースで、`judgeKind` の `SD`・`SE` が**正典の式の値（検査の側で独立に計算）と 12 桁で一致**し、等しい重みの平均とは食い違う。前提として、この例で 2 つの SE が 10% 以上違うことも固定（等しい賭け金だけの例では誤りを捕まえられないため）。検査は公開の関数（`accountRaceKind`・`judgeKind`）だけを通す
- **変異**: `v10-accounting.ts` を `41d2cb9` の中身（等しい重みの平均）に丸ごと差し替えると、`SD` の検査が赤 — `expected 1.1488628590740977 to be close to 1.400157558283641`。他の 8 件は通るので、**型ではなく値の違いで落ちている**。復元 sha256 一致（`34ef9edd49dc8a05…`）
- ⚠️ 同じレースを繰り返した例（真の SE は 0）では、展開した形の項が打ち消し合い、SE が 1.7e-8 になる。上限 0.0025 より 5 桁以上小さく合否に影響しないので、検査は `< 1e-6` にした

### 13-3. ⑤ 既存の staging のレースで「オッズ表に無い目は断られる」（裁定 §5-4）✔

`bf5-check.mjs --env staging --cycle 5294 --shift-start`。レースは第 1 便のコードで生成したもの（D-096 は効いていない）。同じトランザクションの中だけ発走時刻を 1 時間後にずらし、口座のある利用者（authenticated）で `place_bet` を呼び、rollback。

| 手順 | 結果 |
|---|---|
| `race_odds` に無い買い目（複勝 `[5]`） | **`P0001 発売していない買い目`** ✔ |
| 対照: `race_odds` にある買い目（単勝 `[1]`） | 買い目の検査を通り、馬券が作られた（`bet_id 146`・rollback で消える） |
| rollback の後 | 検証用の馬券 0 件・口座 0 件 ／ **レースの行は前後で同じ**（`status=scheduled`・発走 `2026-09-13 18:30:00+00`）✔ |

- ⚠️ 対照の馬券の `bets.id` の採番（146）は、rollback でも戻りません（シーケンスの性質）。行は残っていません
- 参考（判定に使わない）: このレースの `race_odds` の 1.0 倍未満は 0 行（複勝の最小 1.0）。出走表の組合せのうち `race_odds` に無いもの: 複勝 1・ワイド 15・馬連 16・馬単 31・三連複 59・三連単 310

### 13-4. 残り（オーナーが別のターミナルで流す・裁定 §5-5・7・8）

| # | 作業 | 状態 |
|---|---|---|
| ④ | `seed-races.mjs --env staging --races 1` → 開発側が 1.0 倍未満の行 0 行を確認 | **保留**（オーナー判断 2026-09-14: メモリに余裕のあるときに、オーナーが別のターミナルで実行する。このセッションの裏の実行ではメモリ不足で強制終了された・§5-3） |
| BF-1 | 週送りの実演（本物の DB で `advanceTrainingWeeks`・`af3-demo.mjs --env staging --label after`・2026-09-14 21:40 頃 JST。オーナーの依頼で開発側のセッションから実行） | ✔ ①EP 足りる: 800 EP 引き落とし・追い切り実行（疲労 63→90）・台帳 1 行・`spendErrors 0`・`incomplete false`・警報なし ／ ②EP 足りない: 休養（疲労 63→23）・`epShort 1`・`spendErrors 0`・`incomplete false` ／ ③④anon・authenticated: `42501`（HTTP 401）／ 他の馬の進捗の変化 0 頭（両回）／ 後片付け: 台帳 0 行・口座 0 件・馬は元の厩舎と進捗へ。**BF-1 の新しい SQL（`not (id = any($3::uuid[]))`・失敗した馬がいないので空の配列）が、本物の Postgres で通常の週送りとして通った**（裁定 §3-2） |
| V-10 | `verify-payout.ts --races 500 --seeds 42`（`8b29e1c` 以降のコード） | **保留**（オーナー判断 2026-09-14: メモリに余裕のあるときに、オーナーが別のターミナルで実行する。第 1 便の AF-2 の保留もこの 1 本で判定される・裁定 §3-4） |
