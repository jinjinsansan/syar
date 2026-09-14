# 報告書 — 既存部分の全体監査（2026-09-14）

> 報告は鵜呑みにされない前提で書きます（CLAUDE.md）。
> **「再現した事実」と「未検証の主張」を分けます**（R-13）。
> 本監査では**製品コードを 1 行も変更していません**。本書が唯一の新規ファイルです。

⚠️ **権利方針（憲法 1）への配慮**: 本書は、実在の競馬場名・レース名・団体名や他社製品名を**文字列として書きません**。
該当箇所は「ファイル:行」と種別だけで示します（本書自体が追跡ファイル内の違反を 1 件増やさないため）。

## 0. 位置

| | |
|---|---|
| ブランチ | `p4/race-30sec-cuts` |
| 監査時の HEAD | `620e2c1`（記録: 引継ぎ書 2026-09-13） |
| 作業ツリー | 未追跡ファイル 13 件（別セッションの png / txt / wav）。**触っていません** |
| 変更 | 本書 `REPORT_AUDIT_20260914.md` の新規作成のみ。コミットしていません |
| 方法 | 自動検査 3 種を実行し、あわせて観点別の静的監査を 4 本並行で実施しました。4 本とは「憲法」「サーバー権威・DB」「エンジン層」「Web・描画・リポジトリ衛生」です。重い指摘は開発側 Claude が原文を読み直して確認しました |
| 触れていないもの | DB への接続、本番・staging、デプロイ、`git.txt`・`secrets.*.env`・`.env` 類 |

凡例: **✔ 再現** ＝ 開発側 Claude が原文を読むか計算で再現したもの。**△ 監査報告** ＝ 監査エージェントの読みで、開発側 Claude は再現していないもの。

## 1. 自動検査（実行結果）

| 検査 | 結果 |
|---|---|
| `npm run typecheck` | **通過**（exit 0） |
| `npx vitest run` | **1 failed ／ 1600 passed（1601）**・153 ファイル・329 秒 |
| `npm run verify` | **総合 PASS**（seed 42 / 7 / 2026 / 31337 × 100・300 ゲーム内年。V-1・V-2a〜f・V-3 全 PASS。V-2c 最小 15.18% ／ 最大 16.49%・222 秒） |

唯一の赤は `packages/render/test/edit-grammar-audit.test.ts:164` ⑨ です。`独走代表: expected 'contest' to be 'solo'`（seed 474）。
2026-09-13 の引継ぎ書 §3 に記載のある、**以前からの赤**です。代表 seed を採り直すかはオーナー判断待ちです。

**遺伝エンジンの受け入れ判定は健全です。以下の問題はその外側（払戻・DB・Web・権利）にあります。**

## 2. 高

### H-1 払戻が浮動小数で 1 PP 少なくなる ✔ 再現

- `packages/betting/src/settle.ts:106` は `Math.floor((ticket.stake * ticket.oddsAtPurchase) / mult)` です。
- `apps/worker/src/payout.ts:67-71` が `Number(b.odds_at_purchase)` を渡してこの `settle()` で払います。**実際の経路です。**
- 再現: `100 * 2.3` は `229.99999999999997` で、`Math.floor` の結果は **229**。
- 規模: 購入額 100〜10,000（100 刻み）× オッズ 1.0〜999.9（0.1 刻み）の **999,000 通り中 31,577 通り（3.16%）** で、正確な値より 1 PP 少なくなります。
- 払い過ぎにはなりません。ただし客が系統的に損をし、台帳との厳密な突合が崩れます。
- 直し方の案: オッズを 10 倍の整数として扱います。例: `Math.floor(stake * Math.round(odds * 10) / 10)`。

### H-2 オッズを四捨五入して保存し、その値で払う ✔ 経路を確認 ／ △ 規模は監査報告

