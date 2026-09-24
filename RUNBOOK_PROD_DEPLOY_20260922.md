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

## ⚠️ 2026-09-23 に 1 度 通した（`86040e0`）

★実績は `REPORT_PROD_DEPLOY_20260923.md`。★次に流すときは、下の各段の「期待」を、その報告の実績と見比べること。

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
- 🔴 **2026-09-23 に「関門」から「記録」に変えた**（オーナー判断・「URL は誰も知りません」・D-120 追記）。★**止めない**。
- 記録するもの: ① `disable_signup` の値 ② 本番の口座の数（`auth.users` と `users`）。
- ★**口座の数が見込み（オーナーと、オーナーが招待した人だけ）より多ければ、そこで止めて報告する**。
- ⚠️ **閉じる期限**: 告知・景品交換・一般公開のうち、**いちばん早いものの前**に閉じる（オーナー判断）。
- 2026-09-23 の実績: ★**現在値は公開の枝に書かない**（運用の決め・2026-09-23）。★`private/REPORT_PROD_DEPLOY_20260923_details.md` を見る。

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
  | 5 | ★**最初の週送りの周の `[worker] 周の全体=…s(…%)`** を記録する（`6451f98` で足した行・週送りと配合を含む） | ★**100% を超えたら止めて報告**（裁定 `REVIEW_PROD_DEPLOY_ORDER_20260922.md` §6）。超えたときの振る舞いは `REPORT_STAGING_WORKER_RUN_20260922.md` §8。★**超えたら、`[worker] ★発売の遅れ cycle=… +…s` の行の秒数も報告**（発売の時間がそのぶん短くなった・裁定 §7） |

## ⑦ 画面（main への push）

### 🔴 押す前に: その画面が呼ぶ DB の口が、本番に在るか

> ★**2026-09-24 に順が逆になりました**（★レビュー側の裁定 `REVIEW_0077_AND_SCREEN_ORDER_20260924.md`）。
> ★`/stable/foal` を `main` に push した時点で、★その画面が呼ぶ `initial_breeding_dams`（`0077`）が
> ★**本番にありませんでした**。★開くと「候補を読み込めませんでした」になります。
> ★害が小さかったのは ★**たまたまリンクを 1 本も張っていなかった**からです。

★押す前に、★**画面が呼ぶ関数が本番に在るか**を確かめる:

```bash
# ★画面が呼ぶ RPC を数える（★`.rpc('…')` を集める）
# ★その名前が本番に在るかを、読むだけで確かめる
npx tsx tools/verify-screen-rpcs-live.mjs --env production
```

- ⚠️ ★**この道具はまだありません**（★次の便で作ります・レビュー側の条件）。
  ★それまでは ★**目で突き合わせて**ください: ★新しい画面が `rpc('…')` で呼ぶ名前を挙げ、
  ★`db/migrations` のどの番号で足したかを見て、★その番号が本番に当たっているかを確かめる。
- ★順番は ★**移行 → 画面**。★逆にすると、★画面だけ在って動かない状態になります。

```bash
git push origin <0 で控えた sha>:refs/heads/main
npx tsx tools/verify-deployed-build.mjs --base https://star-two-chi.vercel.app --expect $(git rev-parse <sha>)
```
- ⚠️ `--expect` は **完全な 40 桁**で渡す（短い sha を渡すと、中身が同じでも「食い違っています」と出る・2026-09-23 に実際に出た）
- push は HEAD ではなく**控えた sha を名指し**する（記憶「共有ツリーでの push は HEAD を送る」）。このセッションからは資格情報の窓で止まることがあるので、止まったらオーナーに依頼する。

## 後で（本番を読むだけ）

```bash
npx tsx tools/diag-owned-breeders.mjs --env production
```
- ① 持ち主のいる引退馬 ② 持ち主の馬を親に持つ NPC 馬 ③ 対照（引退馬の総数）④ 生涯 8 産に達した繁殖牝馬。
- ① か ② が 0 でなければ、NPC 側に既に生まれた仔の扱いを照会する（裁定 I-1 §2 ③）。
- NG 名のリストが届いたら `tools/recheck-name-blocklist.mjs`（当たりは未検査と別の値で残す・レビュー側の推奨）。
