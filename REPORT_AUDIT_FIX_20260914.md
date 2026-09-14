# 報告書 — 監査の修正 第 1 便（払戻の額 ／ 調教の EP 引き落としと関数の実行権限）

**案件**: STAR（ポイ活型オンライン競馬育成）
**提出**: 2026-09-14 ／ 開発側 → レビュー側
**指示書**: `DEV_INSTRUCTIONS_AUDIT_FIX_20260914.md` ／ 裁定 `REVIEW_AUDIT_VERDICT_20260914.md`
**対象**: 監査 H-1・H-2・H-3・H-4 だけ（H-5・H-6・M-* には触れていません）

> 報告は鵜呑みにされない前提で書きます（CLAUDE.md）。
> 凡例（R-13）: **✔ 再現** ＝ 実行・計算の出力で確かめた事実 ／ **△ 未検証** ＝ 主張・推測のまま。
> ⚠️ 実行が終わらなかった測定は「未計測」と書き、数字を予測で埋めていません（V-10・§3-3）。

---

## 0. 位置

| | |
|---|---|
| ブランチ | `p4/race-30sec-cuts` |
| 開始 HEAD | `620e2c1` |
| 終了 HEAD | `008d822`（実装と本書の初版をコミット。push はしていません）。本行と §3-3 の修正は、その次のコミットです（裁定 `REVIEW_AUDIT_FIX_VERDICT_20260914.md` §7） |
| staging | `0021` を適用済み（オーナーが `migrate.mjs --env staging` を実行）。検証用の口座・台帳は削除済み |
| 本番 | **書き込み・適用なし**。読み取り 1 回（オーナーが実行・§1） |

### 0-2. 提出物・変更範囲

変更の行数は §9 の最終計測を正とします（`git diff --numstat 620e2c1`）。

**新規ファイル**

| ファイル | 中身 |
|---|---|
| `packages/betting/src/odds-tenths.ts` | オッズを 0.1 単位の整数（tenths）で扱う入口（切り捨て・十進の文字列からの変換・数値からの変換） |
| `packages/betting/test/odds-tenths.test.ts` | AF-1 総当たり・経路・境界・例外 ／ AF-2 両側・格子・上限の順序 |
| `db/migrations/0021_spend_training_ep_worker_only.sql` | `spend_training_ep` から `assert_setup_complete()` を外す ＋ public・anon・authenticated の EXECUTE を剥がす ＋ EP 不足に SQLSTATE `ST001` |
| `REPORT_AUDIT_FIX_20260914.md` | 本書 |

**指示書 §0-1 の範囲内で変更したファイル**

`packages/betting/src/{settle.ts, balance.ts}` ／ `apps/worker/src/{payout.ts, training-runner.ts}` ／ `apps/cli/test/rpc-guard.test.ts` ／ `tools/verify-anon-exposure.mjs` ／ `tools/lib/exposure-registry.mjs` ／ `apps/cli/src/verify-payout.ts` ／ `packages/betting/test/settle.test.ts`

**⚠️ 範囲表に無いが変更したファイル（6 本）** — いずれも「指示どおりの変更で必ず赤になる」か「指示の変更に直接必要」なものです。

| ファイル | 理由 |
|---|---|
| `apps/worker/src/odds.ts` | `capped: raw > odds` は、切り捨て後は**毎回 true** になる（odds < raw）。`raw > ODDS_CAP[betType]` に変えた |
| `apps/worker/test/odds.test.ts` | 切り捨て前の値を `toBeCloseTo` で固定していた（4.098… → 4.0 で赤）。帯と `toBe(4)` に置き換え |
| `apps/worker/test/payout.test.ts` | 既存の `3.33`・`7.77`・`99.99` が例外になる（R-3）。§2-2-5 の経路テストもここに置いた |
| `apps/cli/test/exposure-registry.test.ts` | V-20 ④（関数の軸）の判定関数のテスト |
| `packages/betting/src/index.ts` | 新規ファイルを外に出す 1 行 |
| `apps/cli/src/calibration.ts` | 新しい数値定数 3 つを登録簿に載せないと `calibration-registry` が赤になる（§6-6） |

**⚠️ 同じ作業ツリーの作法に関わる記録**

- `db/migrations/0017`〜`0020` の 4 本の**改行を CRLF → LF に戻しました**（オーナーの選択）。中身は変えていません。§6-4 を参照。
  `git diff` は 0 行、`git hash-object --no-filters` は HEAD の blob と 4 本とも一致。ただし `git status` には `M` と出ます（**コミットに含めないでください**）。
- `dist/worker.cjs` を `npm run build:worker` で作り直しました（`.gitignore` 対象・追跡外。§6-7）。
- P4 のファイル（`packages/render/`・`apps/web/`・描画系の道具）と、別セッションの未追跡ファイル（png・wav・txt）には触れていません。
- `git stash`・`git add -A`・`git commit -a` は使っていません。

---

## 1. AF-0 先に測る

道具は `af0-probe.mjs`（接続直後に `set session characteristics as transaction read only` を実行し、`transaction_read_only=on` を印字してから読む）。

