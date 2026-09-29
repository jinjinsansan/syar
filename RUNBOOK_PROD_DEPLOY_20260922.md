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
- 🔴 ★**配備の前に `npx tsx tools/verify-worker-queries.mjs --env staging`**（★ワーカーの拾う問い合わせを staging の実 DB に投げる・★2026-09-29 に `pendingSettlements` の型の誤りで本番が 3 分止まった・偽の DB の網では出ない）。★exit 1 なら配備しない。
- 🔴 ★**`deploy.sh` は ★配備するコミットのものを使う**（★2026-09-29 の実例: ★VPS の `/opt/star` の checkout は `67b2971a` のままで、★置いてある `deploy.sh` は古い手順だった）。★置いてあるものを流すと ★**古い手順で新しい版を配る**ことになる。
  ```bash
  ssh -i ~/.ssh/pax_vps root@162.43.29.102 "cd /opt/star && git fetch origin --quiet && git show <sha>:tools/deploy.sh > /tmp/deploy-<sha>.sh && bash /tmp/deploy-<sha>.sh <sha>"
  ```
- ⚠️ ★配備の直前の周に ★旧プロセスが公示したレースは ★旧い版で作られる（★2026-09-29: 12609 は起動の 1 秒前に公示され R 番号のまま・★新しい版の効きは ★起動より後に公示されたレースで見る）。
- 🔴 ★**順番は ★移行 → ワーカー**（★`deploy.sh` が強制する・2026-09-28 に実測）: ★リリースに含まれる移行が DB に未適用なら ★スキーマ照合で ★配備を中止します（★リンクは張り替えず 停止時間 0・`/var/log/star-deploy.log`）。
  ★だから ★ワーカーは ★「DB が自分より新しい」状態で 必ず一度は動きます。★移行が新しい分類を足す便では ★ワーカーが知らない分類を受け取っても ★落ちない・黙らない作りにしておくこと（★`apps/worker/src/daily-flow.ts` の見出し）。
  ⚠️ ★`0094` の見出しの「ワーカー → 移行」は誤りです（★適用済みの移行はチェックサムで守られているので書き換えず、★ここと `daily-flow.ts` で正しています）。
- 1 周の確認（`RUNBOOK_PROD_RECOVERY_20260920.md` ⑦ と同じ作法。is-active だけで済ませない）:
  | # | 見るもの | 出なければ |
  |---|---|---|
  | 1 | `[worker] cycle=` が 1 件以上 | 配備の失敗。`deploy.sh` が戻したことを確かめる |
  | 2 | `[worker] 週送り` の行 | 週送りが止まっている |
  | 3 | 配合の行（NPC の週次配合・プレイヤーの配合の件数） | 配合が走っていない |
  | 4 | `失敗` の行が 0 | 止めて報告 |
  | 5 | ★**最初の週送りの周の `[worker] 周の全体=…s(…%)`** を記録する（`6451f98` で足した行・週送りと配合を含む） | ★**100% を超えたら止めて報告**（裁定 `REVIEW_PROD_DEPLOY_ORDER_20260922.md` §6）。超えたときの振る舞いは `REPORT_STAGING_WORKER_RUN_20260922.md` §8。★**超えたら、`[worker] ★発売の遅れ cycle=… +…s` の行の秒数も報告**（発売の時間がそのぶん短くなった・裁定 §7） |

- ★**ワーカーの版を DB 側から確かめる（★SSH は使わない）**（★移行 `0092` を当てた後・★2026-09-28）:
  ```bash
  npx tsx tools/verify-deployed-build.mjs --base https://star-two-chi.vercel.app --expect <画面の sha> --expect-worker <deploy.sh に渡した sha（40 桁）>
  ```
  | # | 見るもの | 出なければ |
  |---|---|---|
  | 6 | ★`★ワーカー : <sha>（最後の周 … 秒前）` が ★期待の版と一致し、★最後の周が 12 分（2 周）以内 | ★読めない（`worker: null`）なら ★`0092` が当たっていないか ★ワーカーが古い。★食い違いなら ★deploy.sh がまだ（★git push ではワーカーは入れ替わらない） |
  ⚠️ ★healthz は ★DB が読めなくても 200 で画面の sha を返します（★worker だけ null）。★画面の確認は ★それで止まりません。
  ⚠️ ★版は ★`/opt/star-current` の実体の末尾から読みます。★40 桁でなければ `unknown` と書きます（★その場合は ★deploy.sh 以外の入れ方をした疑い）。

### ⑥ の記録: ★本番のワーカーが main より後ろにいる（★2026-09-28・効く変更は 0）

