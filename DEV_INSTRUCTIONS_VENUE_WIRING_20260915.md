# 指示書 — 本番のレースを 10 場の走路で走らせる（走路の形を値で凍結する）

**案件**: STAR（ポイ活型オンライン競馬育成）
**発行**: 2026-09-15 ／ レビュー側 → 開発側
**根拠**:
- オーナー決定 2026-09-15「**本番への 10 場の配線を、監査修正の残りより先に**」（`REVIEW_CONSULT_RACE_50_VENUES_ANSWER_20260915.md` §8-1 の 4）
- 同回答 §1-2 ⓪・§8-1「決定 4 に伴う条件」
- 正典 **D-055**（出走馬の凍結）・**D-071**（結果に効くものはシードから結果を作る鎖の中に）・**D-091**・**D-092**・§8.6（Provably Fair）・§4.4
- 作業規律 **R-27**（既定は狭い側）・**R-30**（測定器は製品と同じ入力）・**R-31**（測定器の既定は製品の側）・**R-32**（ゲートは CI に）・**R-33**（N 通りなら検査も N 通り）

> 凡例（R-13）: **✔** ＝ レビュー側がコードを読んで確かめた ／ **△** ＝ 未確認 ／ **計算** ＝ コードの定数から出した値
> ⚠️ **本番 DB への書き込み・移行ファイルの適用・ワーカーの配備はしません。** 本便は staging まで。
> ⚠️ **§3 の照会 Q-1〜Q-3 は、着手の前に回答を待つ必要はありません。** 各工程に「回答が出るまでの既定」を書いてあります。

---

## 0. 範囲

### 0-1. この便でやること

| 工程 | 中身 |
|---|---|
| **VW-0** | 先に測る（読み取りのみ）。オッズと確定で走路の模型が食い違っていた件の大きさ |
| **VW-1** | `courseShape`（直線／楕円）を 1 か所から引く。**オッズと確定の食い違いを止める** |
| **VW-2** | レース条件に**競馬場**を割り当てる（サイクル番号だけから決める） |
| **VW-3** | **走路の形をレース生成時に値で凍結**し、オッズの計算・確定・再計算がすべて凍結を読む（移行ファイル `0023`） |
| **VW-4** | Provably Fair の再計算の道具を凍結に揃える |
| **VW-5** | 正典のゲートを測る道具を**本番の条件**に揃える（V-4・V-5・V-6・V-10・V-17・V-18） |
| **VW-6** | staging での実演 |

### 0-2. この便でやらないこと

- **重賞の名前・年間カレンダー（`GRADED_RACES` の 50 鞍）を本番の番組に入れること**。正典 §10.3 の週次頻度（G1=3/週）と 50 鞍の B案（G1 9 / G2 14 / G3 27）が噛み合っていない未決があります（`packages/scheduler/src/graded-races.ts` の註記）。**次の便**
- 坂・コーナーごとの半径（D-092 の段階①②）
- 描画・演出（`packages/render/`・`apps/web/src/app/race/`）。`/races` の画面に競馬場名を出すこと
- 本番 DB への移行ファイルの適用・ワーカーの配備・push
- 正典 `STAR_SPEC_v2.0.md` の編集（レビュー側の未コミットの変更があります。**コミットに混ぜない**）

### 0-3. 触ってよいもの

