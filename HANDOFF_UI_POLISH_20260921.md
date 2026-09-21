# 引継ぎ書 — 本番サイトの UI の仕上げ（2026-09-21・夜）

> **読む人**: Claude Code でも Codex でも、**このファイルだけで再開できる**ように書いています。
> **書き手**: 開発側 Claude（このリポジトリで 2026-09-21 の 1 日ずっと作業したセッション）。
> **次セッションの目的**: **本番サイト（https://star-two-chi.vercel.app）の UI を、お客に見せられる形に仕上げる。**
> **数字はすべて実測です。推測は「推測」と書いています。うまくいかなかったことも書いています（§9）。**

---

## 0. 最初の 10 分（必ずこの順で）

```
1. CLAUDE.md を読む（全文・短い）         ← ★Codex へ: このリポジトリに AGENTS.md はありません。CLAUDE.md が同じ役目です
2. このファイルの §1〜§4 を読む
3. 状態を測る（§10 のコマンド 5 行）      ← ★この文書の数字を信じる前に、自分で 1 回測る
4. §7「やってはいけないこと」を読む
5. オーナーに「§3 のどれから始めるか」を訊く
```

### 0.1 絶対の禁止（CLAUDE.md の写し・違反は即差し戻し）

| | |
|---|---|
| `git.txt` | **認証情報が入っている。読まない・使わない・コミットしない** |
| 実在の名前 | 実在競走馬名・実在レース名・実在競馬場名・**他社製品の固有名称**を、コード・コメント・出力のどこにも書かない |
| ポイント | **参加ポイント（EP）を金銭で購入できる経路を作らない**。賞金 P → 参加 P の還流も不可 |
| 権威 | ポイント台帳・レース結果・乱数は**サーバー側**。クライアント計算を信用しない |
| 決定論 | `Date.now()` / `Math.random()` を直接呼ばない（時刻と乱数は注入） |
| 共有ツリー | **`git stash` 禁止。`git add -A` / `git commit -a` 禁止。ファイルを名指し**する |
| Route Handler | ビジネスロジックを書かない |
| 型 | TypeScript strict・`any` 禁止 |

### 0.2 このセッションの環境（罠が多い）

| | |
|---|---|
| OS / シェル | Windows 11。Git Bash と PowerShell の両方。**日本語ソースは cp932 の罠が多い**（§7-C） |
| リポジトリ | `V:\dev\Cusor\star`。**V: は VeraCrypt**。電源断で落ちる（§7-D） |
| ブランチ | `p4/race-30sec-cuts`（作業枝）。本番の画面は **`main`** から作られる |
| ローカル dev | `http://localhost:3210`（**3000 ではない**）。いまは停止中 |
| DB | Supabase。`secrets.production.env` / `secrets.staging.env`。**値を画面に出さない** |
| ワーカー | **VPS 上の systemd `star-worker`**。**git push では入れ替わらない**（`tools/deploy.sh`）。この PC に SSH 鍵は無い |
| 本番 URL | https://star-two-chi.vercel.app （Vercel・`main` の先端から自動で作られる） |

---

## 1. いまの位置（2026-09-21 21:40 に測った）

```
HEAD                = 8451c20
origin/main         = 8451c20      ← 一致
本番の画面（Vercel） = 8451c20      ← 一致（/api/healthz の sha）
origin/p4/race-30sec-cuts = b0f364d（HEAD より 4 本 遅れ。main には入っているので実害なし。この引継ぎ書のコミットと一緒に追いつかせる）
本番の DB           = 触っていません（移行 59/59。0060 は未適用）
本番のワーカー       = 24af9f2（VPS）。週送りは通っている（遅れ 0 週・現役 2,318 頭）
門（npm run gate）  = 5 段すべて緑
```

### 1.1 未コミットのもの（**私が作ったものではない・触らないこと**）

```
 D apps/web/public/art/uma/title-eye.png / .webp      ← 誰かが消した。意図不明
?? apps/web/public/art/**  … 70 枚                      ← ★§3-A に詳細。重要
?? evidence/world-build/*.json 2 件                     ← 過去の作り直しの証跡
```

### 1.2 今日のコミット（`87c19e6..8451c20`・15 本）