### 1-a. public スキーマの全関数 × EXECUTE（`pg_proc` を走査・R-29）✔

| 関数 | 本番（0020） | staging（0020） | staging（0021 適用後） |
|---|---|---|---|
| `assert_setup_complete()` | anon − / auth ✔ | anon − / auth ✔ | anon − / auth ✔ |
| `exchange_prize(bigint,uuid)` | **anon ✔** / auth ✔ | **anon ✔** / auth ✔ | **anon ✔** / auth ✔ |
| `place_bet(uuid,text,jsonb,integer,uuid)` | **anon ✔** / auth ✔ | **anon ✔** / auth ✔ | **anon ✔** / auth ✔ |
| `spend_training_ep(uuid,bigint,integer)` | **anon ✔** / auth − | **anon ✔** / auth − | anon − / auth − |

- **H-4 は本番・staging の両方で確定**（`proacl` に `anon=X/postgres`）。
- **報告に無かった発見**: `place_bet`・`exchange_prize` にも anon の EXECUTE がある。先頭の `assert_setup_complete()` が「未認証」で弾くので動作としては閉じているが、権限としては開いている → §7 照会 Q2。

### 1-b. 件数 ✔

| | 本番 | staging |
|---|---|---|
| `users`（全体 ／ player ／ その他） | 0 ／ 0 ／ 0 | 0 ／ 0 ／ 0 |
| `horses where owner_id is not null` | 0 | 0 |
| `bets` | 0 | 0 |
| `ep_ledger where reason = 'training'` | 0 | 0 |

→ **裁定 §3-1 の「実害は推測」を閉じます。** H-4 の穴で他人の EP を削れた期間、本番には利用者も持ち馬もいませんでした（本番を読んだ時刻 `2026-09-13 17:08:50 UTC`）。

本番に向けたコマンド（オーナーが実行・出力は途中で切っていません）:

```
npx tsx <scratchpad>/af0-probe.mjs --env production
```

⚠️ 開発側からの本番読み取りは、オーナーの許可後も Claude Code の自動モード判定で拒否されました。回り込まず、オーナーに 1 本流していただきました。

### 1-c. staging の `race_odds`: 保存値 ÷ 切り捨て前の値（再計算・M = 3,896,104）✔

`race_odds` 103,277 行 ／ 38 レース。**条件違い（保存値が再計算の丸め幅に入らない行）は 0 行**（＝道具が保存値を再現できている）。
`probability` は `numeric(9,8)` で丸めて保存されるため、再計算の幅が 0.005 未満の行を「分解可能」として分けました。

| 券種 | 行数 | 分解可能 | 比の最大（分解可能） | 比の平均（分解可能） |
|---|---|---|---|---|
| win | 519 | 519 | +2.429% | −0.007% |
| place | 513 | 513 | **+4.092%** | +0.054% |
| quinella_place | 2,820 | 2,820 | +2.553% | +0.008% |
| quinella | 3,046 | 2,426 | +1.411% | +0.002% |
| exacta | 6,069 | 3,847 | +0.825% | −0.001% |
| trio | 12,246 | 4,810 | +0.803% | +0.002% |
| trifecta | 78,064 | 6,463 | +0.374% | −0.000% |

→ **監査の「最大 +5.24%」は staging の保存値では再現しませんでした**（最大は複勝の +4.09%）。△ +5.24% は監査エージェントの試算で、保存値ではありません。
→ 四捨五入なので平均はほぼ 0 ですが、**低オッズの目ほど 1 本あたりの切り上げ幅が大きい**ことは表のとおりです。

### 1-d. staging の `race_odds`: 1.0 倍未満の目 ✔

| 券種 | 保存値 < 1.0 | 切り捨てにしたら < 1.0 |
|---|---|---|
| place | 1 | 2（513 行中） |
| 他の 6 券種 | 0 | 0 |

→ 最低オッズは決めていません（指示書 §3-2）。§7 照会 Q4。

### 1-e. `spend_training_ep` の稼働中定義の md5 ✔

| | md5 |
|---|---|
| 本番 | `b9f344581ffdb9df47f207597ac46869` |
| staging | `b9f344581ffdb9df47f207597ac46869` |
| `0020` に再掲された本文 | `b9f344581ffdb9df47f207597ac46869` |

→ 3 つとも一致を確かめてから `0021` を確定しました（`af3-fndef.mjs`・§4-1）。

---

## 2. AF-1 払戻を整数だけで計算する（監査 H-1）

### 2-1. 作ったもの

