# 報告: 本番で `my_horses` が「permission denied for table race_entries」— 2026-09-27

- 開発側 `star-ef` → レビュー側
- HEAD: `ce098fa`（未 push）。★**本番には何もしていません**（読みも書きもしていない）

## 1. 見えたもの（実物）

オーナーが手元の画面（本番の DB に繋がる開発サーバー `localhost:3210`）で本番の口座にログインしたところ、ダッシュボードに次の文が出ました（オーナーが貼ったもの・原文のまま）:

```
厩舎を読み込めませんでした
my_horses を読めませんでした: permission denied for table race_entries
```

## 2. 原因（移行の原文から・★DB は読んでいません）

- `0086_horse_record_one_place.sql` で、`horse_wins(uuid)` / `horse_starts(uuid)` を作りました。どちらも `language sql stable` で、**`security definer` がありません**（呼んだ人の権限で走る）
- 同じ移行の 18 行目の註記: 「★`security definer` にしません — ★呼ぶ側（view・関数）の権限で走ればよく」
- 🔴 **ここが誤りです。** PostgreSQL では、ビューの持ち主の権限が効くのは、**ビューが直に参照する表**だけです。ビューの中から呼んだ関数は、**画面を開いた利用者（`anon` / `authenticated`）の権限**で走ります
- 利用者は `race_entries` を読めません（`0006_public_views.sql:37` `revoke all on race_entries from anon, authenticated`）→ 関数の中で落ちます
- 2026-09-26 の本番配備（`0079`〜`0089`）で本番に入りました

## 3. 影響の範囲（移行の原文から数えた）

| ビュー / 関数 | 呼んでいる所 | 読む画面 | 見立て |
|---|---|---|---|
| `my_horses` | `0087:70-72` | ダッシュボード・厩舎・出走登録 | 🔴 **落ちる（実物で確認）** |
| `retired_horses_public` | `0086:68-69` | 引退馬 | 🔴 落ちるはず（未確認・`anon` でも） |
| `horse_market_listing_public` | `0086:94-95` | 市場（09-26 に実データへ繋いだもの） | 🔴 落ちるはず（未確認・`anon` でも） |
| `my_retired_horses()` | `0086:167-168` | 引退馬（自分の） | ✅ 関数そのものが `security definer`（`0086:138`）なので通るはず |
| `enter_race` | `0088:90` | 出走登録の RPC | ✅ `security definer`（`0088:29`）なので通るはず |

- ✅ `my_runs`（`/records`）は関数を呼ばず、ビューの中で `race_entries` を直に数えているので（`0056`）、影響を受けないはずです。録画の読み込みも関数を使っていません
- ⚠️ staging も同じ移行を当てているので、同じように落ちているはずです（未確認）

## 4. なぜ網が捕まえなかったか（見立て）

- 網は SQL の原文と、関数の中身を読むだけです。「**利用者の権限でビューを読む**」ことを試す網がありません
- 本番の読み取り確認（`claim_daily_ep` 等 7/7 在る）は「在る」を確かめたもので、「利用者が読める」は確かめていませんでした（簿 `green-for-the-wrong-reason` の族）

## 5. 直し方の案（★まだ作っていません・★裁定を待ちます）

- 移行 `0090`: `alter function public.horse_wins(uuid) security definer;` と `horse_starts(uuid)` を同様に（`search_path` は既に固定済み `0086:27,41`）
  - 返すのは馬ごとの勝利数と出走数だけです。これは `retired_horses_public` が既に `anon` に見せている値なので、新しく見えるようになるものはありません（D-114「強さの手がかりはオッズと戦績だけ」）
  - `0086` の 18 行目の誤った註記も、`0090` の中で訂正を書きます（適用済みの移行は書き換えない・簿 `mutation-must-reach-the-target`）
- 網 1 本: 「利用者に `select` を与えたビューが呼ぶ関数は、`security definer` であるか、利用者が読める表だけに触れる」を移行の原文から見る。対照（`0086` の形を落とす）つき
- staging で `authenticated` として `my_horses` を読み、落ちる → `0090` を当てて通る、を確かめる（★開発側の権限で staging を読めるかは未確認。止められたらオーナーの端末へ）
- 本番への適用はオーナーの承認事項です

## 6. 照会 Q-INC-1

- 上の直し方（`security definer` にする）でよいか。あるいは、関数をやめてビューに数え方を戻すか（D-052「数え方を 1 か所に」と引き換え）
- 本番への適用の順序（`0090` だけを先に当てるか、段 2 D の配備と一緒にするか）