```
8451c20 /setup を既存の部品で組み直した（オーナー判断「B」）
dea61ec 🔴 「古いデザイン」の正体: /login /signup の帯が二重だった → OWN_HEADER に追加＋網
1edda5c 🔴 訂正: 調査書が「新旧」を逆に書いていた（下の §2）
8652fc0 0 バイトのファイルを検査で止める
b0f364d 配合の追いつき（予算は時間で切る）  ← ワーカー。未配備
ba4d264 配合の所要を測定
cd9af99 CI が「門のあとの汚れ」を見る
882fe65 決定論の穴（localeCompare → compareIds）
0dc003d 門のビルドが追跡ファイルを書き換えていた → 書き戻す
c60b0d8 門に build:web を入れた（出力先 .next-gate）
83bdc61 🔴 本番のビルドが落ちていた（/stable に revalidate が残っていた）
f91730f 血統修復ツールの冪等性
5c17749 血統の写しは作り直さずに直せた（staging で実施）
52924fd 血統の鍵が DB の id ではなかった
0bb37f9 調査: 画面が 2 世代 並存
```

---

## 2. 🔴 最初に知るべきこと: **画面の「新旧」**（私はこれを逆に書いて、あやうく事故になった）

**新旧は「ディレクトリ名の印象」ではなく「追加された日」で決める**（`git log --diff-filter=A --format=%ci -1 -- <path>`）。

| 世代 | 追加日 | 面 | 部品 |
|---|---|---|---|
| **新（馬物語 UI・R-14）** | **2026-09-17** | `/home` `/vote` `/mypage` `/train` `/exchange` `/earn` `/howto` `/watch-race` | `components/uma/uma-parts` |
| **旧** | 2026-08-19 | `/stable` `/training` `/races` `/prizes` `/entry` `/odds` | `components/ui` |
| 混成（旧い日付・**新しい部品で作り直し済み**） | 08-19 / 08-20 | `/login` `/signup`（今日の前から）／`/setup`（**今日** 作り直し） | `uma-parts` |
| どちらでもない | — | `/`（LP）・`/records`（17 行）・`/watch` `/race-next`（実験） | — |

- **2026-09-17 はオーナー指示「また新ルートに切り替えてください」の日**。`apps/cli/test/uma-ui-wiring.test.ts` が `/races` `/training` `/prizes` を **`LEGACY`** として釘付けしている。
- **メニュー（2 つある）は、新しい世代を正しく指している**: `apps/web/src/components/nav.tsx`（`ArcadeNav`）と `apps/web/src/components/story-shell.tsx`（`LINKS`）。**「古いほうを指している」は私の誤り**（調査書 `REPORT_UI_TWO_GENERATIONS_20260921.md` の冒頭に訂正あり。§2〜§4 の新旧は逆に読むこと。§5・§6 は無傷）。
- 🔴 **その結果**: 今日 **本物のデータに繋いだ `/stable` `/training` は旧い世代**。**新しい世代の面（`/mypage` `/train` `/home` `/vote` `/exchange`）は全部デモデータのまま**（`grep supabase|stable-repo|createClient` での簡易判定）。**お客が普通に歩く道は、まだ 1 面も本物のデータに繋がっていない。**

### 2.1 ナビを触るなら

```
- ナビは 2 つ。片方だけ直して「出られます」と報告した失敗が既にある（2026-09-17）。
- `apps/cli/test/uma-ui-wiring.test.ts` を弱めない。落ちたら実装を直す（今日、これが唯一の防壁だった）。
- 確かめるのは「配信された HTML」（§10-③）。ソースを読んだだけで完了と言わない。
```

---

## 3. やること（優先順・**上ほど急ぐ**）

### 3-A 🔴 `/race`（中継）— オーナーが今日 直接 指摘した画面

オーナーの言葉: 「**中継を見るを押すと なんですか？このUIは 色々とUIがちゃんとしていない**」（スクリーンショットあり：薄いベージュの画面に「馬物語／レースの用意をしています…／← もどる」、下に黒い四角、その上にボタンが 7 つ並ぶ）。

**私が本番（`8451c20`）をヘッドレス Chrome で実際に開いて測った事実**（1 回・この PC から・キャッシュ無し）:

| 測ったこと | 結果 |
|---|---|
| 「用意しています」が消えるまで | **122 秒**（`READY_MS=122288`）。**止まってはいない。遅い** |
| キャンバス | 1 枚。描画は始まる |
| 例外 | 無し |
| 🔴 **開発用の操作がお客の画面に出ている** | `演出開始 / 最初から / 音 切 / 演出：新しい形 / 見る人：観戦 / 展開：通常 / 回り：左 / 全画面 / もう一度`（**2 組**重複して出る） |
| 🔴 **404 になる素材** | `favicon.ico`、`art/parallax/backstretch-side-v1/dirt-{near,mid,far}.webp`、`art/horse-jockey-diag-front-v4-pose01〜08.webp` |

**404 の原因（実測）**: **手元には在るのに、git に入っていない**（`git ls-files` = 0、`ls` = 1）。コードは実際に要求している（`race/page.tsx:3382` `'horse-jockey-diag-front-v4'`、`:3416` `v4${t}`）。

