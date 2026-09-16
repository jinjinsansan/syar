# 報告 — ゲーム本体の再設計 第 1 便（GB-1〜GB-6）

**案件**: STAR（ポイ活型オンライン競馬育成）
**発行**: 2026-09-16 ／ 開発側 → レビュー側・オーナー
**対象**: 指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md`
**測ったコミット**（R-23・R-28）: 着手時 `fe5bd53`（指示書と正典の受領）／ GB-1 は本報告と同じコミット
**ブランチ**: `p4/race-30sec-cuts`

> 凡例（R-13）: **✔** ＝ 開発側がこの便で実行・実測した ／ **△** ＝ 未確認・推定
> ⚠️ **着順に効くものは 1 つも入れていません。** `packages/race-engine/src` は触っていません。
> ⚠️ 本番 DB・ワーカーの配備・較正定数・`CYCLE_MS`・正典は触っていません。

---

## 0. この報告の範囲

| 工程 | 状態 |
|---|---|
| **GB-1 調教の見せ方** | ✔ **完了**（本報告・§1） |
| **GB-2 所有頭数** | ✔ **完了**（本報告・§1b） |
| GB-3 騎手 | ⏳ |
| GB-4 馬の購入 | ⏳ |
| GB-5 厩舎の格 | ⏳ |
| GB-6 経済の取り直し | ⏳ GB-1〜GB-5 の後 |

★指示どおり **1 工程 1 コミット**で進めます。本報告は工程ごとに追記します。

---

## 1. GB-1 — 調教の見せ方（D-101）✔

### 1-1. 作ったもの

| ファイル | 中身 |
|---|---|
| `packages/training/src/menus.ts`（追記） | **写像を 1 か所に**: `TrainingAxis`（体・心）・`TrainingIntensity`（弱・中・強）・`MENU_VIEW`（8 メニュー → 枡）・`menuViewOf`・`menusOfView`・見出しの語（`TRAINING_AXIS_LABEL`・`TRAINING_INTENSITY_LABEL`） |
| `packages/training/src/view.ts`（新規） | **画面の 3 本のバー** `trainingBarsOf(stats, condition)`（スピード・スタミナ・コンディション）と、**出走の前後の週の印** `raceWeekMarkOf` ／ `RACE_WEEK_LABEL` |
| `packages/training/src/index.ts` | `view.js` を公開 |
| `apps/web/package.json` | `@star/training` を依存に宣言（画面がこれを引くため） |
| `apps/web/src/lib/game-demo.ts` | ★**8 メニューの表の写しを削除**し、名前・疲労・EP・枡を `@star/training` から作る形に（説明の文言だけ画面側に残す）。`trainingMenusOfView` を追加。`DEMO_TRAINING_STATS`（★上限までの割合を持っていた）を `DEMO_TRAINING_ABILITY`（`stats` だけ）に置き換え |
| `apps/web/src/app/training/page.tsx` | メニューを **体・心 × 弱中強**に並べ替え。バーは `trainingBarsOf` の戻り値から。**コンディションは能力と別の見せ方**（段階の枡＋調子の語）。**出走の前の週・後の週**を見出しに出す |

**層の向き**（報告の指示）: `@star/training` は**依存ゼロの純粋な層**（`@star/sim-engine` の型だけ）で、**画面がこちらを引きます**。逆向きの参照はありません。エンジン（`race-engine`）はこの便に関与しません。

### 1-2. 変えていないもの ✔

- **週の進み方・成長式・疲労・故障・EP コスト**は 1 ミリも変えていません（`growth.ts`・`week.ts`・`injury.ts`・`condition.ts`・`temper.ts` は無変更）
- **新しい乱数・倍率・確率を足していません**（「当たり」の演出は既存の伸びの乱数の上側を見せるだけ。この便では演出そのものは未実装で、写像と導線だけです）
- 較正定数（`MAIN_EFFECT_COEF`・`SIDE_EFFECT_COEF`・`BASE_GAIN` ほか）は触っていません

### 1-3. 検査 ✔

| # | 内容 | 結果 |
|---|---|---|
| 1 | 写像が **8 メニューすべてを覆い**、体・心 × 弱中強の **6 枡すべてに 1 つ以上**（全数・鍵の集合も一致） | ✔ `packages/training/test/menu-view.test.ts` |
| 2 | 画面・表示モデルが **`@star/training` の同じ関数**を引いている（**構文木**で見る。`grep` ではない） | ✔ `apps/cli/test/training-view-wiring.test.ts` |
| 3 | 3 本のバーが **`stats` と調子だけ**から決まる（★**入力の形**で見る。引数は 2 つ・`potential` も「上限までの割合」も渡す口が無い） | ✔ 同上＋写像の検査 ⑤ |
| 4 | **変異**: ①画面に写像の表を複製 ②`trainingBarsOf` を呼ばず自前で組む ③バーに「上限までの割合」を渡す ④表示モデルが自前の表に戻る → **4 つとも検査が落ちる** | ✔（製品ファイルは無傷。読み込んだ文字列に対して壊す形） |
| 5 | **V-14・V-15・V-7a/V-7b が変わらないこと** | ✔ §1-4 |

### 1-4. ゲート（変更前 → 変更後）✔

同じ引数（`--horses 400 --seed 42` ／ V-7 は `--horses 500 --seed 42`）で、**変更の前と後に 1 回ずつ**流しました。

| ゲート | 変更前 | 変更後 | 判定 |
|---|---|---|---|
| V-14 ① 適切な育成 88% 以上 | 90.3%（余裕 9.5 SE） | **90.3%** | **変わらない**・PASS |
| V-14 ② 差 12pt 以上 | 15.8pt（90.3 − 74.5） | **15.8pt** | **変わらない**・PASS |
| V-14 ③ 同一 EP で追い切り偏重が支配的でない | 0.68 倍（上限 1.02） | **0.68 倍** | **変わらない**・PASS |
| V-15 ① 中盤の集団 SD ≥ 誕生時の 50%（最悪 hard_only） | 59.9% | **59.9%** | **変わらない**・PASS |
| V-15 ② キャリアを通じた平均低下 ≥ 15%（balanced） | 35.8% | **35.8%** | **変わらない**・PASS |
| V-7a 恒久ダメージ 20〜40%（balanced） | 29.2% | **29.2%** | **変わらない**・PASS |
| V-7b 致命的故障 3% 以下（balanced） | 0.8% | **0.8%** | **変わらない**・PASS |

→ **写像は見せ方だけで、式に触れていない**ことが実測で確かめられました（D-101 の前提どおり）。

### 1-5. 未実装（GB-1 の範囲で残したもの）

- **「当たり」（GREAT / UP）の演出**（既存の伸びの乱数の上側を見せるだけの形）。今回は写像と導線までで、演出は画面の構成の便に回します（デザイナーのカード待ち・指示書 §8）
- **出走の前後の週**は、いまデモの `nextRace` の有無から作っています。実データ（次走の週・前走の週）に繋ぐのは出走登録の便です
- 指示の保存・週送りはサーバー RPC 待ち（従来どおり）

---

## 1b. GB-2 — 所有頭数（D-104）✔

### 1b-1. 作ったもの

| ファイル | 中身 |
|---|---|
| `packages/scheduler/src/ownership.ts`（新規） | **上限を 1 か所に**: `OWNERSHIP_LIMITS`（現役 **30**・繁殖牝馬 10・種牡馬 5）・`ENTRIES_PER_OWNER_MAX`（**2**）／ 純関数 `ownershipLimitOf`・`canOwnMore`・`canEnterRace`・`ownHorseSelectionOk` |
| `packages/scheduler/src/index.ts` | 公開 |
| `apps/cli/src/calibration.ts` | `OWNERSHIP_LIMITS`・`ENTRIES_PER_OWNER_MAX` を**正典の写し**として `EXEMPT` に理由付きで登録 |

- ★**「入っているが使われない」形**です（R-15）。**出走登録の RPC はまだ 1 つも無い**ので、繋ぐのは出走登録の便です
- ⚠️ **所有上限はこれまでコードに存在しませんでした**（正典 §6.7 にしかなかった）。今回が初出です
- 画面側に「15 頭」等の表示はありませんでした（直す箇所なし）✔

### 1b-2. 検査 ✔（`packages/scheduler/test/ownership.test.ts`・4 件）

| # | 内容 | 結果 |
|---|---|---|
| 1 | 現役 **30 頭目は受理・31 頭目は拒否**。繁殖 10・種牡 5 は変わっていない（境界の両側・R-2） | ✔ |
| 2 | 同じレースに **2 頭目は受理・3 頭目は拒否**。**別のレースなら影響しない** | ✔ |
| 3 | §9.5 の制限が 2 頭のときも成立（**全頭を含む組合せだけ**） | ✔（§1b-3 の註記つき） |
| 4 | 上限を 1 か所から引く（関数と表が同じ値。**2 か所に書いて片方だけ直せば落ちる**値照合） | ✔ |

### 1b-3. ⚠️ 見つけた食い違い（報告のみ・直していません）

**正典 §6.7・§9.5 は「自馬が複数なら全頭を含む組合せだけ」**ですが、**いまの DB の `place_bet`（`0002`・`0020`）は「自馬が 1 頭でも絡めば可」**です。

```sql
-- 0020_rpc_setup_guard.sql:151-158（現在の本番・staging の定義）
if not exists ( … and p_selection @> to_jsonb(e.gate) ) then
  raise exception '自馬出走レースでは自馬絡みの馬券のみ購入できる（§9.5）';