- `packages/betting/src/balance.ts:182-186` の `oddsFromProbability` は、**丸めていない**浮動小数を返します。
- 保存先の列は `numeric(9,1)` です（`db/migrations/0001_init.sql:192,226,250`、`0020:79`）。**Postgres が四捨五入**します。
- 購入時オッズ（`odds_at_purchase numeric(9,1)`）がそのまま払戻に使われます（H-1 の経路）。
- △ 規模（監査の試算・未再現）: 複勝の約半数の目で切り上がり、**最大 +5.24%**。低オッズの目ほど実質の控除率が正典 §9.3 を下回ります。
- 直し方の案: 純関数の中で 0.1 単位に**切り捨て**てから返します。

### H-3 週送りで、持ち馬の調教が全部「休養」に落ちる（潜在） ✔ 再現（原文）

- `db/migrations/0020_rpc_setup_guard.sql:197` は、`spend_training_ep` の先頭で `perform assert_setup_complete();` を呼びます。**NPC 馬の分岐（`:206` `owner_id is null → return null`）より前**で、無条件です。
- `assert_setup_complete()`（`0019:52-56`）は `auth.uid()` が null なら `raise exception '未認証'` を投げます。
- ワーカーは Postgres に直結します。この場合 `auth.uid()` は null です（JWT の claim が無いため）。
- `apps/worker/src/training-runner.ts:196-206` は**すべての例外**を EP 不足として扱い（`void e`）、`menu = 'rest'` にします。
- 起きること: 持ち馬がいれば、毎週全頭が休養に落ちます。アラートは「EP 不足 N 頭」という**誤った文言**になります。
- **現状は表に出ていない**と判断します。Web に認証もセットアップ RPC も無く、利用者が持つ馬がいないはずだからです（本番 DB は未確認・R-25）。持ち馬ができた瞬間に発火します。
- `apps/cli/test/rpc-guard.test.ts:93` は「3 つの書き込み RPC が `assert_setup_complete` を呼ぶこと」を**要求**しています。ワーカーからの呼び出しは想定していません。

### H-4 関数の実行権限が既定で閉じていない △ 監査報告（Supabase の既定付与は未確認）

- `0018_lock_public_grants.sql:48` の `alter default privileges` は**テーブルにしか**掛かっていない、との報告です。
- Supabase は public スキーマの新しい関数に、anon / authenticated へ EXECUTE を明示的に付けます。このため `revoke ... from public` だけでは外れません。
- `spend_training_ep` の revoke は `public, authenticated` だけで（`0013:98-100`、`0014:79-80`）、**anon には残っている疑い**があります。
- 起きうること: 0013〜0019 の間、公開鍵だけで `/rpc/spend_training_ep` を叩き、任意の馬 ID・週番号で他人の EP を削れた可能性があります。週を変えれば冪等キーは毎回別物になります。
- 今は 0020 の `assert_setup_complete()` が**偶然塞いでいるだけ**です。
- ⚠️ **H-3 を「検査を外す」だけで直すと、この穴が戻ります。H-3 と H-4 は同じ便で扱う必要があります。**
- `tools/verify-anon-exposure.mjs` はテーブル権限しか見ておらず、この穴を検出しません（△）。
- 再確認の条件: staging で `select has_function_privilege('anon', 'public.spend_training_ep(uuid,bigint,integer)', 'execute')` を読みます。

### H-5 権利方針（憲法 1）