★本番のワーカー ＝ ★`b583ce2`（★2026-09-27 00:05 JST に配備・`/var/log/star-deploy.log`）／★main ＝ ★`71e7d9c`（★2026-09-28 push）。
★`b583ce2..71e7d9c`（79 コミット）のうち ★ワーカーが読む所（★`apps/worker` と `@star/betting` `breeding` `race-engine` `scheduler` `sim-engine` `training`・★package-lock）に触るのは 3 本で、★**どれもワーカーに効かない**:

| コミット | 触った所 | 効かない理由（★検算の仕方） |
|---|---|---|
| `a77bca9` | `packages/betting/src/ep-grants.ts`（daily 200 → 2000） | ★ワーカーは ep-grants を読まない（★`grep -rn "ep-grants\|EP_GRANT\|dailyEp" apps/worker/src` が 0）。★額は SQL の `ep_grant_amount`（`0091`・適用済み）が持つ |
| `8e13ab9` | `packages/race-engine/src/watch.ts`・`packages/scheduler/src/race-setup.ts` | ★引数の型を狭めただけ（振る舞いは同じ）。★ワーカーは `replayOf` `boundaryTimesOf` `finalOrderMatches` `raceSetupFor` を使わない（★`grep -rn "raceSetupFor\|replayOf\|boundaryTimesOf\|finalOrderMatches" apps/worker/src` が 0） |
| `bb7278e` | `packages/scheduler/src/birth-week.ts` | ★`gameMonthOf` を足しただけ（★`git show --stat bb7278e` で ＋17・−0） |

★範囲の数え方: `git log --oneline b583ce2..71e7d9c -- apps/worker packages/betting packages/breeding packages/race-engine packages/scheduler packages/sim-engine packages/training package-lock.json`
⚠️ ★`race-engine` の package.json は `@star/render` を挙げるが ★ソースは読まない（★`grep -rn "from '@star/render'" packages/race-engine/src` が 0）。★render の変更は ★ワーカーに届かない。
⚠️ ★次にワーカーの読む所へ触るコミットが main に入ったら ★この表は古くなる。★その日は ★`deploy.sh` で入れ替えるか ★この表に足すこと。

#### ⑥ ★押した後に流す（★2026-09-29 から・記録を手で書かない）

`git fetch origin && node tools/verify-worker-lag.mjs --base https://star-two-chi.vercel.app` → ★終了コード 0 = 効く変更 0 ／ 1 = 要判断 ／ 2 = 分からない。★下の手書きの記録は ★検算のために残す。

#### ⑥ の記録（追記・★2026-09-29）: ★ワーカー `5643601`・★画面 `9d9689d` ── ★後ろだが効く変更は 0

★healthz（★2026-09-29 16:55Z 頃）: ★web `9d9689d`・★worker `5643601`（★2026-09-28 の配備）。
★`git log --oneline 5643601..9d9689d -- apps/worker packages/betting packages/breeding packages/race-engine packages/scheduler packages/sim-engine packages/training` → ★**0 件**（★範囲は 10 コミット・すべて画面・網・簿・道具）。
★`git diff --stat 5643601..9d9689d -- package.json package-lock.json db/ tools/deploy.sh` → ★**空**（★依存・移行・配備の道具も動いていない）。
→ ★入れ替えは要らない。★上の表（`b583ce2..71e7d9c`）は ★それより前の範囲の記録として残す。

#### ⑥ の記録（追記・★2026-09-29 夕）: ★ワーカー `5643601`・★画面 `46d7930` ── ★`verify-worker-lag` は exit 1、★判断は配備不要

★2 件が引っかかった: ★`c8c4cff`（`apps/worker/src/training-runner.ts`）は ★**註記と警報の文だけ**（+4/−4）・★`7ac7134` の `0096` は ★**DB 側で本番に適用済み** ＝ ★**ワーカーのコードは変わっていない**。★依存・配備の道具は 0 件。
⚠️ ★**本番のワーカーは、いまも古い警報の文「（Q-P3-23 の裁定待ち）」を出します**（★裁定は `REVIEW_EP_BUDGET` 09-29 で確定済み）。★**次にワーカーを配備する用事が出た日に一緒に乗せる**（★忘れると、★存在しない裁定待ちを指す文がログに残り続ける）。

## ⑦ 画面（main への push）

### 🔴 押す前に: その画面が呼ぶ DB の口が、本番に在るか

> ★**2026-09-24 に順が逆になりました**（★レビュー側の裁定 `REVIEW_0077_AND_SCREEN_ORDER_20260924.md`）。
> ★`/stable/foal` を `main` に push した時点で、★その画面が呼ぶ `initial_breeding_dams`（`0077`）が
> ★**本番にありませんでした**。★開くと「候補を読み込めませんでした」になります。
> ★害が小さかったのは ★**たまたまリンクを 1 本も張っていなかった**からです。

★押す前に、★**画面が呼ぶ関数が本番に在るか**を確かめる:

