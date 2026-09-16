# 報告 — 本番のレースを 10 場の走路で走らせる（走路の形を値で凍結する）

**案件**: STAR（ポイ活型オンライン競馬育成）
**発行**: 2026-09-15 ／ 開発側 → レビュー側・オーナー
**対象**: `DEV_INSTRUCTIONS_VENUE_WIRING_20260915.md`（VW-0〜VW-6）
**ブランチ**: `p4/race-30sec-cuts` ／ **開始 HEAD** `57adf77` ／ **終了 HEAD** `57adf77`（★本便の変更は**未コミット**。コミットはオーナーの指示で）

> 凡例（R-13）: **✔** ＝ 開発側がこの便で実行・実測した ／ **計算** ＝ コードの定数から出した値 ／ **△** ＝ 未確認・推定 ／ **[EYES]** ＝ オーナーの目で決めること
> ⚠️ 本番 DB への接続・書き込み・移行ファイルの適用・ワーカーの配備・push はしていません。staging への `0023` の適用だけ行いました（指示書 §8 の 1）。
> ⚠️ 正典・レビュー側の未コミットのファイル（`STAR_SPEC_v2.0.md`・`PLAN_*`・`REVIEW_*`・`DEV_INSTRUCTIONS_*`）には触れていません。

---

## 0. VW-0 直す前の値（★最初に）

### 0-1. 件数（staging・読み取りのみ）✔

`set session characteristics as transaction read only` で接続し、`app_environment = 'staging'` を確認してから数えました（SQL は付録 A）。

| 項目 | staging |
|---|---|
| `races` 全体 | 39 本（確定 30・発売中 2・中止 7）／ 生成 2026-08-11〜2026-09-13 |
| **1400m 以下** | **15 本**（1200m 確定 9 ／ 1400m 確定 5・発売中 1） |
| 1400m 以下の確定済み | 14 本 |
| 1400m 以下の重賞 | 0 本（F-7 のとおり） |
| **1400m 以下のレースに売れた馬券** | **0 枚・0 EP**（★staging は全距離で馬券 0 枚） |
| `course_id` | C1 20 ／ C2 6 ／ C3 7 ／ C4 6 |
| **直線で計算された推定** | **15 × 20% ＝ 約 3 本**（△ `courseShape` は保存されていないので特定できない） |

- ⚠️ 距離 2600m の中止 1 本がある — `DISTANCE_MENU` に無い距離なので、**番組表を渡さない経路**（`tools/diag-insert.mjs` 等の `buildRace(pool, i, …)` 引数 5 つ）で作られた行です。この経路は距離も馬場も `generateRace` が自分で引きます
- **本番: 未実施**。指示書 §2-1「オーナーの指示があってから 1 回だけ」。同じスクリプトを `--env production` で流します（付録 A）

### 0-2. 大きさ（staging の出走馬の凍結で、手元で計算）✔（★2026-09-16 追記・VC-4 の 2）

staging の確定済み・1400m 以下の 5 本（cycle 5594・5587・5586・5580・5579）で、同じ出走馬・各 200,000 試行を `'oval'` と `'straight'` の 2 通りに振りました（`REPORT_VENUE_WIRING_MEASURE_20260916.md` §3）。

| 券種 | 当たり目の確率の差 平均 | 最大 | 直線でオッズ → 楕円で確定したときの払戻率（切り捨て前） | 設定との差 |
|---|---|---|---|---|
| win | 0.593% | 2.869% | 81.07%（設定 82.0%） | −0.93pt |
| place | 1.200% | 3.016% | 80.32%（設定 82.0%） | −1.68pt |
| quinella_place | 0.282% | 3.094% | 78.67%（設定 80.0%） | −1.33pt |
| quinella | 0.111% | 1.846% | 77.98%（設定 80.0%） | −2.02pt |
| exacta | 0.059% | 1.177% | 77.89%（設定 80.0%） | −2.11pt |
| trio | 0.030% | 1.393% | 73.82%（設定 77.0%） | −3.18pt |
| trifecta | 0.006% | 0.483% | 69.93%（設定 77.0%） | −7.07pt |

- **ずれる向きは常に払戻が足りない側**でした。staging の馬券は 0 枚なので、実害の算定ではありません
- △ ②には測り方自体の誤差（オッズ 200,000 試行・確定 20,000 回）も含みます

---

## 1. 提出物・変更範囲

### 1-1. ファイル

