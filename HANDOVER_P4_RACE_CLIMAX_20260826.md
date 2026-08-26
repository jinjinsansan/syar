# 引継ぎ書 — P4 レース終盤の再構築（次のセッションはここから）

作成: 2026-08-26 / 開発側 Claude Code → 次のセッション
対象指示書: `DEV_INSTRUCTIONS_P4_RACE_CLIMAX_REBUILD_20260826.md`
報告書（数字はすべてここ）: `REPORT_P4_RACE_CLIMAX_REBUILD_20260826.md`
ブランチ: `p4/race-30sec-cuts` / HEAD `8c7203d` / ★**すべて未コミット**

---

## ★0. いちばん最初にやること（オーナー）

### 0-1. 開発サーバーを立てる

```powershell
cd V:\dev\Cusor\star\apps\web
npm run dev
```

★**ポート 3210 は空けてあります。** 撮影のためにこちらで一時的に起動していた
dev サーバー（PID 26360 / 18:22 起動）は**停止済み**です。

⚠️ ★`npm run build` は流さないでください（dev と同時に `apps/web/.next` を触ると壊れます）。

### 0-2. 見る（この 2 つを見比べるのが今回の主題）

| URL | 何が見えるか |
|---|---|
| http://localhost:3210/race | ★**修正後**（現行） |
| http://localhost:3210/race?climax=off | ★**修正前**（直線の演出とカメラの直しを両方切る） |

★seed は画面の数値入力欄で切り替えます。**推奨 seed: 42 → 14 → 332 → 474**。

### 0-3. ★どこを見ればいいか（seed 42・表示秒）

| 表示秒 | 何が起きるはず |
|---:|---|
| 17.4s | side-drive → **第4コーナー**（ハードカット） |
| 17.4〜18.7s | ★**4 角の 1.33 秒。** 馬がカクつかないか・1 コマで別の絵に入れ替わらないか・左右が裏返らないか |
| 18.7s | 4 角 → **最後の直線**（ハードカット） |
| 26〜32s | ★**主役 5 頭が寄ってくる**（残り 400→260m で寄せが掛かる） |
| 31.9s〜 | ★**先頭が入れ替わって見える**（seed 42 は通算 3.83 秒） |
| 38.5s | 直線 → **ゴール前**（ハードカット） |
| 38.5〜43.5s | ★**決着の 5 秒。** ここが今回いちばん大きく変わりました（前は画面内 2 頭 → いま 6 頭） |
| 43.5s | ゴール → ★**勝馬クローズアップ**（ハードカット・馬体が画面高の 39.8%） |
| 43.5〜48.7s | 勝馬の寄り 5.23 秒 ★**ここだけ指示書 §5-4 の上限を超えています**（下の §2-1） |

### 0-4. 動画で見る場合（サーバー不要）

```
out/2d-overhead-stride/climax-after.mp4     ★A 全体版（seed 42 / 17.0〜49.0s / 32秒）
out/2d-overhead-stride/climax-on-off.mp4    ★B 新旧並列（左=修正前 / 右=修正後・同一時刻）
out/2d-overhead-stride/climax-seed14.mp4    ★C seed 違い（18.5〜47.0s）
out/2d-overhead-stride/climax-seed332.mp4
out/2d-overhead-stride/climax-seed474.mp4
```

★**B が最短で違いが分かります。** 特に `残り 201m` のあたり（動画のおよそ 15 秒目）を見てください。
左は 2 頭が小さく走っているだけ、右は 6 頭が画面いっぱいで競っています。

⚠️ ★4 角の新旧比較は B には入っていません（台本側の直しなので左右どちらにも入っています）。
　4 角だけの比較は既存の `out/2d-overhead-stride/corner4-flip-fix.mp4` です。

---

## 1. 何をしたか（30 秒で分かる要約）

**指示書の要求**: ①4 角で滑らかに曲がる ②直線で 4〜5 頭の攻防 ③決着後に勝馬を大きく。

**やったこと**:

1. **4 角** — カメラを直線入口の 30m 先 → **90m 先**、横 27m → **22m** へ。
   台本のカット窓を 0.500/0.660 → **0.540/0.604**（3.27 秒 → 1.33 秒）。
   → 素材切替 **0 回** / 左右反転 **0 回**（前は反転 1 回）。

