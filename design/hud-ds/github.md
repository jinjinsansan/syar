repo: jinjinsansan/syar
branch: main
path: packages/render/src

## Last sync
date: 2026-08-19T02:20:00Z
commit: 65c017d6ffbc (tree)

### Updated in this project
- パドック・リプレイ操作・中継バッジ／遷移エフェクトを追加（レース関連は一通り網羅）
- Web 3画面を新規デザイン（番組表／レース詳細＋公正性の検証／オッズ）。各カードに実装表つき
- 出馬表・確定払戻を追加し、旧 results-board は削除。文言を EP／PP の憲法に統一
- **本線を派手版に確定**（金グラデ1本・斜度 -9°・コンデンス数字）。screen-live を派手版の実測座標で書き換え
- 実況をリアルタイム演出に変更（ナレーター立ち絵・ON AIR・音声レベル・20文字/秒の文字送り）
- ナレーター4名の枠と生成条件を追加
- トークンを Canvas 実装前提で再定義（単色塗り・1px 線・角丸2px、グラデ／ぼかしなし、system-ui のみ）
- 「レース中」フル画面モックを新規追加（実装座標つき）
- Motion 群を追加：走行アニメ仕様・シート受け入れ条件・テンポ確認用の走行モック
- 説明書 MOTION_HANDOFF.md を追加

## Screen map
| カード | 参照した実装 |
| --- | --- |
| tokens/ | packages/render/src/oblique-draw.ts（palette 名）, oblique-ui.ts |
| components/screen-live/ | oblique-ui.ts（drawStandings/drawCallBand/drawCourseSectionTag/drawGauge）, minimap.ts |
| components/standings/ | oblique-ui.ts drawStandings |
| components/call-band/ | oblique-ui.ts drawCallBand, drawGauge |
| components/section-tag/ | oblique-ui.ts drawCourseSectionTag |
| components/winner-lower-third/ | oblique-ui.ts drawWinnerLowerThird |
| components/results-board/ | oblique-ui.ts drawResultsBoard |
| components/minimap/ | packages/render/src/minimap.ts drawCourseMinimap |
| components/start-band/ | race-intro.ts drawStartCallBand |
| components/entry-board/ | 新規（発走前オーバーレイ） |
| components/payout-board/ | oblique-ui.ts drawResultsBoard を置き換え |
| components/narrator-cast/ | drawCallBand の narrator |
| components/program-board/ | apps/web/src/app/page.tsx |
| components/race-detail/ | apps/web/src/app/races/[id]/page.tsx, lib/format.ts |
| components/odds-board/ | lib/queries.ts race_odds_public |
| components/paddock/ | 新規（発走前） |
| components/replay-bar/ | 新規（リプレイ操作） |
| components/broadcast-badges/ | oblique-ui.ts 共通 |
| components/title-card/ | packages/render/src/race-intro.ts drawRaceTitleCard |
| components/motion-spec/ | oblique-draw.ts drawObliqueHorse, race-intro.ts startHorseVisualAt, oblique-ui.ts raceHudVisibilityAt |
| components/sheet-spec/ | oblique-draw.ts SheetSpec / SHEET_*, docs/race-art-production-order.md |
| components/motion-mock/ | （テンポ確認用。対応実装なし） |
