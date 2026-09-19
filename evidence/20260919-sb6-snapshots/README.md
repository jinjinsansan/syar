# SB-6 の控え 3 本 — 何が確かめてあって、何が確かめてないか（2026-09-19 / **09-20 追記**）

> このファイルは、**実 DB で確かめるならどうするか**を、**流す前に**書いたものです。
> **2026-09-20 に 1 本 流しました。** 結果を下の「実 DB でやったこと」に追記しました。

---

## 🔴 実 DB でやったこと（2026-09-20）

### ✅ `verify-g6` — 通りました。**ただし弱い**

```
node tools/diag-stable-census.mjs --env staging --save out/census/before-g6.json
  → 7,370 頭 / 40 厩舎 / sha256 dd2f53fd5064b859…
npx tsx tools/verify-g6.mjs --env staging
  → 8 項目すべて PASS ／ 所属厩舎: 1 → 1 ✅ 戻った ／ 終了コード 0
node tools/diag-stable-census.mjs --env staging --compare out/census/before-g6.json
  → sha256 dd2f53fd5064b859… ✅ **1 頭も動いていない**（頭数も、馬ごとの所属も）
tmp/snapshots/ → 0 件（控えは戻ってから捨てられた）
```

🔴 **この 1 本は「控えが効く」の証拠として弱いです。**
選ばれた馬（`order by id limit 1`）の**元の厩舎がたまたま 1** でした。
→ **「元の値を戻した」と「1 を決め打ちした」が、この run では区別できません。**
これは **R-30**（機構を通っていない）そのものです。

言えるのは:
- ✅ 控えが**実 DB の経路で**取られ、読まれ、捨てられた（`tmp/snapshots/` が 0 になった）
- ✅ 国勢調査が**前後で 1 バイトも変わらない**（＝この道具は何も置き去りにしていない）
- 🔴 **「1 でない厩舎に正しく戻る」は、まだ通っていない**

### ⏸ `verify-prize` — **流せませんでした（前提が無い）**

```
npx tsx tools/verify-prize.mjs --env staging
  → ★これから発走する発売中のレースが見つかりません（終了コード 2）
  → ★このツールは前提が揃うまで**何も作らずに**終了します
```
国勢調査は前後で不変（sha256 同じ）。**何も起きていません。**

**なぜ無いか**（読むだけで確かめました）:
```
cancelled:  7 本（最後 2026-08-11 18:50Z）
scheduled:  1 本（最後 2026-09-16 15:40Z）  ← ★もう過去
settled:   65 本（最後 2026-09-16 15:30Z）
これから発走する発売中: 0 本 ／ いま 2026-09-19 15:23Z
```
**ワーカーが 2026-09-16 から止まっている**ので、未来のレースが 1 本もありません。
⚠️ **`scheduled` のまま発走時刻を過ぎた 1 本**が残っています（09-16 15:40Z）。

→ 流すには `tools/seed-races.mjs` でレースを作る必要があります。
**それは検証そのものより大きな書き込み**なので、**指示を待ちます**。

---

## いま確かめてあること

`apps/cli/test/tool-restores-{g6,prize,a7}.test.ts`（8 + 8 + 7 = 23 件）が見ているのは:

| ✅ 見ている | 🔴 見ていない |
|---|---|
| 控えが `tmp/snapshots/` に**ファイルとして**落ちる | **SQL の文面が staging で正しく当たるか** |
| **別のプロセスから**読める（＝メモリでない） | `fsync` が本当に効くか（**電源を落とさないと分からない**） |
| 次の実行が控えを読んで**戻す手を呼ぶ** | 制約（`horses_owner_xor_npc`）が読みどおりに働くか |
| 戻しが**1 文**である（途中で死んでも半端にならない） | 本当に殺したときに何が起きるか |
| **冪等**（0 行を異常にしない） | |
| 道具の中の**順番**（控え → 変更、復元 → 準備） | |

## 3 本の危険度は同じではない

| 道具 | 動かすもの | 失敗したときに起きること |
|---|---|---|
| `verify-g6` | NPC 馬 **1 頭**（`order by id limit 1`・毎回 同じ） | その 1 頭の所属厩舎が分からなくなる |
| `verify-prize` | 出走表の **17 頭 前後** | 17 頭の所属厩舎が分からなくなる（**`STABLE-1-SKEW` を作り直す**） |
| `verify-a7` | `app_environment`（**1 行・全消し**） | 🔴🔴 **ワーカーも、状態を変える道具 全部も、起動できなくなる** |

## 推し: `verify-g6` だけ流す

理由:
- 動くのは **1 頭**だけ。`STABLE-1-SKEW` を測っている母集団をほぼ動かさない。
- それでも **「控えが実 DB で効く」ことは 1 本 分かる**（3 本とも同じ `snapshot-file.mjs` と同じ形）。
- 失敗しても、`birth_snapshot` のような別の控えが要らない — **控えのファイルそのものが手順書になる**。

### 手順（流す前に読む）

```bash
# ① 置き去りの控えが無いことを先に見る（★在ったら、前の実行が片付いていない）
ls tmp/snapshots/

# ② 対象の馬と、いまの所属厩舎を控えの外でも見ておく（★照合用）
#    ★verify-g6 が選ぶのは `order by id limit 1` の NPC 馬。
npx tsx tools/diag-stable1-skew.mjs --env staging | head -8

# ③ 流す（★timeout を掛けない。★MD-5: 状態を変える道具に締切を付けない）
npx tsx tools/verify-g6.mjs --env staging

# ④ 終わったあと
ls tmp/snapshots/        # ★空であること（★戻ったら捨てる作りなので）
```

### 見るところ

- 出力に `所属厩舎: N → N ✅ 戻った` が出ること。
- `tmp/snapshots/verify-g6.json` が**残っていない**こと。
  🔴 **残っていたら、戻っていません。** そのファイルの `npcStableId` が正解です。

### 戻し方（失敗したとき）

```sql
-- ★tmp/snapshots/verify-g6.json の horseId と npcStableId を入れる
update horses set owner_id = null, npc_stable_id = <npcStableId>
 where id = '<horseId>';
```

⚠️ **2 文に分けないこと。** `owner_id` を外してから `npc_stable_id` を入れると、
間で止まったときに**両方 null** になり `horses_owner_xor_npc` に当たります。

## `verify-a7` は流さないほうがよい

🔴 失敗したときの戻し方が**手作業**で、しかも
**`assertNotProduction` 自身が `app_environment` を読む**ので、
空になった後は**道具のほうから自動では戻れません**（循環）。

戻すなら、`tmp/snapshots/verify-a7.json` の `environment` を見て、直接:

```sql
insert into app_environment (singleton, environment) values (true, '<environment>')
  on conflict (singleton) do update set environment = excluded.environment;
```

## `verify-prize` は `STABLE-1-SKEW` の後でなら意味がある

いま流すと 17 頭を動かします。**偏りの記録（`evidence/20260919-stable1-skew/`）を取った後**なので
記録自体は壊れませんが、**分布は動きます**。
D-026 の系統集中を測る予定があるなら、**その測定より後に**回すのが安全です。
