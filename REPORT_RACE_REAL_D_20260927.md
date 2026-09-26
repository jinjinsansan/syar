# 報告: 段 2 D（実レースの録画）と D-124 — 2026-09-27

- 開発側 `star-ef` → レビュー側
- 裁定: `REVIEW_RACE_REAL_D_AND_CALIBRATION_20260927.md`（`b45c239`）
- 開始時の HEAD: `b45c239` → いまの HEAD: `8e13ab9`（**未 push**）
- コミット: `bb7278e`（D-124）・`ed1201f`（段 D の 1）・`8e13ab9`（段 D の 2）
- 差分（実測・`git diff --stat b45c239..8e13ab9`）: **15 ファイル / +1,190 / −363 行**（この書面を除く）

---

## 1. 済んだこと

### ① D-124: `gameMonthOf(week)`（`bb7278e`）

- `packages/scheduler/src/birth-week.ts`。年の中の週（`gameYearOf` と同じ 52 週）を 12 等分し、**第 1 週 = 1 月**。`WEEKS_PER_YEAR` が唯一の出どころ
- 網 `packages/scheduler/test/game-year.test.ts` に 4 件（1〜12 を欠けず戻らず 1 度ずつ・1 か月 4〜5 週・基準より前の週・整数でない週は投げる）
- 条件どおり見た目にだけ使っています（`/race` の季節の色と粒子のみ）。`seasonOf(month)` の口は変えていません

### ② 段 D の 1: 画面の本体を `RaceView({ setup })` に（`ed1201f`・見本の道は振る舞いを変えない）

- モジュール定数 `DIST` / `COURSE_SPEC` / `RACE_TURN` / `COURSE_OPTS` / `VENUE_LOOK` / `GRADE_LOOK` / `RACE_META` を撤去し、`PageSetup`（場・距離・走路・回り・馬場・**頭数**・出走表・格・月・条件の札・名札）へ
- 見本の道は `venuePageSetup()` が**元の定数と同じ値**を詰めるだけ。本体の先頭で `const DIST = setup.distanceM` 等と受け直すので、本体の式は 1 文字も変えていません
- **`FIELD` の段ばらし（裁定 §4）はこの形で満たしました**: 頭数は `setup.fieldSize`。見本は `SAMPLE_FIELD = 8` のまま
  - ✔ **`floorForFieldSize` は画面を通りません**（呼ぶのはワーカーの番組編成 `race-field.ts:665` だけ）。見本の 8 頭は 1 ビットも変えていません
  - ⚠️ 裁定の「A: `Built` に足す → B → C → D」の順ではなく、**`setup` を先に決めてから本体を開く**形にしました。理由: `FIELD` の 34 か所のうち、素材の読み込み（依存 `[]`）とゼッケンの色は `built` より先に決まるので、`built` からは取れません（段 C の `RACE_TURN` と同じ事情）
- 出走表: 名前・騎手・オッズ・毛色を `roster` から（`HORSE_NAMES` 13・`JOCKEY_NAMES` 7・`DEMO_WIN_ODDS` 5・`coatOf` 5 か所）
- 段 C で釘付けにした 4 か所も、これで `setup` から読む形になりました

### ③ 段 D の 2: `/race?race=<id>` で確定済みの実レースを再現（`8e13ab9`）

- **着順・馬番・走破タイムはサーバーの行を読むだけ**（憲法 3）。`resolveRace` を通しません
  - ペース: 公開されている脚質から `decidePace`（逃げの頭数だけで決まる・§8.4）
  - 着差の文字: 走破タイムの差を `marginLabel` に通す（簿 `REPLAY-MARGIN-FROM-TIME`）
  - ゲージ: `null`（Q-RACE-3）
  - **`finalOrderMatches`（D-059）はそのまま通し**、鳴いたら「この録画は出せません」で止める（見本に落とさない・コンソールにレース ID）
- エンジン: `replayOf` / `boundaryTimesOf` / `finalOrderMatches` の引数の型を、**実際に読む欄**（馬番・走破タイム・距離）へ狭めました。振る舞いは同じで、エンジンのテスト 171 件が通っています。偽の `RaceResult` は作っていません
- 読む層 `apps/web/src/lib/race-real.ts`: 場・距離・馬場・格・R 番号・週（`my_runs.game_week`）・単勝オッズ・斤量・自馬（`is_mine`・`authClient()`）
  - **止める**: 確定前／未ログイン／自馬なし（Q-RACE-6）／取消で欠けた枠／知らない格・条件／斤量の欠け
- 季節: `gameMonthOf(game_week)`（D-124）。週は `races_public` に無いので、**自馬の記録 `my_runs` から**取りました（新しい移行なし）。`0046` より前のレースは季節の色を重ねません
- 平場（Q-RACE-7）: 観客を描き足さない・ファンファーレを鳴らさない・格のイントロを出さずタイトルを先に・タイトルの札は馬場だけ・条件の札は空。**G3 は借りていません**
  - ⚠️ `drawRaceTitleCard` は `gradeLabel` を省くと既定の「GRADE I ・ TURF CHAMPIONSHIP」を出すので、省かずに馬場だけを渡しています