| 工程 | ファイル |
|---|---|
| VW-1・VW-2 | `packages/scheduler/src/conditions.ts`・`packages/scheduler/test/`・`apps/cli/src/race-field.ts`・`apps/cli/test/` |
| VW-3 | `db/migrations/0023_*.sql`（新規）・`apps/worker/src/build-race.ts`・`apps/worker/src/pg-store.ts`・`apps/worker/src/settle.ts`・`apps/worker/test/`・凍結から条件を作る関数を置くパッケージ（§5-3 で 1 か所を選び、報告に書く） |
| VW-4 | `tools/verify-entrant-freeze.mjs`・`tools/verify-heavy.mjs` |
| VW-5 | `apps/cli/src/verify-race.ts`・`apps/cli/src/verify-payout.ts`・`tools/verify-v17.mjs`・`tools/verify-v17-time.mjs`・`tools/lib/v18.mjs`・`tools/verify-v18.mjs`・`apps/cli/test/v18-gate.test.ts` |
| 共通 | `apps/cli/src/calibration.ts`（`COURSE_IDS` の登録を直すとき）・`tools/lib/exposure-registry.mjs`（ビューを変える場合だけ） |

### 0-4. 同じ作業ツリーの作法
これまでと同じです。`git stash`・`git add -A`・`git commit -a` を使わず、ファイルを名指しでコミットし、開始・終了 HEAD と `git diff --numstat` を報告に書いてください。

---

## 1. レビュー側が確かめた事実

| # | 事実 | 出どころ |
|---|---|---|
| F-1 | **本番のレースは 10 場を使っていない。** 条件の `courseId` は `COURSE_IDS = ['C1','C2','C3','C4']` から回すだけ | ✔ `packages/scheduler/src/conditions.ts:27・52` |
| F-2 | オッズのモンテカルロは `resolveRace({ conditions: race.conditions, ... })` で、**`course` を渡さない** → エンジンは `DEFAULT_OVAL`（1 周 2000m・直線 400m） | ✔ `apps/worker/src/build-race.ts:93-98`・`packages/race-engine/src/lane.ts:97` |
| F-3 | `generateRace` に渡す `programme` は `surface`・`distance` だけ（`courseId` を渡さない） | ✔ `build-race.ts:79` |
| F-4 | 確定は `settleRaceFair` に `courseShape: 'oval'` を**直書き**し、**`course` を渡さない**。`course_id` は読むが使わない | ✔ `apps/worker/src/pg-store.ts:336-350`（読むのは `:271-276`） |
| F-5 | ⚠️ **オッズの計算では、1400m 以下のレースの 20% を直線コースとして作る**（`courseShape: distance <= 1400 && rng.bool(0.2) ? 'straight' : 'oval'`）。**直線では距離ロスが 0、枠の係数が 1.0** | ✔ `apps/cli/src/race-field.ts:494`・`packages/race-engine/src/race.ts:135-142`・`coefficients.ts:189` |
| F-6 | → **F-4 と F-5 で、該当するレースは「オッズを付けた模型」と「着順を決めた模型」が違う**。`courseShape` は DB に保存されていない | ✔ 上の 3 か所 |
| F-7 | 本番の番組で 1400m 以下を使うのは重賞以外（重賞は `DISTANCE_MENU.slice(2)` で 1600m から） | ✔ `conditions.ts:21・45` |
| F-8 | **commit はレースの条件を含まない**（`sha256(HMAC(secret, "race:<cycleIndex>"))`）。条件は**サイクル番号だけから決まる**ことで、commit の後に変わらないことを担保している | ✔ `apps/worker/src/seeding.ts:32-39`・`packages/race-engine/src/fairness.ts:38-41`。⚠️ `conditions.ts:6-7` の註記「commit は条件を含む前提で公開される」は**実装と合っていない** |
| F-9 | `races` に走路の形を保存する列が無い（jsonb は `race_entries` の `entrant_snapshot` などだけ）。最新の移行ファイルは `0022` | ✔ `db/migrations/0001_init.sql:155-182`・`0016_entrant_snapshot.sql`・`0022_user_rpc_revoke_anon.sql` |
| F-10 | 再計算の道具も `courseShape: 'oval'`・`course` なし | ✔ `tools/verify-entrant-freeze.mjs:94-108`・`tools/verify-heavy.mjs:124-154` |
| F-11 | 正典のゲートを測る道具はすべて `DEFAULT_OVAL`。V-18 だけ `tools/verify-v18.mjs --venues` で 10 場を測れるが、**CI の `v18-gate.test.ts` は `DEFAULT_OVAL` だけ**で、`--venues` も `cornerRadiiM` を渡さない | ✔ `apps/cli/src/verify-race.ts:272-301`・`verify-payout.ts:148-178`・`tools/verify-v17*.mjs`・`tools/lib/v18.mjs:126・134`・`apps/cli/test/v18-gate.test.ts:57` |
| F-12 | `DEFAULT_OVAL {2000, 400, 20}` はスターパーク競馬場と同じ値 | ✔ `lane.ts:97`・`packages/scheduler/src/venues.ts:72` |
| F-13 | 10 場はすべて楕円。直線コースの場は無い。**正典は直線コースを番組に入れる割合を決めていない**（§8.3 の `gateCoef` の説明「距離とコース形態で内外の有利不利」だけ） | ✔ `venues.ts`・`STAR_SPEC_v2.0.md` §8.3 |