| 場所 | 種別 | 状態 |
|---|---|---|
| `apps/web/src/app/race/page.tsx:777` `HORSE_NAMES` | 実在競馬場名を含むデモ馬名（既知・09-13 引継ぎ書 §5-6） | ✔ |
| `tools/shot-race-at.mjs:540`、`packages/render/test/race-cutin.test.ts:247,251,384,388` | 上と同じ馬名の写し | △ |
| `apps/web/src/lib/game-demo.ts:127` | 実在レース名を含むレース名（画面に出る） | △ |
| `packages/sim-engine/src/naming.ts:23-46` | 生成器が実在競馬場名と同じ文字列を作れる（例: 音節表に含まれる 4 音の組合せ） | ✔ |
| `apps/cli/src/name-blocklist.ts` | NG 判定は実在**馬名**だけを想定。競馬場名を弾く経路が無い | △ |
| `apps/cli/src/preseed-run.ts:22`、`preseed-verify.ts:39`、`tools/seed-world.mjs:16,33` | NG 判定なし（`strict=false` ／ `ALLOW_ALL_NAMES`）で走る | △ |
| `.gitignore:138,150` | 他社製品名。同じファイルのコメントは「`.git/info/exclude` へ移した」と言っており、食い違う | △ |
| `tools/audit-edit-grammar-reference.mjs:2,4,31`、`tools/render-edit-grammar-comparison.mjs:119`、`tools/render-script-v5-sheets.mjs:32`、`tools/race-reference-shots.json:3` | 他社製品名（識別子の名残・出力文字列を含む） | △ |
| 追跡中の md 約 14 件 | 他社製品名 | △ |
| `packages/scheduler/src/graded-races.ts:71,73,75` | コメントに実在レースの位置付け | △ |
| `packages/render/src/{broadcast-v2.ts:1236, coat.ts:110, contest-focus.ts:74, race-development.ts:7, race-elision.ts:10}`、`race/page.tsx:577` | コメントに実在団体の略称。憲法 1 に当たるかは判断が要ります | △ |

⚠️ 権利方針の違反を検出する**自動テストはありません**（`graded-races.test.ts:11` に「守れない」と明記・△）。

### H-6 本番で開発用の画面が開ける ✔ 一部再現

- ✔ `apps/web/src/app/race/page.tsx:2114`: `params.get('dev') === '1' || (NODE_ENV === 'development' && ...)`。**本番でも `?dev=1` で開発卓が出ます。**
- ✔ `:4815` のバッジも同様です。
- △ `art-lab`、`race-quality-lab`、`race-world-lab`、`race-next`、`camera`、`course`、`still`、`watch` の **8 ページ**は、本番用の門（`notFound()` や middleware）も noindex も無いと報告されています。
- △ `lp-preview`（`/` と同じ中身）、`lp-arcade`、架空の EP 残高を出すデモ（`entry`・`setup`・`races/[id]/bet`）も本番で見えます。
- サーバーへ書く経路は無いので、被害は見た目の範囲です。

## 3. 中

| # | 内容 | 場所 | 確度 |
|---|---|---|---|
| M-1 | 締切（正典 §9.6: 発走 30 秒前）が守られない。`place_bet` は `scheduled_at`（発走時刻）まで受け付け、発売開始の判定も無い。レース行をロックしないため、確定・中止と競合した購入が pending のまま残り、EP が戻らない窓がある | `0020:112`、`packages/scheduler/src/cycle.ts:30` | △ |
| M-2 | 確定が 1 レース失敗すると周全体が例外で抜ける。60 分後の自動中止（D-037）にも次のレース生成にも届かず、再起動しても同じ所で止まる | `apps/worker/src/cycle-runner.ts:193-214` | △ |
| M-3 | 正典 §9.5-3「自馬全頭を含む組合せのみ可」が `exists`（1 頭含めば通る）で実装されている。§9.5-4（同一 IP・同一デバイスの検知）は未実装 | `0020:151-156` | △ |
| M-4 | `STAR_SEED_SECRET` が無くても警告だけで起動し、秘密をその場で作る（R-27）。`.env.example` にも `deploy/README.md` にもこの変数が無い | `apps/worker/src/main.ts:67-71` | ✔ |
| M-5 | ツール共通の env 読み込みで、`--env` を省略すると production を向く。書き込み系は `assertNotProduction` で守られているが、読み取り系は黙って本番を見る | `tools/lib/env.mjs:38` | △ |
| M-6 | 正典のゲートの大半が vitest の中で合否判定されていない（R-32）。V-1〜V-2e は小規模設定かつ実装を写す形の assert、V-10・V-12・V-7b は手で回す道具にしか無い | `apps/cli/test/simulator.test.ts:10,62` ほか | △ |
| M-7 | 決定論を守る自動テストがほぼ無い。直接呼び出しの走査は `puddles.ts` 1 ファイルだけで、ロジック 6 パッケージ・worker・cli・web は対象外（R-19）。**現時点のロジック層に違反は無い**（下記 §5） | `packages/render/test/puddles.test.ts:84-85` | △ |
| M-8 | `isPpNetHealthy` は `ppIssued <= 0` で `true` を返す。「経済が存在しない日」を健全と判定する形（R-16 ／ V-11）。worker の `daily-flow.ts` からは呼ばれていない疑い | `packages/betting/src/point-flow.ts:127-129` | ✔（関数）／△（呼び出し） |
| M-9 | 調子の値域の食い違い。育成は 0..5（§7.4）、race-engine は `CONDITION_MIN: 1` で、調子 0 と 1 が同じ補正になる | `packages/training/src/condition.ts:37`、`packages/race-engine/src/balance.ts:489` | △ |
| M-10 | `/race` の中継はレース結果をクライアント内で確定している（`build()` → `resolveRace`）。デモなので今は問題ないが、実レースに繋ぐときは作り直しが要る（憲法 3） | `race/page.tsx:1538-1556` | △ |

