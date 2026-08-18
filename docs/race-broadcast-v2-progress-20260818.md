# レース中継（Broadcast V2）経緯まとめ — 2026-08-17〜18

対象: `apps/web/src/app/race/page.tsx` と `packages/render`（V2 中継描画）。
詳細な作業ログは `docs/race-reference-reproduction-worklog-20260816.md`、当初の引継ぎは `CLAUDE_CODE_HANDOFF_RACE_20260817.md`。

## 1. 出発点（8/17）

- 通常 `/race` が V2 に入っていることを実ブラウザ（ヘッドレス Edge / DevTools）で証明。`/race?renderer=legacy` が旧描画。
- 実測で「背景が 1px/コマしか動かない（必要量の約 1/100）」＝「その場走り」の原因を特定。

## 2. 主な決定と実装（時系列）

| 日 | 内容 | 主なファイル |
|---|---|---|
| 8/17 | 横追従の背景を**ループ多層パララックス**に（承認済みプレートを帯に分解・タイル化） | `tools/split-parallax-layers.mjs` `packages/render/src/parallax-plate.ts` |
| 8/17 | **見た目の速度**を時間圧縮（D-062）から分離（背景の流れと脚の周期は常に実速） | `packages/render/src/visual-scroll.ts` |
| 8/17 | 横追従を望遠に（馬 ≈27%）、注視は先頭集団、決勝線・審判塔を世界固定物体に | `broadcast-v2.ts` `broadcast-v2-scene.ts` |
| 8/17 | 8 コマの配置を外接矩形 → 鞍布基準に、接地影（シルエット）、芝片 | `perspective-draw.ts` `page.tsx` |
| 8/17 | 発走をゲート待機〜追走まで同一カメラで統合（発馬機は差分切り出しの世界固定物体、Codex で発馬機なし版を生成） | `design/art/assets/starting-gate-side-v1-nogate.png` |
| 8/17 | ゴール前カメラを展開で分岐（接戦=引く／単独=寄る、連続ズーム） | `broadcastV2FinishStyleOf` |
| 8/18 | 勝馬 8 コマ `horse-jockey-winner-v2-pose01..08` を Codex で生成（**唯一「合格」評価**の走り） | `apps/web/public/art/` |
| 8/18 | コーナー用に**テクスチャ付き透視ワールド**（芝タイルを走査線ごとに透視で貼る・曲がるラチ・遠景帯・生垣/樹林/スタンドの立体帯） | `packages/render/src/world-textured.ts` |
| 8/18 | 直線の時間圧縮 0.7 → 1.0（ゴール前スロー廃止） | `time-warp.ts` |
| 8/18 | ミニマップ、ショット切替ディゾルブ、発走イージング、序盤隊列の等間隔化 | `minimap.ts` `formation.ts` |
| 8/18 | 方向別の**一体素材**（斜め前 v3・斜め後ろ v4、各 8 コマ・角度固定・騎手込み）を勝馬と同じ方式で Codex 生成し、進行方向とカメラの相対角で選択 | `frameSetOf`（`perspective-draw.ts`） |
| 8/18 | 4 角を JRA 中継風の**固定正面カメラ**（奥からこちらへ・距離で自動ズーム）に | `fourth-corner-front` |

## 3. 不採用にしたもの（オーナー判定）

- 16 コマ（中間コマ）: 「ウサギ跳ね」→ 8 コマに戻す（素材 `horse-jockey-side-v6-mid01..08` は残置・不使用）
- **馬・騎手の分離合成**（`horse-only-*` ＋ `jockey-*`）: 位置合わせ不良で「形・大きさがアンバランス」「勝馬の騎手が破綻」→ 不採用（`USE_SEPARATED_COMPOSITE=false`）。素材は残置
- 低解像度の方向別素材（`*-v2` 271×724）との混在: 「破綻」→ 一体素材が揃った方向だけ使う

## 4. 現在の構成（8/18 時点）

- 発走: ゲート待機（2.6〜4.8s）→ 開扉 → 3 秒の加速 → 望遠横追従（`START_CAMERA` → `SIDE_TELE` へ連続）
- 向正面: 望遠横追従（パララックス層）
- 3 角: 斜め後ろカメラ（透視ワールド）＋ `diag-rear-v4`
- 4 角: 直線入口の固定正面カメラ（透視ワールド）＋ `diag-front-v3`
- 直線〜ゴール: 望遠横追従（展開でズーム）→ 決勝線・審判塔通過 → 勝馬追従（`winner-v2`）
- HUD: 区間タグ、ミニマップ、順位、実況帯、勝馬テロップ

## 5. 検証手段

- `npm run typecheck` / `npm test`（871 件）
- `npx tsx tools/audit-race-motion.mjs`（背景流速・馬の大きさ・見た目速度の全編監査）
- `npx tsx tools/audit-broadcast-v2.mjs`（コンタクトシート・遷移監査）
- 実ブラウザ撮影: ヘッドレス Edge を DevTools Protocol で操作（`?auditSec=` で静止、`演出開始` で実時間）。**監査値ではなくブラウザの絵で判断する**（引継ぎ書 §6.1）

## 6. 残課題（オーナー指摘の未消化分を含む）

- 走り自体の品質: 真横 8 コマの滑らかさは評価時のまま。勝馬 8 コマと同じ方式で真横 8 コマを作り直す案（承認待ち）
- 発走直後の隊列・加速の見え方の追い込み（参考映像との突合）
- 4 角の固定カメラの位置・ズーム上限の微調整、3 角カメラの構図
- 素材の増加（透過 PNG 約 80 枚・130MB）によるページ初期ロードの重さ → 圧縮／シート化
- コース図の向き、区間タグ文言などの細部
