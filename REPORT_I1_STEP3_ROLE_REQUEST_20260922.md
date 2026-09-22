# 報告: I-1 段 3 — 引退馬の役割を持ち主が変える ／ 生涯 8 産の制約 ／ 配備の順番 — 2026-09-22

> 開発側 → レビュー側。裁定 `REVIEW_I1_STEP3_ROLE_REQUEST_VERDICT_20260922.md`・`REVIEW_PROD_DEPLOY_ORDER_20260922.md`。
> staging には `0069`・`0070` を当てた（`--to 0069` で 1 件だけ、続けて残りを）。**本番には触れていない。** push していない。

## §0 一行

役割を変える同期の RPC（`request_breeding_role`）、生涯の記録の新しい種類、`buy_horse` のロックの順の直し、生涯 8 産の制約の直し（別ファイル `0069`）、`migrate.mjs --to` を入れた。
staging の予行 9 件はすべて合格した。制約とロックの 2 つは**対照で赤になる**ことも確かめた。手順書は新しい順番で `RUNBOOK_PROD_DEPLOY_20260922.md` に書いた。

## §1 変えたもの

| ファイル | 中身 |
|---|---|
| `db/migrations/0069_retirement_reason_mare_lifetime.sql` | `horses_retirement_reason_known` に `'mare_lifetime_foals'` を足す（**これだけ**。1 ファイル ＝ 1 取引・裁定 §1） |
| `db/migrations/0070_breeding_role_requests.sql` | 生涯の記録の種類 `breeding-role-changed`・表 `role_requests`（revoke all）・`request_breeding_role`・`buy_horse` の定義し直し |
| `packages/training/src/story.ts` | 種類・文（種牡馬になりました／繁殖牝馬になりました／繁殖を終え、功労馬になりました／功労馬になりました）・表示名「役割の変更」 |
| `apps/web/src/app/stable/retired/page.tsx` | 色の表に 1 行（**仮に「引退」と同じ色**。画面は `kind='breed'` の便でデザイナーが決める・Q-E） |
| `apps/worker/src/breeding-runner.ts` | 生涯 8 産で降ろした馬を `returning id` で受け取り、生涯の記録（reason = `lifetime_foals`）に書く。種類が DB に無ければ書かずに進める（配備の途中でも落ちない） |
| `tools/migrate.mjs` | `--to <4 桁>`（その番号までの未適用だけ）。番号が無い・桁違い・ファイル指定との併用は投げる |
| `tools/verify-role-request-live.mjs`（新規・STATE_CHANGING・必ず rollback） | 予行 ①〜⑨ |
| `tools/diag-owned-breeders.mjs` | ④ 生涯 8 産に達した繁殖牝馬の数を追加 |
| `tools/verify-pool-supply.mjs` | 偽の DB が降ろした id を返し、生涯の記録の問い合わせに答える |
| 試験 | `ownership-limits-sql.test.ts`（新規）・`breeding-runner.test.ts`（+3）・`horse-market-migration.test.ts`（RPC の本文は最後の定義を読む）・`pinned-migration-tests.test.ts`（分類の変更） |
| 登録簿 | classification・tool-aftermath（restores・`countedBy`）・exposure（`role_requests` CLOSED） |
| `RUNBOOK_PROD_DEPLOY_20260922.md`（新規） | 裁定 §2 の新しい順番 ①〜⑦ |

## §2 裁定の条件への対応

- **R-1 条件 1（最新の定義から読む）**: `ownership-limits-sql.test.ts` は `lastFunctionBody`（移行を番号順に読み、同じ名前の最後の定義を返す）から数を抜き出す。
  - 突き合わせる相手は `OWNERSHIP_LIMITS.active/stallion/broodmare` と `DEFAULT_BALANCE.MARE_LIFETIME_FOALS`。
  - 数が 0 個や 2 個以上見つかったら投げる（何を比べたかを曖昧にしない）。
  - 変異: `0070` の種牡馬の 5 を 6 にすると赤、戻して緑。
- **R-1 条件 2（E-2 の 30）**: 同じ試験で `buy_horse` の最後の定義の上限を `OWNERSHIP_LIMITS.active` と突き合わせる。
  - `horse-market-migration.test.ts` の ④ も、字面の 30 ではなく定数で見るように直した。
  - この試験は RPC の本文を最後の定義から読むように直し、分類を `pinned` から `history` に移した。`0025` で名指しするのは、表・台帳の語・権限の 3 つだけ。
- **R-2（同期の RPC）**:
  - 要求 ID で冪等にした。再送には前の結果を返し、同じ ID で別の依頼が来たら ST040。
  - `attempts` や予算は持たない。
  - ロックの順は「利用者 → 馬」。`buy_horse` と対象の馬が重ならない理由は、RPC の註記に書いた。