| 工程 | ファイル | 中身 |
|---|---|---|
| VW-1 | `apps/cli/src/race-field.ts` | `programme` に `courseShape` を必須で持たせ、直線の抽選は**引く位置・条件を変えずに**本番の経路では捨てる |
| VW-2 | `packages/scheduler/src/conditions.ts` | `COURSE_IDS` を廃止。**その馬場を持つ場から、その馬場のレースの通し番号で均等に**割り当て（芝だけ 1 日 3 場ずつずらす・§4-3）。`frozenCourseOf`・`productionRaceOf` を追加。F-8 の註記を実装に合わせて訂正 |
| VW-3 | `db/migrations/0023_race_course_frozen.sql`（新規） | `races.course_frozen jsonb`（null 可・既存行は null のまま・ビューは変えない） |
| VW-3 | `packages/race-engine/src/course-frozen.ts`（新規）・`index.ts` | **凍結 → 条件の唯一の関数** `conditionsFromFrozen`・検める `parseFrozenCourse`・`InvalidFrozenCourseError` |
| VW-3 | `apps/worker/src/build-race.ts` | 凍結を **1 回だけ**作り、その条件でモンテカルロ、**同じ参照**を返す |
| VW-3 | `apps/worker/src/pg-store.ts` | `createRace` が同じトランザクションで `course_frozen` を保存。`settleRace` が読み、`conditionsFromFrozen` で条件を作る（null → `DEFAULT_OVAL` ＋通報／不正 → 投げる）。`'oval'` の直書きを削除 |
| VW-3 | ★`apps/worker/src/cycle-runner.ts`（**§0-3 の表に無いファイル**） | ①`RaceSpec.conditions` に `courseFrozen` の型を足した（`createRace` へ運ぶ型がここにあるため）②中止・返還に載せる名前に `InvalidFrozenCourseError` を足した（§5-2「`UnfrozenRaceError` と同じ扱いで中止・返還の経路へ」の配線がここにあるため）。**この 2 点だけ** |
| VW-4 | `tools/verify-entrant-freeze.mjs`・`tools/verify-heavy.mjs` | 凍結から `conditionsFromFrozen` で条件を作る。`--recompute-settled`（確定済み全件の再計算・読むだけ）と `--ignore-course-frozen`（変異の実演）を追加 |
| VW-5 | `apps/cli/src/verify-race.ts`・`verify-payout.ts` | 既定を本番の条件（`productionRaceOf` → 凍結 → `conditionsFromFrozen`）に。`--legacy-conditions` で旧来 |
| VW-5 | `tools/verify-v17.mjs`・`tools/verify-v17-time.mjs` | 既定を 10 場（凍結した形）に。`--legacy-conditions` で旧来（出力は従来と同じ） |
| VW-5 | `tools/lib/v18.mjs`・`tools/verify-v18.mjs` | `opts.frozen` を受ける。②b（`gateBiasV18`）と本番の組（`productionV18Combos`）を 1 か所に。既定＝本番の 70 組、`--legacy-conditions`＝旧来、`--venues`＝重賞の組（凍結経由なので `cornerRadiiM` も運ぶ・F-11） |
| VW-5 | `apps/cli/test/v18-gate.test.ts` | CI の V-18 を場の軸で広げる（§7-3） |
| 共通 | `apps/cli/src/calibration.ts` | `COURSE_IDS` の免除を削除。`SURFACE_PERIOD`・`DAY_ROTATION`・`BASE_WEIGHT_KG`・`KNOWN_KEYS`・`LEGACY_CONDITIONS` を理由付きで免除 |
| 検査 | `packages/scheduler/test/conditions.test.ts`・`apps/cli/test/course-frozen.test.ts`（新規）・`apps/cli/test/venue-course.test.ts`・`apps/worker/test/course-frozen-wiring.test.ts`（新規）・`apps/worker/test/cycle-runner.test.ts` | §3〜§6 |

- ⚠️ `apps/cli/package.json` の依存に `@star/scheduler` はありません（`verify-race.ts`・`verify-payout.ts` が今回から引く）。ワークスペースのリンクで解決され、`tsc` と `tsx` は通ります（✔）。依存の宣言を足すかはレビュー側の判断に（§0-3 の表に無いので触っていません）
- `git diff --numstat 57adf77 80c4eb3`（★2026-09-16 追記・VC-4 の 1）: **36 ファイル・+3,630 行 / −220 行**
  - うち **コードと SQL は 23 ファイル・+1,457 / −218**、**文書は 13 ファイル・+2,173 / −2**（文書には本便の指示書・報告書のほか、同じコミットに入ったレビュー側の回答・裁定も含みます）
  - 行数の多い順（上位）: `REPORT_VENUE_WIRING_20260915.md` +364 ／ `DEV_INSTRUCTIONS_VENUE_WIRING_20260915.md` +266 ／ `apps/worker/test/course-frozen-wiring.test.ts` +217
  - ⚠️ この数は**コミット `80c4eb3` の中身全体**で、作者別の内訳ではありません（CLAUDE.md の作法）

### 1-2. 凍結から条件を作る関数の置き場所と層の向き（§5-3）

| 役割 | 置き場所 | 依存 |
|---|---|---|
| 凍結するオブジェクトを**作る**（`frozenCourseOf(venueId)`）・本番の条件（`productionRaceOf(cycleIndex)`） | `@star/scheduler`（競馬場のデータを持つ側） | 依存ゼロのまま |
| 凍結を**検めて条件にする**（`parseFrozenCourse`・`conditionsFromFrozen`） | `@star/race-engine` | `@star/sim-engine` だけのまま（`lane.ts` の `DEFAULT_OVAL`・`ovalCornerPlan` を使う） |

