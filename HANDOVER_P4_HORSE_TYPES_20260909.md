# 引継ぎ書 — ★個体タイプを本番へ入れる（2026-09-09・開発側 Claude）

**あて先**: 次のセッションの開発側 Claude
**書いた理由**: セッションを区切るため。★**コミットしていない作業が残っています。**

---

## ★0. いちばん先に読むこと — ⚠️ ★この作業ツリーは 2 人で使われています

★このセッションの途中で、★**私以外の誰か（別セッション or codex）が同じディレクトリを編集**しました。
★セッション開始時のツリーはほぼきれいでしたが、★終了時にはその作業が混ざっています。

### ★仕分け（★2026-09-09 時点・`HEAD = 5bc1b83`）

```
★私（個体タイプ）の未コミット
  apps/web/src/app/race/page.tsx            … ★38 行ぶん（★同じファイルに相手の 7 行も入っています）
  apps/web/public/art/baked/manifest.json   … ★焼き直した目録
  tools/bake-race-frames.mjs                … ★型 B の役を追加
  tools/publish-deformed-art.mjs            … ★型 B を原版へ出す
  tools/capture-race-diagnostic.mjs         … ★--out / --url / 待ち方 / 真っ黒の関
  未追跡 16 枚  apps/web/public/art/horse-jockey-side-v8b-pose01..08.png
                apps/web/public/art/horse-jockey-diag-front-v4b-pose01..08.png
  未追跡 16 枚  apps/web/public/art/baked/side-v6-b-*.webp
                apps/web/public/art/baked/diag-front-v2-b-*.webp

★別作業（★交通流・表示速さ・上下動）— ★**触らないこと**
  packages/render/src/traffic-motion.ts       （新規）
  packages/render/src/race-motion.ts          （新規）
  packages/render/test/traffic-motion.test.ts （新規）
  packages/render/test/race-motion.test.ts    （新規）
  tools/audit-traffic-motion.mjs              （新規）
  packages/render/src/broadcast-v2-scene.ts   （cornerTracking の比較用スイッチ）
  packages/render/src/perspective-draw.ts     （horseBob / scaledHorseLift）
  packages/render/src/index.ts / time-warp.ts
  packages/render/test/fixed-camera.test.ts
  tools/lib/race-audit-build.mjs / .d.mts
  HANDOVER_P4_TRAFFIC_MOTION_20260909.md
  REPORT_P4_TRAFFIC_MOTION_20260909.md
  REPORT_P4_RACE_CONTROLS_20260909.md
  ★page.tsx の中の LEGACY_MOTION / trafficPositionModel / readableRaceRates / cornerTracking
```

### ⚠️ ★やってはいけないこと

```
★① git stash を使わない
   ★私は一度 `git stash -u` を使い、★**相手の作業まで退避**しました（すぐ pop で戻しました）。
   ★同じことをすると相手の作業が消えたように見えます。

★② git add -A / git commit -a を使わない
   ★相手の未完成の作業が入ります。★**ファイルを名指しで add** すること。

★③ page.tsx を「自分の版で上書き」しない
   ★1 つのファイルに 2 人ぶんの変更が入っています。
```

### ★コミットするときの add（★これだけ）

```bash
git add apps/web/src/app/race/page.tsx \
        apps/web/public/art/baked/manifest.json \
        tools/bake-race-frames.mjs tools/publish-deformed-art.mjs \
        tools/capture-race-diagnostic.mjs \
        apps/web/public/art/horse-jockey-side-v8b-pose0*.png \
        apps/web/public/art/horse-jockey-diag-front-v4b-pose0*.png \
        apps/web/public/art/baked/side-v6-b-*.webp \
        apps/web/public/art/baked/diag-front-v2-b-*.webp
```

⚠️ ★`page.tsx` には相手の 7 行が混ざります。★**オーナーに諮ってから**コミットすること。
⚠️ ★push はオーナー指示があるまで行わない（CLAUDE.md）。

---