2. **直線の攻防** — 新規 `packages/render/src/climax-choreography.ts`。
   ★**表示位置だけ**を動かす純粋関数。確定着順の上位 5 頭に「進出／並ぶ／差す／差し返す／脱落」の
   役どころを割り当て、★**残り 60m で完全に 0 に戻す**（＝ゴールは確定着順・確定着差のまま）。

3. **カメラ** — 直線と決着のカットが「主役 5 頭だけ」を画に収めるように
   （`leadGates` + `fillFraction: 0.68`）。→ 5 頭が画面幅の **66.8〜74.4%**（要求 60〜75%）。

4. **勝馬** — 画角 12° → **10°**（馬体 33.1% → **39.8%**）、ディゾルブ禁止（`hardCutIn`）。

5. **HUD** — ★順位表・実況・隊列バーを「画面に描いた位置」で並べるように統一
   （前は絵と数字が最大 10.9 秒食い違っていました）。

**検証**: `npm test` **1160 件 PASS** / `npm run typecheck` **クリーン** /
演出 ON/OFF で着順・タイム・着差・払戻・カット境界が **完全一致**（4 seed）。

---

## ★2. オーナー判断が要る 3 点（次のセッションでここを決めます）

### 2-1. 勝馬の寄りが長い（指示書 §5-4 の「1.5〜2.5 秒」を超える）

実測 **4.57〜5.80 秒**。内訳＝「他馬がゴールし終えるまでの走り抜け **2.1〜3.4 秒**」＋「保持 2.4 秒」。
★保持を 0 にしても走り抜けが残るので、上限は超えたままです。

| 案 | どうなるか | 触る場所 |
|---|---|---|
| ① 今のまま | レースが終わり切るまで勝馬を映す。走り抜けも見せ場と考える | — |
| ② 保持を 0 に | 2.1〜3.4 秒。★それでも上限超え | `page.tsx:158` `WINNER_FOLLOW_SEC` |
| ③ ゴール後の流しを速める | 上限に収まる。★ただし指示書 §6 の「時間圧縮の再設計」に近い | `page.tsx:154` `RUNOUT_SLOW` |

### 2-2. 決着のカットで馬が小さくなった

`finish-line` の上限画角を **26°** にしたので、馬は画面高の **12.2%**
（参考映像 14.1% / 直前の直線 17% 前後）。
★これで画面内の頭数が **1〜2 頭 → 5〜7 頭**になりました。★頭数と大きさのトレードオフです。

- 小さすぎる → `packages/render/src/broadcast-v2.ts:361` の `maxFovDeg: 26` を下げる
- まだ足りない → 上げる

### 2-3. 主役 5 頭の帯が画面の左寄り

帯の中心が画面中央から **−3〜−22%**。先頭馬の前に余白を取る中継の作法（`leadFraction`）によります。
★中央に寄せるなら `leadFraction` を上げますが、★**すでに承認済みの決着の構図が変わります**。
一度に複数を変えたくないので数字を出すだけにしてあります。

---

## 3. ★こちらから見た残りの弱点（隠していません）

1. **seed 332 は先頭の入れ替わりが 0 秒**（2〜5 着の間では起きています）。
   役どころは確定着順で決まるので、勝馬が大差で逃げ切る展開では作られません。
   毎レース欲しい場合は 1 着の波の振幅（`ROLES[0].amp = 2.4`）を上げれば作れます。★勝手には上げていません。

2. **`homestretch-side` の画角が終盤に上限 22° へ張り付きます**（seed 42/332/474）。
   `finish-line` は 26° なので、カットの境目で **1.5〜2.3°** の段差が出ます（ハードカットの場所）。

3. **左下の `COURSE` 表示の裏に馬が入る**場面が残っています（以前から在る事象）。
   ★今回の測定は「キャンバス内にいるか」で数えており、**HUD に隠れているかは数えていません。**

4. **モーションブラーの速度**（`page.tsx:1757`）はエンジンの真の速度のまま。
   演出による見かけの速さのずれ（±13〜15%）は反映されません。控えめな効果なので触っていません。

---

## 4. 変更したファイル（未コミット）

### 新規

```
packages/render/src/climax-choreography.ts        ★直線の攻防（表示専用の純粋関数）
packages/render/test/climax-choreography.test.ts  ★検査 14 件
tools/audit-climax-invariance.mjs                 ★§7-1 結果不変・決定論
tools/audit-climax-camera.mjs                     ★§4-4 構図
tools/audit-climax-release.mjs                    ★見かけの速さ
tools/render-climax-clip.mjs                      ★コマ → 動画
REPORT_P4_RACE_CLIMAX_REBUILD_20260826.md         ★報告書
HANDOVER_P4_RACE_CLIMAX_20260826.md               ★この文書
```