```
🔴 これは「誰かのコミット漏れ」です。私は コミットしていません（理由: 誰の成果物か・どれが本物かを確認していないため）。
   未追跡 70 枚の内訳（例）: diag-front-v4-pose 8 / v4b 8 / v4thin 8 / side-v9b 16 / side-walk-v1 8 / side-v8b 8 / chibi 6 / parallax dirt 3
   コードが要求しているのは: diag-front-v4(-pose)・v4b・parallax dirt・side-walk-v1・side-v8b
        （grep で確認。正面は型 a/b/c のみ要求＝race/page.tsx:719 `HORSE_TYPES`。`thin` という型は無い）
   コードが要求していない（＝実験の残り物の可能性が高い・「高い」であって確定ではない）: v4thin・side-v9b・horse-jockey-chibi-*
        ⚠️ この判定は「文字列の grep」。名前をテンプレートで組み立てている箇所があるので、
           コミットする前に「本番で 404 になった名前」（§10.1 の手順）と突き合わせること
```

**やること（提案・決めるのはオーナー）**:
1. **コードが要求している系列だけ**を、オーナーの了承を得て `git add`（**ファイルを名指し**）。残りは `out/gen/` へ退避（記憶に「Codex は `public/art` に作業ファイルを書く」とある。**画像生成のあとは `git status` で未追跡を確認する**）。
2. **開発用の操作を、お客に見せない**。`race/page.tsx` に `devMode` / `?dev=1` の出し分けが既に在る（`!devMode && …` の枝）。**「開発用の操作を出す」というリンク（`devHref`）が、お客の画面に出ている**のが根。**これは見た目の判断ではなく出し分けの誤り**なので、開発側で直してよい。
3. **122 秒**をどう扱うか。コード自身が「携帯では素材が揃うまで 20 秒ほど何も出ない」と註記している（`:5826`）。**合計 5 MB 超**（部分測定）。携帯には `baked`（焼き込み）経路と `tooHeavy` の蓋がある（`:2439`〜）。**これは映像・素材の設計判断が絡む**（§3-D）。
4. `favicon.ico` の 404 は些細だが、直す（1 枚置くだけ）。

⚠️ **`race/page.tsx` は 401 KiB・6,263 行。** 引き渡し資料 §4.1 は「1 行も触らない」と書いていた（`watch-race/page.tsx` の註記）。**触るなら最小差分・検査つき**。

### 3-B 「数分おきにレースが開催され、それが流れる」という体験（オーナーの根本の疑問）

オーナーの言葉: 「**そもそもレースが数分おきに開催されそれが流れるというのは？**」

**事実（実測）**:
- ✅ **世界は動いている**。6 分（`CYCLE_MS`）に 1 周。レースは生成 → 発走 → 確定している（本番 DB・1 分前に確定・未処理 0 本）。
- 🔴 **しかし「流れる」体験は成立していない**:

| | |
|---|---|
| 観戦の入口が **5 本** | `/race`（6,263 行・本体）・`/races`（一覧）・`/watch-race`（案内・新）・`/watch`（実験）・`/race-next`（実験）。**どれが正か決まっていない** |
| 観る画面が開発用の操作を出したまま | §3-A |
| 縦持ちで観られない | `race/page.tsx:323` `const W = 1280`（16:9 固定）。オーナー: 「**横画面にしないと見れないなら、数分おきのレースが流れ続ける UX にならない**」 |
| 「今やっているレース」へ直接つながる線が無い | `/watch-race` は `/race?return=/home` へ送るだけ |

**レース演出の 3 案（私の見立て・費用は測っていない・見込み）**:
```
① 16:9 のまま縮める        … 小。ただし細い帯のまま＝指摘の答えにならない
② 縦向きの画角を作る       … 大。HUD が 1280 幅の絶対座標。**デザイナーの画角が先**
③ 動かさず結果と物語で見せる … 中。別の体験＝オーナーとデザイナーの判断
```
**これは私・あなたが決めない。** 案と費用を出して、選ぶのはオーナー（レビュー側もそう裁定済み）。

### 3-C 新しい世代の面を、本物のデータに繋ぐ（§2 の 🔴）