## ★1. 落ちている検定 2 件は ★**私の変更ではありません**

```
★npm test  → ★2 件失敗 / 1431 件通過
★npm run typecheck → ★通過（★私の型エラーは直しました）
```

| 落ちた検定 | 理由 | 誰の |
|---|---|---|
| ★R-24 道具の分類 | ★`tools/audit-traffic-motion.mjs` が `tools/lib/classification.mjs` に未登録 | ★別作業 |
| ★表示時間の経路 | ★検定は `ratesForTarget(` を探す。★page.tsx が `(LEGACY_MOTION ? ratesForTarget : readableRaceRates)(` に書き換わったため落ちる | ★別作業 |

★確認の仕方（★`git stash` は使わないこと）:

```bash
git show HEAD:apps/web/src/app/race/page.tsx | grep -c "LEGACY_MOTION"   # → 0（HEAD には無い）
grep -c "LEGACY_MOTION" apps/web/src/app/race/page.tsx                   # → 1 以上（作業ツリーにある）
```

---

## ★2. 今日やったこと（★済み・コミット済み）

```
5bc1b83  レース映像: ★4 角のカット内で 12 頭が 1 コマで左右反転していた
92121a9  台帳: ★馬群の前後幅の誤診を撤回。★測定器の名前を直す
```

### ★4 コーナーの不自然さ — ★原因を特定して直しました

```
★18.2 秒（カットは 17.3〜18.6 秒）で ★12 頭ぜんぶが 0.1 秒で左右反転
★カットの切れ目ではなく ★カットの真ん中
★レース全体 12 カット中、★ここ 1 か所だけ

★原因: fourth-corner-front だけカメラ角が 158° → ★180° → 158° と ★真正面を通る。
　　　 左右は「進行方向を画面の横に投影した符号」で決めるが、★180° では符号が 0。

★直し: 左右の向きを ★カットの入口で 1 回だけ決め、カット中は変えない
　　　 （★据え置きカメラのカットは製品にこの 1 つだけ）。

★実測: カット内反転 ★1 回 → ★0 回 ／ ★他 8 カットは 476 コマ全部で差 0.00
```

⚠️ ★この反転は ★2026-08-28 に「迫ってくる絵」と引き換えに ★**承知のうえで残された**ものでした
（★`broadcast-v2.ts` の注記）。★退行ではありません。

★レビュー側（codex）へ渡した成果物:

```
REPORT_P4_CORNER_FLIP_20260909.md
tmp/race-diagnostic/4corner-plain.mp4 ／ 4corner-arrows.mp4
　★表示秒 12.0〜22.0 ／ ★書き出し倍率 1.0（★レースの 1 秒 = 映像の 1 秒）
```

⚠️ ★`tmp/` は git 管理外です。★消えたら `tools/capture-race-diagnostic.mjs` で撮り直します。

---

## ★3. いまやっていたこと — ★個体タイプ（型 A / B / C）

### ★なぜ要るか（★実測）

★画面の馬は 188×137px（★実機はさらに 67% 縮小）。★この大きさで読めるのは
★**輪郭の形**と ★**大きな明暗のかたまり**だけ。★毛色 20 色は ★**実質 3 群**しかありません
（★鹿毛↔黒鹿毛 55・★鹿毛↔栗毛 31 …）。

```
★型A  がっしり・白なし・短く尖ったたてがみ／気の強い顔
★型B  細身・★顔全体の白＋四肢の白・長く流れるたてがみと尾／穏やかな顔
★型C  小柄でずんぐり・★胴の大きな白斑・立ったブラシ状のたてがみ／やんちゃな顔
★輪郭の差  A↔B 34.4% ／ A↔C 36.1% ／ B↔C 42.7%（★合格線 30.5%）
```

### ★できたこと — ★型 A・B が本番で混ざっています

```
★PC の既定（原版の経路）      … ★確認済み
★携帯（?baked=1 の経路）      … ★確認済み  ← ★R-15「片方だけ直す」を繰り返していません
★npm run typecheck            … ★通過
```