- **Q-C（両方書く）**: 持ち主が変えたときは RPC が reason = `owner` で書く。生涯 8 産で降ろしたときはワーカーが reason = `lifetime_foals` で書く。NPC の馬にも書く（その馬に何が起きたかの帳面）。
- **Q-E**: 裏側だけを出した。画面の色は仮の値で、文言と見た目は `kind='breed'` の便でデザイナーに依頼する。
- **§4（buy_horse のロック）**: 冪等の確認（台帳を読むだけ）の直後に、利用者の行をロックするようにした。出品・馬のロックはその後。
- **配備の裁定 §1**: 制約の直しを別ファイル `0069` にした。本番の該当数は `diag-owned-breeders` の ④ で読む。
- **配備の裁定 §2 条件 1〜3**:
  - 条件 1: `--to` を足した。staging で `--to 0069 --plan`、`--to 0069`（1 件だけ当たる）、`--to 0099`（止まる）、`--to 69`（止まる）を確かめた。
  - 条件 2: 古いワーカーの 1 周の確認は、手順書の ② と ④ の後に置いた。**staging のワーカーは止まっているので、ここでは確かめていない**。
  - 条件 3: 手順書を書いた。

## §3 staging の予行（`npx tsx tools/verify-role-request-live.mjs --env staging`）

| # | 結果 |
|---|---|
| ① 繁殖入り | done・honored → broodmare・生涯の記録 1 行（reason = owner） |
| ② 再送 | 依頼 1 行・記録 1 行のまま |
| ③ 同じ ID で別の依頼 | ST040 |
| ④ 失敗の理由 5 種 | not_owner／not_retired／sex_mismatch／same_role／lifetime_foals_reached がすべて期待どおり |
| ⑤ 上限 | 繁殖牝馬 10 頭ちょうどまで done、次は owner_limit。種牡馬は done 5 頭、次は owner_limit |
| ⑥ 降ろす | 上限を見ずに done。降ろした後、止まっていた 1 頭が done |
| ⑦ ロック | 役割の変更・購入とも、利用者の行に錠の印（`xmax`）が付く。購入は**出品の確認で落ちる呼び方でも**付く（＝出品より前、数えるより前）。**対照**: 取引の中で一時的に戻した `0025` の購入は 0、読むだけの RPC も 0 |
| ⑧ 生涯 8 産 | 年の頭（週 312）が落ちない・honored／mare_lifetime_foals・記録 1 行。**対照**: 制約を `0010` の形に戻すと、同じ週が `horses_retirement_reason_known` 違反で落ちる |
| ⑨ 後始末 | 馬・依頼・記録の数が前後で一致（7,370／0／0） |

- ⚠️ ⑦ は当初、2 本目の接続で待たせる形にした。しかし staging に確定済みの利用者が 1 人もおらず、判定不能になった。確定させる書き込みを避けるため、同じ取引の中で `xmax` を読む形に変えた（詳細は道具の註記）。
- ⚠️ **制約（⑧）とロック（⑦）は、本物の DB の予行でしか確かめられない。** `verify-pool-supply` の偽の DB は制約を再現しない。実際、12 年の回しで 1,390 頭を降ろしていながら、⑧ を捕まえられなかった。
- 取引の境界（裁定 I-1 §6 の決め）: `runBreedingWeek` は相変わらず取引に触らない。変えたのは降ろしの文（`returning id`）と記録の書き込みだけ。この関数を呼ぶ道具と偽の DB を並べる:
  - 道具: `verify-breeding-live`・`verify-player-breeding-live`・`verify-role-request-live`（新）・`verify-pool-supply`
  - 偽の DB: `breeding-runner.test.ts`・`breeding-catchup.test.ts`・`verify-pool-supply`
  - 3 つとも新しい文に答えるか、既定で通ることを確かめた。

## §4 門

通過（検査 2,848 件・赤 3／登録 3・前面・終了コード 0）。途中で赤が 3 件出て、いずれも直した。
- 名指しの検査の分類漏れ
- 名指しの検査が古い定義を見ていた（`buy_horse`）
- 読むだけの道具に書き込み文の字面を入れた

⚠️ 途中で、ヒアドキュメントの中の Python の文字列が逆スラッシュを 1 段食い、試験の正規表現が別物（`v_actives*>=s*30`）になった（記憶「シェルの罠」と同じ形）。試験が赤になって気づき、直した。差分で他の正規表現が崩れていないことも確かめた。

## §5 次

- 本番: オーナーの直接の指示を待つ（`RUNBOOK_PROD_DEPLOY_20260922.md`）
- I-1 の残り: 画面（`kind='breed'`・D-107 と同じ便）
- PLAN の次（I-4〜I-7）はレビュー側の順番に従う
