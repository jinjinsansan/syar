# ③ の予想 — ★**本番で測る前に書きます**（2026-09-20・AU-7′）

道具: `tools/verify-migration-landed.mjs --env production` ＋ `tools/verify-anon-exposure.mjs --env production`
基準: 同じ道具を **staging** に流した値（53/53 の環境）。

## ★staging の実測（＝期待値の出どころ）

```
① 移行 53 件（最後 0053_growth_tell_baseline.sql）
② my_horses / my_runs … 在る
③ races.course_frozen / race_entries.scratched_at / race_entries.prize_pp
   / horses.growth_told_stats … 在る
④ 対照: races_public / race_entries_public が anon から まだ読める … true
⑤ anon / authenticated の書き権限 … 0 件
⑥ anon の EXECUTE: spend_training_ep / place_bet / exchange_prize … すべて false
形（合否ではない）: ビュー 10 / 表 24 / 関数 14
```

## 🔴 本番の予想（★当たり外れを後で数える）

| # | 予想 | 自信 | 外れたら何を意味するか |
|---|---|---|---|
| ① | **53 件** | 高 | `migrate.mjs` の「完了」が嘘だった＝**戻り値を信じてはいけない**の実例 |
| ②③ | **全部 在る** | 高 | ファイルは流れたのに DDL が効いていない（考えにくい） |
| ④ | **両方 true** | 中 | 🔴 `0032` の `revoke all` が**公開ビューまで剥がした**＝**剥がしすぎ**。画面が落ちる |
| ⑤ | **0 件** | 中 | 🔴 2026-08-20 に見つかった `users` / `npc_stables` の anon UPDATE が**まだ残っている** |
| ⑥ | **すべて false** | 高 | `0021`/`0022` の revoke が効いていない |
| 形 | **ビュー 10 / 表 24 / 関数 14** | 中 | staging と本番で**構成が違う**（`SCHEMA-DRIFT-PROD`。数が違えば、どこが違うか追う） |

## ⚠️ H-3（持ち馬が全頭 休養）は、ここでは判定しません

`0021` が入っても、直るのは **ワーカーが次の週を送ったとき**です。
いま測れば「まだ休養中」が出ますが、**それは移行のせいではありません**。
→ **時刻を分けて測ります。** この便では**材料（持ち馬の数・休養中の数・最後に送った週）だけ**を出します。

⚠️ そして **ワーカーは 2026-08-20 の束のまま**です。直るのは「DB 側の例外が止まる」ところまでで、
新しいコードが要るものは**配備（⑥）まで直りません**。ここを混ぜないこと。