★割り当ては ★**枠番から引く表**です（★`Math.random` は使いません・憲法4）。

```ts
// apps/web/src/app/race/page.tsx
const HORSE_TYPE_BY_GATE = ['a','b','a','b','a','b','a','b','a','b','a','b', ...];
const typeOf = (gate) => HORSE_TYPE_BY_GATE[(gate - 1) % 18];
const roleSuffixOf = (t) => (t === 'a' ? '' : `-${t}`);   // ★型 A は接尾なし（戻り道）
const HORSE_TYPES_IN_USE = HORSE_TYPES.filter((t) => HORSE_TYPE_BY_GATE.includes(t));
```

### ⚠️ ★型 C は止めています — ★実測した欠陥

★型 C の識別点「胴の大きな白斑」は、engine が ★**鞍布を探す窓**に入ります。

```
★鞍布の窓  x 0.27〜0.59 / y 0.34〜0.58 の中の「低彩度で明るい画素」
　　　　　（SILKS_LAYOUT_CROUCH.saddlecloth）

★その窓の中で「塗られる」画素（★側面 8 コマ）
  ★型A  63,411    ★型B  55,951    ★型C  ★117,295（★型A の 1.85 倍）
```

★画面では ★1 番が白・★7 番が緑…と ★**枠色の毛布**になりました（★目視確認済み）。
★型 C の個性が消えるうえ、★毛色でも型でもないもので馬が変わって見えます。

→ ★**白斑を鞍布の窓の外（後躯・尾）へ移して描き直す**のが直し方です。
★絵を作り直す話なので ★**オーナー判断待ち**（★勝手に生成を走らせていません）。

★戻し方（★描き直したら）:

```
① design/art/prompts/deformed-type-c.txt の白斑の位置を後躯・尾へ
② node tools/gen-pose-set.mjs …（★側面 8 ＋ 正面 8）
③ node tools/build-sprite-set.mjs … --install
④ tools/publish-deformed-art.mjs の c / c-front の 2 行のコメントを外す
⑤ tools/bake-race-frames.mjs の side-v6-c / diag-front-v2-c の 2 行のコメントを外す
⑥ page.tsx の HORSE_TYPE_BY_GATE を 3 型の表へ戻す（★注記に旧表が書いてあります）
```

★素材と経路は ★**全部通してあります**。★③まで済めば ④⑤⑥ は行を戻すだけです。

### ★読み込みの重さ（★実測）

```
★携帯が読むアトラス  ★型A のみ 10 枚 → ★型A＋B ★16 枚
　⚠️ ★3 型 × 7 色 = 42 枚ではありません。★**(型, 毛色) の実在する組だけ**読みます。
★焼いた素材（disk）  ★43MB → ★64MB
```

---

## ★4. ⚠️ ★今日つまずいた所（★同じ穴に落ちないために）

### ★① 画面が真っ黒になる ← ★型ごとに 12 頭ぶん焼いていた

★`buildFrames` は ★1 組の絵から ★12 枠ぶんを作ります。★型ごとに 3 回まわすと
★**キャンバスが 3 倍**になり、★描画が丸ごと止まりました（★JS ヒープは 117MB で上限 4192MB。
★**ヒープではなくキャンバス側**です）。

→ ★`buildFrames` と `silksOverlays` に ★`ownsGate` を足し、★**自分の枠だけ**作るようにしました。

```
★勝負服の重ね絵  192 枚 → （型を足すと）576 枚 → ★`ownsGate` で 192 枚に戻る
```

### ★② dev サーバーが編集を拾わないことがある

★`page.tsx` を編集しても、★配信される束が古いままでした（★`ASSET_VERSION` が古い値のまま）。

```bash
# ★配信中の中身を直に確かめる（★これが唯一の確実な確認）
curl -s http://localhost:3210/_next/static/chunks/app/race/page.js | grep -o "ASSET_VERSION = '[0-9]*'"
```

