# 報告: I-1 段 1（Q-4）— NPC の配合から持ち主の馬を外す — 2026-09-22

> 開発側 → レビュー側。裁定 `REVIEW_I1_RETIREMENT_ROLE_VERDICT_20260922.md` §2・§4・§5-1 への対応。
> 開始時の HEAD `e81cd78`。本番には触れていません（本番の読み取りは §4 の 1 コマンドをオーナーに渡します）。push はしていません。

## §0 一行

NPC の配合が繁殖馬を拾う 4 つの select（母・種牡馬・枠の数え・補充）に `owner_id is null` を足した。
staging の予行で「持ち主の母と種牡馬からは 0 頭、NPC どうしからは 12 頭」。絞りを外すと予行が赤になる（母・種牡馬それぞれで確認）。

## §1 変えたもの

| ファイル | 変更 |
|---|---|
| `apps/worker/src/breeding-runner.ts` | 母の一覧・種牡馬・枠の数え（`have`）・補充の候補の 4 か所に `owner_id is null` を追加 |
| `packages/training/src/retirement.ts` | 註記の「照会中」を閉じた（裁定 §4: 上がる条件は置かない・暫定）。`preferHonored` の接続は段 2 で行い、今は未接続であることも明記 |
| `apps/cli/test/breeding-runner.test.ts` | 繁殖の集合を拾う select が **ちょうど 4 つ**走り、4 つとも絞りを持つことを確認する試験。対照として、生涯 8 産で降ろす update が持ち主の馬にも掛かることを確認（Q-3） |
| `apps/cli/test/breeding-catchup.test.ts`・`breeding-runner.test.ts` | 偽の DB の照合文字列を新しい SQL に合わせた |
| `tools/verify-breeding-live.mjs` | 判定 ⑥ を追加。取引の中で、その週に番が来る産める NPC 牝馬 1 頭と種牡馬の半分に仮の持ち主を付けて 1 週を走らせ、必ず rollback する |
| `tools/verify-pool-supply.mjs` | 偽の DB を製品に追いつかせた（§3） |
| `tools/diag-owned-breeders.mjs`（新規・READONLY） | 持ち主のいる引退馬の数、持ち主の馬を親に持つ NPC 馬の数、対照（引退馬の総数）を出す。出すのは数だけ |
| `tools/lib/classification.mjs` | 上の道具を READONLY に登録 |

生涯 8 産で繁殖牝馬を功労馬へ降ろす処理（`breeding-runner.ts:449`）は、裁定 Q-3 に従い**絞っていない**。持ち主の馬も同じ規則で降ろす。ただし本人に知らせる仕組みはまだ無く、段 3 で作る。

## §2 確かめたこと

- 単体試験: 種牡馬の絞りを 1 か所外すと赤、戻すと緑。
- staging の予行（`npx tsx tools/verify-breeding-live.mjs --env staging`）: ①②③④⑤⑥ の 6 件すべて合格（週 272、生まれた 12〜13 頭）。
  - 正: 持ち主の母 1 頭 → 0 頭 ／ 持ち主の種牡馬 104 頭 → 0 頭 ／ NPC どうし 12 頭
  - 母の絞りだけ外す: 持ち主の母 → **1 頭** → ⑥ 赤
  - 母と種牡馬の絞りを外す: 持ち主の種牡馬 → **5 頭** → ⑥ 赤
  - ⚠️ 最初の版の ⑥ は**母の側が空回り**していた。ワーカーは「1 つ前の週」（`weekIndexAt(...) - 1`）を処理するのに、道具はその週で母を選んでいたため。週を合わせたうえで、「選んだ週 ＝ 処理した週」がずれたら判定不能とするようにした。
  - 仮の持ち主を付ける際は `npc_stable_id` も空にした（制約 `horses_owner_xor_npc`）。
- 頭数は rollback の後に元へ戻った（7,370 → 7,370）。
- 門: 通過（検査 2,830 件・赤 3 件／登録 3 件）。前面で流し、終了コードは 0。