```bash
npx tsx tools/verify-screen-rpcs-live.mjs --env production
```

- ★`apps/web/src` の `.rpc('…')` を原文から拾い、★その名前が本番に在るか・★`authenticated` が
  ★呼べるかを ★**読むだけ**で確かめます（★一覧を手で書きません）。
- ✅ ★2026-09-24 の実測: ★本番・staging とも ★**16/16 合格**。
- ⚠️ ★**引数の形までは見ません**（★名前だけ）。★引数を変えた移行は、これでは捕まりません。
- ★順番は ★**移行 → 画面**。★逆にすると、★画面だけ在って動かない状態になります。

```bash
git push origin <0 で控えた sha>:refs/heads/main

# 🔴 ★**push できたかは、★終了コードで判定しない**（★下の ⚠️）
git ls-remote --heads origin main        # ← ★ここの sha が、★控えた sha と一致して初めて「押せた」

npx tsx tools/verify-deployed-build.mjs --base https://star-two-chi.vercel.app --expect $(git rev-parse <sha>)
```
- 🔴 ⚠️ ★**`git push` の終了コードを成功の判定に使わない。** ★`git ls-remote` の sha で確かめる。
  ★2026-09-24 の実例（★同じ日に 2 度）:
  ```
  fatal: unable to access '…': Could not resolve host: github.com   ← ★2 回とも失敗
  [exited with code 0]                                              ← ★なのに 0
  ```
  ★このときリモートは 1 つ前のままで、★「押せた」と読んでいたら ★**本番に出ていないものを出たと報告**していました。
  ★資格情報の窓で止まる形（★このセッションからは押せない）でも、★終了コードは当てになりません。
- ⚠️ `--expect` は **完全な 40 桁**で渡す（短い sha を渡すと、中身が同じでも「食い違っています」と出る・2026-09-23 に実際に出た）
- push は HEAD ではなく**控えた sha を名指し**する（記憶「共有ツリーでの push は HEAD を送る」）。このセッションからは資格情報の窓で止まることがあるので、止まったらオーナーに依頼する。

## ⑧ 🔴 関門: 利用者の目で、公開ビューを 1 本ずつ読む（★通らなければ配備は未完了）

> ★**2026-09-27 に足しました**（★裁定 `REVIEW_INC_PROD_PERMISSION_20260927.md` §4）。
> ★09-26 の配備の確認は ★「関数が 7/7 在る」「列が在る」を ★**service role で**見ました。★**利用者が読めるか**は見ていませんでした。
> ★その結果 ★`my_horses`・`retired_horses_public`・`horse_market_listing_public` が ★本番で
> ★「permission denied for table race_entries」でした（★`0086` の関数が definer でない・★直しは `0090`）。
> ★★**権限は、通る道のいちばん狭い所で決まります。** ★「在る」「辿れる」とは別に、★「読める」を見る段です。

```bash
npx tsx tools/verify-user-eyes.mjs --env production
```

- ★`anon` と ★`authenticated`（★馬を持つ実在の利用者 1 人の `auth.uid()`）で、★利用者に `select` を与えたビューを ★**全部の列ごと**読みます。
  ★1 本ごとに ★`rollback` するので ★DB は変わりません。
- 🔴 ★**`🔴` が 1 本でもあれば ★配備は未完了**。★画面を出さない・★出していたら戻すかを判断する。
- ⚠️ ★**`count(*)` で確かめないこと** — ★使われない列の関数は ★呼ばれず、★壊れていても「読めた」と出ます
  （★2026-09-27 に staging で実際にそう出ました。★`select *` にして初めて 5 本が落ちた）。
- ⚠️ ★**0 行は ★`select *` でも「読める」の証明になりません**（★行が無ければ列の式は評価されない・★`count(*)` と同じ理屈の双子）。
  ★道具は ★0 行のビューが呼ぶ `public` の関数を ★**同じ役で直に呼び**、★通るかを見ます。★関数を呼ばないビューは ★「対象外」と出します。
  ★引数を作れない関数・★`volatile` の関数は ★「確かめられない ＝ 不合格」です（★「判定不能」という 3 つ目の状態は作らない・裁定 §5）。
- ✔ ★staging の実測（2026-09-27）: ★`0090` の前 ★**読めない 5 本** → ★後 ★**0 本**（★対象外 2 本 ＝ `prize_catalog_public` が 0 行・関数を呼ばない）。
  ⚠️ ★「0 行のビューの関数を直に呼ぶ」道は ★staging では 1 度も通っていません（★0 行で関数を呼ぶビューが無い）。
- ⚠️ ★**公開関数（RPC）は ★この道具では読みません**（★引数が要る）。★名前と実行権は ⑦ の `verify-screen-rpcs-live.mjs`、
  ★「ビューが呼ぶ関数の権限」は ★網 `apps/cli/test/view-function-invoker-rights.test.ts` が原文で見ます。

