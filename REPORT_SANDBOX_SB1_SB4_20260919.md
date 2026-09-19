# REPORT — SB-1〜SB-4: `rollback` 付き 18 本の全数分類と、見張りの一般化

- 日付: 2026-09-19
- 発行: 開発側
- 裁定: `REVIEW_SANDBOX_LEAK_VERDICT_20260919.md`

---

## 0. 🔴 ★**まず、私の前便を 2 か所 訂正します**

### 訂正① ★「ワーカーは一度も動いていない」は ★**言い過ぎ**でした

★私は「`world_state` が 0 行 ＝ ★**ワーカーは一度も動いていない**」と書きました。
✔ ★`world_state` への書き込みは ★**今日入りました**（`e9b5e7b`・2026-09-19・UI1-10）。

→ ★★**0 行は「今日その行を書くコードが入ってから、ワーカーが動いていない」しか意味しません。**
✔ ★実測: ★レースは **73 件**あり、★**最後の確定は 2026-09-16**。
→ ★**正しくは「ワーカーは 2026-09-16 以降 動いていない」**です。★09-15/16 には動いていた形跡があります。

⚠️ ★**結論（「7,333 → 7,332 の原因は私」）は変わりません。** ★変わるのは理由の言い方です。

### 訂正② ★`verify-v11-synthetic.mjs` は ★**「漏らした」のではなく「わざと書く」**ものでした

★私は `grep -l rollback` で 18 本を拾い、★そこに混ぜていました。
✔ ★読んだら ★**`commit` を 2 回持ち、★`clean()` で自分の作ったものを消します**。★設計です。

---

## 1. ✅ SB-2 — ★`ep_ledger` / `pp_ledger`（★表から漏れていたもの）

> ★「掃除した」の表に載っていないものが、いちばん残ります

✔ ★数えました（`tools/diag-ledger-orphans.mjs`・読むだけ）:

| | 行数 | 孤児（`users` にいない） | `ref_id` が `races` に無い |
|---|---|---|---|
| **`ep_ledger`** | ★**0** | 0 | 0 |
| **`pp_ledger`** | ★**0** | 0 | 0 |

★他も 0 でした: `race_odds`（検査のレースの）／`bets`／`race_entries` の孤児／
`owner_id` があるのに `users` にいない馬／`owner_id` も `npc_stable_id` も無い馬。

→ ★**残っていませんでした。** ★掃除の SQL が `users` より先に `ep_ledger` を消していたためです。
⚠️ ★**ただし「表に載せなかった」のは私の落ち度**です。★載せていなければ、★**残っていても気づけません**。

---

## 2. 🔴 SB-1 — ★`rollback` 付き 18 本の ★**全数分類**

★危ないのは ★**「自分で `begin`/`commit` する関数を呼ぶもの」**だけです。
✔ ★数えました（★製品側に `query('begin')` があるか）:

| 製品の関数 | 自分で取引を持つか |
|---|---|
| `cancel.ts` → `cancelRace` | 🔴 **持つ** |
| `pg-store.ts` → `fillRace` / `settleRace` | 🔴 **持つ** |
| `pg-store.ts` → `registeredHorses` ほか読み | ✅ 持たない |
| `prize-award.ts` → `awardPrizes` | ✅ 持たない |
| `unlock-flow.ts` → `recordUnlockDistribution` | ✅ 持たない |
| `training-runner.ts` → `advanceTrainingWeeks` | ✅ 持たない |
| ★SQL 関数（RPC） | ✅ **呼び側の取引の中で走る** |

### 分類（18 本）

