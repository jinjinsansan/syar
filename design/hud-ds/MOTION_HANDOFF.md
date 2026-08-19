# レース中継 HUD／モーション 説明書

対象リポジトリ: `jinjinsansan/syar` @ `main`
このデザインシステム（STAR レース中継 HUD）のカードが仕様の正本。Canvas 実装（`packages/render/src/*`）はここに合わせる。

## 0. 本線（迷ったらここを見る）

**本線は派手版**。正本は次の 2 つ。他のカードはこの 2 つに従う。

- 見た目の正本: `templates/race-hud/RaceHud.dc.html`（動く状態で確認できる）
- 実装値の正本: `components/screen-live/index.html`（1280×720 の実測座標つき）

派手版で許可している表現（Canvas で実装可）:

- **金はグラデーション1本**（`createLinearGradient`）。#fff6b0 0% → #f3cf34 30% → #a9791a 48% → #f7dc6b 62% → #fff6b0 100%。offset を 4.5s 周期で 190%→-90% に動かして光沢を走らせる。**ぼかし・影は使わない。**
- **斜度 -9°**（帯・チップ・馬番）。Canvas は 4 点 path。**文字は傾けない。**
- **数字はコンデンス書体 700**。導入できない場合は system-ui bold + tabular にフォールバックし、右揃えの箱幅を +15% 取る。
- 実況帯のスピードライン（1px・横流し 1.5s / 2.1s）は任意。重ければ省いてよい。

## 1. 何がどこにあるか

| デザインシステム内 | 内容 | 対応する実装 |
| --- | --- | --- |
| `tokens/` | 色・文字階層・パネル余白・線・切り欠き・状態色・カメラ切替色 | `palette.json`、各 draw 関数の色指定 |
| `components/screen-live/` | 「レース中」フル画面＋**実装座標の一覧** | `apps/web/src/app/race/page.tsx` の配置 |
| `components/standings/` | 順位パネル | `oblique-ui.ts drawStandings` |
| `components/call-band/` | 実況帯＋余力ゲージ | `oblique-ui.ts drawCallBand` / `drawGauge` |
| `components/section-tag/` | 区間タグ | `oblique-ui.ts drawCourseSectionTag` |
| `components/winner-lower-third/` | 勝馬テロップ | `oblique-ui.ts drawWinnerLowerThird` |
| `components/results-board/` | 着順ボード | `oblique-ui.ts drawResultsBoard` |
| `components/minimap/` | コース図ミニマップ | `minimap.ts drawCourseMinimap` |
| `components/title-card/` | レース名タイトル | `race-intro.ts drawRaceTitleCard` |
| `components/motion-spec/` | 走行アニメーションの式・数値 | `oblique-draw.ts drawObliqueHorse` / `race-intro.ts startHorseVisualAt` |
| `components/sheet-spec/` | スプライトシート受け入れ条件 | `oblique-draw.ts SheetSpec / SHEET_*` |
| `components/motion-mock/` | テンポ確認用の動くモック（絵なし） | — |
| `components/narrator-cast/` | ナレーター4名の枠・役割・生成条件 | `drawCallBand` の narrator 引数 |
| `templates/race-hud/` | HUD 一式のテンプレート | — |
| `components/start-band/` | まもなく発走 帯・カウントダウン | `race-intro.ts drawStartCallBand` |
| `components/entry-board/` | 出馬表（発走前オーバーレイ） | 新規（Canvas） |
| `components/payout-board/` | 確定・払戻（レース後） | `drawResultsBoard` を置き換え |
| `components/program-board/` | 番組表（Web） | `apps/web/src/app/page.tsx` |
| `components/race-detail/` | レース詳細＋公正性の検証（Web） | `apps/web/src/app/races/[id]/page.tsx` |
| `components/odds-board/` | オッズ（Web・新規） | `race_odds_public` |
| `components/paddock/` | パドック（発走前） | 新規（Canvas） |
| `components/replay-bar/` | リプレイ操作（シークバー） | 新規（Canvas） |
| `components/broadcast-badges/` | 中継バッジと遷移エフェクト | `oblique-ui.ts` の各 draw に共通 |

## 2. 描画の共通規約