```

- 2 頭出したとき、**DB は「片方だけを含む買い目」を通します**。正典は通しません
- **1 頭までしか出せなかった間は同じ意味**でした。**D-104 で 2 頭まで出せるようにしたので、ここで差が生まれます**
- 開発側は **`ownHorseSelectionOk` を正典どおり**（全頭を含む）に書き、検査で固定しました。**移行ファイルは本便の触ってよいものに入っていない**ので、DB 側は直していません
- ⚠️ 正典の帰結として、**2 頭出すと単勝・複勝は買えません**（1 頭しか選べないため）。これでよいかはオーナー判断に回します（照会）
- → **次の便（出走登録・投票の RPC）で、DB 側を正典に合わせる移行が要ります**

### 1b-4. 流したゲート

- **該当なし**（GB-2 は着順・育成・経済のどれにも触れていません）。V-4〜V-6・V-17・V-18・V-14・V-15・V-7 は**この工程では動きません**
- 全体の検査で `calibration-registry` を含む 179 ファイルを流しています（§2）

---

## 2. 検査の全体 ✔

- `npm run typecheck` … **通過**（exit 0・`apps/web` を含む）
- `npx vitest run --maxWorkers=2 --minWorkers=1` … `Test Files 1 failed | 178 passed (179)` ／ `Tests 1 failed | 1797 passed (1798)`・終了コード 1・**118 秒**
  - 落ちたのは変更前からの `edit-grammar-audit` ⑨（独走代表 expected 'contest' to be 'solo'）だけで、**1 件から増えていません**
  - 件数は 1787 → **1798**（+11）。増えたのは本便の `menu-view.test.ts` 6 件と `training-view-wiring.test.ts` 5 件です
- ⚠️ **較正定数の登録簿に 1 回落ちました**（`calibration-registry.test.ts`）。新しく `export` した数 `TRAINING_BAR_MAX`・`CONDITION_STEPS` が未登録だったためです。**どちらも正典の写し**（能力の値域 0〜1000・調子の段階 1〜5）なので、`apps/cli/src/calibration.ts` の `EXEMPT` に**理由付きで**載せました（較正値としては登録していません）

## 3. 触ったもの

| 触った | 触っていない |
|---|---|
| `packages/training/src/{menus,view,index}.ts`・`packages/training/test/menu-view.test.ts`・`apps/cli/test/training-view-wiring.test.ts`・`apps/web/{package.json,src/lib/game-demo.ts,src/app/training/page.tsx}` | `packages/race-engine/src`・`packages/sim-engine/src`・較正定数・`ODDS_MC_TRIALS`・`CYCLE_MS`・正典・本番 DB・ワーカーの配備 |

## 4. オーナーに見ていただきたいこと [EYES]

- 調教画面の並びが「体・心 × 弱中強」になりました。**枡の分け方（何を体、何を心に置くか）は正典 §7.2 の註記どおり**ですが、画面の見た目（枡の見出し・強度の色）は開発側の暫定です。**画面の構成そのものはデザイナーのカード待ち**なので、気になる点があれば、その旨をデザイナーへの依頼に含めます
