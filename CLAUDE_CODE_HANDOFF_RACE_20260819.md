# Claude Code 引継ぎ書 — レース中継 HUD（合格）と Codex 復帰後の続き

作成日: 2026-08-19  
対象リポジトリ: `V:\dev\Cusor\star`（branch `main`）  
対象画面: `apps/web/src/app/race/page.tsx`（開発サーバー `npm -w @star/web run dev` → http://localhost:3100/race）  
前回の引継ぎ: `CLAUDE_CODE_HANDOFF_RACE_20260817.md`（読み物として残す。§1 の「V2 を通常 URL で動かす」は解決済み）

---

## 0. いま何が確定しているか（オーナー判定）

| 項目 | 状態 | 出典 |
|---|---|---|
| **レース中継 HUD のデザイン（Claude Design「STAR レース中継 HUD」・派手版）** | **合格**（2026-08-19 オーナー「今回デザイナー側にもらったデザインは合格です」） | `design/hud-ds/` |
| HUD の Canvas 実装（見出し・区間タグ・順位・コース図・実況帯・タイトル・発走帯・勝馬テロップ・確定ボード） | 実装済み・開発サーバーでオーナー確認「ＯＫです」 | commit `cf397ef` |
| 真横 8 コマ（side-v6→v7） | 「合格に近い」／勝馬 v2 8 コマは「唯一合格」 | 前回引継ぎ・作業ログ |
| 背景・芝・ゲート・パノラマ・観客席 | 合格（触らない） | 同上 |
| 馬・騎手の走り（走行素材） | **未合格**。作り直し議論 A〜D のうち A（毛色）実装済み、B（写実寄り再描画）は Codex 復帰待ち | `docs/race-horse-art-options-20260819.md` |

**憲法（CLAUDE.md §0）**: 実在の競馬場・レース名・馬名・他社製品名を書かない（現在の仮名: スターパーク競馬場／桜星賞／11R／架空の馬名・騎手名・実況アナ「星野 亮太」）。`Date.now()`/`Math.random()` を直接呼ばない。`git.txt`・`secrets.*.env`・`壊す用のsupabse情報.txt` を読まない・コミットしない。`-chroma.png` 原版はコミットしない（`out/` は gitignore）。

---

## 1. デザインシステムの扱い（正本と同期）

- 正本は **Claude Design 側**のプロジェクト「STAR レース中継 HUD」（projectId `8d3af359-df88-42aa-b686-b4f1d09ce64f`）。ローカル `design/hud-ds/` はそのミラー（commit `6bc3587`）。
- 本線＝**派手版**。迷ったら次の 2 つ:
  - 見た目の正本: `design/hud-ds/templates/race-hud/RaceHud.dc.html`
  - 実装値の正本: `design/hud-ds/components/screen-live/index.html`（1280×720 の実測座標）
  - 規約: `design/hud-ds/MOTION_HANDOFF.md`（金グラデ 1 本／斜度 -9°・文字は傾けない／中央 x300–900・y80–600 は空ける／14px 未満禁止／走行アニメは距離でコマを回す）
- **座標や色を変えるときは、先にカードを直してから Canvas に反映する**（2 か所で持つと必ず離れる）。
- 同期手順（Claude Code の DesignSync ツール。サブエージェントには無いので本体で行う）:
  1. `list_files`（projectId 上記）で一覧 → `get_file` で本文 → `design/hud-ds/<path>` に verbatim 保存
  2. 取り込まないもの: `uploads/*.png`（オーナーのスクショ）、`_ds_bundle.js`・`_ds_manifest.json`・`_adherence.oxlintrc.json`・`.thumbnail`（アプリ生成物）
  3. 大きな繰り返し HTML（motion-mock・entry-board・odds-board・program-board・race-detail・paddock）は生成スクリプトで再現した（`scratchpad` の gen-*.mjs。差分が出たら再フェッチして上書きでよい）
  4. こちらから Claude Design へ書き戻すときは `finalize_plan`（writes/deletes 必須）→ `write_files`（localDir = `design/hud-ds`）
- Claude Design にお願いするときの依頼文の雛形: `docs/claude-design-hud-brief-20260819.md`

---

## 2. HUD 実装の所在（今回の成果）

