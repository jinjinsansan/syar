# 一覧 — ソースに 1 回しか出ない漢字 129 種（裁定 Q-K-2）

作成: 2026-08-29 / ブランチ `p4/race-30sec-cuts`
開発側 → レビュー側・オーナー
指示: `REVIEW_P4_A1_DIRT_CANON_VERDICT_20260829.md` §8 Q-K-2

> ★**結論: 別字は 0 件でした。** ★129 種すべて、文脈で正しい字です。
> ★直したものは**ありません**（裁定の「『この語のこの字が変』と言えたものだけを直す」に従いました）。
> ⚠️ ★**この一覧を登録簿に昇格させないこと**（裁定 Q-K-1 の理由がそのまま効きます）。

---

## 0. 測定の条件

| | |
|---|---|
| 走査対象 | 追跡中の `.ts` / `.tsx` / `.mjs` ★**496 ファイル**（`git ls-files`）|
| 異なる漢字 | 1308 種 |
| ★**1 回だけ** | ★**129 種**（本書の対象）|
| 判定 | ✅ = 文脈で正しい ／ ☆ = ★**字は正しいが、語の選びが珍しい**（直していません）|

★字の**周辺**を出しています。
⚠️ ★行頭から 110 字で切ると、★**肝心の字が見えない行が 10 件**ありました（一度そう作って直しました）。

---

## 1. 騎手名（16 字）

★`apps/web/src/app/race/page.tsx` の `JOCKEY_NAMES` にしか出ません。★**全部正しい字**です。
⚠️ ★実在の人物をモデルにしないこと（憲法 §0.1）は別の論点で、本書の対象外です。