- `oddsTenthsFromDecimalString("2.3") = 23`: DB の文字列から**浮動小数を経ずに** tenths へ。`numeric(9,1)` の形（整数部 8 桁まで・小数 1 桁・後ろの 0 は許す）以外は**例外**。
- `grossPayout(stake, tenths, mult)`: `⌊stake × tenths / (10 × mult)⌋` を、途中の値もすべて整数で計算（`(x − x mod d) / d`）。
- `settleTenths`（tenths 版）を新設し、`settle`（数値版）は `oddsTenthsFromNumber` で変換してから同じ `grossPayout` を通す。**払戻の式は 1 か所だけ**。
- `payout.ts` は `Number(b.odds_at_purchase)` をやめ、`settleTenths` ＋ `oddsTenthsFromDecimalString` を通す。
- 前提の確認 ✔: `apps/worker/src/pg-types.ts` は numeric（OID 1700）を変換しないので、`pg` は `"2.3"` の文字列で返す（裁定 §3-4 の前提どおり）。

### 2-2. 検査（指示書 §2-2）

| # | 検査 | 結果 |
|---|---|---|
| 1 | 総当たり: 購入額 100〜10,000（100 刻み）× tenths 10〜9,999 × mult 1・2・3 ＝ **2,997,000 通り**を BigInt の正解と照合 | ✔ 食い違い 0 |
| 1' | `settle`（数値のオッズ = tenths / 10）を通す総当たり（購入額 4 通り × mult 3 通り × tenths 全部） | ✔ 食い違い 0 |
| 1'' | 変換の往復: tenths 0〜999,999 の全部で、数値 → tenths ・十進の文字列 → tenths が元に戻る | ✔ 食い違い 0 |
| 2 | 境界: `100 × 2.3 = 230`（テスト内で `Math.floor(100 * 2.3) = 229` も示す）／ 3 頭同着 `100 × 3.5 ÷ 3 = 116` | ✔ |
| 3 | `3.33`・`99.99`・`NaN`・`Infinity`・`-2.3` と、文字列 `"3.33"`・`"abc"`・`""`・`"02.3"`・`"1e2"` ほかが例外 | ✔ |
| 4 | 既存 `settle.test.ts` の `3.33`（同着の切り捨て）→ 3 頭同着 3.5 倍 = 116 ／ `3.33`・`99.99`（上限側）→ tenths で一致の側も押さえる（R-2） | ✔ 守っていたもの（同着の切り捨て・発行超過しない）を保持 |
| 5 | 経路: 偽の DB を通して `settlePayouts` を呼び、`"2.3"` × 100 EP が `update bets set status='won', payout=230` と `prize_points + 230` で書かれる ／ tenths 10〜9,999 × 購入額 100・700 の 19,980 本で書く値が BigInt の正解と一致 ／ `"3.33"` は例外で何も書かない | ✔ |
| 6 | **変異**（下記） | ✔ 検査が捕まえた |

#### 変異の実演（§2-2-6）✔

`settle.ts` の `grossPayout` の最終行を旧式に置き換えて実行（`mutate-run.mjs`・finally で復元・sha256 照合）:

```
- return (numerator - (numerator % divisor)) / divisor;
+ return Math.floor((stake * (oddsTenths / 10)) / mult);

× odds-tenths.test.ts  総当たり（stake=100 odds=2.3 mult=1: 229 ≠ 230 ほか）: expected 79432 to be +0
× odds-tenths.test.ts  settle を通す総当たり: expected 3554 to be +0
× odds-tenths.test.ts  境界: expected 229 to be 230
× payout.test.ts       払戻は購入額×オッズと一致: expected 1609 to be 1610
× payout.test.ts       経路 "2.3" × 100 EP: expected 229 to be 230
× payout.test.ts       経路 19,980 本: expected 1524 to be +0
Tests 6 failed | 12 passed (18) ／ 終了コード 1
復元後 sha256 = 変異前（0231597f…）
```

★**食い違い 79,432 通りは、裁定 §3-3 の独立計算と一致しました**: mult 1 で 31,577 ＋ mult 2 で 31,577 ＋ mult 3 で 16,278 ＝ 79,432。

---

## 3. AF-2 オッズを 0.1 単位で切り捨てて返す（監査 H-2・D-094 候補）

### 3-1. 作ったもの

- `oddsFromProbability` = `floorOddsToTenths(min(ODDS_CAP, raw)) / 10`（上限で頭打ち → 切り捨て）。
- 格子ちょうどの値が浮動小数で下側に表される場合に 1 段下げない許容幅 `ODDS_GRID_EPSILON_TENTHS = 1e-6`（tenths 単位）。根拠（ファイルの註記）:
  - 誤差の側: オッズの計算は四則 4 回で相対誤差 1e-15 の桁、tenths は上限でも 1,000,000 → 絶対誤差 1e-9 tenths の桁。許容幅はその 1,000 倍。
  - 取り違えの側: 本当に格子の 1e-7 倍下にある値を格子へ寄せても、1 点 10,000 EP で払戻の差は 0.001 PP に届かない。
- `verify-payout.ts`: 「cap による損失」と「切り捨てによる損失」を分けて数え、`切捨て無しなら` の列を足した（以前は `raw > paid` の差をすべて cap の損失としていた）。

### 3-2. 検査（指示書 §3-3）

