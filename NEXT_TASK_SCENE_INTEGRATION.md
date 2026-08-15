# 次にやること — ★第2便（`scene.js`）を `/race` に入れる

**状態**: ★**一度やって失敗し、戻しました**（`a06afca`）。
**理由**: 動いているコードに**文字列置換で差し込んだ**ため、引数の並びが壊れた。

---

## 1. ★何が起きたか（繰り返さないために）

```
動いている /race に、scene.js の呼び出しを**切り貼りで差し込んだ**
 → ★引数が壊れた（順位も実況も届かず、第1便の固定データが表示された）
 → ★型検査は通る（渡す値がすべて unknown 型のため）
 → ★テストも通る（767件緑。描画は測っていない）
 → ★画面を見て初めて分かった（背景も馬も出ない）
```

★**証拠の見つけ方**: 順位表示が `3,1,7,8,12,4,9,17,2,11,6,14` になっていたら、
それは **`layers1.json` の `horsePlan.runningOrder`（固定値）**です。
**実際の順位が届いていない**ということです。

---

## 2. ★正しい進め方

**差し込まないこと。`/race` を第2便向けに一から書くこと。**

理由: `drawStill`（第1便・1場面ぶん全部）と `drawScene`（第2便・区間別）は
**役割が重なっています**。両方を呼ぶと、どちらが何を描くのかが追えなくなります。

### 手順

1. ★**新しいページ `/race-next` を作る**（`/race` は触らない）
2. `still-reference.js` → `scene.js` の順に読み込む
3. `drawScene` **だけ**で背景・馬・手前のラチを描く
4. UI（順位・スタミナ・実況・着順）は**自分で描く**
   ⚠️ `drawStill` を UI のために呼ばない（役割が重なる）
5. 1つ描くごとに**画面を見る**。まとめて書かない
6. 見て良ければ `/race` を置き換える

---

## 3. ★API（確認済み）

```js
STARScene.drawScene(ctx, {
  palette,          // ★第1便＋第2便のマージ（/art/palette.json に統合済み・140キー）
  layers2,          // /art/layers.json（第2便）
  sharedLayers,     // ★/art/layers1.json の .layers（第1便の層。turfFar 以下を引く）
  atlas,            // STARStill.buildAtlas(sheet, palette, layersWithAllGates)
  section,          // 'homestretch' | 'backstretch' | 'corner' | 'gate'
  scroll,           // ★lead * 20（毎秒320px前後。3.2 だと止まって見える）
  horsePlan,        // { own, rows: [{ id, scale, groundY, air, gates[], x[] }] }
  cornerVariant,    // 'c'（回頭。★案a=帯の反り, 案b=斜め は不採用）
})
STARScene.drawFanfare(ctx, palette, width, phase)   // phase 0=旗が上がる / 1=振られる
STARScene.drawCutBadge(ctx, palette, label, metersLeft)
```

### ★落とし穴（両方とも踏みました）

1. **`buildAtlas` は `layers.horsePlan.rows` に載っている馬番しか焼きません。**
   第1便の計画は `14,6,11,2,17,9,4,12,8,7,1,3` なので、
   ★**5番・10番などが焼かれず、画面に出ません**。**1〜18 を全部載せた計画**を渡すこと。
2. **引数は `buildAtlas(sheet, palette, layers)`。** 順を間違えました。

---

## 4. ★守ること

| # | |
|---|---|
| 1 | ★**構図（3段12枠）は固定。** 誰がどの枠に入るかだけを順位で決める。計算で置き直すと壊れる |
| 2 | ★**走路の y を区間で変えない。** 接地線（436/520/626）がずれて枠が全部壊れる（デザイナーの指摘） |
| 3 | ★**倍率は 1× と 2× だけ**（D-058）。連続値で縮小しない |
| 4 | ★**着順はエンジンが決めたもの。** 開始時に D-059 のゲートを通す |
| 5 | ★**16進を書かない。** `palette.json` から役割名で |
| 6 | ★**コーナーの回頭は 0 → 0.48 → 0 に 1.2秒で補間**（突然逆流すると「バグ」に見える） |
| 7 | ★**`ASSET_VERSION` を上げる。** 上げないと古い JS が使われる |

---

## 5. ★確認の順序（毎回）

```bash
npm run typecheck && npm test     # 767件緑
```

⚠️ ★**型検査もテストも、描画の壊れを検出しません。** 必ず画面を見ること。

**画面で見るもの:**
- 背景が出ているか（★出ていなければ `drawScene` が落ちている）
- 馬が出ているか（★出ていなければ atlas に馬番が無い）
- 順位表示が**実際の順位**か（★固定値なら引数が届いていない）
- 手前のラチが馬より前にあるか

---

## 6. 残っている素材（`design/art/handoff2/`）

```
scenes/gate-closed.png / gate-fanfare.png / gate-open.png
scenes/backstretch.png / homestretch.png / corner.png
scenes/corner-a.png / corner-b.png / corner-c.png（★3案の比較）
scenes/light-day.png / light-dusk.png / light-night.png
sprites/prompts/frame-03-collected.md / frame-06-suspension.md（★追加2コマの生成指示）
ui/cut-badge.png / spec.md
cuts.md / RESEARCH.md / NOTES.md
```

★**追加2コマ（最収縮・宙に浮く24px）はまだ作っていません。**
生成プロンプトが `sprites/prompts/` にあります。**既存6コマの「間」に挿入**すること
（末尾に足すと「6コマ回してから2コマだけ違う動き」になる・`contract.md §1`）。

---

## 7. 未裁定・未処理

| # | |
|---|---|
| 🔴 **Q-P4-29** | 横位置 `w` の決め方（D-065 の本当の影響が測れない） |
| 🔴 **Q-P4-21** | `emptyAtMeter` を描画層に渡してよいか |
| 🔴 **Q-P4-22** | ゲージの定義（逆を向いていた件） |
| **Q-P4-20 / 25 / 26 / 30** | 境界の位置／コーナー／距離ごとの勝ち時計／毛色を遺伝形質に |
| **アートバイブル** | 順位表示の丸を §3 の例外にするか |
| **第3便** | 最終直線・ゴール前後の演出 |
| ★**オーナー** | **staging の DB パスワードと service_role キーのローテーション（未実施）** |