| ファイル | 内容 |
|---|---|
| `packages/render/src/hud-kit.ts` | 共通部品: トークン `HUD`／金プレート `goldPlate`（`createLinearGradient` 1 本・4.5s 光沢）／斜め帯 `fillSlant`・`strokeSlant`／切り欠き板 `drawGlassNotchPanel`／枠色バッジ `drawFrameBadge`／字間ラベル `drawLabel`／登場 `riseAt`・ワイプ `wipeAt`／ON AIR＋音声レベル `drawOnAir`／文字送り `typedCount`（20 文字/秒）／ナレーター枠 `drawNarratorFrame`／金チップ `drawGoldChip`／`formatRaceTime` |
| `packages/render/src/oblique-draw.ts` | `Ctx2D` に任意 `createLinearGradient` を追加（無い環境では単色の金） |
| `packages/render/src/oblique-ui.ts` | `drawStandings`（順位）・`drawCallBand`（実況帯＋余力＋残り距離）・`drawCourseSectionTag`・`drawRaceHeadlineChip`（新規）・`drawWinnerLowerThird`・`drawResultsBoard`（確定ボード）。旧シグネチャは互換（`opts` 省略で静止画） |
| `packages/render/src/minimap.ts` | `opts` を渡すと本線の板（x40 y321 264×209） |
| `packages/render/src/race-intro.ts` | `drawRaceTitleCard`（96px レース名・自馬パネル・頭数バッジ）・`drawStartCallBand`（まもなく発走・カウントダウン） |
| `apps/web/src/app/race/page.tsx` | 配置とタイミング: HUD 登場 0.8s（`HUD_SETTLE_SEC`）／区間タグは文言が変わるとスライドイン（`sectionTagRef`）／実況の各行に発話開始秒（`callStartRef`）／局面が変わった発言は区間名から入る／ゴールした瞬間からライブ HUD を落とし勝馬テロップのみ／`NARRATOR_NAME`／フォント `system-ui` |

デザインにあって**未実装**のもの（次に着手する候補）:
1. 確定・払戻ボードの右ブロック（全券種の払戻・「あなたの結果」・差引）— 投票データが画面に届く経路ができてから
2. 出馬表（発走前オーバーレイ・縦組み）／パドック／リプレイ操作 — 新規画面（Canvas）
3. Web 3 画面（番組表／レース詳細＋公正性／オッズ）— Next.js DOM（`layout.tsx` の main を 1180 に）
4. ナレーター 4 名の切替と口パク（立ち絵が未制作。`components/narrator-cast` に生成条件あり）
5. コンデンス数字書体（今は system-ui bold。導入するならフォント読み込みと `hud-kit` の `+15%` 幅ルール撤廃）
6. カット替えのフラッシュ: 今は参考映像どおり白 95%・0.3s（`page.tsx` FLASH_INTO）。デザインは白 18%・3 フレーム。**オーナーが参考映像側を指定しているので変えていない**

---

## 3. Codex 復帰後（2026-08-20 14:13 以降）にやること

Codex は画像生成に使う（`tools/codex-imagegen.mjs`。生成物は `~/.codex/generated_images` から拾う。クロマ抜きは `tools/remove-chroma-key.mjs`、WebP は `tools/build-art-webp.mjs`）。**Codex の出力が 2 枚同じになる・選べないときは手で候補をコピーする**（過去に発生）。

### 3-1. 勝馬 後方寄り（winner-rear-v1）の残り 3 コマ
- 済: `out/gen/horse-jockey-winner-rear-v1-pose01〜05-chroma.png`（未クロマ抜き・未配置）
- 残: pose06〜08 を `design/art/prompts/winner-rear.txt` で生成 → 8 枚を `tools/remove-chroma-key.mjs` で抜いて `apps/web/public/art/horse-jockey-winner-rear-v1-pose01〜08.png` に置く → `node tools/build-art-webp.mjs`
- 置くだけで `page.tsx` の `loadSet('horse-jockey-winner-rear-v1')` が拾い、`broadcastV2ShotAt(..., { winnerRear: true })` で `winner-follow-rear` が有効になる（受け口は実装済み）
- 受け入れ: `design/hud-ds/components/sheet-spec` の 8 項目（接地点同一・pose01→08→01 が連続・被写体内にキー色なし 等）