| 分類 | 本数 | |
|---|---|---|
| ✅ **A. `rollback` のつもりで、★漏らしえない** | **10** | `tmp/verify-0051` `tmp/verify-bt5` `tmp/verify-bt6` `tmp/verify-d117-fill` `tmp/verify-pr1` `tmp/verify-registered-excludes-scratched` `tools/verify-d117-fill` `tools/verify-initial-horse-distribution` `tools/verify-registered-excludes-scratched` `tools/verify-unlock-daily` |
| 🔴 **B. `rollback` のつもりで、★漏らした** | **2** | `tmp/verify-ds7-cancel` `tools/verify-ds7-cancel`（★`cancelRace`） |
| ⚠️ **C. ★わざと書く（`grep` の拾いすぎ）** | **6** | `tools/cleanup-ds7-leak` `tools/synthetic-bettor` `tools/verify-a5` `tools/verify-a6` `tools/verify-exchange` `tools/verify-v11-synthetic` |

★**B の 2 本だけが漏らしました。** ✔ 残り物は掃除済み（§1）。

### 🔴 ★C の中に、別の見つけものがあります — `verify-v11-synthetic.mjs`

★この道具は ★**実在する発売中のレースを 1 本取って、`settleRace` で確定させます**:

```js
select id, cycle_index … from races where status = 'scheduled' and scheduled_at > now() … limit 1
…
await store.settleRace(Number(race.cycle_index));
```

🔴 ★**`clean()` はレースの `status` を戻しません。** ★消すのは自分の作った `users`/`bets`/台帳だけです。
→ ★★**流すたびに、発売中のレースを 1 本 永久に消費します。**
✔ ★いま staging に残っている `scheduled` は ★**1 件だけ**（cycle 5709）。

⚠️ ★さらに `clean()` は `npc_stable_id = 1` と ★**決め打ち**で戻します
（★私が 2 頭で踏んだのと**同じ穴**です・§4）。

→ ★**これは今日の便では直しません**（★私に出ている指示の外です）。★**見つけたことだけ報告します。**

---

## 3. ✅ SB-3 — ★印を使わない見張り（`txid_current()`）

★旧: 「`cycle_index >= 200000` が 0 件か」＝ ★**その検査の印**。★印の無いものは漏れます。
★新: `tools/lib/sandbox-tx.mjs` の `beginSandbox` / `endSandbox`。

```
begin → txid_current() を控える → … → rollback の直前にもう一度 → 違っていたら 🔴
```

★内側の `commit` が発火すると外側の取引は終わり、★次の文は新しい取引で走ります。
→ ★★**`txid` が変わることが「途中で確定した」の定義そのもの**です。★印が要りません。

### ✅ ★見張りが本当に見つけることを、★**対照で確かめました**

`tools/verify-sandbox-detects-commit.mjs`（★実データに触らず、一時表だけ）:

| | |
|---|---|
| ① 途中で `commit` しない | ✅ `committed=false` |
| ② 🔴 ★**わざと途中で `commit`** | ✅ ★**`committed=true`・取引 23188 → 23189** を検出 |
| ③ 包みを通すと内側の `commit` が届かない | ✅ 横取り 2 件・`committed=false` |
| ④ 横取り 0 件は「効いた」ではない | ✅ |

→ ★**② が無ければ、①③ の ✅ は「いつでも ✅ を返す実装」でも同じ見た目**でした。

---

## 4. 🔴 SB-4 — ★**作り直した 2 頭**（★申し送り）

★`horses_owner_xor_npc` があるため、★`owner_id` を付けた時点で `npc_stable_id` は null にされ、
✔ ★`birth_snapshot` も無く、★**元の所属厩舎は永久に失われました**。

| `horses.id` | 名前 |
|---|---|
| `86f718ec-1455-46fa-8d37-f30a46b60cbf` | ドルガスゴベ |
| `6c675418-5ebe-4255-9ad7-9a0126a3886b` | クレイオネグ |

★`md5(id)` から 40 厩舎に決め打ちで戻しました。
→ ★**戻ったのは「厩舎に属している」ことだけ**で、★**「どの厩舎か」は別物**です。
★影響: ★市場の候補（`npc_stable_id is not null`）は戻る／★`owner_label` の名前が 2 頭だけ違う。

⚠️ ★**データには何も残っていません。** ★これを読む以外に、★**後から特定する手立てはありません。**
