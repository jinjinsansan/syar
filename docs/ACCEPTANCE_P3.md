# P3 受け入れ判定（R-23: 基準ごとに SHA を併記）

**作成**: 2026-08-12 / **HEAD**: `a97f603` 以降（各行の SHA が実際の証拠の出所）

> **R-23**: 証拠は「いつのものか」だけでなく「**どの経路のものか**」でも失効する。
> この表の各行は、**その SHA のコードで実際に流した出力**に対応する。

---

## 1. 合格基準 B-1〜B-9

| # | 内容 | 判定 | SHA | 証拠 |
|---|---|---|---|---|
| **B-1** | 1頭を誕生から引退まで通せる（実 DB・各週の記録） | **PASS 10/10** | `2a4106a` | `tools/verify-b1.mjs`（staging・260週すべて記録） |
| **B-2** | V-7 故障率 | **PASS** | `259b17d` | V-7a 29.9%（帯20〜40%）/ V-7b 0.7%（3%以下）・1,800頭 |
| **B-3** | V-11 の構造報告 | **完了** | `786fd1e` | `tools/diag-v11.mjs`（本番の実測つき） |
| **B-4** | `current ≤ potential` が全経路で成立 | **PASS** | `eb6fee6` | 単体（`week.test.ts`）＋ staging 全馬で超過 0 頭 |
| **B-5** | 週番号が時刻から決まり、欠落も重複もしない | **PASS** | `eb6fee6` | 単体12件 ＋ staging 8項目（冪等・二度進まない） |
| **B-6** | 調子・疲労が §8b の介入ゲージ初期値に接続 | **PASS** | `9fce812` | 本番の実分布で V-13 = 0.165（有意差）・全ゲート PASS |
| **B-7** | 引退馬が NPC と同一の遺伝エンジンで繁殖に乗る | **PASS** | `6423e38` | `retirement.test.ts`（★繁殖の実装がここに無いことを機械的に検査） |
| **B-8** | P0/P1/P2 の全ゲートが通る（回帰） | **PASS** | §2 参照 | 各ゲートを現 HEAD で再実行 |
| **B-9** | テスト全PASS・typecheck・`any` ゼロ・変異試験 | **★条件付き** | 本便 | 622件緑 / `tsc --noEmit` / ★**変異試験は 24 OK / 23 NG**（§3） |

---

## 2. B-8 の内訳（回帰）

| 層 | 判定 | 実行したもの | 結果 |
|---|---|---|---|
| **P0** | **PASS** | `npm run verify` | 8シード × V-1 / V-2a / V-2b / V-2d / V-2e / V-2f / V-3 がすべて PASS。**V-2c（300年）も PASS**（最小 15.18% / 最大 16.49%） |
| **P1** | **PASS** | `npm run verify:race --pool docs/pool-staging.json --real-ability --b6-wired` | V-4 32.32% / V-5 63.26% / V-6 1.00% / V-8 93.59% / V-13 0.165 |
| **P2** | **PASS** | `tools/audit-tools.mjs`（A-2/A-4/A-5/A-6/A-7 等を staging で2回ずつ） | 全件 exit 0・2回の出力が一致・行数も戻る |

★**P1 は「本番の開放率分布そのもの」で測っています**（Q-P3-39 の裁定）。
母集団は `docs/pool-staging.json` に同梱し、独立に再実行できます。

---

## 3. 変異試験（B-9）— ★満たしていません

`npm run mutation` を流しました。**24 OK / 23 NG** です。
★**「テストがある」ことと「テストが守っている」ことは別**で、
このハーネスは「**★付きの振る舞いテストが落ちること**」を要求します
（値照合 `toBe(7.8)` は摂動すれば必ず落ちるので、防御の証拠になりません・R-14）。

### ★まず、これは私が確かめずに PASS と書いていました

最初この判定書に「B-9 PASS」と書きました。**変異試験の結果を見る前**です。
「PASS と書いてあることが、何についての PASS なのか」——**自分で踏みました。**

### P3 で足した定数は防御できています

| 定数 | 判定 |
|---|---|
| `TEMPER_FLOOR_RATIO` | ✓ OK（V-15 が検出） |
| `INJURY_BASE_PROB` | ✓ OK |
| `COMMON_EVENT_PROB` / `PUSH_THROUGH_IQ_MULT` | ✓ OK |
| `FATIGUE_NATURAL_RECOVERY` | ✓ OK |
| `MAIN_EFFECT_COEF` / `SIDE_EFFECT_COEF` | ✓ OK |
| **`BASE_GAIN`** | ✗ → **★本便で ★試験を足して OK にしました** |
| **`DOMINANCE_MARGIN_RATIO`** | ✗ → **★本便で ★試験を足して OK にしました** |

- `BASE_GAIN`: `packages/training/test/base-gain.test.ts`
  「**放置だけでは上限近くまで開放されない**」（実測 68.2%。既定値 12 に戻すと約87%）
- `DOMINANCE_MARGIN_RATIO`: 判定を `isNotDominant()` に切り出し、
  `apps/cli/test/dominance.test.ts` で「**支配的な戦略を実際に落とせるか**」を試験

**どちらも変異試験を単体で流し、★付きテストが検出することを確認済み**です。

### ★残り 21 件は P1 期からの積み残しです