- 型は両方に同じ形があります（`FrozenCourseRecord` ／ `FrozenCourse`）。scheduler は依存ゼロ、race-engine は scheduler に依存しない（devDependencies のみ）ので、`RaceCourseSpec` ／ `OvalSpec` と同じ作法です
- 離れないことは `apps/cli/test/course-frozen.test.ts` が**型の上で相互に代入**し、**10 場すべてで `parseFrozenCourse(frozenCourseOf(id))` が同じ参照を返す**ことで見ます（✔）
- エンジンは描画層に依存しません（`turn` は凍結に入るが、エンジンは読まない）

### 1-3. 照会 Q-1〜Q-3 の既定で進めた箇所

| 照会 | 既定 | この便で入った箇所 |
|---|---|---|
| Q-1 直線コース | **入れない** | `frozenCourseOf` の `courseShape: 'oval'`（10 場すべて）。`generateRace` の直線抽選は本番の経路で捨てる。`conditionsFromFrozen` は `'straight'` の凍結も受ける（入れる日のため）が、本番の番組には現れない |
| Q-2 割り当て | **均等** | `conditionsOf` — 馬場ごとに 10 場で 1 週の最多 − 最少 ≤ 1（§4-2）。**ただし芝は日ごとに 3 場ずらす**（均等のまま、枠が場に張り付くのを防ぐ・§4-3） |
| Q-3 重賞 50 鞍 | **当てない** | `DISTANCE_MENU` はそのまま（1200〜3000m の 7 距離）。レース名は `R<cycle>` のまま |

---

## 2. VW-1 `courseShape` を 1 か所から引く

| # | 検査 | 結果 |
|---|---|---|
| 1 | モンテカルロに渡した条件と確定に渡した条件の `courseShape`・`course` が完全に一致（1400m 以下・スターパーク以外を含む） | ✔ `course-frozen-wiring.test.ts` ★2。**エンジンの `resolveRace` を包んで、実際に受け取った条件を両方の経路で記録**して比べる（両辺を自分で組み立てない） |
| 2 | 変異: 確定を `'oval'` の直書き・モンテカルロを直線にすると 1 が落ちる | ✔ §9-1 |
| 3 | `programme` を渡さない経路の乱数の並びが変わらない | ✔ ①変更前後で `generateRace` 400 本の出力の sha256 が一致（旧来の経路 `e02ae6fe…4d0d`・番組表あり経路の出走表 `2c64261d…0eff`、変更前も後も同じ値）②恒久の検査: 番組表あり／なしで出走表・馬場状態が同じ（300 本・直線の抽選が実際に起きた標本を含む）`course-frozen.test.ts` |

---

## 3. VW-2 競馬場の割り当て

### 3-1. 検査 ✔（`packages/scheduler/test/conditions.test.ts`）

| # | 内容 | 結果 |
|---|---|---|
| 1 | 同じサイクル番号から何度呼んでも同じ場（クラスを変えても同じ） | ✔ |
| 2 | **1 日（144R）の中に 10 場すべて**（0・1・2・5・6・100 日目） | ✔ |
| 3 | 割り当てた場がその回の馬場を持つ（1 週全サイクル） | ✔ |
| 4 | 馬場ごとに 10 場へ均等（1 週で最多 − 最少 ≤ 1） | ✔ |
| 5 | 本番の番組の（場 × 距離）の組すべて（1 週で **70 組**）で、エンジンの `ovalSegments` と描画の `ovalCourse` が同じ区間 | ✔ `venue-course.test.ts`（凍結から作った `course` を使う） |
| 追加 | 10 日で、クラスごとの**芝**の本数が 10 場で完全に等しい | ✔ §4-3 |

### 3-2. 場ごとの回数（1 週 1,008R・計算）— Q-2 の判断材料

| 場 | 芝 | ダート | 計 | 距離の種類 | 新馬 | 1勝 | 2勝 | 3勝 | OP | 重賞 |
|---|---|---|---|---|---|---|---|---|---|---|
| スターパーク | 63 | 38 | 101 | 7 | 26 | 27 | 14 | 13 | 13 | 8 |
| 天河 | 63 | 38 | 101 | 7 | 28 | 25 | 21 | 14 | 7 | 6 |
| 青嶺 | 63 | 38 | 101 | 7 | 30 | 28 | 18 | 10 | 10 | 5 |
| 白砂 | 63 | 38 | 101 | 7 | 30 | 24 | 13 | 14 | 13 | 7 |
| 潮風 | 63 | 38 | 101 | 7 | 34 | 22 | 16 | 14 | 8 | 7 |
| 月見丘 | 63 | 38 | 101 | 7 | 23 | 28 | 19 | 12 | 13 | 6 |
| 銀嶺 | 63 | 38 | 101 | 7 | 30 | 26 | 17 | 13 | 10 | 5 |
| 陽光台 | 63 | 38 | 101 | 7 | 34 | 19 | 18 | 13 | 11 | 6 |
| 霧ヶ原 | 63 | 37 | 100 | 7 | 26 | 34 | 13 | 11 | 10 | 6 |
| 大河原 | 63 | 37 | 100 | 7 | 33 | 19 | 19 | 12 | 10 | 7 |