- **データ層は使い回せる見込み**（実装で確認したわけではない＝**推測**）。`apps/web/src/lib/stable-repo.ts`（`supabaseStableRepo`）は `StableRepo` interface の裏に在り、`my_horses` `my_runs` `users` `world_state_public` を読む。`/stable` で動いている。
- 調教の指示: `training_orders` 表 ＋ RPC `set_training_order`（移行 `0057`〜`0059`）。**書く鍵と読む鍵の食い違いを 1 度作って直した**（`apps/cli/test/training-order-key.test.ts` が釘付け）。**注意: ワーカー側（`training-runner.ts` が注文を読む）は未配備**。画面から指示を書いても、**本番のワーカーは まだ読まない**（§6）。
- **条件（レビュー側の裁定）**: ① 見た目を変えない ② `uma-ui-wiring.test.ts` を弱めない ③ 「本物のデータを読んでいる」＋「デモに落ちたときは理由が出る」を**対で**検査 ④ 旧の 2 面（`/stable` `/training`）は**消さない**。
- ⚠️ **デザイナー領域との線**: 「データを読む配線」は開発側。「どう見せるか（配置・色・部品の新設）」は**デザイナー**（§5）。

### 3-D デザイナー（またはオーナー判断）が要るもの

| | |
|---|---|
| `/race` の画角（縦持ち） | §3-B ②③ |
| `/home` `/login` `/signup` `/earn` `/howto` `/setup` の**出来** | `/setup` は今日 **B（既存部品の再利用）** で組み直した。それ以上の意匠は未決 |
| 観戦の入口を 1 つにする | どれが正か（オーナー判断） |
| 旧い面（`/stable` `/training` `/races` `/prizes` `/entry` `/odds` `/records`）を **新しい世代へ載せ替えるか** | 載せ替えるなら**旧 5 面に相手が無い**問題（`/home` 相当はあるが）。**デザイナー案件** |
| `/setup` の「馬体カット（準備中）」 | 旧版の内容。新版では出していない（毛色・年齢・脚質・素質は**列が無い・作り物だった**ので出さない、が旧版の判断） |

---

## 4. 今日 **配信された画面で確かめた**事実（本番 `8451c20`）

`/home /login /signup /setup` は、**帯 1 つ・自前バー有り・`data-theme="uma"`**（`OK`）。`/login` `/signup` の**帯の二重**は直った（`OWN_HEADER` に追加）。**オーナーの「TOP からログインを押すと古いデザインが出る」の正体はこれ**（世代の混在ではなかった）。

⚠️ **検査が言えるのは「在ること」まで**（画面を描画していない）。**`/setup` で実際に登録が最後まで通るかは、誰も見ていない。** オーナーに `/signup` → `/setup` → 最初の 1 頭 を通してもらうこと。失敗の文言は**サーバーの言葉をそのまま出す**作り（UI1-9）。

---

## 5. 体制（誰が何を決めるか）

```
オーナー（最終判断）
   ↕
レビュー側 Claude（別セッション名 claude-code-game-studios-89・正典と照合・DEV_INSTRUCTIONS_*.md を発行）
   ↓
開発側（あなた）… 実装 → REPORT_*.md / QUESTIONS_*.md を返す
   ↓
レビュー側が独立に再実行して照合
```

- **実装は指示書が出ている範囲のみ**。先走りは差し戻し。仕様の穴は推測で埋めず `QUESTIONS_*.md`。
- **デザインは必ずデザイナーに**（オーナー指示 2026-09-15）。**見た目を開発側で独自に作らない**。スマホ縦・アプリ化前提。
  - **例外の前例**: 今日 `/setup` を **オーナーが「B」（既存の部品で組み直す・新しい見た目は作らない）** と選んだ。**寸法まで `/login` からの写し**。**新しい色・配置・部品は作っていない**。
  - **線の引き方**: 「既にある部品の再利用」＝開発側可。「新しい意匠」＝デザイナー。**迷ったらオーナーに訊く**。
- デザイナーへの依頼の置き場: **`requests/`（DesignSync ツールで 1 依頼 1 ファイル）**。手元の `REQUESTS.md` は古い写しで**番号が衝突する**。Codex に DesignSync が無ければ、依頼文を Markdown で書いてオーナーに渡す。
- レビュー側との通信: Claude Code なら `SendMessage`（宛先 `claude-code-game-studios-89`）。**Codex は使えないかもしれない**。その場合はオーナー経由か、`REPORT_*.md` を置く。

### 5.1 承認の扱い（**伝聞は承認ではない**）