---

## 2. VW-0 先に測る（読み取りのみ）

F-6 の食い違いが、いつから・どれだけのレースで・どれだけの大きさだったかを、直す前に測ります（AF-0 と同じ形）。

### 2-1. 件数

- staging（`--env staging`）で、`races` を `distance`・`grade`・`status` で数える。**1400m 以下の件数・確定済みの件数・そのレースに売れた馬券の件数と賭け金の合計**
- 本番は、**オーナーの指示があってから 1 回だけ**、同じ読み取りを `--env production` で（書き込みなし・`set session characteristics as transaction read only`）
- ⚠️ `courseShape` は保存されていないので、**どのレースが直線で計算されたかは DB から特定できません**。件数 × 20% を**推定**として書いてください（△）

### 2-2. 大きさ

- staging の確定済みの 1400m 以下のレースから数本を選び、凍結された出走馬（`entrant_snapshot`）で、**同じ出走馬・同じ試行数**のまま `courseShape` を `'oval'` と `'straight'` の 2 通りでモンテカルロを回す
- 券種ごとに、**1 着確率の差の平均と最大**・**「直線でオッズを付けて楕円で確定した」ときの払戻率**（切り捨て前・D-094）を出す
- 本番の DB には接続しない（計算は手元）

### 2-3. 報告
件数・推定・大きさを表に。**直す前の値**として残します。

---

## 3. 照会（オーナー）— 回答が出るまでの既定つき

| # | 照会 | 回答が出るまでの既定 |
|---|---|---|
| **Q-1** | **直線コースを本番の番組に入れるか。** 入れるなら、直線コースを持つ競馬場（または場の中の直線コース）を `venues.ts` に作り、その形を凍結する | **入れない**（10 場はすべて楕円・R-27 の狭い側）。`courseShape` は凍結した形から `'oval'` |
| **Q-2** | 競馬場の割り当ての比率。**馬場（芝・ダート）を持つ場の中で均等**に回すか、偏らせるか | **均等**（サイクル番号から決める・§4） |
| **Q-3** | 重賞の枠に `GRADED_RACES` の 50 鞍（名前・場・距離・馬場）を当てるか。当てるなら週次頻度（正典 §10.3）と 50 鞍の B案をどう揃えるか | **この便では当てない**（次の便） |

---

## 4. VW-1 `courseShape` を 1 か所から引く

### 4-1. 作るもの
- `courseShape` を、**凍結する走路の形（§5）の 1 項目**にする。**オッズのモンテカルロ・確定・再計算の道具は、すべてその値を読む**
- `apps/cli/src/race-field.ts:494` の `rng.bool(0.2)` は、**本番の経路（`programme` が渡るとき）では引いてから捨てる**（`race-field.ts:350-359` の距離・馬場と同じ作法。乱数の並びをずらさない）
- 確定の `courseShape: 'oval'` の直書き（`pg-store.ts:343`）を消し、凍結から読む
- Q-1 の既定（入れない）により、本便の値は全レース `'oval'`