- ⚠️ 白砂は `venues.ts` で「ダートの本場」ですが、Q-2 の既定（均等）では**他の場と同じ本数のダート**です。偏らせるかはオーナー判断（Q-2）
- 10 場すべてが現れる**連続本数**（計算・開始位置を 1 週ずらして）: 最小 10 ／ 中央 15 ／ **最大 26**

### 3-3. ★初版の割り当ての欠陥と是正（この便の中で見つけて直した）

- 初版は「その馬場のレースの通し番号 mod 10」だけで回し、註記に「**芝 90 と ダート 54 はどちらも 10 で割り切れないので、同じ枠に来る場は日ごとにずれる**」と書いていました。**芝 90 は 10 で割り切れます**。誤りです
- 実害（計算・1 週）: 番組表はクラスを枠で決めるので、**新馬が潮風 69 本・スターパーク 12 本**（5.75 倍）。月見丘の重賞 12 本／陽光台 5 本
- 是正: 芝だけ 1 日ごとに 3 場ずらす（`DAY_ROTATION = 3`。10 と互いに素なので 10 日で各枠が 10 場を 1 回ずつ）。芝は 1 日 9 本ずつなので均等は崩れない。ダートは 54 ≡ 4 (mod 10) で自然にずれ、さらにずらすと日の境目で均等が崩れるのでずらさない
- 是正後: 新馬 23〜34 本（1.48 倍）。検査「10 日でクラスごとの芝の本数が 10 場で等しい」を足した（初版の形では落ちる）
- 代償: 10 場が出そろう連続本数の最大が 16 → 26

---

## 4. VW-3 走路の形の凍結

### 4-1. 形 ✔

```
races.course_frozen jsonb  -- 名前は指示書のまま
{ "v": 1, "venueId": "shiokaze", "lapM": 1900, "homeStretchM": 310, "widthM": 20, "turn": "right", "courseShape": "oval" }
```

- `cornerRadiiM` は場が持つときだけ項目ごと入る（いまはどの場も持たないので**項目が無い**）
- `parseFrozenCourse` が投げる条件: オブジェクトでない ／ **知らない項目がある**（版を上げずに足した項目を読まずに確定しないため）／ `v ≠ 1` ／ `venueId` 空 ／ 寸法が正の数でない ／ `直線×2 ≥ 1 周` ／ `turn`・`courseShape` が不正 ／ `cornerRadiiM` が正の数 4 つでない ／ **1 周と半径の食い違い**（`ovalCornerPlan`）
- 確定では加えて **`venueId ≠ course_id`** も不正として投げる（どちらが正しいか決まらないため）

### 4-2. 生成・確定 ✔

- `buildRace` が `frozenCourseOf(programme.courseId)` を **1 回だけ**呼び、`conditionsFromFrozen` の条件でモンテカルロ、**同じ参照**を `conditions.courseFrozen` で返す → `createRace` が `JSON.stringify` して `$13::jsonb` で**同じトランザクション**に保存
- 番組表を渡さない呼び方（本番のワーカーは使わない。`tools/verify-build.mjs`・`diag-insert.mjs`）は、**これまでと同じ模型**（スターパーク＝`DEFAULT_OVAL` と同じ値・直線は `generateRace` の抽選）を凍結して保存。この経路でもオッズと確定は同じ形を読む
- `settleRace`: `course_frozen` null → `DEFAULT_OVAL`・`'oval'`、**commit の後に**累計件数を通報（`createPgStore` の第 3 引数 `onCourseNotFrozen`。省くと `console.warn`。ワーカーの `main.ts` は触っていないので既定の `console.warn`）
- 不正 → rollback して `InvalidFrozenCourseError`（`cycle=` 付き）→ `runCycle` が開催中止・返還・通報に載せる

### 4-3. 検査 ✔（`apps/worker/test/course-frozen-wiring.test.ts`・`apps/cli/test/course-frozen.test.ts`・`cycle-runner.test.ts`）

| # | 内容 | 結果 |
|---|---|---|
| 1 | 保存した `course_frozen` ＝ モンテカルロに渡した `course`・`courseShape`（偽の DB で `createRace` の引数を記録） | ✔ 3 組（潮風 1200m 右回り ほか・スターパーク以外・1400m 以下・左右を含む） |
| 2 | 確定が `course_frozen` から作った条件で `settleRaceFair` を呼ぶ（エンジンが受け取った条件を記録） | ✔ かつ `DEFAULT_OVAL` と違う形であることも確認 |
| 3 | null の行は `DEFAULT_OVAL`・`'oval'` で確定し、件数が通報に出る | ✔ `[{cycle, count:1}, {cycle, count:2}]` |
| 4 | 不正な行は確定せずに投げる（エンジンを呼ばない） | ✔ 寸法が文字列・版 9・別の場の `venueId`・JSON 文字列 |
| 5 | 変異: 確定で `course` を渡し忘れるとスターパーク以外で落ちる | ✔ §9-2 |
| 6 | 凍結から条件を作る関数: 10 場すべて・`turn` 左右（回りは条件を変えない）・`cornerRadiiM` の有無・null・直線・不正 13 通り | ✔ |
| 追加 | `InvalidFrozenCourseError` で確定が落ちたら中止・返還・通報 | ✔ `cycle-runner.test.ts` |