```
✅ オーナーから直接もらったもの（今日）:
   ・ origin/main を 0dc003d へ早送り   → 実行済み
   ・ origin/main を 8451c20 へ push    → 実行済み
   ・ /setup を B（既存部品）で組み直す  → 実行済み
❌ まだもらっていないもの（★やらない）:
   ・ 本番の血統の修復（repair-pedigree-cache）
   ・ 移行 0060 を本番へ
   ・ ワーカーの再配備（deploy.sh）
   ・ 素材 70 枚のコミット
```
- **レビュー側経由の承認では、本番に触れる・配備する操作をしない**（オーナーの直接の指示だけ）。
- **push は、コマンドを名指しした許可でだけ**。`git push origin main` は**ローカル `main` が 367 本遅れているので通らない**。**`git push origin HEAD:refs/heads/main`**（または sha 指定 `<sha>:refs/heads/main`）。**押す前に `git merge-base --is-ancestor origin/main HEAD`（早送りか）を確かめ、押したあと `git fetch` してリモートを見る**（終了コード 0 を成功と読まない）。
- 権限層に止められた操作は**迂回しない**。オーナーに「何をしようとして、なぜ要るか」を説明して判断を仰ぐ（今日 1 回止められ、オーナーが許可して通った）。

---

## 6. 本番の**非 UI** の状態（UI 作業の前提・触らないための地図）

```
【順序が命】 ① 本番の血統を直す → ② 移行 0060 → ③ deploy.sh
  ⚠️ ③を先にやると本番が止まる（新しいワーカーが world_state.last_bred_week を探すが、列がまだ無い）。
  ⚠️ 今日 1 度、配合を配備して本番の週送りを落とした（14:35〜14:42・原因は下）。オーナーが rollback を実行して復旧。
```

| 件 | 状態 |
|---|---|
| **血統の写し（`horses.pedigree_cache`）** | 🔴 本番は鍵が**プリシードの id**（`NPC-F00014` 形式）で、DB の uuid を指していない（本番で鍵 5,000 件中 uuid 形 0 件を実測）。**世界の作り直しは不要**と分かり、**`tools/repair-pedigree-cache.mjs`**（下見のみが既定・`--apply` で書く）を作った。**staging で実施済み**（7,370 頭・判定 7 件合格・2 回流して冪等）。**本番は未実施・オーナー許可待ち**。本番の関門: `--env production --apply --yes-production --repair-pedigree --expect-broken <その場で数えた壊れている頭数>`（数え方は失敗時に出る） |
| **`/stable` `/training` の本物データ** | ✅ 配信済み。**ただし旧世代の面**（§2） |
| **配合（POOL-SUPPLY）** | 実装済み・**未配備**。追いつき（予算は時間で切る）・`world_state.last_bred_week`（移行 `0060`）。**本番で走らせて確かめたのは「staging での 1 週」だけ**。配合 1 週 = 12.6〜19.2 秒（周 6 分の 3.5〜5.3%・この PC → staging）。**VPS からは未測定** |
| **調教の指示** | 画面 → `set_training_order`（移行 0057〜0059・本番に**当て済み**）。ワーカーが読む側は**未配備**。**画面から書いても、本番のワーカーはまだ読まない** |
| 本番のワーカー | `24af9f2`（VPS）。**push では入れ替わらない**。`tools/deploy.sh <commit>` |
| `nameCheckSkipped: true` | `data/ng-names.txt` が無く、馬名の NG 判定を通していない（公開前ブロッキング候補） |

### 6.1 今日の失敗（本番を 1 度落とした）— 同じ形を避けるために

`週送りに失敗: invalid input syntax for type uuid: "NPC-F00014"`。原因: **staging の偽の DB が返す行の形が本物と違った**（偽物の `pedigree_cache` の鍵は uuid、本物はプリシード id）。**偽物では緑・本物で赤**。→ 対策: **`tools/verify-breeding-live.mjs`**（本物の DB で 1 週走らせ、**必ず rollback**）。**配備の前に、本物の DB に 1 度通す。**

---

## 7. ⚠️ やってはいけないこと／罠（今日 実際に踏んだ）

### A. 画面まわり

| 罠 | 実例・対策 |
|---|---|
| **`'use client'` のファイルに `export const revalidate` などを残す** | `next build` が落ち、**Vercel が古い版を配信し続けた**（31 コミット・約 1.5 時間）。型検査は通る。**網**: `apps/cli/test/client-page-segment-config.test.ts`。門に `build:web` を入れた |
| **`OWN_HEADER` の入れ忘れ** | 新しい面（`uma-parts` を使う）を足すと、`story-shell.tsx` の `OWN_HEADER` に足さない限り**帯が二重**になる。3 度やった。**網**: `apps/cli/test/own-header-coverage.test.ts` |
| **ナビは 2 つ** | `nav.tsx` と `story-shell.tsx`。両方直す。**配信 HTML で確かめる** |
| **`globals.css` のモバイル規則** | `[style*="flex:0 0 250px"]` のように**インラインの値を名指し**している。ページ側で値を消すと**黙って効かなくなる**。**網**: `apps/web/test/mobile-css-anchors.test.ts`（今日、これが拾った） |
| **新旧を名前で決める** | §2。`components/ui` が新しそう、は**逆**だった |
| **見た目を開発側で新規に作る** | §5 |