| # | 検査 | 結果 |
|---|---|---|
| 1 | 7 券種 × M 2 通り（10,000・3,896,104）× p_min〜1 の対数等間隔 2,001 点 ＝ 28,014 点で、0.1 単位に乗る・切り捨て前の値以下（許容幅まで）・切り捨て前の値 − 0.1 より大きい | ✔ 違反 0 |
| 2 | `(23 − 1e-9) / 10` → 23（素直な `Math.floor` なら 22 になることもテスト内で示す）／ `2.3 − 1e-6` → 22 ／ `2.3 + 1e-6` → 23 | ✔ |
| — | 上限: 7 券種で「頭打ち → 切り捨て」と「切り捨て → 頭打ち」が同じ値 | ✔ |
| 3 | 既存の `toBeCloseTo(切り捨て前の値)`（`settle.test.ts` の控除率・式変形・上限の 3 か所）を、「帯（両側）」＋「式変形そのものは切り捨て前の値どうしを 9 桁で照合」に置き換え | ✔ 守っていたもの（控除率・補正式・上限）を保持 |
| 4 | V-10 を変更の前後で実行 | **未計測**（変更後の実行もメモリ不足で強制終了・結果なし）§3-3 |
| 5 | staging でレースを 1 本生成し、`race_odds.odds` が再計算の切り捨て値と全行一致 | ✔ 1,396 行すべて（確率の丸め幅の中で一致・幅の外 0・切り捨て前超え 0）§3-4 |
| — | **変異**: `ODDS_GRID_EPSILON_TENTHS = 0` にすると「格子ちょうどは下げない」が赤（Tests 1 failed / 9）。復元 sha256 一致 | ✔ |

### 3-3. V-10（`verify-payout.ts --races 2000 --seeds 42`・odds-trials 10,000）

**未計測です。変更後の 1 本も、メモリ不足でシステムに強制終了され、結果が残りませんでした。**

- 変更前（開始 2026-09-14 01:21 JST・HEAD `620e2c1`）と変更後（開始 01:43 JST・作業ツリー）を同じ条件で同時に走らせましたが、**6 時間を超えても 2 本とも終わらず**（1 本あたり CPU 約 2 万秒・途中経過を出さない道具で、残り時間も見積もれない）、**オーナーの判断で変更前を止めました**（07:30 頃 JST）。
- **変更後も、約 10 時間半走ったところで（2026-09-14 12:15 頃 JST）メモリ不足で強制終了されました。** 出力は冒頭の見出しだけです。この道具は結果を最後にまとめて出すので、途中の値は何も残っていません。強制終了の直後の空きメモリは 15.7 GB 中 3.5 GB でした。
- 「切捨て無しなら」の列が変更前の払戻率と同じ値であることは、裁定 `REVIEW_AUDIT_FIX_VERDICT_20260914.md` §3-2 が式から確かめています（変更前の実行はやり直さない）。
- **V-10 は、第 2 便 §6-3 の 1 本（BF-5・BF-6 を入れた後）で取ります。** オーナーの判断（2026-09-14）により、第 1 便の V-10 は流し直さず、この記録をコミットして第 2 便に着手します。
  ⚠️ 第 2 便の着手条件（「第 1 便の V-10 が終わり、結果を追記してから」）と裁定 §7-1 は、**字義どおりには満たしていません**。第 2 便 §5・§6 で V-10 の賭け金の集合（D-035・D-096）と判定値（D-094）が変わるので、**第 1 便の AF-2 の保留は、第 2 便の 1 本の結果で判断していただくようお願いします。**
- ⚠️ 同じ seed・同じレースなので**前後の差は標本の違いを含みません**。一方、races=2000・1 seed の絶対値は SE が大きく（過去の実測で races=8000 でも SE 約 2pt・`REPORT_P2_A3C_20260809.md`）、**±1% の合否判定には粗い**ことを先に書いておきます。
- ⚠️ 走行中は、全テスト・staging のレース生成・見積もり用の小さな実行（途中で止めた）と CPU を取り合っていました。所要時間は比較に使いません。

### 3-4. staging のレース 1 本の照合（`af2-odds-check.mjs`）✔

`npx tsx tools/seed-races.mjs --env staging --races 1`（ワーカーと同じ `buildRace` → `buildOddsRows` → `oddsFromProbability`・M = 3,896,104）で cycle 5294 に 1 本作成し、その `race_odds` を全行照合（読み取りのみ）。
保存値は DB の文字列から `oddsTenthsFromDecimalString` で読む。`probability` は `numeric(9,8)` の丸めがあるので、再計算は ±5e-9 の幅で行う。

| 券種 | 行数 | 0.1 単位外 | 中心で一致 | 幅の中で一致 | 幅の外 | 切り捨て前の値を超える | capped |
|---|---|---|---|---|---|---|---|
| win | 12 | 0 | 12 | 12 | 0 | 0 | 0 |
| place | 11 | 0 | 11 | 11 | 0 | 0 | 0 |
| quinella_place | 51 | 0 | 51 | 51 | 0 | 0 | 0 |
| quinella | 50 | 0 | 49 | 50 | 0 | 0 | 0 |
| exacta | 101 | 0 | 100 | 101 | 0 | 0 | 0 |
| trio | 161 | 0 | 135 | 161 | 0 | 0 | 0 |
| trifecta | 1,010 | 0 | 588 | 1,010 | 0 | 0 | 0 |
| **合計** | **1,396** | **0** | **946** | **1,396** | **0** | **0** | **0** |