---

## 5. VW-4 再計算の道具

- `verify-entrant-freeze.mjs`: 期待値と対照の条件を、確定と同じ `conditionsFromFrozen` で作る（`venueId ≠ course_id` も投げる）。`--recompute-settled` は読むだけで、確定済みの全レースを凍結から再計算し保存された着順と突き合わせ、場ごとの表と食い違った行を出す
- `verify-heavy.mjs`: 実験の条件を凍結から作る。null の本数を出す

### 5-1. staging・この便の前に生成された行での再計算（参考・✔）

| 確定済み | 出走馬の凍結が無く飛ばした | 再計算した（すべて走路の凍結なし → `DEFAULT_OVAL`） | 一致 | 食い違い |
|---|---|---|---|---|
| 30 | 23 | 7 | 5 | **2** |

- 食い違い: `cycle=686`（1200m・2026-08-12 生成）9・10 着の入れ替わり ／ `cycle=868`（1200m・2026-08-13 生成）11・12 着の入れ替わり
- △ 原因は未確認です。どちらも**走路の凍結が無く、変更の前も後も `DEFAULT_OVAL`・`'oval'` で再計算される行**なので、この便の変更では動きません。生成の日付は距離ロス（D-071・2026-08-16〜）・`LANE_REVEAL_FULL_RUN`（2026-08-21）・`LANE_MODEL`（2026-08-31）より前で、**エンジンが確定の後に変わった**ためと推定します。確かめるには当時のコミットで再計算します（未実施）
- ⇒ §6 検査 1 の「全件一致」は、**この便のコードで生成・確定したレース**（VW-6 の 3〜5）で判定します

---

## 6. VW-5 正典のゲートを測る道具

> ⚠️ **【2026-09-16 訂正・VC-4 の 3】中断の原因**: 本節はこの中断を「メモリ不足」と書いていましたが、**正しくは Windows Update の自動再起動**です（照会 `QUESTIONS_ENGINE_LANE_SPEED_20260915.md` §3-1 の註記が正しく、本報告の記述が誤りでした）。なお、2026-09-14 の V-10（約 10 時間半）と staging のレース生成（約 1 時間 45 分）の強制終了は**メモリ不足**で、こちらは別件です。★**両方を「メモリ不足」とひとまとめにしたため、本当の一因（エンジンの遅さ）が見えにくくなっていました**（ES 便で解消）。
>
> ⚠️ **計測の中断（2026-09-15 04:14）**: V-18 の本番 70 組・VW-0 のモンテカルロ・V-17 一式を**裏で同時に**流していたところ、開発側のセッションが落ちました。V-17 だけ完走し、V-18 は 70 組中 23 組で途切れ、VW-0 は 0 件です。楕円の `resolveRace` は 1 試行 約 6.7ms（他の計算と並走中の実測・直線は 約 30µs）で、VW-0 の `--trials 200000` × 2 通り × 5 本は数時間の見積りでした。以後、重い計算は 1 本ずつ流し、数十分を超えるものはオーナーのターミナルに回します。

### 6-1. V-4・V-5・V-6

✔ **【2026-09-16 追記・VC-4 の 6】流しました**（`REPORT_VENUE_WIRING_MEASURE_20260916.md` §2）。**2 条件で合わせて 約 27 分**（ES 便でエンジンが速くなったため）。

| # | 帯 | 本番の条件 | 旧来の条件 | 動いた量 | 判定 |
|---|---|---|---|---|---|
| V-4 | 30〜34% | **31.37%** | 31.26% | +0.11pt | どちらも PASS |
| V-5 | 60〜65% | **62.18%** | 62.31% | −0.13pt | どちらも PASS |
| V-6 | 0.5〜2% | **1.15%** | 1.21% | −0.06pt | どちらも PASS |

⚠️ 頭数別では **8 頭立てが 2.38%** で帯の上限を 0.38pt 超えます（旧来の条件でも同じ向き）。判定はプール値で、定数は動かしていません。

---

（以下は 2026-09-15 時点の記述）⏸ **流していません。** 所要を見積もったところ、既定（60,000 レース × 1 レース 502 回の `resolveRace`）で **1 条件 約 21 時間**の計算でした（楕円の `resolveRace` が 1 回 約 2.5ms・D-071 の前は 61µs）。エンジンの遅さは照会 `QUESTIONS_ENGINE_LANE_SPEED_20260915.md` に出しました。その回答が出るまでの既定（Q-1）により、**直った後に流します**。V-18 の残り 47 組と VW-0 の大きさも同じ扱いです。

### 6-2. V-17 ✔（2026-09-15 04:08 開始・`DAY_ROTATION` の是正の後の作業ツリー）

`tools/verify-v17.mjs`（200 レース / 12 頭 / `TIME_GAP_FACTOR = 0.045`）: **旧来・本番とも PASS（①②）・exit 0**