## 4. 低・衛生

- **DB と接続**（△）
  - 同じ冪等キーが同時に 2 本来ると、2 本目が一意制約違反のエラーになる（二重には引かない）: `0020:40,96`
  - 日次上限の「1 日」が UTC 基準: `0020:130`
  - `spend_training_ep` の `search_path` に `pg_temp` が無い: `0020:189`
  - DB 接続で TLS 証明書を検証していない（`rejectUnauthorized: false`）: `apps/worker/src/main.ts:45`、`tools/migrate.mjs:106`、`schemacheck.ts:43`
- **設定の食い違い**（△）
  - worker が使っていない `SUPABASE_SERVICE_ROLE_KEY` を必須にしている
  - `.env.example` の `SUPABASE_ANON_KEY` と、Web が読む `NEXT_PUBLIC_SUPABASE_ANON_KEY` が食い違う
  - `deploy/star-worker.service:28` が tsx で原本を動かしており、D-043（バンドル版）と食い違う
- **エンジン**（△）
  - 同着の払戻規則が誤っている。1 着同着で馬単・三連単が不的中になる（現状は同着が発生しないため未発火）: `settle.ts:28-78`
  - 異常な確率に `ODDS_CAP` を返し、お金の側で「開く」向きに落ちる: `balance.ts:183`
  - NaN が着順ソートに流れ込みうる: `race-engine/src/race.ts:223`
  - `localeCompare` への環境依存: `sim-engine/src/inbreeding.ts:179-182`
- **定数の古い写し**（△）
  - `sim-engine/src/balance.ts:78` の `RACE_RANDOM_K: 0.12`（使われているのは race-engine 側の 0.22）
  - `calibration.test.ts:65` の試験名が「0.26」のまま
  - 正典 §13.1 の表（`BASE_GAIN 12` ／ `INJURY_BASE 0.0018`）がコード（7.8 ／ 0.0013）と食い違う
- **リポジトリの重さ**（△）
  - `.git` は 598MiB（全部 loose オブジェクト）、`apps/web/public/art` は 362MB、1MB を超える png が 146 本
  - ルートの zip 2 本が追跡されたまま
  - `.gitignore` がルートの `*.wav` を除外していない（未追跡の wav 3 本が `git add` で入りうる）
