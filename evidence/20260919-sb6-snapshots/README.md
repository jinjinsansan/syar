# SB-6 の控え 3 本 — 何が確かめてあって、何が確かめてないか（2026-09-19）

> 🔴 **どれも実 DB では確かめていません。** 検査が渡しているのは**偽の client** です。
> このファイルは、**実 DB で確かめるならどうするか**を、**流す前に**書いたものです。

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