| 距離 | 勝ち時計（中央）旧来 | 本番 10 場 | 1着〜最下位の差 中央（旧来） | 本番 10 場の幅 |
|---|---|---|---|---|
| 1200 | 74.2 秒 | 10 場とも 74.2 秒 | 1.98 秒 | 1.98 |
| 1400 | — | 87.0 秒 | — | 2.32〜2.33 |
| 1600 | 99.9 秒 | 99.9 秒 | 2.64 秒 | 2.64 |
| 1800 | — | 112.9 秒 | — | 2.98 |
| 2000 | 126.0 秒 | 126.0 秒 | 3.35 秒 | 3.35〜3.36 |
| 2400 | 152.6 秒 | 152.6 秒 | 4.14 秒 | 4.14〜4.15 |
| 3000 | — | 193.5 秒 | — | 5.19 |

`tools/verify-v17-time.mjs`（1600m / 3000 レース / 4 シード）: **旧来・本番 10 場とも ①② ✅・exit 0**。10 場とも 勝ち時計の平均 99.90 秒（帯 93〜101 の中 100%）／ 着差の平均 2.80 秒・中央 2.66 秒（帯 2〜4 の中 83.7〜83.8%）

- 場による違いは、着差の p10〜p90 で最大 0.01 秒でした。勝ち時計は 10 場で同じ値です
- △ 場の形がほとんど効かない理由は、この便では調べていません（D-064: `TIME_GAP_FACTOR` は表示と記録にだけ効く）

### 6-3. V-18（本番の 70 組）— ⚠️ 未完（23 / 70 組）

`npx tsx tools/verify-v18.mjs`（2000 レース / 12 頭）は中断で 23 組までしか出ていません。**出た 23 組はすべて PASS**:

| 場 | 距離 | ① 枠順と着順 | ②a 内外差 | ②b 枠間の平均差 |
|---|---|---|---|---|
| 青嶺（7 距離） | 1200〜3000m | +0.008〜+0.070 | 9.5〜9.8 馬身 | 0.181〜0.413 馬身 |
| 銀嶺（7 距離） | 1200〜3000m | +0.008〜+0.069 | 7.8〜8.0 馬身 | 0.164〜0.342 馬身 |
| 霧ヶ原（7 距離） | 1200〜3000m | +0.008〜+0.069 | 7.8〜8.2 馬身 | 0.170〜0.342 馬身 |
| 大河原 | 1200・1400m | +0.069・+0.053 | 8.1・8.0 馬身 | 0.248・0.181 馬身 |

- ⚠️ **月見丘・白砂（必須の 2 場）を含む残り 47 組は未計測**です。全 70 組を 1 本で流すと長いので、**オーナーのターミナルで 1 本**流していただく予定です
- この実行は 03:59 開始で、`DAY_ROTATION` の是正（04:05）より前です。是正は場の割り当ての順番だけを変え、70 組の集合と凍結した形は変えないので、上の値には効きません

### 6-4. CI の V-18（`apps/cli/test/v18-gate.test.ts`）✔

| 組 | 本数 | 見るもの |
|---|---|---|
| 既定の走路（`DEFAULT_OVAL`）1200・1600・2000・2400m | 600 レース | ① ②a と対照（旧形に戻すと ②a が帯を割る） |
| **月見丘・白砂** の 1200m・3000m | 600 レース | ① ②a |
| 月見丘・白砂 の 3000m | ②b | ②b |
| **10 場すべて** の 3000m | 200 レース | ②a |
| 対照: 白砂と大河原 ／ 凍結なし（`DEFAULT_OVAL`） | 50 レース | 凍結を読めば場ごとに ②a が違い、凍結なしの値とも違う |

- 2026-09-15 09:32 に 1 本だけ流して **9 件中 9 件合格・42.7 秒**でした（下の差し替えの前）
- ⚠️ **対照の 2 つめを差し替えました。** 初版は `expect(at()).toBe(at())` で、同じ値を自分と比べていたので、どう壊れても落ちませんでした（R-16）。凍結を渡さないときの値（`DEFAULT_OVAL`）と比べる形に直しました。差し替えの後の結果は §9-1 の全体の実行で確かめます

- **V-10 は流していません**（指示書 §7-2）。道具は本番の条件に揃えました。**本便のコミットの後に、オーナーが別のターミナルで** `npm run verify:payout -- --races 500 --seeds 42` を 1 本（第 1 便 AF-2・第 2 便 BF-6 もこの 1 本で判定）
- 帯を外れたゲートがあっても較正定数は動かしていません

---

## 7. VW-6 staging での実演