### 変更

```
packages/render/src/broadcast-v2.ts        4角カメラ / 台本の窓 / 枠取り / 勝馬の画角
packages/render/src/broadcast-v2-scene.ts  leadGates・climaxCameraDisabled / 横縮小を描画から外す
packages/render/src/index.ts               climax-choreography を公開
apps/web/src/app/race/page.tsx             表示位置の引き上げ / HUD・実況の並べ方 / 勝馬の長さ
packages/render/test/contender-frame.test.ts        枠取りの新基準に更新（+ 対照を side-low へ）
tools/lib/classification.mjs               新しい道具 4 本を READONLY に登録
tools/lib/race-audit-build.mjs             ★実画面と違っていた定数を直した（40→400 / 0.55→0.6）
```

⚠️ ★`apps/web/package.json` のポート 3210 は**オーナーの既存作業**。触っていません。
⚠️ ★`broadcastV2TurnFacing` / `broadcastV2TurnSqueezeX`（4 角の横縮小・素材切替）は
　指示書 §3-1 で不合格になった案です。★**関数と検査は残置、描画からは呼んでいません。**

---

## 5. 再現コマンド（次のセッションでそのまま貼れます）

```powershell
# 検証
npm test
npm run typecheck

# 測定（すべて読取専用・標準出力のみ・dev サーバー不要）
npx tsx tools/audit-climax-contest.mjs                     # §4-3 攻防の定量条件
npx tsx tools/audit-climax-invariance.mjs                  # §7-1 結果不変・決定論
npx tsx tools/audit-climax-camera.mjs                      # §4-4 攻防のカットの構図
npx tsx tools/audit-climax-camera.mjs --shot finish-line   # 決着のカットの構図
npx tsx tools/audit-climax-release.mjs                     # 見かけの速さ
npx tsx tools/audit-winner-closeup.mjs                     # §5 勝馬クローズアップ
npx tsx tools/audit-corner-turn.mjs                        # §3 素材切替・左右反転
npx tsx tools/audit-corner-cut-window.mjs                  # §3 角度の窓

# 撮り直し（dev サーバーが :3210 で起動していること）
$env:AUDIT_SHOT="fourth-corner-front"; $env:AUDIT_SEED="42"; $env:AUDIT_FROM="17.0"; $env:AUDIT_TO="49.0"
npx tsx tools/capture-overhead-stride.mjs --label climax-after
$env:AUDIT_QUERY="&cinematography=v5&climax=off"
npx tsx tools/capture-overhead-stride.mjs --label climax-off
Remove-Item Env:AUDIT_QUERY
npx tsx tools/render-climax-compare.mjs                    # B 新旧並列
npx tsx tools/render-climax-clip.mjs --label climax-after  # A 全体版
```

⚠️ ★撮影の道具は**1 コマ単位では決定論ではありません**（カットの境目付近で一部のコマが
　別のバイト列になります・平均画素差 3〜13/255）。
　★**「バイト一致しない＝絵が違う」と読まないでください。** 構図が同じかどうかは
　`auditSceneAt` の値（決定論）で判定します。

---

## 6. ★次のセッションの Claude への申し送り

1. ★**まずオーナーの目視評価を聞くこと。** 数字は全部そろっています（報告書 §5〜§7）。
   ★数字を再提示しても判定は進みません。**どのカットの何秒でどう見えたか**を聞き出してください。

2. ★**上の §2 の 3 点は「オーナーが決めること」です。** 勝手に決めないこと。

3. ★**「定義が在る」を「満たしている」と読まないこと。** この案件では
   `winner-follow` が「画面高 約 35%」とコメントされていて**実測 33.1%** でした。
   ★必ず `tools/audit-*.mjs` で測ってから報告してください。

4. ★**測る道具が実画面と同じ条件かを先に確かめること。**
   今回 `tools/lib/race-audit-build.mjs` が実画面と違う定数（40 / 0.55）で走っていました。
   ★測る側が間違っていると、直したかどうかが判定できません。

5. ★**リモートへの push はオーナー指示があるまで行わないこと**（CLAUDE.md）。
   ★コミットもまだしていません。オーナーの合否が出てからです。