- 「録画・確定した結果から再現」の札（契約 §暫定の録画表示）。意匠は作っていません（簿 `REPLAY-FLAT-RACE-QUIET-DEFAULT`・R-18 と同じ便へ）
- 実レースは、見比べの口（`?seed=` / `?surface=` / 馬場状態）で曲げません。映像の種はレース ID から（FNV-1a・憲法 4）
- `?race=` と `?venue=` を同時に渡したら止めます（`PARAM_ERROR`）
- **入口は作っていません**（Q-RACE-6）。網 `race-real-replay.test.ts` ⑥ が、許した画面（いまは 0）の外の `/race?race=` を落とします

### ④ 簿の修理（`8e13ab9`）

- 🔴 **`verify:open` は、私が触る前から落ちていました**。前便が足した「開いている指摘」5 行（`NEXT-BUILD-REWRITES-TRACKED-FILES`〜`REPLAY-GAUGE-ABSENT-FOR-REAL-RACE`）が `WATCHING`（見張り）の配列に入っていて、`returnWhen` / `reviewBy` が無いと落ちていました。引継ぎ書の検証一覧には `verify:open` が載っていませんでした
- 私も最初は同じ場所に 6 行を足して落とし、そこで気づきました → **11 行とも `OPEN_FINDINGS` へ移しました**（中身は変えていません）
- 新規 6 行: `REPLAY-NEEDS-OWN-HORSE` / `REPLAY-GATE-GAP-NOT-DRAWN` / `REPLAY-MARGIN-FROM-TIME` / `REPLAY-FIELD-SIZE-WEIGHT-UNMEASURED` / `REPLAY-FLAT-RACE-QUIET-DEFAULT` / `REPLAY-ENTRANCE-NOT-LINKED`。塞がり方が機械で分かる 4 行には `stillOpen` を付けています

## 2. 検証

```
npm test            3,134 件 / 赤 3（★既知の赤 3 件のみ・verify-known-red ✅）
verify:open         ✅（★修理前は不合格）
typecheck           root / apps/web / tools すべて exit 0（★道具自身の終了コードを読んだ）
build:web           exit 0（★追跡ファイルの汚れ 0）
```
- 新しい網 `apps/cli/test/race-real-replay.test.ts`（10 件）: `supabase` の層だけを表を返す偽物に差し替え、読む層の判断を見ています。止める 6 件は**その枝でしか出ない文言**で確かめ、止めない対照（8 頭・18 頭が読める）を並べました
- 網の書き換え: `built-course-fields`（本体がモジュールの見本の設定を直に読まない・対照つき）／`replay-gauge`（ゲージを `null` にする道は実レースの 1 本だけ）／`preshow-wiring`・`season-atmosphere`・`venue-look`・`venue-scenery`（綴りを新しい引用へ。要求は同じ）

## 3. 🔴 未検証（ここは「済んだ」と読まないでください）

- **実レースの録画を画面で開いていません**。`/race` は手元に素材が 0 枚で、本番でしか測れません。確定済みで自馬が出たレースを持つ口座も、手元にはありません
- **18 頭立ての重さは未測定**（簿 `REPLAY-FIELD-SIZE-WEIGHT-UNMEASURED`）。ゼッケンの重ね絵は枠ごとに作るので、頭数に比例して増えます
- 18 頭立てで、HUD の順位表・出馬表・コース図が画面に収まるかも見ていません（見本は 8 頭）
- → 段 2 の完了条件（本番へ出した後に総量を測る）と同じ便で、push・配備の後に測ります。**push と配備はまだです**（オーナー指示待ち）

## 4. 照会

### Q-RACE-8 見本の `COAT_BY_GATE` を消すか

- 0926 の裁定は「`/race` が `horse_id` を読み始めた日に表ごと消す」（`COAT_LIST_EXEMPT` の消す条件も同じ）
- ✔ 実レースの道は `coatOfHorseId(horse_id)` で引いています（9 色すべて）
- 🔴 ところが**見本の道**を裁定の文言どおり `coatOfHorseId(String(gate))` にすると、8 頭が
  `黒鹿毛・鹿毛・鹿毛・黒鹿毛・鹿毛・鹿毛・栗毛・芦毛` になり、**隣どうしの同じ毛色が 2 組**できます
- この表の註記には「隣どうしが同じ毛色にならないよう散らした（オーナー要望「同じ馬が並んでいる」に見えるため）」とあります
- → 消すと、既定の `/race` でオーナーが以前嫌った見え方に戻ります。**私の判断では消さず、表は見本の道だけに残しています**（実レースは表を通りません）
- 選択肢:
  - (a) 裁定の文言どおり消す（見本の見た目が変わる）
  - (b) 見本だけに残し、除外の消す条件を「見本の毛色の並べ方をオーナーが決めた日」に書き換える
  - (c) 見本の馬に、隣が重ならない ID を割り当てる（⚠️ 見た目に合わせて ID を選ぶことになるので、推しません）

