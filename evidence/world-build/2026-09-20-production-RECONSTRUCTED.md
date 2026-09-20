# 🔴 本番の世界の素性 — ★**手で書き起こしました**（★道具が落ちて残せなかったため）

⚠️ **これは道具が出した JSON ではありません。** `tools/seed-world.mjs` が
**判定 4 つを全部 通した後**、素性を書き出す所で落ちたため、記録が残りませんでした。
下の値は **その実行の端末出力から書き起こしたもの**です。**機械が出した証跡ではありません。**

## 何が落ちたか

```
ReferenceError: environment is not defined
    at tools/seed-world.mjs:735
```
- 原因: 本番の関門を足したとき、`const environment` を **`connectDb()` の中**に置いてしまい、
  外（素性の書き出し）から見えませんでした。**世界には影響しません**（落ちたのは全部 終わった後）。
- 🔴 **そして終了コードが `0` と表示されました。** `| tail -40` に通していたので、
  **`tail` の終了コード**が出ていました（★`read-the-tools-own-exit-code` と同じ罠・同じ日に 2 度目）。
- ✅ 直しました（`dbEnvironment` を外に出した）。

## 実行

```
npx tsx tools/seed-world.mjs --env production --yes-production --wipe-world \
  --expect-horses 7355 --allow-all-names --wipe-races
```

| 欄 | 値 |
|---|---|
| 環境 | **production** |
| 種 / 世代 | 20260833 / 50 |
| 基準の週 | **259** |
| 投入 | **7,370 頭**（598.4 秒） |
| tally | 現役 2,400 / 種牡馬 200 / 繁殖牝馬 800 / 功労馬 3,970 |
| 追いつき | 16 周・延べ **248,045 頭週**・引退 **6 頭**・**184 秒** |
| 消した行 | `truncate` 1 文 **0.1 秒** / 合計 **15,670,404 行**（`race_odds` 15,576,415 ／ `race_entries` 80,442 ／ `races` 6,192 ／ `horses` 7,355） |
| 繋ぎ直し | **0 回** |
| 🔴 **nameCheckSkipped** | **true**（`--allow-all-names`。`data/ng-names.txt` が無い） |
| nameBlocklistSize | 0 |

## 🔴 この世界は、弁護士に見せる構成には使えません

名前が **一度も NG 判定を通っていません**（憲法 §0.1 / 正典 §17.2 C-4）。
**名前リストが届いたら ④′ で作り直します。** それまで「見せられる」と読まないこと。

## 判定（道具が出したもの）

```
✓ ①  birth_week が無い馬が 0 頭                              （PROD-NEVER-AGED）
✓ ②a reason=age 4,970 頭 / 期待 4,970 頭                      （SEED-NOT-RETIRED）
✓ ②b 現役 2,394 ＋ 追いつき中の引退 6 ＝ 2,400 / プリシード 2,400
✓ ③  現役の birth_week が 156 種類                            （SEED-LOCKSTEP）
DB: total 7,370 / with_sire 6,980 / lines 40 / active 2,394 / aged_retired 4,970
    no_birth_week 0 / active_birth_weeks 156
実現率 mean(stats/potential)（能力値ごと）: 全馬 0.4369（n=36,850） / 現役 0.6907（n=11,970）
```

## ⚠️ 測れなかったもの

- **プリシード生成の秒数**: `| tail -40` で先頭が切れたため**読めません**。推測で埋めません。