- 画面は **1280×720**、左上原点。HUD は四隅と下端のみ。**中央 x300–900 / y80–600 は常に空ける**。
- 文字は **system-ui**（Hiragino / Noto Sans JP 系）の bold のみ。**14px 未満を使わない**。数字は tabular。
- 表現は **塗り・1px 線・角丸 2px** ＋ **金のグラデーション1本**まで。影・ぼかしは使わない。
- 斜度は **-9° 固定**。Canvas では 4 点 path の塗り。**文字は傾けない**。
- 金 `#f0cc4a` はアクセント。**1 画面で金を使う要素は 3 つまで**（上縁・先頭順位・重要数字）。
- 枠色 1〜8（白・黒・赤・青・黄・緑・橙・桃）は変更禁止。枠色の上の文字色は `inkOn()` で決める。

## 3. 走行アニメーション（要点）

```
STRIDE_M = 7.0
phase(h) = (h.meters / STRIDE_M + ((gate * 0.37) mod 1)) mod 1
frame(h) = floor(phase(h) * sheet.frames) mod sheet.frames
```

- **コマは距離で回す**。`displaySec` から作らない（減速時に「氷の上」に見える）。
- 目安 16m/s = 2.3 完歩/秒 = 18.3 コマ/秒。道中 2.1、直線の追い比べ 2.6。
- `bob` は `mode !== 'cruise'` のときだけ `sin(phaseT×2π) × widthPx × 0.025`。
- 鞭は `widthPx >= 140` のみ。引きでは出さない。
- 接地影は楕円 1 つ（`widthPx×0.20 × widthPx×0.05`, `rgba(20,30,18,.30)`）。
- 芝片は `(frame + gate) % 3 === 0` のコマだけ 4 個。
- **カット替えで frame を 0 に戻さない**（脚が飛ぶ）。

詳細な数値は `components/motion-spec/` を見る。

## 4. スプライトシートの受け入れ条件（Codex 生成物のチェック）

1. 1 行 = 8 コマ（斜め視点は 4 コマ）。コマ幅は整数、端に余白なし。
2. 接地点は全コマ同一。脚を畳んだコマだけ体高が変わる状態は不可。
3. 表示倍率の基準は「全コマ中の最大不透明高」= `referenceHeight` を固定。
4. 透過 PNG。被写体内部にクロマキー色の残りがないこと。
5. 勝負服・ゼッケン・枠色は差し替え可能な構造（別レイヤーか無地マスク）。
6. pose01 → pose08 → pose01 が連続する完歩 1 周期。
7. **寄りのシートを縮小して引きに使わない**。引きは `SHEET_FAR` として別に描く。
8. セル寸法・コマ数は描画コードに直書きせず、必ず `SheetSpec` で渡す。

命名: `horse-jockey-<view>-v<n>-pose<01..08>.png`（view = side / rear / diag-front / diag-rear / high-diag / far）

## 5. 進め方

1. Codex が 1 視点ずつ生成 → `components/sheet-spec/` の 8 項目で受け入れ判定。
2. 通ったら `SHEET_*` に 1 行追加し、`components/motion-mock/` のテンポ設定（完歩 0.44s、位相ずれ 0.37）で実機確認。
3. HUD 側の座標は `components/screen-live/` の一覧が正本。座標を変えるときは**まずカードを直す**。

## 5.5 Web 画面（DOM）と Canvas 画面の切り分け

- **Canvas（1280×720 固定）**: レース中HUD／タイトル／まもなく発走帯／出馬表／確定・払戻。座標は各カードの実装表が正本。
- **DOM（Next.js）**: 番組表／レース詳細＋公正性／オッズ。`layout.tsx` の `main` は max-width 980 → **1180** に広げ、padding は各画面に持たせる。共通のグローバルヘッダー（h56・ロゴ 18px 字間 .22em 金・右に EP と PP を別表示）を `layout.tsx` に置く。
- **文言の憲法（`lib/format.ts`）**: EP は「参加ポイント」、PP は「賞金ポイント」。**「購入」「チャージ」「換金」「円」を使わない。EP と PP を合算しない。** オッズが上限に達したら「（上限）」を明示。実在の競馬場名・レース名を使わない。

## 6. まだ決まっていないこと

- 状態差分（発馬直後の低い姿勢／省エネ／追い込み／疲労／勝者流し）が入るまで `mode` は 3 値運用。
- 「ゴール直後」「着順確定」のフル画面モックは未作成（`screen-live` と同じ規範で展開予定）。
- `components/` の個別カード（standings / minimap / section-tag ほか）は派手版への追従が一部残っている。座標は `screen-live` を優先。
- レース映像そのもの（馬・騎手・背景・ゲートの絵）は別ライン。
- 育成・記録・わたしの馬などレース外の画面は未着手。
- 区間タグ 6 状態、まもなく発走帯、四隅バッジも未展開。