### ⑧b 🔴 関門: 騎手の名簿（★画面の料金 ＝ サーバーが引く料金）

> ★**2026-09-28 に足しました**（★レビュー側の依頼・`0093` と同じ便）。
> ★画面は TS の `JOCKEYS` で料金を出し、★出走登録は ★DB の `jockeys.fee_ep` を引きます。
> ★網 `jockey-roster-sql.test.ts` は ★移行 `0082` の原文しか見ないので、★**生きている行が動いたら見えません**。

```bash
npx tsx tools/verify-jockey-roster-live.mjs --env production
```

- ★id・name・fee_ep・calm と ★人数を突き合わせます。★ずれが 1 件でもあれば ★非ゼロで終わる。★**DB が 0 人でも不合格**（★R-21）。
- ★`select` だけ（★分類簿は READONLY）。★service role で読むので ★`0093` で表を閉じた後も読めます。
- ✔ ★実測（2026-09-28）: ★staging・本番とも ★6 人・ずれ 0。
  ★変異（★写しの問い合わせだけ変えて staging で）: ★料金 +100 → ★exit 1（`j-aoi: 料金 TS 200 / DB 300`）／ ★0 行 → ★exit 1。

## ⑨ 🔴 関門: スマホ幅で 実物を測る（★横あふれ ／ ★44px 未満の操作）

> ★**2026-09-27 に足しました**（★裁定 `REVIEW_UI_AUDIT_20260927.md` 追記・★守りの主を ★原文の検査から ★実測へ）。
> ★安全網（`globals.css`）の多くは ★inline style の ★部分一致（`[style*="display:flex"]` など）で当てています。
> ★画面側で後から描いた要素は ★ブラウザが ★`display: flex;`（★コロンの後に空白）に直すので、★**黙って外れます**
> ★（★簿 `INLINE-STYLE-SELECTOR-MISSES-CLIENT-RENDER`）。★網 `mobile-css-anchors` は ★原文しか見られません。
> ★**綴りが外れても、実測なら見つかります。**

```bash
AUDIT_BASE=https://star-two-chi.vercel.app npx tsx tools/verify-mobile-layout.mjs --widths 390 --taps
```

- ★**記録する 2 つの数**: ★「★横あふれが出た組み合わせ」の数 ／ ★「★44px 未満の操作」が 0 でない画面とその内訳。
- ★基準（★2026-09-27・`next start`・390px）: ★横あふれ ★**0 / 37**・★44px 未満 ★**全画面 0**（★`/race` は ★`stageMinPx` の後で 360/390/430 とも 0）。
- 🔴 ★どちらかが ★基準より増えたら ★配備の報告に ★画面名と内訳を書く（★黙って通さない）。★直すかは ★レビュー側が決める。
- ⚠️ ★本文の文字リンク（★display が inline の a）は ★数えません。★ボタンの形のリンクは ★数えます（★線引きは道具の註記）。
- ⚠️ ★Git Bash では ★`--path /race` の `/race` が ★Windows の道に書き換わり ★0 画面になります。★`MSYS_NO_PATHCONV=1` を前に付ける。
- ⚠️ ★ログインの要る画面は ★ログインしていない姿で測ります（★道具はログインしない）。
  🔴 ★**数の射程**: ★「0 / N」は ★**未ログインの姿**の数です。★ログインが要る画面の中身（★投票の中身・馬の詳細 等）は ★含みません（★案内だけ）。★記録するときは ★この射程を並べて書く（★2026-09-28・レビュー側・簿 `LAYOUT-AUDIT-LOGGED-OUT-ONLY`）。
- ★動的な経路（★レース詳細・投票・オッズ・馬の詳細）は ★`--rid <実在のレース id>` / `--hid <馬 id>` を渡したときだけ測ります（★既定なし・★渡さなければ「測っていない」と名前で出る）。
  ★2026-09-28 の本番: ★`--rid`（帯の「詳細」の href から）で 3 本を足して ★0 / 40。★レース詳細の最小文字 ★7px（★R-16 の完了条件へ）。

## 後で（本番を読むだけ）

```bash
npx tsx tools/diag-owned-breeders.mjs --env production
```
- ① 持ち主のいる引退馬 ② 持ち主の馬を親に持つ NPC 馬 ③ 対照（引退馬の総数）④ 生涯 8 産に達した繁殖牝馬。
- ① か ② が 0 でなければ、NPC 側に既に生まれた仔の扱いを照会する（裁定 I-1 §2 ③）。
- NG 名のリストが届いたら `tools/recheck-name-blocklist.mjs`（当たりは未検査と別の値で残す・レビュー側の推奨）。
