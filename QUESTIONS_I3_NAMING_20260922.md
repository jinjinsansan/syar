# 照会: 仔の命名（PLAN I-3・D-120 ⑥ N-3）の実装前の論点 — 2026-09-22

- 開発側 Claude（`star-aa`）・照合 HEAD `2610e5f`
- 前提の裁定: `REVIEW_UNNAMED_FOAL_PLACEMENT_VERDICT_20260922.md`（`ff7028c`）§2・§4・§5
- 凡例: ✔ ＝ コード・staging で確かめた ／ △ ＝ 推定

## 1. 事実

| | |
|---|---|
| staging の既存 7,370 頭の正規化後の名前（`normalizeName`） | ✔ **衝突 0 件**・正規化で空になる名前 0 件（読むだけで数えた・2026-09-22） |
| ⚠️ その 0 件の理由 | ✔ 世界の生成（`apps/cli/src/preseed.ts:265`・`:359`）は `generateHorseName` に「使用済みの正規化名」を渡して重複を避けている。**作りのとおりの 0 件** |
| 🔴 NPC の配合の仔の名前 | ✔ `breeding-runner.ts` の insert は `${stable.prefix}${foalId.slice(0, 6)}`（接頭辞 ＋ ID の先頭 6 文字）。**重複も禁止名も検査していない**。staging のワーカーはまだ仔を産んでいないので、この名前は上の 0 件に**含まれていない** |
| 禁止名の判定 | ✔ `apps/cli/src/name-blocklist.ts`（`data/ng-names.hash` を読む）。ワーカーは使っていない。世界の生成は `loadNameBlocklist(undefined, false)`（strict 無効）で呼ぶ（簿 `NG-NAMES-UNWIRED`） |

## 2. 論点と開発側の案

### Q-1 🔴 `name_key` の全頭一意と、NPC の仔の名前（裁定 §2 条件 2 に関わる）

全頭に `unique (name_key)` を張ると、NPC の仔の名前が偶然衝突した時点で `insert` が一意違反で落ち、**NPC の配合の週ごと戻る**（取引は週単位・`runBreedingCatchUp`）。△ 衝突の起きやすさは「6 文字の 16 進 ＝ 1,677 万通り」×「毎年 約 800 頭」なので低いが、0 ではなく年々積み上がる。

- **開発側の案**: NPC の仔の名前も、世界の生成と同じ `generateHorseName`（使用済みの正規化名を避ける・禁止名を避ける）で付け、`name_key` を同時に書く。念のため `insert` の一意違反は **その 1 頭だけ名前を引き直す**（セーブポイントで包む・週ごと戻さない）
- ⚠️ これは **NPC の世界の出力（馬名）を変える**。名前は着順・能力に効かないが、「変更前後の配合計算を固定シードで比較する」（指示書の受入条件 7）の比較対象から名前を外すことを明記する

### Q-2 禁止名の判定の置き場所

`name-blocklist.ts` は `apps/cli` にある。ワーカーから `apps/cli` を読み込むのはアプリどうしの依存になる。

- **開発側の案**: 判定の本体（ハッシュ集合を受け取って判定する純関数）は `packages/sim-engine/src/naming.ts` の `NameBlocklist` 型のまま、**ファイルを読む部分だけをワーカー側に置く**（`apps/worker/src/name-blocklist.ts`）。ハッシュの作り方（`hashName`）は 1 か所にしたいので、`packages/sim-engine` に移し、`apps/cli` はそれを呼ぶ形に寄せる
- ⚠️ ハッシュ表（`data/ng-names.hash`）が無い間は、裁定 §4 のとおり **`name_checked_with = null` のまま通し、要求の結果に「禁止名の検査をしていない」と明示**する。VPS の配備物にハッシュ表を含める方法（`tools/deploy.sh`）は、表ができた時点で決める

### Q-3 既存の全頭への `name_key` の埋め込みの順番

裁定 §2 条件 2: 一意を張る前に既存の衝突を数える・埋める道具は TS で `normalizeName()` を呼ぶ。

- **開発側の案**: ① 移行で `name_key text`（null 可）と `name_checked_with text` を足す（一意はまだ張らない） ② 道具 `tools/backfill-name-key.mjs`（STATE_CHANGING・下見が既定・`--apply` で書く）が全頭の `name_key` を埋め、**衝突を数えて 0 でなければ書かずに止まる** ③ 0 を確かめた後の別の移行で `unique (name_key)` と `not null` を張る。staging で ①〜③、本番は読むだけの下見まで（書くのはオーナーの許可）
- ⚠️ 本番の順序（血統修復 → 0060 → 配備）の後ろに積む

### Q-4 命名の要求（kind = `name`）の受付と確定

裁定どおり（要求を積む → ワーカーが検査 → 通れば `foal_drafts.record` から `horses` に 1 行・下書きに `named_horse_id`）。追加で決めたいこと:

- **文字数**: 正典に上限が見当たらない（△ 探した範囲では §6.1-10 に「馬名生成 or ユーザー命名待ち」だけ）。**開発側の案**: 2〜9 文字（カタカナ中心の競馬の慣習に合わせた仮の値）を較正定数でなく「規則の写し」として置き、正典への記入をお願いしたい
- 使える文字の種類（カタカナだけか・英字や漢字も可か）も正典に無い。**開発側の案**: 当面カタカナ・長音・中黒のみ（`normalizeName` が落とす記号との整合）
- 命名後の馬の `owner_id` ＝ 本人・`npc_stable_id` ＝ null（`horses_owner_xor_npc` 制約どおり）

## 3. 決めてほしいこと

1. Q-1: NPC の仔も `generateHorseName` で名付ける案でよいか（NPC の世界の出力が変わる）
2. Q-2: 判定の本体を `packages/sim-engine` に寄せ、読み込みをワーカーに置く案でよいか
3. Q-3: 3 段の順番でよいか
4. Q-4: 文字数・文字の種類（正典への記入が要る。オーナー判断なら暫定で決めて返してもらえれば、それで進める）