### 4-2. 検査
| # | 内容 |
|---|---|
| 1 | 同じレースについて、**モンテカルロに渡した条件の `courseShape`・`course` と、確定に渡した条件の `courseShape`・`course` が完全に一致**すること（経路の検査・R-30）。1400m 以下のレースを必ず含める |
| 2 | **変異**: 確定を `'oval'` の直書きに戻し、モンテカルロ側を直線にすると 1 が落ちる |
| 3 | `programme` を渡さない検証ハーネスの経路（V-4〜V-6 の旧来の測り方）の乱数の並びが、変更の前後で 1 ビットも変わらないこと（引いてから捨てているか） |

---

## 5. VW-2・VW-3 競馬場の割り当てと、走路の形の凍結

### 5-1. VW-2 競馬場を割り当てる

- `conditionsOf(cycleIndex, raceClass, grade)` が**競馬場の id** を返す。`courseId` にそのまま入れる（`'C1'`〜`'C4'` をやめる）
- 決め方は**サイクル番号だけ**（F-8。乱数を使わない・再起動で変わらない）
- 選べるのは、**その回の馬場（`surface`）を持つ場だけ**（`venues.ts` の `surfaces`）
- 距離は今の `DISTANCE_MENU` のまま（1000m・3600m などを本番に足すのは Q-3 の便）
- `conditions.ts:6-7` の註記を**実装に合わせて直す**:「commit は条件を含まない。条件はサイクル番号だけから決まるので、commit を公開した後に変わらない」

**検査**
| # | 内容 |
|---|---|
| 1 | 同じサイクル番号から、何度呼んでも同じ競馬場 |
| 2 | **1 日（144 R）の中に 10 場すべてが現れる**（`conditions.test.ts` の「4 ID が 1 日に現れる」を置き換える） |
| 3 | 割り当てた場が、**その回の馬場を持っている**（全サイクル 1 週分） |
| 4 | 場ごとの回数を 1 週分数えて、報告に表で出す（Q-2 の判断材料。線は引かない） |
| 5 | 割り当てた場と距離の組すべてで、エンジンの `ovalSegments` と描画の `ovalCourse` が同じ区間を作る（`venue-course.test.ts` の組を、本番の番組の組に広げる・R-33） |

### 5-2. VW-3 走路の形を値で凍結する

**移行ファイル `0023`**
- `races` に **`course_frozen jsonb`** を足す（名前は変えてよい。報告に書く）
- 中身は次の 1 つのオブジェクト:
  ```
  { v: 1, venueId, lapM, homeStretchM, widthM, cornerRadiiM?, turn, courseShape }
  ```
  - `turn` はエンジンが使わない（描画だけ）が、将来の中継のために一緒に凍結する
  - `cornerRadiiM` は場が持つときだけ（いまはどの場も持たない）
- **既存の行は `null` のまま**にする（書き換えない）
- ビュー `races_public` は変えない（この便では画面に出さない）

**生成**
- `build-race.ts` で、**凍結するオブジェクトを 1 回だけ作り**、①そのオブジェクトから条件を作ってモンテカルロに渡し、②**同じオブジェクト**を `createRace` で保存する（作り直さない・R-30）
- `createRace` の同じトランザクションで保存する（`pg-store.ts:107-210`）

**確定**
- `settleRace` は `course_frozen` を読み、**同じ関数**で条件を作って `settleRaceFair` に渡す
- **`course_frozen` が `null` の行**（この便より前に生成された行）: その行は実際に `DEFAULT_OVAL`・`'oval'` の確定で扱われてきたので、**明示的に `DEFAULT_OVAL`・`'oval'` で確定する**。ただし**黙って落とさず**、件数を数えて警報に出す（D-055「凍結の無い馬は数えて出す」と同じ形・R-27）
- `course_frozen` が**あるのに読めない・形が不正**（`ovalCourse` の前提を満たさない等）なら、**確定せずに投げる**（`UnfrozenRaceError` と同じ扱いで中止・返還の経路へ）