### B. 検証

| 罠 | 対策 |
|---|---|
| **「200 が返った」を「動いている」と言う** | `/stable` は 200 でも中身はブラウザで読み込まれる（server-render は 8.6KB の外枠だけ）。**配信された HTML の中身を読む**。ログインが要る面は**オーナーの目** |
| **「テストが通った」を「機能が在る」と言う** | 今日の `/setup` の検査は「在ること」しか言えない（描画していない）。**言い過ぎない** |
| **「作った」で終わる** | 配信された HTML / 実 DB で確かめてから「できた」と言う |
| **パイプの終了コード** | `cmd \| tail; echo $?` は `tail` の値。**`npm run gate` にパイプを付けない**（`tools/gate.mjs` は自分の終了コードが判定そのもの） |
| **偽の DB / 偽の時計で緑** | 本物に 1 度通す（§6.1） |
| **道具の判定を疑わず信じる** | 判定を作ったら**わざと壊して落ちることを確かめる**（対照）。今日 何度もそれで欠陥が出た |

### C. シェル・ファイル編集（Windows / 日本語）

| 罠 | 対策 |
|---|---|
| **ヒアドキュメントが `\n` や `\s` を食う** | 日本語ソースの機械編集は **Edit ツール**。正規表現を含む JS は **Write ツールでファイルに書いてから実行**（`node -e` や `<<EOF` に正規表現を入れない） |
| 🔴 **Python の `open(p,'w')` は書く前に 0 バイトにする** | 書き込みが文字コードで落ちると**空のまま残る**。**`node --check` は空ファイルを合格にする**。**置換の後は必ず行数を見る**（`wc -l` / `git diff --numstat`）。**未コミットの大きな変更を抱えたまま機械編集しない**。**網**: `apps/cli/test/no-empty-files.test.ts`（追跡ファイルが空にならない） |
| コメント中の `*/` や `` ` `` | JSDoc・テンプレート文字列を壊す。検査が「落ちる」でなく「走らなくなる」 |
| `cp932` 出力 | Python の `print` で絵文字を出すと落ちる。ファイルに書いて `cat` する |

### D. インフラ

| 罠 | 対策 |
|---|---|
| **V: は VeraCrypt。電源断で落ちる** | 今日 1 度（ブレーカー）。`git` が「オブジェクトが読めない」と言い出す。**壊れている間は git に書かない**。**まず `Get-WinEvent` で `Microsoft-Windows-Ntfs` の Id 140 が止まっているか見る**（再マウント直後も他案件の常駐プロセスが古いハンドルを掴んで出続けた）。再マウントは**オーナー**（パスワード） |
| **dev サーバーと build が `.next` を奪い合う** | 門の `build:web` は `apps/web/.next-gate` へ出す（`STAR_NEXT_DIST_DIR`）。**ただし `next build` は `next-env.d.ts` と `tsconfig.json` を書き換える** → `tools/gate.mjs` の `buildWeb()` が書き戻す。**手で `npm run build:web` を流す場合は、流したあと `git status` を見て、この 2 ファイルが変わっていたら戻す** |
| **`loadEnv()` は `--env` 必須** | 省略で例外。**必ず `--env staging` か `--env production` を明示し、「接続先」の行を読む**。状態を変える道具は `assertNotProduction` が本番を拒否（本番に書くのは専用の旗が要る） |
| **本番の読み取りも権限層が止めることがある** | 本番を読む工程は、着手前に**1 コマンドに絞ってオーナーへ渡す** |
| **`git push` が資格情報の窓で固まる** | このセッションから push できない場合がある。**押せたかは `git fetch` して `origin/main` を見て判断** |

### E. 判断の作法（レビュー側と合意した規則）

```
・ 数字は 1 回 自分で測ってから書く。引き継いだ数字を信じて上書きしない
・ 「0 だった」を「合格」と読まない。0 件通過は判定不能（tools/lib/counted-verdict.mjs）
・ 「戻した」「消した」「直した」は、戻り値でなく実物（DB・配信 HTML・ファイル）で確かめる
・ 直した道具は 2 回流す（1 回目の緑は「効いた」しか言わない。2 回目で「何もすることが無い」になって初めて繰り返せる）
・ 規則は自分の頭の外に置く（註記は人を守らない。検査が守る）
・ 規則の索引: REVIEW_RULES_20260919.md / REVIEW_RULES_20260920.md（新しい分は未反映のものがある）
```

---

## 8. 門と検査（コミットの前に必ず）

```bash
npm run gate          # ★パイプを付けない。終了コード 0 になるまでコミットしない
```
5 段: ① `build:worker`（dist/worker.cjs）② `typecheck`（tsc strict・web も）③ **`build:web`（今日 追加）** ④ `verify:red`（vitest 約 2,700 件 ＋ 登録簿）⑤ `verify:open`（開いている指摘の期限）。

- **登録簿が新しい部品に反応する**（正しい挙動・毎回 出る）: 新しい `tools/*.mjs` → `tools/lib/classification.mjs`（READONLY/STATE_CHANGING…）に登録。新しい `tools/lib/*.mjs` → `COMPONENT` と `registries.mjs` の `NOT_A_REGISTRY`。状態を変える道具 → `tool-aftermath.mjs`。新しい `export const` の数値 → `calibration.ts` の `CALIBRATION` か `EXEMPT`。新しいエンジンの公開名 → `no-potential-in-web.test.ts` の `SAFE_REASONS`（D-114）。**落ちたら「登録する」であって「テストを消す」ではない。**
- 新しい未追跡ファイルは、`git add <名指し>` してから gate を流す（`tool-guard` が「版管理に在るか」を見る）。
- **コミット**: `git add <ファイルを名指し>` → `git commit`。**メッセージの末尾に、そのセッションの Co-Authored-By 行**（Claude Code は自動の指示に従う。Codex は不要）。**`git commit -a` `git add -A` は禁止。**
- **CI**: `.github/workflows/gate.yml`。`npm run gate` ＋ `node tools/verify-clean-tree.mjs`（門のあとに作業ツリーが汚れていないこと）。**CI で緑になるのを、まだ 1 度も見ていない**（push が要った。簿 `CI-DIRTY-TREE-UNSEEN` は閉じていない）。

---

## 9. 私（開発側）の今日の失敗（正直な記録）

1. **本番の週送りを 7 分止めた**（配合を配備 → 偽の DB で見えなかった形）。オーナーが rollback を実行。
2. **調査書の新旧を逆に書き、レビュー側の裁定を誤らせ、実装して 9/17 のオーナー決定を取り消しかけた**。`uma-ui-wiring.test.ts` が止めた。**変更は本番に出ていない。**
3. **`/stable` に `revalidate` を残し、本番のビルドを落とした**。Vercel は古い版を配信し続けた。「エイリアスが古い」「デプロイが抜けている」と 2 人で外れた診断をした（オーナーの「push すれば自動で出るのでは？」で解けた）。
4. **未コミット 500 行のファイルを 0 バイトにした**（Python の `open('w')`）。HEAD から復元（未コミットだった変更は再実装）。
5. **自分が書いた番人に 2 度 落とされた**（前提が誤り）。
6. 「新しい世代を本物のデータに繋ぐ」と言ったが、**データ層が使い回せるかは実装して確かめていない**（推測）。

---

## 10. 状態を測るコマンド（コピペ用・Git Bash）

```bash
cd /v/dev/Cusor/star
# ① 版
git rev-parse --short HEAD origin/main ; git fetch origin && git rev-parse --short origin/main
curl -s https://star-two-chi.vercel.app/api/healthz          # {"sha":"…"} ← 画面（Vercel）の版だけ。ワーカーの版ではない
# ② ワーカーが進んでいるか（読むだけ）
node tools/diag-worker-alive.mjs --env production
# ③ 配信された画面の帯（二重になっていないか）— 自前バーがあり、story-header が無いのが正しい
curl -s https://star-two-chi.vercel.app/login | grep -c "story-header"    # 0 が正しい
# ④ 門
npm run gate
# ⑤ ディスクが健全か（Windows / PowerShell）
#   Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-Ntfs';StartTime=(Get-Date).AddMinutes(-5)} | ? Id -eq 140
```

### 10.1 本番の `/race` を実際に開いて測る（今日 使った手順）

`tools/lib/cdp.mjs` の `launch()` は**既定でヘッドレス**（オーナーの画面に窓を開かない）。**この PC に Chrome がある前提**。手順:
1. `_race_probe.mjs` をリポジトリ直下に**Write ツールで**作る（`launch` → `goto` → `Runtime.exceptionThrown` / `Network.responseReceived(status>=400)` を購読 → 1 秒ごとに `document.body.innerText` を見て「レースの用意をしています」が消えるまでの時間を測る）。
2. `node _race_probe.mjs`。**測ったら消す**（`rm`）。コミットしない。
3. ⚠️ 記憶: 「`/race` はローカル dev では測れない（art が無い）。数字は本番でしか出ない」。**この手順は本番 URL を叩く**。

---

## 11. 開いている指摘（`tools/lib/open-findings.mjs`・**42 件**・期限内・2026-09-21 に数えた）

**UI に直結するもの**:
```
SETUP-STILL-OLD-DESIGN   [owner]  /setup。今日 B で組み直した。実登録が通るかは未確認（閉じていない）
PROD-OWNER-PAGES-BROKEN  [dev]    （既存・私は今日 中身を読んでいない）
GB-1 画面                [dev]    （既存・同上）
※ 旧い面と新しい面の混在は、簿に起票していません（一度 OLD-PAGES-ORPHANED-FROM-NAV を書いたが、
   裁定 A の撤回とともに取り消した）。§2 / §3-D に書いた。必要なら次のセッションが起票する
```
**本番の DB・ワーカーに関わるもの（UI の前提）**:
```
PEDIGREE-CACHE-IDS-NOT-DB-IDS      [review]  §6。staging 実施済み・本番は許可待ち
BREEDING-ONLY-ONE-WEEK-PER-CYCLE   [review]  追いつきを実装。未配備
BREEDING-STALL-COUNT-IN-MEMORY     [dev]     停滞の数えがメモリ。配備の便で DB へ
INBREED-COEFF-ABOVE-PEDIGREE       [review]  staging で 2 頭を再計算値に上書き済み（裁定）。本番は未
SEED-WORLD-DROPS-PRUNED-ANCESTOR   [review]  枝刈りの縁で 38 頭が片親不明。画面では「不明」と出す方針（裁定）
TRAINING-INSTRUCTION-NOT-READ      [review]  画面→DB は繋いだ。ワーカーが読む側は未配備
POOL-SIZE-THREE-SOURCES            [review]  2,500（正典）/ 2,400（実際）/ 2,028（導出）。算術上 2,500 が外れ値
NG-NAMES-UNWIRED                   [owner]   data/ng-names.txt が無い（公開前ブロッキング候補）
CI-DIRTY-TREE-UNSEEN               [dev]     実装済み。CI で緑を見るまで閉じない
```
（上は抜粋です。**全 42 件は `tools/lib/open-findings.mjs` を読むこと**。`why` に経緯が全部ある。**期限が切れると門が落ちる**）

---

## 12. 次セッションの提案する進め方（オーナーが違うと言えばそちらに従う）

```
1. §0 の 10 分。§10 で状態を測る
2. オーナーに 3 つ訊く:
     (a) /race の素材 70 枚: コードが要求している系列（§3-A）だけコミットしてよいか
     (b) /race の開発用の操作を、お客の画面から消してよいか（出し分けの誤りの修正・見た目の判断ではない）
     (c) /setup を実際に通してもらえるか（signup → setup → 最初の 1 頭）
3. (b) を直す → 配信 HTML と、§10.1 の実測で「開発用の操作が消えた」を確かめる
4. (a) 了承後に素材をコミット → push → 404 が消えたか、§10.1 で再測定
5. 122 秒の扱い（素材の軽量化・段階表示・携帯経路）を、案と費用で出す（実装しない）→ オーナー／デザイナー
6. 新しい世代の面を本物のデータへ（§3-C・条件 ①〜④）
```

**本番の血統修復 → 0060 → deploy.sh は、UI とは別の便**。オーナーが許可するまで**触らない**。

---

## 13. 参照

```
CLAUDE.md                                   … 憲法・体制・共有ツリーの作法
STAR_SPEC_v2.0.md                           … 正典（迷ったらここ。ここに無い仕様を推測で埋めない）
REPORT_UI_TWO_GENERATIONS_20260921.md       … 画面 2 世代（⚠️ 冒頭の訂正を先に読む。§5 §6 は有効）
REPORT_PEDIGREE_REPAIR_20260921.md          … 血統修復の報告（対照つき）
REVIEW_RULES_20260919.md / _20260920.md     … 規則の索引（AU-* / CK-* / MD-* / R-*）
tools/lib/open-findings.mjs                 … 開いている指摘（why に経緯が全部ある）
HANDOFF_*.md                                … 過去の引継ぎ書（最新の前は 2026-09-18）
apps/web/src/components/story-shell.tsx     … 帯とナビ（OWN_HEADER / LINKS）
apps/web/src/components/uma/uma-parts.tsx   … 新しい世代の部品（Backdrop/TopBar/NoticeBar/BigButton/…）
apps/web/src/app/race/page.tsx              … 中継（6,263 行）
apps/web/src/app/setup/page.tsx             … 今日 組み直した面（部品の使い方の手本）
apps/web/src/lib/stable-repo.ts             … 本物のデータを読む層
```

**⚠️ 廃棄済みで読まない・従わない**: `SPEC.md` / `AI_PROMPT.md`（他社製品の再現・憲法違反）、`GORILLA_STABLE_SPEC_v1.*` / `files.zip`（別プロジェクト）、`git.txt`（認証情報）。