→ **全行が 0.1 単位に乗り、確率の丸め幅の中で切り捨て値と一致し、切り捨て前の値を超えない。** `capped` は 0 行（`odds.ts` の判定変更で、切り捨てを「上限に当たった」と数えていない）。
⚠️ 「中心で一致」が 946 行にとどまるのは、保存された確率が 8 桁で丸められ、高オッズの目では再計算の幅が 0.1 を超えるためです（幅の外は 0 行）。
⚠️ このレースは staging に残しています（発売中のレース 1 本・`seed-races.mjs` の既知の乖離 Q-P3-29 のとおり、オッズの妥当性の主張には使わず、丸めの照合にだけ使いました）。

---

## 4. AF-3 `spend_training_ep` をワーカー専用として閉じる（監査 H-3＋H-4・D-095 候補）

### 4-1. 移行ファイル `0021` ✔

- 本体は `0020` に再掲された定義から作り、**`pg_get_functiondef()` の稼働中定義と md5 で照合**（§1-e。本番・staging・0020 の 3 つが一致）。
- `0021` の本体が「稼働中の定義 − `perform assert_setup_complete();` の 1 行 ＋ EP 不足の `using errcode = 'ST001'`」と**完全一致**することを確かめた（`af3-fndef.mjs`）。
- `revoke all on function public.spend_training_ep(uuid, bigint, integer) from public, anon, authenticated;` を同じトランザクションで。
- staging に適用（オーナー実行）: `未適用 1 件 / 全 21 件 ／ 0021_spend_training_ep_worker_only.sql ... OK`。適用後の稼働中定義の md5 は `d68a7799bf82d13c953de5040a6fdead`。

### 4-2. `rpc-guard.test.ts` のワーカー専用関数の登録簿 ✔

- `WORKER_ONLY_FUNCTIONS = ['spend_training_ep']`。載った関数は `assert_setup_complete()` の要求を外す代わりに、次を満たすこと:
  ① 最後の定義より後に public・anon・authenticated からの revoke がある ② その revoke より後にそれらへの grant が無い ③ 本体で `auth.uid()` を使わない
- `place_bet`・`exchange_prize` は、ワーカー専用にも読み取り専用にも入れられない。
- 走査はコメントを同じ長さの空白に置き換えてから行う（コメント中の `revoke` を数えない）。
- 検査の効き（R-14）: 合成の SQL で「anon の revoke 抜け」「revoke が再定義より前にしか無い」「後の移行で grant して戻す」「コメントの中だけの revoke」「本体で `auth.uid()`」がすべて落ちることをテストに固定。
- SQLSTATE の一致: `0021` の最後の定義が `errcode = '<EP_SHORT_SQLSTATE>'` を含むことを、ワーカーの定数から照合。`ST001` は PostgreSQL の分類（先頭 2 文字）と重ならない。
- **変異**（§4-3-5 の前半）: `0021` の revoke から `anon` を消すと赤 — `spend_training_ep: 最後の定義（0021_…）より後に anon からの revoke が無い`。復元 sha256 一致。✔

### 4-3. `training-runner.ts` の例外処理 ✔

- `classifySpendError(e)`: **SQLSTATE が `ST001` のときだけ** `ep_short`（メッセージの文字列は見ない）。
- EP 不足 → 従来どおり休養 ＋ `epShort`。
- **それ以外** → `spendErrors` に数え、警報（馬 ID・週・SQLSTATE・メッセージ）を出し、**その馬のその週は進めない**（状態を書かない）。そのバッチの残りは進め、**実行はそのバッチで打ち切る**（同じ馬が次のバッチで選び直されて空回りしないため）。`incomplete: true`。次の周で再試行（引き落としは馬×週で冪等なので二重には引かれない）。
- ⚠️ 「止める／飛ばす」は案として実装し、照会します（§7 Q1）。

### 4-4. V-20 ④ 関数の軸 ✔

- `verify-anon-exposure.mjs` に `pg_proc` の全走査（`has_function_privilege`）を追加。判定は「登録簿に無い関数が無い」「登録簿に残った古い関数が無い」「EXECUTE が登録簿どおり（開きすぎも塞ぎすぎも数える）」。
- 登録簿 `EXPECTED_FUNCTION_EXECUTE` は **staging の実測（0021 適用後・§1-a の右列）どおり**に書いた。`place_bet`・`exchange_prize` の `anon: true` も実測どおり（閉じるかは照会 Q2）。
- ⚠️ **本番は `0021` 未適用なので、本番で V-20 を回すと④が落ちます**（正しい挙動）。

### 4-5. 既定の権限（§4-2 の実演・staging）✔

作成ロール `postgres` で public に関数を作ると（トランザクション内で作って測り rollback・残り 0 件）:

```
anon の EXECUTE          : true
authenticated の EXECUTE : true
proacl                   : =X/postgres postgres=X/postgres anon=X/postgres authenticated=X/postgres service_role=X/postgres
pg_default_acl（postgres / public / f）: postgres=X anon=X authenticated=X service_role=X
pg_default_acl（postgres / public / r）: postgres=arwdDxtm service_role=arwdDxtm   ← 0018 で表だけ閉じている
```

→ **新しい関数は anon・authenticated（と PUBLIC）の EXECUTE を持って生まれます。** `0018` の `alter default privileges` は表にしか効いていません。案は §7 Q3（本便では入れていません）。

### 4-6. 実演（§4-3・staging）✔

`af3-demo.mjs`。全馬の `last_processed_week` が揃っていること（29）を確かめ、NPC 馬 1 頭を検証用の内部口座の持ち馬にして 1 週だけ戻し、**ワーカーと同じ `advanceTrainingWeeks`** で週送り。③④は額 0・週 999999 で呼び、トランザクションは rollback。後片付け後: 台帳 0 行・口座 0 件・馬は元の厩舎・進捗に戻った。**他の馬の進捗の変化 0 頭**（両回とも）。

| # | 手順 | 0021 適用前 | 0021 適用後 | 期待 |
|---|---|---|---|---|
| 1 | 所有馬・EP 足りる（1,000,000） | `spendErrors 1`・進めず・警報 `SQLSTATE P0001 / 未認証` | **引き落とし 800 EP**・追い切り実行（疲労 63→90）・台帳 1 行 `training:<馬>:28`・警報なし | 休養に落ちない ✔ |
| 2 | 所有馬・EP 足りない（0） | 同上（P0001 未認証） | **休養**（疲労 63→23）・`epShort 1`・`spendErrors 0`・台帳 0 行 | 休養・epShort ✔ |
| 3 | anon（SQL `set local role anon`） | 関数の中まで入り `P0001 未認証` | **`42501 permission denied`** | 拒否 ✔ |
| 3 | anon（HTTP `/rpc/spend_training_ep`・anon キー） | status 400・`P0001 未認証` | **status 401・`42501`** | 拒否 ✔ |
| 4 | authenticated（口座あり・`request.jwt.claims` 付き） | `42501` | `42501` | 拒否 ✔ |
| 5 | 変異: staging で anon に EXECUTE を付けて V-20 | — | **V-20 不合格 1 件**（`spend_training_ep(uuid,bigint,integer).EXECUTE(anon) 実測=true 期待=false`）・終了コード 1 ・剥がした後の proacl は変異前と一致 | 落ちる ✔ |

★適用前の 1・2 は、**直す前のワーカーなら「EP 不足」として休養に落としていた状況**です（H-3 の staging での再現）。今回のワーカーは取り違えずに止まっています。

---

## 5. 検証結果

| 検査 | 結果 |
|---|---|
| `npm run typecheck` | 通過（exit 0） |
| 関係テスト（betting・worker の払戻/オッズ/自己検査/週送り・rpc-guard・exposure-registry・tool-guard・calibration-registry） | 通過 |
| `npx vitest run`（登録簿修正後・報告書追加前） | `Test Files 1 failed \| 153 passed (154)` ／ `Tests 1 failed \| 1625 passed (1626)` ／ exit 1 |
| `npx vitest run`（**報告書追加後**） | `Test Files 1 failed \| 153 passed (154)` ／ `Tests 1 failed \| 1625 passed (1626)` ／ exit 1（§9-2） |
| V-20（staging・0021 適用後） | **合格 11 件中 11 件**（exit 0） |

- 唯一の赤は `packages/render/test/edit-grammar-audit.test.ts` ⑨（`独走代表: expected 'contest' to be 'solo'`）。**以前からの赤で、1 件から増えていません**（監査時の実行でも同じ 1 件）。
- テスト件数は監査時 1601 → 1626（本便で +25）。

---

## 6. つまずき・事故と、その原因

1. **DB への接続が自動モードで拒否された**。staging の読み取り（オーナーの許可前）、本番の読み取り（許可後も）、`migrate.mjs --env staging`（許可後も）が拒否された。**回り込まず**、本番の読み取りと移行の適用はオーナーに `!` で実行していただいた。
2. **測定器の券種名の誤り（自分の道具）**: `race_odds` はコードの券種名 `quinella_place`、`bets` は DB 名 `wide`。`wide` だけを想定して例外で止まった（誤った数字は出していない）。両方を受け付けて再実行。
3. **実演の馬選びが空（自分の道具）**: 「疲労 60 未満」で絞ったが、staging の現役馬の疲労は 63 前後で 0 頭になった（状態を変える前に例外で停止・書き込みなし）。休養の閾値 70 に合わせて再実行。
4. **`migrate.mjs` のチェックサムが 0017〜0020 で食い違った**。
   - 原因 ✔: `core.autocrlf=true` で、作業ツリーの 4 本が CRLF（索引は LF）。DB の記録は **LF のチェックサムと 4 本とも一致**。中身の差ではない。
   - 対応: `--repair-checksum`（記録を CRLF 側で上書きする）は使わず、オーナーの選択で**作業ツリーの 4 本を LF に戻した**（書き戻した sha256 = DB の記録、`git hash-object --no-filters` = HEAD の blob）。その後の適用は成功。
   - ⚠️ **再発する**: git が「次に触れたら LF を CRLF に置き換える」と警告している。ブランチ切り替え等で再び CRLF になる。`0021` もコミット後に CRLF で取り出されれば同じことが起きる → §7 Q5。
