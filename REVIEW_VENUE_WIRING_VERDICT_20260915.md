# 裁定（中間）— 本番のレースを 10 場の走路で走らせる（報告 `REPORT_VENUE_WIRING_20260915.md`・コミット `80c4eb3`）

**案件**: STAR（ポイ活型オンライン競馬育成）
**発行**: 2026-09-15 ／ レビュー側 → 開発側・オーナー
**対象**: 指示書 `DEV_INSTRUCTIONS_VENUE_WIRING_20260915.md`（VW-0〜VW-6）／ 報告 `REPORT_VENUE_WIRING_20260915.md` ／ コミット `80c4eb3` ／ ブランチ `p4/race-30sec-cuts`・HEAD `cfc3ad1`
**同日の関連**: 回答 `REVIEW_QUESTIONS_ENGINE_LANE_SPEED_ANSWER_20260915.md`（ES 便）

> 凡例（R-13）: **✔** ＝ レビュー側がコードを読んで確かめた、または手元で実行した ／ **△** ＝ 未確認 ／ **計算** ＝ 定数から出した値
> ★**本書は中間の裁定です。** コードの照合だけを判定し、ゲートの測定は ES 便（エンジンの速さ）の後に最終裁定で判定します。
> 本書は正典を編集しません。

---

## 0. 判定

| 範囲 | 判定 |
|---|---|
| **コード**（VW-1〜VW-4・VW-5 の道具の形） | ✅ **PASS** |
| **ゲート**（VW-0 の大きさ・VW-5 の測定・VW-6 の staging での実演） | ⏸ **保留** — 計測がエンジンの遅さで止まっている（照会 `QUESTIONS_ENGINE_LANE_SPEED_20260915.md`） |
| **総合** | **CONDITIONAL PASS（中間）** |

★**本番への `0023` の適用・新しいワーカーの配備は、ES 便の裁定と本便の最終裁定の後です。**

---

## 1. 照合した事実

| # | 指示書の要求 | 照合 |
|---|---|---|
| 1 | VW-1 直線の抽選は本番の経路で**引いてから捨てる**（乱数の並びをずらさない） | ✔ `apps/cli/src/race-field.ts:502`（`drawnStraight` を先に引く）・`:512`（`programme` があれば凍結の値）。検査は 300 本・直線が実際に引かれた標本を含む（`apps/cli/test/course-frozen.test.ts`） |
| 2 | VW-1 確定の `'oval'` の直書きを消す | ✔ `apps/worker/src/pg-store.ts` の `settleRace` から削除。条件は `conditionsFromFrozen` だけから |
| 3 | VW-2 競馬場は**サイクル番号だけ**・**その回の馬場を持つ場だけ**・均等 | ✔ `packages/scheduler/src/conditions.ts` `conditionsOf`（`surfaceOrdinal`・`DAY_ROTATION`）。乱数も時計も読まない |
| 4 | VW-2 註記「commit は条件を含む」を実装に合わせて訂正 | ✔ 同ファイル冒頭 |
| 5 | VW-3 凍結は**1 回だけ作り**、同じものでモンテカルロと保存 | ✔ `apps/worker/src/build-race.ts:67`（`frozenCourseOf` を 1 回）・`:101-103`（条件を作る）・`:117`（モンテカルロ）・`:166-168`（同じ参照を返す） |
| 6 | VW-3 `createRace` の**同じトランザクション**で保存 | ✔ `pg-store.ts:136`（`begin`）〜`:240`（`commit`）の中で `$13::jsonb` |
| 7 | VW-3 確定は凍結を読む ／ null は `DEFAULT_OVAL`・`'oval'` で確定して**件数を通報** ／ 不正は**確定せずに投げる** | ✔ `pg-store.ts:387-409`（検める・`venueId ≠ course_id` も投げる）・`:436-441`（**commit の後に**数える）。中止・返還は `cycle-runner.ts` の名前の判定に `InvalidFrozenCourseError` を追加 |
| 8 | VW-3 移行ファイル: 既存行は null のまま・ビューを変えない | ✔ `db/migrations/0023_race_course_frozen.sql`（`add column if not exists`・更新文なし・`races_public` に触れない） |
| 9 | §5-3 凍結から条件を作る関数は**1 か所** | ✔ `packages/race-engine/src/course-frozen.ts` `conditionsFromFrozen`。ワーカーの生成（`build-race.ts`）・確定（`pg-store.ts`）・再計算（`tools/verify-entrant-freeze.mjs` `conditionsOfRow`）・測定器（`verify-race.ts:306`・`verify-payout.ts:167`・`tools/lib/v18.mjs:82`・`tools/verify-v17.mjs`）がすべて通る |
| 10 | §5-3 層の向き | ✔ `@star/race-engine` は `@star/scheduler` を引かない。型は両方に同じ形で持ち、`course-frozen.test.ts` が相互に代入し、10 場すべてで突き合わせる |
| 11 | 不正な凍結の範囲（知らない項目・版・寸法・回り・形・半径・1 周との食い違い） | ✔ `parseFrozenCourse`。知らない項目で投げる（版を上げずに足した項目を読まずに確定しない） |
| 12 | VW-4 再計算の道具が凍結を読む | ✔ `tools/verify-entrant-freeze.mjs`（`--recompute-settled`・`--ignore-course-frozen`） |
| 13 | VW-5 測定器の既定は本番の条件（R-31） | ✔ `verify-race.ts:280`・`verify-payout.ts:157`（`productionRaceOf`。旧来は `--legacy-conditions` のときだけ）・`v18.mjs:207` |
| 14 | 経路の検査（R-30）: 両辺を自分で組み立てない | ✔ `apps/worker/test/course-frozen-wiring.test.ts` は `resolveRace` を包み、**エンジンが実際に受け取った条件**を生成と確定の両方で記録して比べる。組は**スターパーク以外**・1400m 以下・左右を含み、`DEFAULT_OVAL` と違う形であることも見る |
| 15 | 検査の再実行 | ✔ レビュー側の実行（HEAD `cfc3ad1`）: `conditions`・`course-frozen`・`venue-course`・`course-frozen-wiring`・`cycle-runner` の **5 ファイル・59 件すべて合格**（2.6 秒） |