## §3 🔴 `verify-pool-supply` は `fca33da` から走らなくなっていた（開発側の見落とし）

- 追いつきに週ごとの取引を入れた `fca33da`（I-2 の直し）以降、偽の DB が `begin` を知らずに落ちていた。当時この道具を流していなかった。
- 同じく I-2・I-3 で足した問い合わせ（`to_regclass`、`information_schema.columns`、`select name from horses`）にも答えられていなかった。
- 直し方: `begin`／`commit` は受け付ける。`rollback` は回数を数え、1 回でもあれば判定 ⑤ で落とす（偽の DB は取引を再現しないため）。下書きの表と `name_key` の列は「無い DB」として答える。名前は行に控える。
- 結果（`--years 12 --policy random`）: ①〜⑤ の 5 件とも合格。rollback 0 回。
- **対照**: 絞りだけを外したコードで同じ道具を流すと、出力は時間の行を除き**一字一句同じ**だった。この世界には持ち主の馬がいないので、当然の結果。裁定 §2 ② の「数はほぼ動かない」を、「まったく動かない」として確かめた。
- ⚠️ 前回（`evidence/20260921-pool-supply/random-12y.log`）とは最後の現役頭数が違う（2,028 → 2,400）。今日の絞りによる差ではない（上の対照による）。09-21 以降の別の変更（繁殖牝馬の目標）によるものと見ているが、**原因は突き止めていない**。

## §4 本番の読み取り（オーナーに渡す 1 コマンド）

```
npx tsx tools/diag-owned-breeders.mjs --env production
```

staging の結果: ① 持ち主のいる引退馬 0 頭 ／ ② 持ち主の馬を親に持つ NPC 馬 0 頭 ／ ③ 対照: 引退馬 4,982 頭。
本番で ① か ② が 0 でなければ、裁定 §2 ③ に従い、NPC 側に既に生まれた仔の扱いを別に照会する。

## §5 次

1. 段 2: 持ち主の馬に `preferHonored = true` を渡す（牡牝 × 持ち主の有無の 4 通りの試験）
2. 段 3: 別表・RPC・ワーカーの確定・降ろしたことの通知 → staging の予行
3. 案 B の模擬（`training-career.ts` に開始週の引数を足したところで中断中・この便には含めていない）

---

## §6 段 2（2026-09-22 追記）— 持ち主のいる馬は、引退したら功労馬が既定

- `apps/worker/src/training-runner.ts`: 純関数 `prefersHonored(owner_id)` を出し、週送り（`advanceWeek`）に `preferHonored: prefersHonored(row.owner_id)` を渡す。NPC の馬はこれまでどおり性別に応じて繁殖入りする。乱数は消費しないので、着順・経済・NPC の供給は動かない。
- `packages/training/src/week.ts`: `preferHonored` の註記「照会中」を閉じた。
- 試験 `apps/cli/test/retirement-role-owned.test.ts`: 本物の週送りで、牡牝 × 持ち主の有無の 4 通りを引退させる（持ち主あり → 功労馬 ×2、NPC → 種牡馬／繁殖牝馬 ×2）。加えて、ワーカーが渡していることを原文から確かめる。
  - 変異: 関数を常に false にすると 2 件赤、ワーカーが渡さないと 1 件赤。元に戻して緑。
- 門: 通過（検査 2,836 件・赤 3/登録 3・前面・終了コード 0）。
- 取引の境界は**変えていない**（裁定 §6 の新しい決めに従い明記する）。`advanceTrainingWeeks` の呼び出し元（`main.ts`・`scratch.ts`）と偽の DB の照合文字列には影響しない。SQL の文面も変えていない。
- ⚠️ 既に持ち主のいる引退馬が繁殖入りしている場合、その行は変えていない（staging は 0 頭。本番は §4 の 1 コマンドで数える）。