5. **私の予測の誤り**: LF に戻しても「git の差分は出ない」と言ったが、`git status` に `M` と出た。`git diff` は 0 行・バイト列は HEAD と一致（中身の変更ではない）。
6. **自分で出した赤**: `calibration-registry`（新しい数値定数 `MAX_ODDS_TENTHS`・`ODDS_GRID_EPSILON_TENTHS`・`DECIMAL_ODDS` が未登録）。
   `ODDS_GRID_EPSILON_TENTHS` は `CALIBRATION` に登録（摂動値 0 → 変異試験で赤になることを実演）、残り 2 つは理由付きで `EXEMPT`。**定数を式に埋め込んでメタテストを避ける形は採っていません**（R-16）。
7. **`selfcheck` の赤**: `dist/worker.cjs` が 2026-08-13 のビルドのままで、原本（切り捨て後 3.200000）と配布物（切り捨て前 3.279990）が食い違った。テストの指示どおり `npm run build:worker` で作り直して通過。

---

## 7. 照会（オーナー／レビュー側の判断）

| # | 照会 | 開発側の案 |
|---|---|---|
| **Q1** | ワーカーの週送りで、EP 不足**以外**の失敗が出たときの扱い（指示書 §4-1-3） | いまは「その馬のその週を**飛ばす** ＋ 警報 ＋ そのバッチで打ち切り・次の周で再試行」。常に失敗する馬が 1 頭いると、1 周あたり 1 バッチ（2,000 頭）しか進まない。「週送り全体を**止める**」案もあるが、1 頭の不具合で全馬の育成が止まる |
| **Q2** | `place_bet`・`exchange_prize` の anon の EXECUTE を剥がすか（本番・staging とも付いている） | 剥がす（`revoke all on function … from anon`）。動作は変わらない（先頭の検査で既に「未認証」）。多重防御を「念のため」で積まない R-29 に照らし、**剥がさない場合の具体的な破られ方**（`assert_setup_complete()` を外す変更が入った日に開く）を根拠にする |
| **Q3** | 関数の既定の権限を閉じるか（§4-5） | `alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;`。**既存の grant は変わらない**（`place_bet` 等の authenticated は残る）。以後、利用者の RPC は `grant execute … to authenticated` を明示する必要がある（0002・0008 は既にそうしている）。staging で「作って測る」を再実演してから |
| **Q4** | 最低オッズ（1.0 倍未満）を置くか（§1-d） | 決めていません。staging では切り捨てで複勝 2 行（513 行中）が 1.0 未満 |
| **Q5** | 移行ファイルの改行の再発防止（§6-4） | `.gitattributes` に `db/migrations/*.sql text eol=lf`、または `migrate.mjs` が改行をそろえてからチェックサムを計算する。後者は安全策の変更なので R-26 の実演が要る |
| **Q6** | 範囲表に無いファイル 6 本の変更（§0-2）の扱い | 追認をお願いします |
| **Q7** | 本番への `0021` の適用 | 指示書 §6 のとおり、裁定とオーナーの指示を待ちます。**適用するまで本番の V-20 ④は落ちます** |

---

## 8. 期待値つきの再実行表

リポジトリ直下で。`<sp>` は開発側の scratchpad（道具は提出物に含めていません。必要ならリポジトリの `tools/` へ移して分類簿に登録します）。