変異試験は **P1（`7bbf1c6`）以来、一度も流されていません**。
その間に登録簿へ追加された定数（`race-field.ts` 系・`race-engine/balance.ts` 系・
`LAMBDA_STAR` / `ODDS_CAP` / `CANCEL_AFTER_START_MS` / `PRIZE_TABLE` ほか）は、
**値照合テストしか持っていません**。

```
未防御 21件:
  PRIZE_TABLE / CANCEL_AFTER_START_MS / LAMBDA_STAR / ODDS_CAP / NAME_TAIL_RATE /
  CALIBRATED_RACE_RANDOM_K / TAIL_MIX_P_DEFAULT / TAIL_MIX_M_DEFAULT /
  PLACEHOLDER_UNLOCK / DEFAULT_CLASS_BAND / OFF_SURFACE_ENTRY_RATE /
  TRACK_CONDITION_CDF / DISTANCE_SUIT_MIN / OFF_DISTANCE_ENTRY_RATE /
  FIELD_STRENGTH_FLOOR / FLOOR_FIELD_SIZE_SLOPE / OVERSAMPLE_RATIO /
  FLOOR_REDRAW_PASSES / CLASS_PRIZE_TOP_MULT / FIELD_SIZE / DEFAULT_POPULARITY_TRIALS
```

★**P3 の範囲外なので、こちらでは手を付けていません**（照会 Q-P3-40）。
★ただし **B-9 は「変異試験すべて防御」なので、この状態では満たしていません。**

## 4. G-1〜G-8

| # | 内容 | 判定 | SHA |
|---|---|---|---|
| **G-1** | 週進行エンジン | PASS | `eb6fee6`（`packages/scheduler/src/week.ts` ＋ ワーカー接続） |
| **G-2** | 調教8種と成長式 | PASS | `6423e38`（`menus.ts` / `growth.ts`） |
| **G-3** | 疲労と調子 | PASS | `6423e38`（`condition.ts`・D-046 の自然回復こみ） |
| **G-4** | 故障判定 | PASS | `259b17d`（`injury.ts`・D-045 の切り下げこみ） |
| **G-5** | 育成イベント | PASS | `6423e38`（`events.ts`・気性の下限を通す） |
| **G-6** | EP の消費 | **PASS 8/8** | `cb519fa`（`spend_training_ep`・並列5本でも記帳1行） |
| **G-7** | PP の発行と台帳 | **PASS 7/7** | `66e0dae`（§11.1 の表と一致・NPC には払わない） |
| **G-8** | 引退と繁殖入り | PASS | `6423e38`（`retirement.ts`） |

---

## 5. 新設・改訂したゲート

| ゲート | 内容 | 判定 | SHA |
|---|---|---|---|
| **V-7a/b**（D-049 で分割） | 恒久ダメージ 20〜40% / 致命的 3%以下 | PASS 29.9% / 0.7% | `259b17d` |
| **V-14**（③を D-047 の定義に是正） | 同一 EP 予算下で支配的でない | PASS 比 0.68倍 | `cf32d8e` |
| **V-15**（新設・両側） | ①中盤SD ≥ 誕生時の50% / ②低下 ≥ 15% | PASS 60.8% / 35.8% | `cf32d8e` |
| **V-11**（②を追加） | 発行量と消費量がともに実質ゼロでない | **合成集団で PASS 7/7** | `786fd1e` |

---

## 6. ★この判定書の限界（明記しておきます）

| # | 内容 |
|---|---|
| 1 | **VPS では測っていません。** 周時間（A-1 の余裕）は開発機での実測です。VPS は `ca575f9`（P2期）のままで、**P3 の変更は1つも配備されていません** |
| 2 | **P1 は実物の母集団で測っているので、シードを変えても母集団は同じ**です。シード間 SD は 0.39%（合成母集団のときは 0.55%）で、**そのぶん SE は小さく出ます** |
| 3 | **開放率は動き続ける入力**です。この判定は **平均 71.3% / SD 12.6pt / p10 55.3% p50 73.8% p90 86.1% / 週齢平均 182週** の上に立っています。`unlock_daily` が毎日記録するので、**ここがずれたら測り直してください** |
| 4 | **②③（`PLACEHOLDER_UNLOCK` 廃止 ＋ B-6）は本番に入っていません。** 受け口は残してあり、裁定待ちです（Q-P3-35） |
| 5 | **B-9 は満たしていません**（変異試験 23件 NG のうち 21件は P1 期からの積み残し・§3） |
| 6 | **V-10 の本番経路版は、実現払戻率では原理的に測れません**（±1% に 287万〜6,700万レース）。`p × odds` で代替しており、測り方の裁定待ちです（Q-P3-34） |

---

## 7. 未回答の照会

**Q-P3-20〜31 / 33〜39**。特に判断が要るもの:

| # | 内容 |
|---|---|
| **Q-P3-35** | ②③ を本番に入れてよいか（★測定は揃いました） |
| **Q-P3-37** | VPS に Q-P3-32 の是正（オッズと条件の不一致・馬場 good 固定）を配備するか |
| **Q-P3-34** | V-10 の本番経路版の測り方（`p × odds` を採るか） |
| **Q-P3-33** | 馬場状態の割合は何本で判定するか |
| **Q-P3-40（新規）** | ★変異試験の未防御 21件（P1 期からの積み残し）をどう扱うか。B-9 の判定に含めるか |