### 5-3. 凍結から条件を作る関数は 1 か所

- 「凍結したオブジェクト → エンジンに渡す `conditions`（`distance`・`surface`・`trackCondition`・`courseShape`・`course`・`baseWeightKg`）」を作る関数を **1 つだけ**置く
- **ワーカーの生成・確定、再計算の道具（VW-4）、測定器（VW-5）がすべてこの関数を通る**
- 置き場所（`packages/scheduler` か `packages/race-engine` など）は開発側で選び、**層の向き**（エンジンが描画に依存しない等）を報告に書く

### 5-4. 検査

| # | 内容 |
|---|---|
| 1 | 生成で保存した `course_frozen` と、モンテカルロに渡した `course`・`courseShape` が**同じ値**（偽の DB で、`createRace` の引数を記録して比べる） |
| 2 | 確定が `course_frozen` から作った条件で `settleRaceFair` を呼ぶ（偽の DB） |
| 3 | `course_frozen` が `null` の行は `DEFAULT_OVAL`・`'oval'` で確定し、**件数が警報に出る** |
| 4 | `course_frozen` が不正な行は確定せずに投げる |
| 5 | **変異**: 確定で `course` を渡し忘れる（`DEFAULT_OVAL` に落ちる）と、スターパーク以外の場で 1〜2 のどれかが落ちる。**スターパークだけで検査すると `DEFAULT_OVAL` と同じ値なので捕まらない**（F-12）→ 検査は**スターパーク以外の場を必ず含める** |
| 6 | 凍結から条件を作る関数の単体の検査: 10 場すべて・`turn` 左右・`cornerRadiiM` の有無 |

---

## 6. VW-4 Provably Fair の再計算の道具

- `tools/verify-entrant-freeze.mjs`・`tools/verify-heavy.mjs` を、**§5-3 の関数**で `course_frozen` から条件を作る形に（`courseShape: 'oval'` の直書きを消す）
- `course_frozen` が `null` の行は §5-2 と同じ扱い（明示的に `DEFAULT_OVAL`・件数を出す）

**検査・実演（staging）**
| # | 内容 |
|---|---|
| 1 | staging の確定済みのレース（新しく生成したもの）で、**凍結から再計算した着順 ＝ 保存された着順**が全件 |
| 2 | **変異**: 道具が `course_frozen` を読まない（`DEFAULT_OVAL` に落ちる）形に戻すと、**スターパーク以外の場のレースで食い違いが出る**ことを実演する |

---

## 7. VW-5 正典のゲートを測る道具を本番の条件に（R-30・R-31・R-32・R-33）

### 7-1. 作るもの
- **本番の条件を作る関数**（サイクル番号 → 番組 → 条件 → 凍結オブジェクト）を 1 つにし、ワーカーと測定器が共有する
- `verify-race.ts`（V-4・V-5・V-6）・`verify-payout.ts`（V-10）・`tools/verify-v17*.mjs`（V-17）は、**既定で本番の条件**を使う（R-31）。旧来の条件（`DEFAULT_OVAL`・直線 20%）は **`--legacy-conditions` を明示したときだけ**（比較用）
- **V-18 のゲートを CI の中で 10 場に広げる**（`apps/cli/test/v18-gate.test.ts`）。いまは `DEFAULT_OVAL` だけで、10 場は手で回す道具にしか無い（R-32）。**本番の番組に現れる（場 × 距離）の組**を対象にし、所要時間が長ければ組の選び方を場の軸で決めて註記する（R-33。月見丘・白砂は必ず含める — `venues.ts` の註記の「天井まで 0.8〜1.1 馬身」）

### 7-2. 測って報告するもの