| # | 誰 | 作業 | 結果 |
|---|---|---|---|
| 1 | 開発側 | `npx tsx tools/migrate.mjs --env staging` | ✔ 適用前: `course_frozen` 列なし・未適用 1 件（`0023` だけ）・食い違い 0 ／ 適用後: `jsonb`・null 可・**39 行すべて null**・`schema_migrations` にチェックサム `2713146306897bb8…`（2026-09-14T19:01:27Z） |
| 2 | 開発側 | `npx tsx tools/verify-anon-exposure.mjs --env staging` | ✔ **V-20 11 件中 11 件合格**（ビューを変えていない） |
| 3 | 開発側（オーナーの指示で） | `npx tsx tools/seed-races.mjs --env staging --races 26 --trials 10000` | ✔ **完了**（2026-09-16・`REPORT_STAGING_DEMO_20260916.md`）。**26 本・1 本 約 2 秒**。★**【VC-4 の 4】所要の見積りを実測に置き換えました**: 古い註記の「1 本 80〜96 秒」「236〜976 秒」は D-071 の前後のもので、いまの値ではありません。**本番と同じ 3,896,104 試行なら 1 本 約 110 秒**（計算: ES-6 の試行 1 回 約 28µs × 3.9M ＋ 出走表の生成などの固定分 約 2 秒） |
| 4 | 開発側 | 生成されたレースの `course_frozen` を読み、10 場・全件 `'oval'`・値が `venues.ts` と一致 | ✔ **完了**: 26 本すべて凍結あり・全件 `'oval'`・`frozenCourseOf` と完全一致・**10 場すべて**（`REPORT_STAGING_DEMO_20260916.md` §2） |
| 5 | 開発側（オーナーの指示で） | `npx tsx tools/settle-races.mjs --env staging --from-cycle 5573` | ✔ **完了**: 26 本確定。`--from-cycle` で以前からの未確定 2 本には触れていません |
| 6 | 開発側 | `npx tsx tools/verify-entrant-freeze.mjs --env staging --recompute-settled` で新しい行が全件一致 ／ `--ignore-course-frozen` で食い違いが出る | ✔ **完了**: 新しい 26 本は**全件一致** ／ 変異は**天河 1400m で食い違う**（同 §3・§4） |
| 7 | 開発側 | 既存の null 行が確定されたら通報の件数 | ✔ **完了**: 凍結の無い行は **7 本**（`--recompute-settled` の出力。今回の 26 本はすべて凍結あり）。既知の食い違い cycle 686・868 は増えていません |

---

## 8. 変異の実演と復元

### 8-1. §4-2-2 確定を `'oval'` の直書き（`course` なし）・モンテカルロを直線に ✔

`course-frozen-wiring.test.ts`: **5 件中 3 件が落ちた**
- ★1 `expected 'straight' to be 'oval'`（保存した凍結とモンテカルロの形が違う）
- ★2 `★cycle 7: expected 'oval' to be 'straight'`（確定とモンテカルロの形が違う）
- ★3 `expected undefined to be { lapM: 2000, … }`（null の行でも `course` を明示していない）

### 8-2. §5-4-5 確定で `course` を渡し忘れる ✔

**5 件中 2 件が落ちた**
- ★2 `★cycle 7: expected undefined to deeply equal { lapM: 1900, homeStretchM: 310, … }`（潮風）
- ★3 同上（null の行）
- ⚠️ ★1 は落ちない（保存とモンテカルロは正しいまま）。スターパークだけで検査すると ★2 は `DEFAULT_OVAL` と同じ値で通るので、組は**スターパーク以外に固定**し、★2 に「`DEFAULT_OVAL` と違う形であること」も書いた

### 8-3. 復元 ✔

2 回とも元の行に戻してから `course-frozen-wiring.test.ts` 5/5 合格、`grep MUTATION apps/worker/src` 0 件。

### 8-4. §6-2 道具が凍結を読まない形（staging）

⏳ VW-6 の 5 の後に `--ignore-course-frozen` で実演します。

---

## 9. 再実行表（期待値つき）

| # | コマンド | 期待値 |
|---|---|---|
| 1 | `npx vitest run packages/scheduler/test/conditions.test.ts apps/cli/test/course-frozen.test.ts apps/cli/test/venue-course.test.ts apps/worker/test/course-frozen-wiring.test.ts apps/worker/test/cycle-runner.test.ts` | すべて合格 |
| 2 | `npx vitest run apps/cli/test/v18-gate.test.ts` | 9 件すべて合格・単独で 約 43 秒 ✔ |
| 3 | `npm run typecheck` | 0 エラー ✔（対照の差し替えの後にも再実行・exit 0） |
| 4 | `npx tsx tools/verify-v18.mjs` | 70 組すべて PASS（⚠️ 未完。出た 23 組はすべて PASS・残り 47 組は未計測・§6-3） |
| 5 | `npx tsx tools/verify-v17.mjs` ／ `--legacy-conditions` | どちらも V-17 PASS（①②）・exit 0 ✔ |
| 6 | `npx tsx tools/verify-v17-time.mjs` ／ `--legacy-conditions` | 旧来 1 本・本番 10 場とも ①② ✅・exit 0 ✔ |
| 7 | `npm run verify:race` ／ `-- --legacy-conditions` | ✔ **どちらも V-4〜V-6 PASS**（本番 31.37% / 62.18% / 1.15%・旧来 31.26% / 62.31% / 1.21%・2 条件で 約 27 分・§6-1） |
| 8 | `npx tsx tools/migrate.mjs --env staging` | 「未適用のものはありません」 |
| 9 | `npx tsx tools/verify-anon-exposure.mjs --env staging` | V-20 11/11 |