- **古くなった記載**（✔ 一部）
  - `CLAUDE.md:10` の「現在のフェーズ: P0」、ワーカーの配備先「Render」（`deploy/README.md` は VPS）
  - 正典 §16.1 の状態欄（P1.5 再開／P2 進行中／P4 未着手）
  - `next.config.mjs` のコメント「Route Handler を作らない」（実際には `api/healthz`・`api/rig-lab` がある）
- **Web のテスト**（△）: `apps/web/test` は 2 本だけ。未テストのもの:
  - Provably Fair の検証表示
  - `/race` の URL 解析と dev 判定
  - `race-audio.ts`
  - 本番で開発ページが 404 になるか
- **ブランチ**（△）: ローカル `main` は HEAD より 7 遅れ。`origin/main` は HEAD より 1 遅れ（記録コミットのみ）。

## 5. 問題が無かったもの

- **決定論**: ロジック 6 パッケージ（sim-engine・race-engine・training・scheduler・betting・auth）の `src` に、`Math.random` ／ `Date.now` ／ 引数なし `new Date` ／ `performance.now` ／ `crypto.getRandomValues` の呼び出しはありません。worker のゲーム判断は Postgres の `now()` を使います。
- **型と依存**: ロジックパッケージは外部依存ゼロ（training・race-engine は sim-engine だけ）で、Node・React・Next の import もありません。`any` ／ `@ts-ignore` ／ `@ts-expect-error` は `apps/cli`・web・render を含めて 0 件。tsconfig は strict・`noUncheckedIndexedAccess`・`exactOptionalPropertyTypes` です。
- **ポイント 5 原則**: EP を購入する経路、PP→EP の還流、利用者どうしの譲渡は、どれもありません。台帳の理由値は CHECK で閉じてあり、EP と PP をまたぐ値は作れません。
- **台帳**: 残高の更新と記帳は 1 トランザクション内で行い、非負の CHECK があります。二重払戻（`status='scheduled'` 条件の更新 ＋ pending の馬券だけ行ロック）とレースの二重生成（一意制約 ＋ advisory lock）も防がれています。
- **権限**: 全テーブルで RLS が有効です。テーブル権限は TRUNCATE を含めて revoke 済みで、将来のテーブルにも既定で付きません。公開ビューは `server_seed` を出しません。
- **サーバー権威（本番経路）**: Web からの DB 書き込み・rpc 呼び出しは 0 件です。着順・オッズ・乱数はワーカーだけが計算しています。
- **秘密情報**: Web は anon キーだけを参照し、service_role の参照はありません。`git.txt`・`secrets*.env`・`.env`・`apps/web/.env.local` は ignore されていて、追跡もされていません。
- **正典値の一致**: 遺伝の定数、介入の定数、§9.3 ／ §9.4、§11.1 の賞金表、番組表 144R が正典と一致します。
- **Web の後始末と本番の門**: `rig-lab/*`・`gait-review`・`design-preview/odds`・`api/rig-lab` は本番で 404 になり、パス外への読み出しも防げています。`race/page.tsx` のリスナー（追加 4 ／ 解除 4）、rAF の取消、`AudioContext` の close は対になっています。

## 6. 推奨する扱い（オーナー ／ レビュー側の判断）

開発側は指示書の範囲外を実装しないため、**本書では修正していません**。推奨する順は次の通りです。

1. **H-1・H-2（払戻の額）** — お金が実際にずれる経路。純関数の修正と境界テスト（R-2・両側）で閉じられます。
2. **H-3 と H-4 を同じ便で** — 検査を外すと権限の穴が戻るため、分けて直さないこと。先に staging で関数の実行権限を実測します。
3. **H-5（権利）・H-6（本番の開発画面）**
4. M-1〜M-3（馬券の締切・確定の止まり・自馬制限）
5. M-6・M-7（ゲートと決定論の検査を CI に入れる）

⚠️ **未検証の主張（△）は、再現してから指示書に載せてください。** 特に次の 3 点です。
- H-4 の anon への実行権限
- H-2 の +5.24% という規模
- M-1 の宙に浮いた馬券の窓