★直し方: ★`.next` を消してサーバーを入れ直す。
⚠️ ★起動は ★**`npm -w @star/web run dev -- -p 3210`**（★`npm run dev` は存在しません）。

### ★③ 撮影ツールで「真っ黒な 3 コマ」を撮った

```
★PC では ★**入場カード（「観る」）が出ません**。★出るのは開発用の操作だけ。
★PC は ★「演出開始」、★携帯は ★「観る」で始まります。
⚠️ ★どちらも押さないと ★**キャンバスは真っ黒のまま**で、★それでもシークは動くので
   ★黒いコマが所定の枚数だけ撮れます。
⚠️ ★「観る」を ★**部分一致**で探すと ★「ほかのコースを観る」を掴み、★一覧が開くだけです。
```

→ ★`tools/capture-race-diagnostic.mjs` に ★**平均輝度 8 未満なら出さない**関を付けました。

### ★④ ★「入力を疑ってから出力を疑う」

★白斑が緑になったとき、★まず ★**素材に緑が残っていないか**を測りました（★結果 0 画素）。
★そのうえで ★描画側（鞍布の窓）に原因を絞りました。★順番を守ること。

### ★⑤ ★矢印は根拠にならなかった

★4 コーナーはカメラがほぼ真正面（172°）で、★3m 進んでも画面上 26px。
★矢印の向きの振れ幅が ★151° あり ★**数値的に不安定**でした。
★「矢印と馬体が食い違う＝不具合」とは ★言えません。★直線カットで矢印自体を検算（★0°±1°）してから
★根拠から外しました。

---

## ★5. 使う道具

```bash
# ★型を原版へ出す（★勝負服を無彩色に戻す処理つき）
node tools/publish-deformed-art.mjs

# ★本番形式（アトラス）へ焼く
npx tsx tools/bake-race-frames.mjs

# ★dev サーバー（★npm run dev ではありません）
NODE_OPTIONS=--max-old-space-size=6144 npm -w @star/web run dev -- -p 3210

# ★等速でコマを撮る（★真っ黒なら止まります）
npx tsx tools/capture-race-diagnostic.mjs --from 17 --to 18 --fps 2 \
  --out tmp/race-types --url "http://localhost:3210/race?dev=1"

# ★矢印を重ねる（★診断専用・本番の絵には影響しません）
node tools/render-corner-arrows.mjs

# ★型を切って A/B する
#   ?types=0 … 型なし ／ ?types=side ／ ?types=front ／ 省略 … 全部
```

⚠️ ★`?dev=1` が要ります（★「開発用の操作を出す」は ★リンクであってボタンではありません）。
⚠️ ★新しい `tools/*.mjs` は ★`tools/lib/classification.mjs` に登録すること（★R-24 が落ちます）。

---

## ★6. 次にやること（★順番）

| # | やること | 状態 |
|---|---|---|
| ★① | ★オーナーに ★**2 人で同じツリーを使っている**ことを伝え、★コミットの仕分けを決める | ★**最優先** |
| ★② | ★型 A・B を ★オーナーの目で確認（`http://localhost:3210/race?dev=1` → 演出開始） | ★待ち |
| ★③ | ★型 C の白斑を後躯・尾へ移して描き直すか判断 | ★オーナー判断 |
| ★④ | ★繁殖で型を継ぐのか（★正典に無い）を照会書に出す | ★未着手 |
| ★⑤ | ★`tools/verify-v16.mjs` を製品の描画経路に合わせる | ★未着手 |

⚠️ ★④ は ★**推測で埋めないこと**。★いまは枠番から引いているだけで、
★「その馬の見た目」ではありません。★育成・繁殖ゲームとしては ★個体に属すべきものです。

---

## ★7. ★オーナーへの未回答

```
★「もう一方の作業と衝突していないか確認したい」… ★誰が何をしているか
★「型 C を描き直す生成を走らせてよいか」
```

★この 2 つが決まるまで ★**コミットしていません**。
