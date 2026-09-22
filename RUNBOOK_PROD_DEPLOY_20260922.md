# 手順書: 本番配備（初回の馬・命名・血統の継承 I-1）— 2026-09-22

> 裁定 `REVIEW_PROD_DEPLOY_ORDER_20260922.md` §2 の順番で書く。**移行を全部当ててから、新しいワーカーを入れる。**
> 🔴 **どの段も、オーナーの直接の指示が出るまで実行しない。** レビュー側を通した「OK」は指示ではない。
> 🔴 **1 段でも期待と違ったら止めて報告する。** 次の段へ進んで取り返そうとしない。
> SSH の接続先・鍵は `RUNBOOK_PROD_RECOVERY_20260920.md` ③′ と同じ。このPCに鍵が無ければ、その段はオーナーが流す。

## 0. 始める前に

| 確かめること | コマンド | 期待 |
|---|---|---|
| 配備する sha | `git log --oneline -1`（検査を通した sha を名指しで控える） | 門（`npm run gate`）を前面で通した sha |
| 本番の未適用の移行 | `npx tsx tools/migrate.mjs --env production --plan` | 0060〜0072 が並ぶ。**0059 以前が並んだら止める**（前提が違う） |
| 本番のワーカーの版 | `/api/healthz`（画面）とは別に、VPS の `/opt/star-current` の sha | `24af9f2`（配合をしない版）。違えば止める |

## ① 血統の鍵を直す（`repair-pedigree-cache`）

```bash
npx tsx tools/repair-pedigree-cache.mjs --env production              # 下見。壊れている頭数 N を読む
npx tsx tools/repair-pedigree-cache.mjs --env production --apply \
    --yes-production --repair-pedigree --expect-broken <N>
```
- 期待: 道具自身が書いた後に読み直し、uuid でない鍵が 0 件。道具の終了コードが 0。

## ② 移行 `0060`〜`0065`（古いワーカーのまま）

```bash
npx tsx tools/migrate.mjs --env production --plan --to 0065          # 0060〜0065 の 6 件だけが並ぶこと
npx tsx tools/migrate.mjs --env production --yes-production --to 0065
```
- `--to` は 2026-09-22 に足した口（裁定 §2 条件 1）。`0066` の中の `raise` で止める形に頼らない。
- **古いワーカーが 1 周正しく回ることを確かめる**（裁定 §2 条件 2）:
  ```bash
  ssh … "journalctl -u star-worker --since '-15 min' --no-pager -o cat | grep -c 'cycle='"     # 1 以上
  ssh … "journalctl -u star-worker --since '-15 min' --no-pager -o cat | grep -c '失敗'"      # 0
  ```

## ③ 馬名の正規化キーを埋める（`backfill-name-key`）

```bash
npx tsx tools/backfill-name-key.mjs --env production                  # 下見。空の頭数 M と重なり 0 を読む
npx tsx tools/backfill-name-key.mjs --env production --apply \
    --yes-production --backfill-name-key --expect-null <M>
```
- 期待: 重なり 0・空の名前 0。書いた後に道具が読み直して一致。本番の下見（09-22）では 7,370 頭・正規化して重なり 0。

## ④ 移行 `0066`〜最後（`0067`〜`0072` を含む）

```bash
npx tsx tools/migrate.mjs --env production --plan                     # 0066〜0072 の 7 件だけが並ぶこと
npx tsx tools/migrate.mjs --env production --yes-production
```
- `0066` は直前に `name_key` の空を数え、1 件でもあれば止まる → ③ に戻る。
- `0069` で、生涯 8 産で降ろすときの理由が制約で許される。これより前に新しいワーカーを入れると、8 産に達した牝馬が出た年の頭に配合が止まる（裁定 §1）。
- **古いワーカーが 1 周正しく回ることを、もう一度確かめる**（② と同じ 2 行）。`0066` の `name_key not null` は、古いワーカーが `horses` に行を足さないので当たらない**見込み**。見込みなので、ここで確かめる。
- ⚠️ `0067` の後、**それ以前に作ったアカウントは `legacy`** になる（新しい導入の画面は出ない）。新しい流れを試すには、新しいアカウントが要る。

## ⑤ 🔴 関門: 一般登録が閉じているか

```bash
npx tsx tools/read-auth-settings.mjs --env production
```
- **`disable_signup = true` でなければ止める。** 移行だけ当たった状態で止まっても害は無い（要求が積まれても、処理するワーカーが居ないので、無償の配合は渡らない）。
- 閉じ方と招待の段取りは、レビュー側がオーナーに渡している（裁定 `ad2da90`）。

## ⑥ 新しいワーカーを入れる（`deploy.sh`）

```bash
bash tools/deploy.sh <0 で控えた sha>
```
- 1 周の確認（`RUNBOOK_PROD_RECOVERY_20260920.md` ⑦ と同じ作法。is-active だけで済ませない）:
  | # | 見るもの | 出なければ |
  |---|---|---|
  | 1 | `[worker] cycle=` が 1 件以上 | 配備の失敗。`deploy.sh` が戻したことを確かめる |
  | 2 | `[worker] 週送り` の行 | 週送りが止まっている |
  | 3 | 配合の行（NPC の週次配合・プレイヤーの配合の件数） | 配合が走っていない |
  | 4 | `失敗` の行が 0 | 止めて報告 |
  | 5 | ★**最初の週送りの周の `[worker] 周の全体=…s(…%)`** を記録する（`6451f98` で足した行・週送りと配合を含む） | ★**100% を超えたら止めて報告**（裁定 `REVIEW_PROD_DEPLOY_ORDER_20260922.md` §6）。超えたときの振る舞いは `REPORT_STAGING_WORKER_RUN_20260922.md` §8 |

## ⑦ 画面（main への push）

```bash
git push origin <0 で控えた sha>:refs/heads/main
npx tsx tools/verify-deployed-build.mjs --base <本番の URL> --expect <sha>
```
- push は HEAD ではなく**控えた sha を名指し**する（記憶「共有ツリーでの push は HEAD を送る」）。このセッションからは資格情報の窓で止まることがあるので、止まったらオーナーに依頼する。

## 後で（本番を読むだけ）

```bash
npx tsx tools/diag-owned-breeders.mjs --env production
```
- ① 持ち主のいる引退馬 ② 持ち主の馬を親に持つ NPC 馬 ③ 対照（引退馬の総数）④ 生涯 8 産に達した繁殖牝馬。
- ① か ② が 0 でなければ、NPC 側に既に生まれた仔の扱いを照会する（裁定 I-1 §2 ③）。
- NG 名のリストが届いたら `tools/recheck-name-blocklist.mjs`（当たりは未検査と別の値で残す・レビュー側の推奨）。