| ゲート | 出すもの |
|---|---|
| V-4・V-5・V-6 | **旧来の条件と本番の条件の両方**で、値と帯の内外。変わった量 |
| V-17 | **場ごと**の勝ち時計（距離ごと）と 1 着〜最下位の差 |
| V-18 | **場ごと**の ①・②a・②b |
| V-10 | ⚠️ **開発側は流さない**（1 本数時間・メモリ不足の前例）。道具を本番の条件に揃えるところまで。**本便のコミットの後に、オーナーが別のターミナルで `--races 500 --seeds 42` を 1 本**（第 1 便の AF-2・第 2 便の BF-6 もこの 1 本で判定する） |

帯を外れたゲートがあっても、**この便で較正定数を動かさない**でください。値を報告し、照会に回します。

---

## 8. VW-6 staging での実演

順番を守ってください。

| # | 誰 | 作業 | 確かめること |
|---|---|---|---|
| 1 | 開発側 | `npx tsx tools/migrate.mjs --env staging` で `0023` を適用 | 適用前後で `races` の列・既存行の `course_frozen` が `null`・チェックサムの食い違い 0 |
| 2 | 開発側 | V-20（`tools/verify-anon-exposure.mjs --env staging`） | 11 件中 11 件合格（ビューを変えていないこと） |
| 3 | オーナー | 別のターミナルで `seed-races.mjs --env staging` を、**10 場すべてが現れる本数**だけ流す（本数は開発側が §5-1 の割り当てから計算して知らせる） | — |
| 4 | 開発側 | 生成されたレースの `course_frozen` を読み、**10 場すべて**・`courseShape` が全件 `'oval'`・値が `venues.ts` と一致 | 表で報告 |
| 5 | オーナー | 別のターミナルで `settle-races.mjs --env staging` | — |
| 6 | 開発側 | §6 の再計算で**全件一致**・変異で食い違いが出る | 件数 |
| 7 | 開発側 | 既存の `null` の行が確定されていれば、**件数が警報に出た**こと | 件数 |

---

## 9. 報告 `REPORT_VENUE_WIRING_<日付>.md`

- これまでと同じ形（提出物・変更範囲 ／ 期待値つきの再実行表 ／ 再現した事実と未検証の主張を分ける R-13）
- **VW-0 の測定結果を最初に**
- 変異の実演（§4-2-2・§5-4-5・§6-2）と復元の確認
- `npx vitest run` の `Test Files`・`Tests` の行と終了コード。**提出物を足したあとにもう一度回す**。既存の赤（`edit-grammar-audit` ⑨）が 1 件から増えていないこと
- §7-2 の表
- Q-1〜Q-3 の既定で進めた箇所を列挙する

---

## 10. 本番について（本便では何もしない）

本番へ当てる順番だけ、先に固定します:

1. `0021` → `0022`（監査の第 1 便・第 2 便・オーナー指示待ち）
2. **`0023`**（本便）
3. 新しいワーカーを配備
4. それぞれの前後で V-20 が全件合格
5. 配備の後の最初の確定で、**`course_frozen` が `null` の行の件数**が警報に出ることを確かめる（配備時点で生成済みのレース）

実施はオーナーの指示で、本便の裁定のあとに行います。

---

## 11. 正典について（レビュー側の作業・参考）

本便の裁定のあと、オーナーの承認を得て次を正典に起票する予定です（**開発側は正典を編集しない**）。
- **D-099（候補）**: 走路の形（`courseShape` を含む）はレース生成時に値で凍結し、オッズの計算・確定・再計算・測定器はすべて凍結を読む。id から現在の値を引かない（D-055・D-071 の適用）
- §4.4 の `races` 表に凍結の列
- §10.3 に競馬場の割り当ての規則（Q-2 の回答）
- Q-1 の回答（直線コースを入れるか）

---

本書の作成にあたって、**7DAYS のファイルは開いていません**（`REVIEW_SESSION_RULES.md` §7・越境なし）。