| 字 | コードポイント | 出どころ | その周辺 | 判定 |
|---|---|---|---|---|
| 伊 | U+4F0A | `apps/web/src/app/race/page.tsx:321` | …', '藤田 昇', '小林 亮', '伊藤 健', '吉田 直樹', '岡田 悠… | ✅ |
| 佐 | U+4F50 | `apps/web/src/app/race/page.tsx:321` | …Y_NAMES = ['田中 守', '佐藤 翼', '山本 誠', '中村 駿'… | ✅ |
| 吉 | U+5409 | `apps/web/src/app/race/page.tsx:321` | …', '小林 亮', '伊藤 健', '吉田 直樹', '岡田 悠', '森川 浩… | ✅ |
| 岡 | U+5CA1 | `apps/web/src/app/race/page.tsx:321` | …, '伊藤 健', '吉田 直樹', '岡田 悠', '森川 浩'] as con… | ✅ |
| 川 | U+5DDD | `apps/web/src/app/race/page.tsx:321` | …'吉田 直樹', '岡田 悠', '森川 浩'] as const; | ✅ |
| 悠 | U+60A0 | `apps/web/src/app/race/page.tsx:321` | …伊藤 健', '吉田 直樹', '岡田 悠', '森川 浩'] as const; | ✅ |
| 拓 | U+62D3 | `apps/web/src/app/race/page.tsx:321` | …'中村 駿', '高橋 蓮', '松本 拓海', '藤田 昇', '小林 亮',… | ✅ |
| 村 | U+6751 | `apps/web/src/app/race/page.tsx:321` | …, '佐藤 翼', '山本 誠', '中村 駿', '高橋 蓮', '松本 拓海'… | ✅ |
| 森 | U+68EE | `apps/web/src/app/race/page.tsx:321` | …, '吉田 直樹', '岡田 悠', '森川 浩'] as const; | ✅ |
| 橋 | U+6A4B | `apps/web/src/app/race/page.tsx:321` | …, '山本 誠', '中村 駿', '高橋 蓮', '松本 拓海', '藤田 昇'… | ✅ |
| 浩 | U+6D69 | `apps/web/src/app/race/page.tsx:321` | …吉田 直樹', '岡田 悠', '森川 浩'] as const; | ✅ |
| 海 | U+6D77 | `apps/web/src/app/race/page.tsx:321` | …中村 駿', '高橋 蓮', '松本 拓海', '藤田 昇', '小林 亮', '… | ✅ |
| 翼 | U+7FFC | `apps/web/src/app/race/page.tsx:321` | …AMES = ['田中 守', '佐藤 翼', '山本 誠', '中村 駿', '… | ✅ |
| 蓮 | U+84EE | `apps/web/src/app/race/page.tsx:321` | …'山本 誠', '中村 駿', '高橋 蓮', '松本 拓海', '藤田 昇',… | ✅ |
| 誠 | U+8AA0 | `apps/web/src/app/race/page.tsx:321` | …'田中 守', '佐藤 翼', '山本 誠', '中村 駿', '高橋 蓮', '… | ✅ |
| 駿 | U+99FF | `apps/web/src/app/race/page.tsx:321` | …'佐藤 翼', '山本 誠', '中村 駿', '高橋 蓮', '松本 拓海',… | ✅ |

---

## 2. その他（113 字）

| 字 | コードポイント | 出どころ | その周辺 | 判定 |
|---|---|---|---|---|
| 丁 | U+4E01 | `packages/training/src/temper.ts:14` | *     丁寧に休養を入れるプレイヤーほど、馬の個性… | ✅ |
| 但 | U+4F46 | `packages/render/src/reference-hud.ts:20` | *   （設計 §5 の但し書き）。**先頭との差**にしています… | ✅ |
| 住 | U+4F4F | `apps/web/src/app/prizes/page.tsx:114` | …取消できません。発送先はアカウント設定の住所になります</span></div> | ✅ |
| 促 | U+4FC3 | `packages/sim-engine/test/streams.test.ts:41` | …える（増やしたらこのテストが落ち、登録を促す） | ✅ |
| 冗 | U+5197 | `packages/render/src/bracket.ts:12` | *       「色＋数字」の冗長化で自然に満たされます。 | ✅ |
| 凡 | U+51E1 | `apps/web/src/app/stable/[horseId]/page.tsx:14` | …まで（文字・左バー／地）。3 組目以降は凡例に名前だけ */ | ✅ |
| 凹 | U+51F9 | `apps/web/src/app/setup/page.tsx:19` | /** 入力欄（筐体の凹み: 縁 3px 濃紺＋inset・右端… | ✅ |
| 刺 | U+523A | `packages/race-engine/test/lane-reveal.test.ts:7` | *   このとき裁定が釘を刺したのは: | ✅ |
| 剥 | U+5265 | `tools/lib/exposure-registry.mjs:84` | …update, delete` だけを剥奪し、 | ✅ |
| 劇 | U+5287 | `apps/cli/src/preseed.ts:126` | *   近交には**劇的に効く**が、**合格基準3 が悪化す… | ✅ |
| 勘 | U+52D8 | `packages/render/src/broadcast-v2.ts:95` | …★その式は**馬 1 頭ぶんの絵の幅を勘定に入れていません**。実測（4 see… | ✅ |
| 勾 | U+52FE | `tools/verify-readable.mjs:204` | * ★ロジスティック回帰（勾配降下）。★手で係数を決めないための最小… | ✅ |
| 包 | U+5305 | `packages/sim-engine/src/balance.ts:106` | …nge 600/900）と実在の距離帯を包含する範囲を P0 で定義。 | ✅ |
| 博 | U+535A | `packages/betting/src/types.ts:10` | …で購入できる経路を作らない**（憲法・賭博構造の分水嶺） */ | ✅ |
| 厄 | U+5384 | `tools/lib/env.mjs:74` | …ます。★落ちずに NaN のまま進むのが厄介です。 | ✅ |
| 商 | U+5546 | `apps/web/src/lib/format.ts:7` | …総資産的な合算表示をしない** — 投資商品の見えを作らない | ✅ |
| 填 | U+586B | `apps/cli/test/preseed.test.ts:133` | //     5代の充填を測れない（実測 11/62）。44年… | ✅ |
| 墨 | U+58A8 | `apps/web/src/app/race-next/page.tsx:723` | *      墨の帯 ＋ 上辺に金の罫 ＋ **枠順色の… | ✅ |
| 奇 | U+5947 | `tools/render-contest-compare.mjs:64` | …H は偶数にすること（libx264 は奇数を受け付けない） | ✅ |
| 妙 | U+5999 | `tools/slice-narrator.mjs:103` | …ん。** 生成物は輪郭の抗鋸歯が全体で微妙に違うので、 | ☆ 同じ行の「抗鋸歯」が中国語風の語選び。★**字は壊れていない** |
| 委 | U+59D4 | `tools/diag-gauge.mjs:180` | …の出口（400m）で数%。★判断は裁定に委ねます。'); | ✅ |
| 寂 | U+5BC2 | `tools/shot.mjs:60` | *      「背景が寂しい」と私が判断していたのは、**確認用… | ✅ |
| 寧 | U+5BE7 | `packages/training/src/temper.ts:14` | *     丁寧に休養を入れるプレイヤーほど、馬の個性が… | ✅ |
| 尊 | U+5C0A | `tools/lib/dress.mjs:97` | …→ **透明で抜けているなら、それを尊重します。** | ✅ |
| 島 | U+5CF6 | `tools/measure-sheet-blobs.mjs:53` | // ★大きい塊だけ（尾の先などの離れ小島は捨てる） | ✅ |
| 嶺 | U+5DBA | `packages/betting/src/types.ts:10` | …経路を作らない**（憲法・賭博構造の分水嶺） */ | ✅ |
| 希 | U+5E0C | `apps/cli/src/verify-v14.ts:221` | //   EP は希少資源で、プレイヤーが直面する問いは | ✅ |
| 師 | U+5E2B | `apps/web/src/app/page.tsx:114` | …a-ink-2)' }}>オーナー兼調教師として、牧場をひとつ預かります</spa… | ✅ |
| 幻 | U+5E7B | `tools/lib/pixel-font.mjs:5` | …の評価は「まだ頑張って欲しい／ゼッケンで幻滅する」でした。 | ✅ |
| 建 | U+5EFA | `packages/render/src/perspective-draw.ts:418` | // 区間ごとの遠景建築。直線は観客席、向正面は低い設備棟、コ… | ✅ |
| 快 | U+5FEB | `packages/sim-engine/src/rng.ts:82` | …シュを持たないので呼び出し順=消費順が明快） */ | ✅ |
| 悲 | U+60B2 | `packages/race-engine/src/lane.ts:198` | * ⚠️ ★**コメントが裁定より悲観的なまま残っているのは事故のもと**で… | ✅ |
| 慮 | U+616E | `packages/betting/src/settle.ts:27` | /** 同着を考慮した「その馬の着順」。1始まり。同着は同… | ✅ |
| 憶 | U+61B6 | `tools/migrate.mjs:14` | …**どこまで当たっているかは人の記憶にしか無い**状態でした。 | ✅ |
| 懸 | U+61F8 | `tools/diag-v11.mjs:314` | …-11 が満たせるかは**ここだけ**に懸かっています'); | ✅ |
| 扇 | U+6247 | `packages/render/src/race-intro.ts:76` | // 発馬直後は進路を扇形に広げず、参考映像同様3列の密集馬群を… | ✅ |
| 抵 | U+62B5 | `apps/web/src/app/race-next/page.tsx:141` | …バイブル §3（線遠近を描き込まない）に抵触 | ✅ |
| 拌 | U+62CC | `packages/render/src/narrator.ts:44` | // ★シードを軽く撹拌してから割り当てる（連番のレースで同じ人… | ✅ |
| 招 | U+62DB | `apps/web/src/lib/game-demo.ts:148` | …体験', name: '厩舎見学ツアー 招待', pp: 42000, stock… | ✅ |
| 拭 | U+62ED | `apps/cli/src/race-diagnostics.ts:9` | ….12）を自分のプレースホルダの粗さの尻拭いに使ってしまう。 | ✅ |
| 挫 | U+632B | `apps/cli/src/measurement.ts:45` | …25〜35%」で、**軽度（3週で治る挫石・60%）から | ✅ |
| 搭 | U+642D | `apps/cli/src/simulator.ts:162` | *   **レース非搭載時のフォールバックとして明示的に隔離し… | ✅ |
| 播 | U+64AD | `apps/cli/test/preseed.test.ts:260` | …な F でも壊れない（NaN が評価に伝播しない）', () => { | ✅ |
| 撹 | U+64B9 | `packages/render/src/narrator.ts:44` | // ★シードを軽く撹拌してから割り当てる（連番のレースで同じ… | ☆ 伝統的な表記は「攪拌」。★**字は壊れていない** |
| 族 | U+65CF | `packages/render/test/shot-sequence.test.ts:30` | …it('道中は6秒ごとに異なるショット族を使う', () => { | ✅ |
| 昔 | U+6614 | `apps/worker/src/pg-store.ts:305` | * 【なぜ「昔の経路に落ちる」ではいけないか】 | ✅ |
| 昼 | U+663C | `packages/scheduler/src/programme.ts:43` | * 朝・昼・夜の目玉枠。144枠 = 24時間なの… | ✅ |
| 朱 | U+6731 | `apps/web/src/lib/setup.ts:16` | …vermilion', label: '朱', hex: '#d62f26' }, | ✅ |
| 柔 | U+67D4 | `tools/split-parallax-layers.mjs:236` | // 空との境界を少し柔らかく | ✅ |
| 校 | U+6821 | `apps/cli/src/sweep-distance.ts:2` | * 距離系形質の変異幅・回帰率の校正（開発用ツール） | ✅ |
| 栽 | U+683D | `packages/render/src/crowd.ts:171` | *    植栽は暗い緑なので差が小さく、この閾値では抜… | ✅ |
| 梁 | U+6881 | `packages/render/src/coat.ts:26` | * ⚠️ ★白い靴下・鼻梁の流星は無彩色に寄るので**変換しません… | ✅ |
| 棟 | U+68DF | `packages/render/src/perspective-draw.ts:418` | …遠景建築。直線は観客席、向正面は低い設備棟、コーナーは樹林を主役にする。 | ✅ |
| 欧 | U+6B27 | `packages/render/src/oblique-draw.ts:58` | *    **和文と欧文が混じった行で必ずずれます**。近似し… | ✅ |
| 毀 | U+6BC0 | `packages/training/test/injury.test.ts:2` | …故障（§7.5）。**プレイヤーの資産を毀損する**唯一の経路なので、 | ✅ |
| 汗 | U+6C57 | `apps/web/src/app/art-lab/page.tsx:30` | …'生中継を望遠で切り取った1コマ。毛艶・汗・血管、脚先だけ微ブレ', | ✅ |
| 沫 | U+6CAB | `packages/render/test/perspective-world.test.ts:12` | it('乾いた芝では飛沫を出さず、悪化したダートほど蹴り上げを強… | ✅ |
| 浅 | U+6D45 | `tools/measure-gallop.mjs:101` | …ちらは長らく bbox で測り、「伸縮が浅い（5.5%）」と誤判定して | ✅ |
| 湧 | U+6E67 | `packages/render/src/race-intro.ts:71` | …2秒以内に反応する。差を広げすぎて順番に湧かせない。 | ✅ |
| 滞 | U+6EDE | `packages/sim-engine/src/balance.ts:172` | * 実在サラブレッドの**選抜停滞（selection plateau）*… | ✅ |
| 漢 | U+6F22 | `apps/cli/test/source-integrity.test.ts:88` | *    ★恒久の形（使ってよい漢字の登録簿にして、既定を閉じる）は | ✅ |
| 火 | U+706B | `tools/verify-a2.mjs:126` | …onsole.log(`  ★中止の誤発火なし（期限内のレースを中止していない）:… | ✅ |
| 灯 | U+706F | `packages/render/src/oblique-ui.ts:382` | …隔5 高36/30/24/18/12（点灯分は 1.0s 脈動） | ✅ |
| 焦 | U+7126 | `tools/measure-contest-video.mjs:56` | …路は緑、ダートは明るい茶、柵は白。馬体（焦茶）・脚（黒）・勝負服（濃色）が残ります… | ✅ |
| 犯 | U+72AF | `tools/verify-horse-motion.mjs:10` | *      どれが犯人か切り分けられません。**動くものを… | ✅ |
| 玉 | U+7389 | `packages/scheduler/src/programme.ts:43` | * 朝・昼・夜の目玉枠。144枠 = 24時間なので 1枠… | ✅ |
| 玩 | U+73A9 | `packages/race-engine/test/pure-hash.ts:4` | * ★玩具ハッシュ（FNV 等）にしなかった理由… | ✅ |
| 瑕 | U+7455 | `tools/mutation/run.mjs:136` | // ★認証の瑕疵は「壊れていても正常にログインできてし… | ✅ |
| 疵 | U+75B5 | `tools/mutation/run.mjs:136` | // ★認証の瑕疵は「壊れていても正常にログインできてしま… | ✅ |
| 症 | U+75C7 | `packages/render/test/coat.test.ts:42` | …★芦毛を掛けても、肌は肌のまま残る（元の症状が再発しないこと）', () => { | ✅ |
| 痕 | U+75D5 | `tools/gen-pose-set.mjs:6` | …en/*.prompt.txt` がその痕跡）。 | ✅ |
| 皐 | U+7690 | `apps/web/src/lib/game-demo.ts:127` | …'投票', desc: '馬連　7R 皐月特別', delta: -500, b… | ✅ |
| 眠 | U+7720 | `packages/sim-engine/src/genetics.ts:225` | …// 低い方のアレルを置き換える（＝眠っていた大物の血が表に出る） | ✅ |
| 神 | U+795E | `packages/race-engine/test/intervention.test.ts:166` | …のテストは何も守っていない（R-3 の精神） | ✅ |
| 章 | U+7AE0 | `tools/audit-race-broadcast.mjs:166` | …。背景は drawCallBand で文章幅に追従する。 | ✅ |
| 紛 | U+7D1B | `tools/verify-training-week.mjs:117` | *   ★③は特に紛らわしく、「2回目も進んだ」のは**残り… | ✅ |
| 給 | U+7D66 | `apps/cli/src/preseed.ts:152` | …の（§6.1 の分離・突然変異）が既に供給している。 | ✅ |
| 綴 | U+7DB4 | `tools/lib/env.mjs:23` | …、**`--env local` という綴りがそれを環境名に見せていました。** | ✅ |
| 羽 | U+7FBD | `tools/mutation/dump-calibration.ts:15` | //   摂動のたびに登録簿も直す羽目になり、二重管理になる（L-2 で潰し… | ✅ |
| 翌 | U+7FCC | `apps/web/src/lib/game-demo.ts:47` | …rn '疲労が中程度です。重いメニューは翌週に影響します'; | ✅ |
| 脅 | U+8105 | `apps/worker/src/pg-store.ts:183` | …1（10分サイクルが無人で回り続ける）を脅かします。 | ✅ |
| 腹 | U+8179 | `tools/verify-pose-set.mjs:29` | …ました。** 数えていたのは**脚の間や腹の下の隙間**で、 | ✅ |
| 舐 | U+8210 | `packages/render/src/crowd.ts:208` | // ★行全体を舐めると重いので間引く。屋根は横一様なので… | ✅ |
| 蔵 | U+8535 | `tools/lib/cdp.mjs:15` | …ません（依存を増やさない）。Node 内蔵の `WebSocket` で直接話しま… | ✅ |
| 衷 | U+8877 | `tools/audit-overhead-stride2.mjs:71` | …18,    22,      '折衷'], | ✅ |
| 襲 | U+8972 | `packages/betting/src/balance.ts:52` | …以下）は2着までになる。実競馬の慣行を踏襲。 | ✅ |
| 誇 | U+8A87 | `packages/render/src/broadcast-v2.ts:1026` | *     ★**横移動がいちばん誇張される正面から 12 秒**かけて見せ… | ✅ |
| 誘 | U+8A98 | `tools/render-2d-pack-compare.mjs:9` | * ⚠️ ★画像の中に評価を誘導する説明文を書きません。名前と時刻だけ… | ✅ |
| 諦 | U+8AE6 | `apps/cli/src/simulator.ts:912` | …理由（高齢・8産済み等）なら、この牝馬は諦める | ✅ |
| 諮 | U+8AEE | `packages/render/src/broadcast-v2.ts:531` | …勝手に決めません。オーナーに諮ること。 | ✅ |
| 譲 | U+8B72 | `packages/render/test/contest-focus.test.ts:71` | /** ★上限を広げるほど後ろへ譲る（単調） */ | ✅ |
| 貧 | U+8CA7 | `packages/render/src/broadcast-v2.ts:55` | …で処理しましたが、★カットが減れば中継は貧しくなります） | ✅ |
| 貪 | U+8CAA | `tools/pick-silk-palette.mjs:69` | * ★貪欲法で「いちばん近い2色の距離」を大きく… | ✅ |
| 賄 | U+8CC4 | `apps/cli/test/simulator.test.ts:49` | …// 種付け候補 × 年間上限 で賄えている | ✅ |
| 軍 | U+8ECD | `apps/worker/src/odds.ts:55` | …向の都合で複製している。★L-2 の予備軍として記録しておく） | ✅ |
| 遵 | U+9075 | `packages/auth/src/line-id-token.ts:14` | *   これは規約の遵守であると同時に、**期限切れを再現可能… | ✅ |
| 郎 | U+90CE | `packages/auth/test/line-id-token.test.ts:90` | …loadOf({ name: '山田 太郎', picture: 'https:/… | ✅ |
| 酔 | U+9154 | `tools/count-headings.mjs:98` | …り替えが増える（★中継らしさは上がるが、酔いやすくなる）'); | ✅ |
| 釘 | U+91D8 | `packages/race-engine/test/lane-reveal.test.ts:7` | *   このとき裁定が釘を刺したのは: | ✅ |
| 釣 | U+91E3 | `apps/web/src/app/race/page.tsx:151` | …71×724 の低解像度で真横 v6 と釣り合わず、 | ✅ |
| 銀 | U+9280 | `apps/web/src/lib/setup.ts:31` | …: 'silver', label: '銀', hex: '#c9ced6' }, | ✅ |
| 鍛 | U+935B | `tools/verify-readable.mjs:16` | …⚠️ それは**画面ではなく読み手を鍛えた**だけで、R-16 | ✅ |
| 霜 | U+971C | `apps/web/src/lib/stable.ts:148` | …{ week: 19, race: '霜月賞', grade: '3勝クラス',… | ✅ |
| 靴 | U+9774 | `packages/render/src/coat.ts:26` | * ⚠️ ★白い靴下・鼻梁の流星は無彩色に寄るので**変換… | ✅ |
| 預 | U+9810 | `apps/web/src/app/page.tsx:114` | …}>オーナー兼調教師として、牧場をひとつ預かります</span> | ✅ |
| 頑 | U+9811 | `tools/lib/pixel-font.mjs:5` | …×5** で描き、オーナーの評価は「まだ頑張って欲しい／ゼッケンで幻滅する」でした… | ✅ |
| 願 | U+9858 | `apps/cli/src/verify-v7.ts:281` | …% に入るかどうかが変わります。判断をお願いします`); | ✅ |
| 騙 | U+9A19 | `packages/render/src/commands.ts:195` | *   **位置だけを読むと必ず騙されます。** | ✅ |
| 骸 | U+9AB8 | `tools/verify-v19-db.mjs:46` | * 既存の残骸を消してから始める（前回が途中で落ちてい… | ✅ |
| 鬐 | U+9B10 | `tools/measure-contest-video.mjs:69` | …り方です。上位 10% の列を「脚先から鬐甲まで通っている列」とみなします。 | ✅ |
| 鬣 | U+9B23 | `apps/web/src/app/race/page.tsx:686` | …鞍布の x 範囲」の黒画素がブーツ（鞍・鬣・脚を避ける）。 | ✅ |
| 齟 | U+9F5F | `tools/verify-horse-smoothness.mjs:36` | …方**に同じものを渡すこと（片方だけだと齟齬になる）。 | ✅ |
| 齬 | U+9F6C | `tools/verify-horse-smoothness.mjs:36` | …**に同じものを渡すこと（片方だけだと齟齬になる）。 | ✅ |

---

## 3. ★印を付けた 2 件（直していません）

| 字 | 語 | なぜ印か |
|---|---|---|
| 妙 | 微妙 | ★同じ行の「**抗鋸歯**」が中国語風の語選びです（日本語ならアンチエイリアス）。★**字は 1 つも壊れていません** |
| 撹 | 撹拌 | ★伝統的な表記は「**攪拌**」です（攪は常用外なので 撹 で書くのは普通）。★**字は壊れていません** |

★どちらも ★**「この語のこの字が変」とは言えません**ので、裁定の指示どおり**直さずに残し**て印を付けました。

---

## 4. ★この一覧の限界（R-22）

★**「1 回だけの字」は、別字が隠れやすい場所であって、別字が居る場所の全部ではありません。**

⚠️ ★実際、今回見つかった 6 種のうち ★**U+82DD（芝）は 38 箇所**あり、
★**この一覧には一度も出てこなかった**はずです（単発ではないため）。
★つまりこの検査は、★**今回の実害を一件も見つけられなかった**でしょう。

★正典 R-22「検定が『異常なし』と言ったら、その検定が異常のあるはずの場所を見ているかを先に確認する」。
→ ★**本書の 0 件は「別字が無い」ではなく、「1 回だけの字の中には無かった」以上のことを言いません。**

★恒久の形（Q-K-3）は単独の便で、と裁定が定めています。★本書はその判断材料の一部です。
