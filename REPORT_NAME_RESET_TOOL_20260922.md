# 報告: 運営が馬名を戻す道具 — 2026-09-22

> 開発側 → レビュー側。裁定 `REVIEW_NAME_RESET_TOOL_VERDICT_20260922.md`（P-1〜P-5・§1・§2）。
> staging には `0072` を当てた。**本番には触れていない。** push していない。

## §0 一行

`tools/reset-horse-name.mjs`（既定は下見・`--rehearse`・`--apply`・本番の関門）、記録の表 `horse_name_resets`（`0072`）、部品 `tools/lib/name-reset.mjs` を入れた。
- 持ち主の居る馬は仮の名前「カリメイ＋5 文字」にする。
- NPC の馬は `generateHorseName` で普通の名前を引き直す（§2）。
- 利用者の命名は、接頭辞で始まる名前を `reserved_prefix` で弾く（§1 条件 1）。

staging の予行は、道具が 4 件（NPC の経路）、両方の経路を通す予行が 5 件で、どちらも全件合格。

## §1 変えたもの

| ファイル | 中身 |
|---|---|
| `packages/sim-engine/src/naming.ts` | `PROVISIONAL_NAME_PREFIX = 'カリメイ'`（定数 1 か所）<br>`provisionalHorseName(id, 回数)`: ID の 16 進と回数から決まるカタカナ 5 文字。乱数を使わない<br>`checkPlayerHorseName` に `reserved_prefix`（正規化した名前が接頭辞で始まる） |
| `db/migrations/0072_horse_name_resets.sql` | 記録の表。列は `owned`・`reason`（5 語）・`note`・`old_name_hash`（16 桁の形を制約で）・`new_name`・`checked_with`。revoke all<br>表の註記に「秘密にする仕組みではなく、平文を置かない仕組み」と書いた（§3）<br>`horses.name_checked_with` の註記を直した（`hit:<版>` を足した・§6 の宿題） |
| `tools/lib/name-reset.mjs` | `chooseNewName`（純関数・持ち主の有無で分ける・一覧と重複を通す・当たれば次の候補へ）<br>`planNameReset`（読むだけ）<br>`applyNameReset`（書く・`begin`/`commit` をしない・名前が読んだ後に変わっていたら書かない・読み直す） |
| `tools/reset-horse-name.mjs` | 道具。元の名前は出力しない（出すのは ID・持ち主の有無・新しい名前・元の名前が今の一覧に当たるか） |
| `tools/lib/args.mjs` | `productionNameResetOptInProblem`（`--yes-production`・`--reset-name`・`--expect-horse` に同じ ID をもう一度。違っても正しい ID は教えない） |
| `tools/verify-name-reset-live.mjs`（新規・必ず rollback） | staging に持ち主の居る馬がいないので、取引の中で仮の持ち主を付けて両方の経路を通す |
| `apps/worker/src/breeding-runner.ts` | `stableOfNumericId` を公開（NPC の厩舎の接頭辞を写さずに使うため） |
| 試験 | `naming.test.ts`（+5）・`player-naming.test.ts`（+1: ワーカーの確定で `reserved_prefix`）・`name-reset.test.ts`（新規 4）・`migrate-guard.test.ts`（+7: 関門） |
| 登録簿 | classification（STATE_CHANGING 2・COMPONENT 1）・tool-aftermath・exposure（`horse_name_resets` CLOSED）・registries・calibration（`PROVISIONAL_SUFFIX_CHARS` 免除）・no-potential-in-web（公開名 2） |

## §2 確かめたこと

- `verify-name-reset-live`（staging・5 件合格）:
  - ① 持ち主の居る馬は、1 つ目の仮の名前が一覧に当たるように渡した。2 つ目の「カリメイレムラナメ」になり、利用者の命名では付けられない形だった。版も書けた。
  - ② NPC の馬は、仮の名前ではなく普通の名前（「アグニルピリョサ」）になった。
  - ③ 元の名前が当たる一覧を渡すと「当たる」と言う。
  - ④ 記録は 2 行。理由・持ち主の有無・16 桁のハッシュが入っている。**元の名前の平文は、どの列にも無い**。
  - ⑤ 戻した後、記録の数と 2 頭の名前が元のまま。
- `reset-horse-name --rehearse`（NPC の馬・4 件合格）: 名前・版・記録 1 行、戻した後の記録の数。
- 単体: 仮の名前は 9 文字のカタカナで決定論。回数を進めると別の候補になる（20 回で 15 種類を超える）。半角で書いても接頭辞を弾く。**接頭辞が途中にあるだけなら弾かない**（対照）。
- 門: 通過（2,885 件・赤 3／登録 3）。

## §3 範囲外（裁定 P-4・P-5 のとおり）

- 本人への知らせと、本人の改名の経路は作っていない（提案 §2 段 2 の便）。
- 本番で書くのはオーナーの許可のもと。手順書には、この道具の段は入れていない（NG 名のリストが届いてから、1 頭ずつ使う道具のため）。
- 手順書の移行の範囲は、`0072` が増えたので 0066〜0072（7 件）に直した。