| # | コマンド | 期待値 |
|---|---|---|
| 1 | `npm run typecheck` | exit 0 |
| 2 | `npx vitest run packages/betting apps/worker/test/payout.test.ts apps/worker/test/odds.test.ts apps/cli/test/rpc-guard.test.ts apps/cli/test/exposure-registry.test.ts apps/cli/test/calibration-registry.test.ts` | 全件通過 |
| 3 | `npm run build:worker && npx vitest run apps/worker/test/selfcheck.test.ts` | 2 件通過 |
| 4 | `npx vitest run` | `Tests 1 failed`（`edit-grammar-audit` ⑨ のみ） |
| 5 | `node <sp>/mutate-run.mjs packages/betting/src/settle.ts '  return (numerator - (numerator % divisor)) / divisor;' '  return Math.floor((stake * (oddsTenths / 10)) / mult);' npx vitest run packages/betting/test/odds-tenths.test.ts apps/worker/test/payout.test.ts` | 6 failed ／ 総当たりの食い違い 79432 ／ 復元 sha256 一致 |
| 6 | `node <sp>/mutate-run.mjs db/migrations/0021_spend_training_ep_worker_only.sql 'from public, anon, authenticated;' 'from public, authenticated;' npx vitest run apps/cli/test/rpc-guard.test.ts` | 1 failed（anon からの revoke が無い） |
| 7 | `node <sp>/mutate-run.mjs packages/betting/src/odds-tenths.ts 'export const ODDS_GRID_EPSILON_TENTHS = 1e-6;' 'export const ODDS_GRID_EPSILON_TENTHS = 0;' npx vitest run packages/betting/test/odds-tenths.test.ts` | 1 failed（格子ちょうどは下げない） |
| 8 | `npx tsx tools/verify-anon-exposure.mjs --env staging` | V-20 合格 11 件中 11 件 |
| 9 | `npx tsx <sp>/af3-v20-mutation.mjs --env staging` | V-20 不合格 1 件（`EXECUTE(anon) 実測=true 期待=false`）・proacl 復元一致 |
| 10 | `npx tsx <sp>/af3-demo.mjs --env staging --label after` | §4-6 の「0021 適用後」の列 ・他の馬の進捗の変化 0 |
| 11 | `npx tsx <sp>/af3-fndef.mjs --env staging` | ⚠️ 0021 適用後は稼働中定義が変わるので「0020 の本文と不一致」になる（適用前の出力は §1-e） |
| 12 | `npx tsx <sp>/af0-probe.mjs --env staging --odds` | §1-a（右列）・§1-b・§1-c・§1-d |
| 13 | `npx tsx apps/cli/src/verify-payout.ts --races 2000 --seeds 42` | **未計測**（変更後の実行もメモリ不足で強制終了・§3-3）。第 2 便 §6-3 の 1 本で取る |

---

## 9. 最終計測

### 9-1. 変更範囲（`git diff --numstat 620e2c1`・作業ツリー・コミットなし）✔

```
15	0	apps/cli/src/calibration.ts
13	2	apps/cli/src/verify-payout.ts
57	1	apps/cli/test/exposure-registry.test.ts
197	15	apps/cli/test/rpc-guard.test.ts
4	1	apps/worker/src/odds.ts
6	3	apps/worker/src/payout.ts
77	6	apps/worker/src/training-runner.ts
6	1	apps/worker/test/odds.test.ts
93	4	apps/worker/test/payout.test.ts
9	2	packages/betting/src/balance.ts
1	0	packages/betting/src/index.ts
65	3	packages/betting/src/settle.ts
38	13	packages/betting/test/settle.test.ts
64	0	tools/lib/exposure-registry.mjs
43	0	tools/verify-anon-exposure.mjs

15 files changed, 688 insertions(+), 51 deletions(-)
```

未追跡の新規ファイル（行数は `ReadAllLines` の実測）:

```
  97  packages/betting/src/odds-tenths.ts
 193  packages/betting/test/odds-tenths.test.ts
 100  db/migrations/0021_spend_training_ep_worker_only.sql
 378  REPORT_AUDIT_FIX_20260914.md（この節を書く前の行数）
```

- 改行だけを LF に戻した `db/migrations/0017`〜`0020` は、上の numstat に**出ていません**（中身の差 0 行・§0-2）。`git status` には `M` と出ます。
- ⚠️ この数字は**作者別の行数ではありません**（CLAUDE.md の作法）。本便の開始から終了まで、上の 15 本と新規 4 本に別セッションの変更は混ざっていないことを `git status` で確かめていますが、作業ツリーは共有です。

### 9-2. 報告書を足した後の `npx vitest run` ✔

開始 2026-09-14 09:50:31 JST（報告書・移行ファイル・登録簿をすべて足した状態・V-10 変更後の実行と並走）:

```
 FAIL  packages/render/test/edit-grammar-audit.test.ts > 編集文法の監査 > ⑨ seed 分類を現 HEAD で再確認している
 Test Files  1 failed | 153 passed (154)
      Tests  1 failed | 1625 passed (1626)
exit=1
```

- 赤は `edit-grammar-audit` ⑨ の **1 件だけ**で、監査時（`1 failed | 1600 passed (1601)`）から**増えていません**。代表 seed を採り直すかはオーナー判断待ちのままです。
- テスト件数は 1601 → 1626（本便で +25）。

---

## 10. 再現した事実と未検証の主張（R-13）

**✔ 再現した事実**: §1 の全数値（環境を明記）／ §2 の総当たり・経路・変異（79,432 通り）／ §3-2 の 1〜3 と変異 ／ §4 の移行ファイルの照合・適用・V-20・既定の権限・実演 5 本 ／ §5 の型検査と全テスト（報告書追加前）／ §6 の原因（改行・券種名・馬選び・登録簿・配布物）

**△ 未検証**:
- 監査の「複勝で最大 +5.24%」（staging の保存値の最大は +4.09%）
- §7 Q1 の「1 周 1 バッチしか進まない」は実装からの推論（常に失敗する馬を置いた実演はしていない）
- 本番に `0021` を当てたときの挙動（staging と同じ定義・同じ権限であることは md5 と `proacl` で確かめたが、本番では実行していない）