### 9-1. `npx vitest run` 全体 ✔

`npx vitest run --maxWorkers=2 --minWorkers=1`（2026-09-15 09:39〜09:44・HEAD `57adf77` と本便の未コミットの作業ツリー・対照の差し替えの後）

```
 Test Files  1 failed | 164 passed (165)
      Tests  1 failed | 1710 passed (1711)
 exit=1   Duration 291.30s
```

- 赤は既存の `packages/render/test/edit-grammar-audit.test.ts` ⑨（`独走代表: expected 'contest' to be 'solo'`）だけです。**1 件から増えていません**
- 本便の検査ファイルは全部合格です: `conditions.test.ts` 15 ／ `course-frozen.test.ts` 7 ／ `venue-course.test.ts` 11 ／ `course-frozen-wiring.test.ts` 5 ／ `cycle-runner.test.ts` 21 ／ `calibration-registry.test.ts` 5 ／ `v18-gate.test.ts` 9
- 裁定 `REVIEW_RACE_SIDE_ONLY_VERDICT_20260915.md` §1 の 163 ファイル・1685 件より、2 ファイル・26 件多くなっています。増えたファイルは本便で足した `course-frozen.test.ts`・`course-frozen-wiring.test.ts` です
- ⚠️ `--maxWorkers=2` だけでは `options.minThreads and options.maxThreads must not conflict` で 1 件も走りません（`Test Files no tests`）。`--minWorkers=1` を一緒に付けてください
- △ 差し替えた対照（§6-4）の**変異の実演はまだです**。凍結を読まない形に戻すと落ちることを、まだ確かめていません

---

## 10. 未検証・残り

- 本番の VW-0 件数（オーナーの指示待ち）
- VW-6 の 3〜7（オーナーの seed-races・settle-races の後）
- V-10（オーナーの別ターミナル・コミットの後）
- staging の既存 2 行の再計算の食い違いの原因（△ §5-1）

## 11. デザイナー側・レビュー側の 50 場の相談との関係

- デザイナー側（Claude Design「STAR レース中継 HUD」）の R-9 への回答は、2026-09-15 の同期時点で**まだ届いていません**（`components/` に新しいカードなし）
- 本便は指示書 §0-2 で描画・演出を含まないので、デザイナー側の案は本便の実装に影響しません。凍結に `turn` を入れたので、場ごとの景色・右回りの向き（相談 Q-D1・Q-D8）を**本番のレースの凍結から引ける**土台はできました
- レビュー側の回答（`REVIEW_CONSULT_RACE_50_VENUES_ANSWER_20260915.md`）§7 の順番では、本便（⓪ 本番への配線と凍結）が先で、景色・季節・時間帯（決定 2: 発走の時刻から）は後の便です

---

## 付録 A. VW-0 の件数の SQL（読み取りのみ）

開発側の作業用スクリプト（リポジトリには入れていません・`tools/` に置くと `classification.mjs` の登録が要り、§0-3 の表の外になるため）。接続直後に `set session characteristics as transaction read only`、`--env` は必須（`tools/lib/env.mjs` の `loadEnv`）。

```sql
select environment from app_environment;
select column_name, data_type from information_schema.columns
 where table_name = 'races' and column_name in ('course_id', 'course_frozen');
select count(*)::int total,
       count(*) filter (where distance <= 1400)::int le1400,
       count(*) filter (where distance <= 1400 and status = 'settled')::int le1400_settled,
       count(*) filter (where distance <= 1400 and grade is not null)::int le1400_graded,
       count(*) filter (where status = 'settled')::int settled,
       min(created_at) first_created, max(created_at) last_created
  from races;
select distance, (grade is not null) graded, status, count(*)::int n from races group by 1,2,3 order by 1,2,3;
select course_id, count(*)::int n from races group by 1 order by 1;
select r.status race_status, b.status bet_status, count(*)::int bets,
       coalesce(sum(b.amount),0)::bigint stake_ep, coalesce(sum(b.payout),0)::bigint payout_pp
  from bets b join races r on r.id = b.race_id
 where r.distance <= 1400 group by 1,2 order by 1,2;
select count(*)::int bets, coalesce(sum(amount),0)::bigint stake_ep, coalesce(sum(payout),0)::bigint payout_pp from bets;
select count(*)::int n from races r
 where r.status = 'settled' and r.distance <= 1400
   and not exists (select 1 from race_entries e where e.race_id = r.id and e.entrant_snapshot is null)
   and exists (select 1 from race_entries e where e.race_id = r.id);
```

**本番（オーナーの指示があってから 1 回だけ）**: 開発側が同じスクリプトを `--env production` で流します。オーナーが自分で流す場合は、リポジトリの直下で `! node <作業用スクリプト> --env production`（パスは指示をいただいたときにお伝えします）。

---

本書の作成にあたって、**7DAYS のファイルは開いていません**。
