# 照会: 命名前の仔の置き場所と、命名の検査の置き場所（D-120 ⑥ N-2・N-3）

2026-09-22・開発側 Claude・照合 HEAD `7efc3a0`。**I-2 の確定処理の書き込み先がこれで決まるため、I-2 の実装の前に出す。**
凡例: ✔ ＝ コード・正典で確かめた

## 1. 事実

| | |
|---|---|
| `horses.name` は NOT NULL | ✔ `db/migrations/0001_init.sql:108`（前の裁定 §6 で確認済み） |
| `horses` を読む製品コード | ✔ **ワーカー 8 ファイル**（`breeding-runner` `entry-freeze` `horse-repo` `market-flow` `prize-award` `scratch` `training-runner` `unlock-flow`）＋ ✔ **移行 28 本**のビュー・関数（`my_horses` `race_entries_public` `races_public` `horse_market_listing_public` `create_account` `set_training_order` ほか） |
| 名前の正規化 | ✔ TS だけ: `packages/sim-engine/src/naming.ts:90` `normalizeName()`。SQL に正規化・名前の一意制約は **0 件** |
| 禁止名の判定 | ✔ TS だけ: `apps/cli/src/name-blocklist.ts`（`data/ng-names.hash` を読む。**ハッシュ表がまだ無い**＝`NG-NAMES-UNWIRED`） |

## 2. 置き場所（N-2）

| 案 | 中身 | 紛れ込みの防ぎ方 |
|---|---|---|
| **(i) 別の表に置く（推奨）** | 確定処理は `breed()` の結果をそのまま **`foal_drafts`（仮称）**に書く（要求 ID・父母・種・`birth_week`・全形質）。命名が通った時点で、同じ取引の中で `horses` に 1 行入れ、下書きを「命名済み」にする | **`horses` を読む 36 か所を 1 つも変えずに済む**（下書きは `horses` に居ないので、構造上 紛れ込めない）。表は `revoke all … from anon, authenticated`（0057 と同じ）。本人が読む口は RPC かビューで、**非公開の能力値を列に出さない** |
| (ii) `horses` に入れて旗で隠す | `name` に仮の値・`is_draft` の旗 | **36 か所すべてに絞り込みを足す**必要があり、1 か所の漏れで出走・一覧・NPC の配合相手に紛れ込む（受入条件 3）。新しく `horses` を読む処理を書くたびに同じ罠が残る |

(i) の注意点（確かめる試験）:
- 下書きの間も、**母のカウンタ（`bred_this_year` `foal_count`）と父の `coverings_this_year` は確定時に進める**。したがって同じ週に NPC の経路が同じ母で産むことは、ロックの後の `canMate()` で止まる。★`0054` の `unique (dam_id, birth_week)` は `horses` にしか効かないので、**下書きの表にも同じ一意を置く**（NPC 経路とプレイヤー経路が同じ母・同じ週に 1 頭ずつ作る試験を、前の裁定 §2 のとおり書く）
- 仔の成長: NPC の仔も `last_processed_week = 誕生週 + 78` で 78 週まで週送りを飛ばす（✔ `breeding-runner.ts:545`）。**命名が遅れても成長の取りこぼしは起きない**（78 週までは処理しないので）。ただし **78 週を過ぎても命名していない**場合は、`horses` に入れる時点で `last_processed_week` を誕生週 ＋ 78 のままにし、欠けた週を週送りの追いつきで処理させる（✔ `weeksToProcess` が欠落を補完する設計）
- 所有上限（D-120 ③）: 下書きも「現役」に数える（数え方は `ownership.ts` の 1 か所）

## 3. 命名の検査の置き場所（N-3）

正規化と禁止名の判定は **TS にしかない**。SQL に写すと出どころが 2 つになる（D-052）。

| 案 | 中身 | 欠点 |
|---|---|---|
| **(α) 命名も要求を積む形にする（推奨）** | RPC `request_foal_name(draft_id, name, request_id)` は積むだけ。ワーカーが `normalizeName()`・禁止名のハッシュ表・既存の馬名との重複（正規化した値で比べる）を検査し、通れば `horses` に入れる。落ちれば理由を要求の行に書く | 名前の可否が出るまで最大 60 秒（起床間隔）。★**画面の文字数だけは即時に判定してよい**（ただしサーバーでも再判定する） |
| (β) 正規化した名前を SQL の列に持つ | `horses.name_key` に正規化の結果を保存し `unique`。禁止名だけワーカー | 正規化を SQL で再現しないと、RPC で重複を判定できない（写しになる）。結局ワーカーを通る |

★(α) なら、I-2 の配合の要求と同じ部品（要求の表・冪等キー・理由の書き戻し）を使い回せる。
★禁止名のハッシュ表が無い間は、裁定 §5-4 のとおり **「禁止名の検査をしていない」ことを要求の結果に明示して通す**（黙って通さない）。

## 4. 決めてほしいこと

1. N-2: (i) 別の表 でよいか
2. N-3: (α) 命名も要求を積んでワーカーで検査 でよいか
3. 下書きの表と命名の要求の表を、配合の要求の表と **1 つにまとめるか分けるか**（開発側の推奨: 要求の表は 1 つ〔`kind = 'breed_initial' | 'breed' | 'name'`〕、下書きの表は別）