---

## 2. 条件（最終裁定までに）

| # | 条件 | 中身 |
|---|---|---|
| **VC-1** | ゲートの測定（**ES 便の後**） | VW-0 の大きさ（報告 §0-2）／ V-4〜V-6 を旧来と本番の両条件で ／ V-18 の残り 47 組（**月見丘・白砂を含む**）／ VW-6 の 3〜7 ／ V-10（オーナーの別ターミナル）。★**VW-6 の 3 の本数と所要の見積りは ES 便の後に取り直す**（報告 §7 の「35 分〜7 時間」は D-071 の前の註記に基づいていて、いまは成り立たない） |
| **VC-2** | CI の V-18 の対照の**変異の実演** | 報告 §9-1 の △。凍結を読まない（`DEFAULT_OVAL` に落ちる）形に戻して、書き直した対照が落ちることを見せる（R-16） |
| **VC-3** | `apps/cli/package.json` に **`@star/scheduler` を宣言** | `verify-race.ts`・`verify-payout.ts`・検査が引いている。ワークスペースのリンクでたまたま解決している形は、配る物の自己検査（D-043）や依存の整理で黙って外れる。§0-3 の表の外だが**触ってよい** |
| **VC-4** | 報告の穴を埋める | `git diff --numstat`（TBD）／ §0-2（TBD）／ §6 冒頭の中断の原因（照会 §3-1 の「Windows Update の再起動」と食い違う）／ §7 の所要の見積りの訂正 |
| VC-5 | （急がない）基準斤量 55 が 2 か所 | `race-field.ts`（`generateRace`）と `course-frozen.ts`（`BASE_WEIGHT_KG`）。本番の経路はどちらも `conditionsFromFrozen` の値を使うので結果は一致する。次にこの 2 ファイルに触るとき、片方がもう片方を引く形に（D-052「条件は 1 か所で引く」） |

---

## 3. 受理（指摘しない）

| 事項 | 理由 |
|---|---|
| `apps/worker/src/cycle-runner.ts` を §0-3 の表の外で変更 | 型と中止の経路の 2 点だけで、指示書 §5-2 の配線に要る。報告に明記あり |
| 凍結の無いレースの通報が `console.warn` | ワーカーの他の警報（中止・失敗）も `console.error` で、同じ水準。通報の経路を強くするのは別の便 |
| 不正な凍結の経路で rollback が 2 回（`pg-store.ts:404` と `:443`） | 既存の `UnfrozenRaceError`（`:360` と `:443`）と同じ形。Postgres は 2 回目を警告にするだけ。直すなら 2 つまとめて別の便 |
| 初版の割り当ての欠陥（芝 90 本が 10 で割り切れる） | 開発側が自分で見つけて直した。検査「10 日でクラスごとの芝の本数が 10 場で等しい」で固定 ✔ |
| staging の既存 2 行（cycle 686・868）の再計算の食い違い | どちらも走路の凍結の無い行で、本便の前後で条件が同じ（`DEFAULT_OVAL`・`'oval'`）。本便の原因ではない。原因の特定は別件（残件） |
| 利用者向けの公正性の検証 | `apps/web/src/app/races/[id]/page.tsx` は commit の照合（`verifyReveal`）だけで、着順の再計算を出していない → 本便で壊れるものは無い。★**着順の再計算を公開する日には、`course_frozen` を公開ビューに足すこと**（R-29: 必要なものだけ開ける）→ 残件 |

---

## 4. 照会 Q-1〜Q-3（オーナー）

開発側は既定で進めました。レビュー側は**既定のままでよい**と考えます（R-27 の狭い側）。

| # | 既定 | 補足 |
|---|---|---|
| Q-1 | 直線コースを本番の番組に**入れない** | 10 場はすべて楕円。入れる日のために `conditionsFromFrozen` は `'straight'` も受ける |
| Q-2 | 馬場ごとに 10 場へ**均等** | 白砂（ダートの本場）も他の場と同じ本数（報告 §3-2）。偏らせたければオーナー判断 |
| Q-3 | 50 鞍の重賞は**この便では当てない** | 週次頻度（§10.3）と 50 鞍の B案の食い違いが未決 |

---

## 5. このあと

1. ES 便（回答 `REVIEW_QUESTIONS_ENGINE_LANE_SPEED_ANSWER_20260915.md` §5）
2. 本便の VC-1〜VC-4 → 最終裁定
3. 本番: `0021` → `0022` → `0023` → 新しいワーカーの配備（指示書 §10・オーナーの指示で）
4. 最終裁定のあと、オーナーの承認を得て正典に **D-099（候補）**（走路の形を生成時に値で凍結する）を起票

---

本書の作成にあたって、**7DAYS のファイルは開いていません**（`REVIEW_SESSION_RULES.md` §7・越境なし）。