### 3-2. 正面（0°）／真後ろ（180°）の一体素材セット
- 4 角正面（`fourth-corner-front`）と追走で、今は斜め素材の流用。`design/art/prompts/onepiece-dir.txt` を基に 8 コマずつ
- 命名 `horse-jockey-<view>-v<n>-pose01..08.png`（view = front / rear）。`SheetSpec` 経由で渡す（描画コードに寸法を直書きしない）

### 3-3. 案 B: 写実寄りの馬・騎手（side-v8）
- 手順は `docs/race-horse-art-options-20260819.md` の B。**まず 1 コマ目だけ**生成 → オーナー承認 → 8 コマ → 方向別へ展開
- 既存の side-v7 は残す（`page.tsx` の読み分けで戻せるように別セット名で）
- 参考: 承認済み側の見え方（勝馬 v2・side-v7）と、TV 中継の写実感（アーケード参考映像 `ダービースタリオン/参考映像スターホース版.mp4`）

### 3-4. ナレーター立ち絵（任意・HUD 側の要望）
- `design/hud-ds/components/narrator-cast/index.html` の生成条件（150×172 表示・2 倍で納品・胸から上・顔中心 (75,68)・下 30px はネームプレート・口 閉／開 2 枚・透過 PNG・金と枠色を服に使わない）
- まずは A（実況・星野 亮太）の「通常」2 枚だけ。命名 `narrator-a-normal-closed.png` / `narrator-a-normal-open.png`
- 実装側: `drawNarratorFrame` に渡す画像を差し替え、`speaking` に応じて 6fps で交互（`drawCallBand` の `speaking` は算出済み）

---

## 4. 検証の手順（毎回）

```bash
npm run typecheck                    # strict
npx vitest run packages/render       # 描画パッケージ（204 件）
npx vitest run                       # 全体（872 件・約 2.5 分）
```
- 実ブラウザ確認: 開発サーバー起動中に http://localhost:3100/race 。`?auditSec=秒` で静止画（例 4.6 タイトル／6.9 発走帯／12 レース中／86.5 勝馬／95 確定）
- ヘッドレス Edge 撮影: `scratchpad/capture.mjs`（Edge は PowerShell `Start-Process msedge --headless=new --remote-debugging-port=9333` で先に起動し、スクリプトは接続だけ）
- 動画の道具 `tools/render-oblique-video.mjs` 等は旧シグネチャのまま動く（`opts` 省略）。`tools/audit-race-broadcast.mjs` は今回の変更前から `ERR_UNKNOWN_FILE_EXTENSION` で起動しない（未対応）

---

## 5. 既知の運用上の注意

- **git push が通らないことがある**（Windows の Git Credential Manager が保存済み資格情報を返さず、認証プロンプト待ちで止まる。`gh` の sevendaysderby アカウントは対象リポジトリに push 権限なし）。通らないときはオーナーに `! git push origin main` を打ってもらう。2026-08-19 時点で `6bc3587`・`cf397ef` の 2 コミットが未 push の可能性あり — 最初に `git status -sb` で確認
- 長い bash heredoc（引用符を含む）は失敗しやすい。パッチは Write でスクリプトに書いてから実行する
- 開発サーバーは `npm -w @star/web run dev`（ポート 3100）。古い生成物で見た目が変わらないときは `apps/web/.next` を退避して再起動
- `.png` を追加したら `node tools/build-art-webp.mjs`（Web は WebP 優先で読む）。`ASSET_VERSION`（`page.tsx`）を上げるとキャッシュが切れる

---

## 6. 記録の場所

- 作業ログ（時系列）: `docs/race-reference-reproduction-worklog-20260816.md`
- 参考映像の台本: `docs/race-broadcast-script-reference-20260818.md`
- 進捗のまとめ: `docs/race-broadcast-v2-progress-20260818.md`
- 馬の作り直し議論: `docs/race-horse-art-options-20260819.md`
- Claude Design 依頼文: `docs/claude-design-hud-brief-20260819.md`
- 戻り先タグ: `race-v2-before-broadcast-script-20260818`