### Q-RACE-9 18 頭立てで画面が収まらない場合

- 順位表・出馬表などが 18 行で溢れたとき、詰めるのは意匠の判断になります。**本番で測ってから出す**ので、いまは照会だけ置きます

---

## 5. 追記（2026-09-27・裁定 §8 `b07db6b` を受けて）

### ✅ Q-RACE-8 (b)・Q-RACE-9（`f31c885`）

- `COAT_BY_GATE` → **`DEMO_COATS`**（見本専用）。重複なしの 8 色 `bay grey dark-bay palomino chestnut blue-black white liver-chestnut`。外したのは青鹿毛（黒鹿毛と青毛に挟まれて見分けにくい）。重みは使っていません。色名は `CoatName` 型で受けています
  - ⚠️ 「綴りを直書きしない」は、**`CoatName` 型で受けて型検査に綴りを見させる**形で満たしました。8 色を選ぶ以上、どの色かを名前で 1 回は書くことになるので、型で縛るのが限度と判断しました
- 網 `coat-single-source` ④: 中身（8 色・重複なし・月毛白毛・`coat.ts` の色）／`DEMO_COATS` を読むのは `coatOf` だけ・`coatOf` を読むのは `venuePageSetup` だけ・実レースは `coatOfHorseId` だけ／対照つき。除外の消す条件は「見本の道が無くなった日」
- 🔴 **本番で総量を測る道具 `tools/measure-race-asset-bytes.mjs` が、原文から `COAT_BY_GATE` を読んでいました**。名前を替えただけだと、段 2 の完了条件で使う道具が止まるところでした → `DEMO_COATS` へ直しました
- 実測（手元の焼き済み 91 ファイル・同じ道具）:

| | 毛色 | ファイル | 初回 |
|---|---|---|---|
| 見本・旧表の先頭 8 頭 | 5 | 16 | 5.2MB |
| **見本・`DEMO_COATS`** | **8** | **22** | **7.5MB（+2.3MB・+44%）** |
| 実レース 12 頭（馬 ID・300 回） | 平均 5.8 | — | 平均 5.7MB / 最大 8.4MB |
| 実レース 18 頭（同） | 平均 6.8 | — | 平均 6.4MB / 最大 8.6MB |

  → 既定の `/race` の初回は増えます（見本に 8 色すべてを出すため）
- Q-RACE-9: 簿 `REPLAY-FIELD-18-LAYOUT-UNSEEN`（黙って削らない条件つき）。出馬表（`entry-board.ts`）は頭数で列幅を割り、馬名を 22→18px まで落として**全頭を並べる**ことを原文で確認しました。上位 5・上位 3 を出す表示は頭数に依らない意匠です
- 検証: npm test 3,137 件 / 赤 3（既知のみ）・verify:open ✅・typecheck 3 つ exit 0・build:web exit 0

### 🔴 「staging で録画を 1 度開く」は、まだ開けていません（止まっている理由）

1. 🔴 **手元の画面（`apps/web/.env.local`）は本番の Supabase に繋がっています**（接続先の先頭が `secrets.production.env` と一致・staging とは別）。このまま `localhost:3210/race?race=…` を開くと**本番を読みます**
2. staging に向けるには、`.env.local` を書き換えるか、staging の値を環境変数で渡して起動する必要があります。**環境の設定なので、オーナーの判断**です
3. **自馬が確定済みのレースに出ている staging の口座**の資格情報を、開発側は持っていません
4. **そのレースの ID を調べる DB の読み取り**は、開発側のセッションでは権限層に止められています（09-27 に 1 度止められた。回避はしていません）
   - ⚠️ この読み取りを**レビュー側に代わりに流していただくことはお願いしません**（止められた操作を別のセッションで通すことになるため）

### 照会 Q-RACE-10 開く確認をどの形で満たすか

- **A.（開発側の推奨）オーナーが 3 つを用意し、開発側がブラウザで確かめる**
  - オーナー: ① staging の値を渡して開発サーバーを起動（`.env.local` は書き換えない）② staging の口座でログイン ③ レース ID を調べる読み取り 1 本
  - 開発側: 3 点（①落ちない ②馬番と着順が記録どおり ③自馬のいないレースで止まる）を確かめて報告
- **B. 本番で確かめる**（push と配備の後、オーナーの口座で開く）。裁定は staging を求めているので、これで足りるかをご判断ください

⚠️ ③のうち「**番人（D-059）が鳴いたら止まる**」は、実データでは食い違いが起きない限り発火しません。本物のレースでは試せないので、ここは**コードで読んだだけ**です（`build()` が投げる → effect の `catch` で `real !== null` なら止めて文を出し、見本に落とさない）。
